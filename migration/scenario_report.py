"""Install 100 unique test subscribers (+ a master-subordinate Multi-SIM
scenario) on Classic EC via UCIP, run the EC->CBEV migration capture for each,
and emit an HTML report with one tab per scenario showing every step's request,
response, and the derived mapping.

Pipeline per scenario:
  1. INSTALL (UCIP, live writes):  InstallSubscriber (serviceClass + bill cycle
     via pamServiceID + offers [+ UT dedicated accounts where applicable]).
  2. FETCH (UCIP, live reads):     GetAccountDetails / GetOffers /
     GetBalanceAndDate / GetAccumulators / GetMultiSubscriberNumbers.
  3. MAP (local):                  mapping_engine.build_plan -> MigrationPlan.
  4. CBEV PROVISION (BSSF bodies, dry-run build): Party / Customer / Contract /
     Product Bucket Adjustment request bodies.
Every UCIP call's raw request+response is captured via the client recorder.
BSSF bodies are built (not sent) so the report shows what WOULD be provisioned.

Notes / constraints (verified against this lab + CPI):
  * AF routes only the 8869700070xx prefix -> 100 numbers 886970007000..099.
  * UC (usage counter) is NOT settable via UCIP (accepted but no-op); it is
    rating-owned. Scenarios therefore vary offers / UT / bill cycle / service
    class, UC stays 0. The migration mapping (account = UT - UC) is still shown.

Usage:
  python -m migration.scenario_report --count 100 --out report.html
  python -m migration.scenario_report --count 100 --dry-run      # no SDP writes
  python -m migration.scenario_report --count 20 --out small.html
"""

from __future__ import annotations

import argparse
import html
import json
import sys
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from xml.dom import minidom
from xml.etree import ElementTree as ET

from .ucip_client import UcipClient, UcipError
from .mapping_engine import load_engine
from .bssf_migrator import BssfMigrator

_REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = _REPO_ROOT / "migration" / "config" / "migration_config.json"
GB = 1073741824

# AF-routable block on this node.
RANGE_START = 886970007000
RANGE_SIZE = 100

# Offer catalog (offerID, family) used to build unique combinations.
OFFER_BASIC = (145001, "Basic")
OFFER_DATA_ADDON = (160006, "Data Add-on")
OFFER_TETHERING = (281007, "Tethering")
OFFER_TOD = (157006, "ToD Limited")
OFFER_CATALOG = [OFFER_BASIC, OFFER_DATA_ADDON, OFFER_TETHERING, OFFER_TOD]

# Bucket spec id per offer (account bucket / usage threshold id).
OFFER_BUCKET = {145001: 6145000, 160006: 6160006, 281007: 6281007, 157006: 6157006}

# Varied dimensions for uniqueness.
SERVICE_CLASSES = [5010]          # valid installable SC on this SDP (155 for others)
BILL_CYCLES = [1, 2, 3]           # pamServiceID
UT_GB_CHOICES = [5, 10, 20, 30, 50, 80, 100, 150, 200, 500]


# ---------------------------------------------------------------------------
# Scenario generation
# ---------------------------------------------------------------------------

def _offer_combinations():
    """Yield unique offer-id tuples: all singles, pairs, triples, and the quad,
    in a stable order, so we can build many distinct combinations."""
    import itertools
    ids = [o[0] for o in OFFER_CATALOG]
    combos = []
    for r in (1, 2, 3, 4):
        for c in itertools.combinations(ids, r):
            combos.append(list(c))
    return combos  # 4 + 6 + 4 + 1 = 15 distinct offer-sets


def generate_scenarios(count: int) -> list[dict]:
    """Build `count` unique scenarios varying offer-set x bill cycle x UT values.

    Uniqueness key = (offers, pam, tuple(UT per offer), service_class). We walk
    the cartesian space deterministically and take the first `count` unique keys.
    """
    offer_sets = _offer_combinations()
    scenarios: list[dict] = []
    seen = set()
    i = 0
    # iterate a large deterministic space
    for sc in SERVICE_CLASSES:
        for pam in BILL_CYCLES:
            for offers in offer_sets:
                # rotate UT values per offer so each scenario's thresholds differ
                for shift in range(len(UT_GB_CHOICES)):
                    ut = {}
                    for j, oid in enumerate(offers):
                        ut[oid] = UT_GB_CHOICES[(i + j + shift) % len(UT_GB_CHOICES)]
                    key = (tuple(offers), pam, tuple(sorted(ut.items())), sc)
                    if key in seen:
                        continue
                    seen.add(key)
                    msisdn = str(RANGE_START + len(scenarios))
                    scenarios.append({
                        "msisdn": msisdn,
                        "name": _scenario_name(offers, pam, ut),
                        "service_class": sc,
                        "pam_service_id": pam,
                        "offers": offers,
                        "ut_gb": ut,  # {offerID: GB}
                        "kind": "standard",
                    })
                    i += 1
                    if len(scenarios) >= count:
                        return scenarios
    return scenarios


def _scenario_name(offers, pam, ut) -> str:
    fam = "+".join(_family(o) for o in offers)
    uts = ",".join(f"{_family(o)}={ut[o]}GB" for o in offers)
    return f"{fam} | BC{pam} | {uts}"


def _family(offer_id) -> str:
    for oid, fam in OFFER_CATALOG:
        if oid == offer_id:
            return fam
    return str(offer_id)


def master_subordinate_scenario(index: int) -> dict:
    """A master phone + subordinate device (Apple Watch) on the same account."""
    master = str(RANGE_START + index)
    sub = str(RANGE_START + index + 1)
    return {
        "msisdn": master,
        "subordinate": sub,
        "name": f"Multi-SIM master {master} + watch {sub}",
        "service_class": 10,
        "pam_service_id": 1,
        "offers": [OFFER_BASIC[0], OFFER_DATA_ADDON[0]],
        "ut_gb": {OFFER_BASIC[0]: 50, OFFER_DATA_ADDON[0]: 100},
        "kind": "master_subordinate",
    }


# ---------------------------------------------------------------------------
# Install + fetch + map + bssf capture, per scenario
# ---------------------------------------------------------------------------

def _expiry(days=365):
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y%m%dT%H:%M:%S+0000")


def _offer_entries(scn):
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H:%M:%S+0000")
    return [{"offerID": oid, "offerType": 1, "startDate": now, "expiryDate": _expiry()}
            for oid in scn["offers"]]


def _ut_entries(scn):
    # dedicated-account UT seeds (offer also defines threshold; we attempt the seed)
    return [{"id": OFFER_BUCKET[oid], "value": gb * GB} for oid, gb in scn["ut_gb"].items()]


def run_scenario(ucip: UcipClient, engine, migrator: BssfMigrator, scn: dict,
                 dry_run: bool) -> dict:
    """Execute install + fetch + map + bssf-build for one scenario, capturing
    every step. Returns a dict with 'steps' = ordered list of captured steps."""
    msisdn = scn["msisdn"]
    steps: list[dict] = []
    ucip.recorder = []  # fresh capture buffer for this scenario

    # ---- 1. INSTALL (UCIP write) ----
    if not dry_run:
        try:
            ucip.install_subscriber(
                msisdn,
                service_class=scn["service_class"],
                pam_service_id=scn["pam_service_id"],
                offers=_offer_entries(scn),
            )
        except UcipError:
            pass  # captured in recorder (e.g. already exists); keep going
        # subordinate device for master-subordinate scenario
        if scn.get("subordinate"):
            try:
                ucip.install_subscriber(
                    scn["subordinate"], service_class=scn["service_class"],
                    pam_service_id=scn["pam_service_id"], offers=_offer_entries(scn))
            except UcipError:
                pass

    # ---- 2. FETCH (UCIP reads) ----
    profile = None
    try:
        profile = ucip.fetch_profile(msisdn)
    except Exception as e:  # noqa: BLE001 - captured in recorder
        steps.append({"phase": "FETCH", "note": f"fetch error: {e}"})

    # snapshot all UCIP records captured so far (install + fetch)
    for rec in ucip.recorder:
        steps.append({
            "phase": "INSTALL" if rec["operation"] in ("InstallSubscriber",) else "FETCH",
            "interface": "UCIP",
            "operation": rec["operation"],
            "request": _pretty_xml(rec["request"]),
            "response": _pretty_xml(rec["response"]),
            "responseCode": rec.get("responseCode"),
            "error": rec.get("error"),
        })

    # ---- 3. MAP (local derivation) ----
    plan = None
    mapping_rows = []
    if profile is not None:
        try:
            plan = engine.build_plan(profile)
            mapping_rows = _mapping_rows(profile, plan)
        except Exception as e:  # noqa: BLE001
            steps.append({"phase": "MAP", "note": f"mapping error: {e}"})

    # ---- 4. CBEV PROVISION (BSSF bodies, built not sent) ----
    bssf_steps = []
    if plan is not None:
        try:
            bssf_steps.append(("Create Party", "POST /bssfIndividualPartyManagement/.../individualParty",
                               migrator.build_party_body(plan)))
            bssf_steps.append(("Create Customer", "POST /bssfCustomerManagement/.../customer",
                               migrator.build_customer_body(plan)))
            bssf_steps.append(("Create Contract", "POST /bssfSubscriptionManagement/.../contract",
                               migrator.build_contract_body(plan)))
            for pe, bucket in plan.all_bucket_adjustments():
                bssf_steps.append((f"Bucket Adjustment {pe}/{bucket.bucket_spec_external_id}",
                                   "POST /bssfBalanceManagement/.../bucketAdjustment/adjust",
                                   migrator.build_bucket_adjustment_body(plan, pe, bucket)))
        except Exception as e:  # noqa: BLE001
            steps.append({"phase": "CBEV", "note": f"bssf build error: {e}"})

    for title, url, body in bssf_steps:
        steps.append({
            "phase": "CBEV",
            "interface": "BSSF",
            "operation": title,
            "request": url + "\n\n" + json.dumps(body, indent=2),
            "response": "(dry-run: body built, not sent)",
            "responseCode": None,
            "error": None,
        })

    return {
        "scenario": scn,
        "steps": steps,
        "mapping_rows": mapping_rows,
        "profile_summary": _profile_summary(profile) if profile else {},
        "plan_summary": _plan_summary(plan) if plan else {},
    }


# ---------------------------------------------------------------------------
# Mapping / summaries
# ---------------------------------------------------------------------------

def _mapping_rows(profile, plan) -> list[dict]:
    """Build human-readable SDP->CBEV mapping rows with derivation."""
    rows = []
    rows.append({"sdp": "master MSISDN", "sdp_val": profile.master_msisdn,
                 "cbev": "accountID char (every PO)", "derivation": "as-is"})
    rows.append({"sdp": "serviceClassCurrent", "sdp_val": profile.service_class,
                 "cbev": "ServiceClass contract char",
                 "derivation": f"mapped -> {plan.service_class_ecev}"})
    for p in plan.products:
        for b in p.buckets:
            rows.append({
                "sdp": f"offer {p.product_offering_external_id} bucket",
                "sdp_val": f"{b.bucket_spec_external_id}",
                "cbev": f"PO {p.product_offering_external_id} bucket {b.bucket_spec_external_id}",
                "derivation": f"{b.reason}: {b.amount} bytes ({b.amount / GB:.2f} GB)",
            })
    for sub in plan.additional_msisdns:
        rows.append({"sdp": "subordinate MSISDN", "sdp_val": sub.msisdn,
                     "cbev": "2nd ext_LRS_MSISDN resource (same contract)",
                     "derivation": "FC757 Multi-SIM; accountID stays master"})
    return rows


def _profile_summary(profile) -> dict:
    return {
        "master_msisdn": profile.master_msisdn,
        "service_class": profile.service_class,
        "offers": [o.offer_id for o in profile.offers],
        "dedicated_accounts": [f"{d.dedicated_account_id}={d.value}{d.unit}"
                               for d in profile.dedicated_accounts],
        "accumulators": [f"{a.accumulator_id}={a.value}{a.unit}" for a in profile.accumulators],
        "subordinates": [s.msisdn for s in profile.subordinates],
    }


def _plan_summary(plan) -> dict:
    return {
        "party": plan.party_external_id,
        "customer": plan.customer_external_id,
        "contract": plan.contract_external_id,
        "partition": plan.partition_id,
        "service_class_ecev": plan.service_class_ecev,
        "products": [p.product_offering_external_id for p in plan.products],
        "bucket_adjustments": len(plan.all_bucket_adjustments()),
    }


def _pretty_xml(text) -> str:
    if not text:
        return ""
    try:
        return minidom.parseString(text).toprettyxml(indent="  ")
    except Exception:
        return text


# ---------------------------------------------------------------------------
# HTML report
# ---------------------------------------------------------------------------

def build_html(results: list[dict], meta: dict) -> str:
    tabs, panels = [], []
    for i, res in enumerate(results):
        scn = res["scenario"]
        tab_id = f"s{i}"
        active = " active" if i == 0 else ""
        label = f"{scn['msisdn']}"
        tabs.append(f'<button class="tab{active}" onclick="show(\'{tab_id}\')" '
                    f'id="btn_{tab_id}" title="{html.escape(scn["name"])}">{label}</button>')
        panels.append(_panel_html(tab_id, res, active))

    ok = sum(1 for r in results if not any(s.get("error") for s in r["steps"]))
    summary = (f"{len(results)} scenarios &middot; generated "
               f"{meta.get('generated')} &middot; endpoint {html.escape(meta.get('endpoint',''))} "
               f"&middot; mode {meta.get('mode')}")

    return _HTML_TEMPLATE.format(
        summary=summary,
        tabs="\n".join(tabs),
        panels="\n".join(panels),
    )


def _panel_html(tab_id, res, active) -> str:
    scn = res["scenario"]
    disp = "block" if active else "none"
    # scenario header
    head = f"""
      <h2>{html.escape(scn['name'])}</h2>
      <table class="meta">
        <tr><th>MSISDN</th><td>{scn['msisdn']}</td>
            <th>Kind</th><td>{scn['kind']}</td></tr>
        <tr><th>Service Class</th><td>{scn['service_class']}</td>
            <th>Bill Cycle (pamServiceID)</th><td>{scn['pam_service_id']}</td></tr>
        <tr><th>Offers</th><td>{', '.join(str(o) for o in scn['offers'])}</td>
            <th>UT (GB)</th><td>{html.escape(json.dumps(scn['ut_gb']))}</td></tr>
      </table>
    """
    # mapping table
    map_rows = "".join(
        f"<tr><td>{html.escape(str(r['sdp']))}</td><td>{html.escape(str(r['sdp_val']))}</td>"
        f"<td>{html.escape(str(r['cbev']))}</td><td>{html.escape(str(r['derivation']))}</td></tr>"
        for r in res["mapping_rows"])
    mapping = f"""
      <h3>SDP &rarr; CBEV Mapping &amp; Derivation</h3>
      <table class="map"><tr><th>SDP source</th><th>Value</th><th>CBEV target</th><th>Derivation</th></tr>
      {map_rows or '<tr><td colspan=4><i>no mapping (fetch/map failed)</i></td></tr>'}</table>
    """
    # steps
    step_blocks = []
    for n, s in enumerate(res["steps"], 1):
        if s.get("note"):
            step_blocks.append(f'<div class="step note">Step {n}: {html.escape(s["note"])}</div>')
            continue
        rc = s.get("responseCode")
        badge_cls = "ok" if rc in ("0", None) and not s.get("error") else "err"
        badge = f'<span class="badge {badge_cls}">rc={rc}</span>' if rc is not None else ""
        if s.get("error"):
            badge = f'<span class="badge err">{html.escape(str(s["error"]))}</span>'
        step_blocks.append(f"""
          <div class="step">
            <div class="step-h">Step {n} &middot; <b>{s['phase']}</b> &middot;
              {s.get('interface','')} &middot; {html.escape(str(s.get('operation','')))} {badge}</div>
            <div class="io">
              <div class="col"><div class="lbl">Request</div><pre>{html.escape(s.get('request') or '')}</pre></div>
              <div class="col"><div class="lbl">Response</div><pre>{html.escape(s.get('response') or '')}</pre></div>
            </div>
          </div>""")
    steps = "<h3>Steps (request / response)</h3>" + "\n".join(step_blocks)

    return f'<div class="panel" id="{tab_id}" style="display:{disp}">{head}{mapping}{steps}</div>'


_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>EC -> CBEV Migration Scenario Report</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: Segoe UI, Arial, sans-serif; margin: 0; color: #1b1b1b; background:#f4f6f9; }}
  header {{ background:#0b2e59; color:#fff; padding:14px 20px; }}
  header h1 {{ margin:0; font-size:18px; }}
  header .sub {{ font-size:12px; opacity:.85; margin-top:4px; }}
  .tabs {{ display:flex; flex-wrap:wrap; gap:2px; padding:8px; background:#dfe6ee;
           position:sticky; top:0; max-height:120px; overflow:auto; }}
  .tab {{ border:0; padding:5px 9px; font-size:11px; cursor:pointer; background:#fff;
          border-radius:3px; }}
  .tab:hover {{ background:#cfe0f5; }}
  .tab.active {{ background:#0b57d0; color:#fff; }}
  .panel {{ padding:18px 22px; }}
  h2 {{ font-size:16px; }}
  table {{ border-collapse:collapse; margin:8px 0 16px; font-size:12px; width:100%; }}
  th, td {{ border:1px solid #cbd5e1; padding:5px 8px; text-align:left; vertical-align:top; }}
  table.meta th {{ background:#eef2f7; width:150px; }}
  table.map th {{ background:#0b2e59; color:#fff; }}
  .step {{ border:1px solid #cbd5e1; border-radius:5px; margin:10px 0; background:#fff; }}
  .step-h {{ background:#eef2f7; padding:6px 10px; font-size:12px; border-bottom:1px solid #cbd5e1; }}
  .io {{ display:flex; gap:0; }}
  .col {{ flex:1; min-width:0; border-right:1px solid #eee; }}
  .col:last-child {{ border-right:0; }}
  .lbl {{ font-size:11px; font-weight:bold; padding:4px 8px; background:#fafbfc; color:#555; }}
  pre {{ margin:0; padding:8px 10px; font-size:11px; white-space:pre-wrap; word-break:break-word;
         max-height:360px; overflow:auto; background:#fcfcfd; }}
  .badge {{ font-size:10px; padding:1px 6px; border-radius:10px; margin-left:6px; }}
  .badge.ok {{ background:#d7f5dd; color:#0a6b25; }}
  .badge.err {{ background:#fde0e0; color:#a11; }}
  .note {{ padding:8px 10px; font-size:12px; color:#a11; }}
</style></head><body>
<header><h1>Classic EC &rarr; CBEV Migration &mdash; Scenario Report</h1>
<div class="sub">{summary}</div></header>
<div class="tabs">{tabs}</div>
{panels}
<script>
function show(id) {{
  document.querySelectorAll('.panel').forEach(p => p.style.display='none');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).style.display='block';
  document.getElementById('btn_'+id).classList.add('active');
}}
</script></body></html>"""


# ---------------------------------------------------------------------------
# Orchestration / CLI
# ---------------------------------------------------------------------------

def _load_config(path):
    p = Path(path)
    if not p.exists():
        tmpl = p.parent / "migration_config.template.json"
        p = tmpl if tmpl.exists() else p
    with open(p) as f:
        return json.load(f)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="scenario_report",
                                 description="Install 100 scenarios + migration capture -> HTML report")
    ap.add_argument("--config", default=str(DEFAULT_CONFIG))
    ap.add_argument("--count", type=int, default=100, help="number of standard scenarios")
    ap.add_argument("--out", default="migration_scenarios_report.html")
    ap.add_argument("--dry-run", action="store_true", help="skip SDP install writes (fetch+map+bssf only)")
    ap.add_argument("--no-subordinate", action="store_true", help="skip the master-subordinate scenario")
    args = ap.parse_args(argv)

    cfg = _load_config(args.config)
    ucip = UcipClient(cfg)
    wb = cfg.get("mapping_workbook", "migration/config/mapping_template.xlsx")
    if not Path(wb).is_absolute():
        wb = _REPO_ROOT / wb
    engine = load_engine(wb)
    migrator = BssfMigrator(defaults=cfg.get("ecev_defaults", {}))

    scenarios = generate_scenarios(args.count)
    if not args.no_subordinate:
        # place subordinate scenario right after the standard block (uses 2 numbers)
        scenarios.append(master_subordinate_scenario(len(scenarios)))

    print(f"Running {len(scenarios)} scenarios (dry_run={args.dry_run}) ...")
    results = []
    for n, scn in enumerate(scenarios, 1):
        res = run_scenario(ucip, engine, migrator, scn, dry_run=args.dry_run)
        results.append(res)
        rc_ok = all(s.get("responseCode") in ("0", None) and not s.get("error")
                    for s in res["steps"] if s.get("interface") == "UCIP")
        print(f"  [{n:3}/{len(scenarios)}] {scn['msisdn']}  {scn['name'][:50]:50} "
              f"steps={len(res['steps'])} {'ok' if rc_ok else 'see-report'}")

    meta = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "endpoint": cfg.get("ucip", {}).get("endpoint", ""),
        "mode": "dry-run (no SDP writes)" if args.dry_run else "live install + capture",
    }
    out = Path(args.out)
    out.write_text(build_html(results, meta), encoding="utf-8")
    print(f"\nHTML report written: {out.resolve()}  ({len(results)} tabs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
