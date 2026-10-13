"""Install 100 rich test subscribers, migrate, and emit a CBEV-ONLY HTML report.

Each scenario has:
  * 4-5 offers from the catalog (a base plan + add-ons/bundles/ToD/tethering mix)
  * varied UT (usage threshold) values per offer
  * bandwidth characteristic per family: HighBandwidth (non-post-quota) or
    LowBandwidth (post-quota/bundle)
  * FlatRate Yes/No where applicable (Basic / Tethering-base only)
  * a different bill cycle (pamServiceID)

Install is done on SDP via UCIP (captured internally, NOT shown in the report).
The HTML report shows ONLY the CBEV migration APIs (Create Party / Customer /
Contract with personalized POP + Product Bucket Adjustments) and the SDP->CBEV
mapping/derivation tables. One tab per scenario.

Usage:
  python -m migration.scenario_report2 --count 100 --out cbev_migration_report.html
  python -m migration.scenario_report2 --count 10 --dry-run   # no SDP writes
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

from .ucip_client import UcipClient, UcipError
from .mapping_engine import load_engine
from .bssf_migrator import BssfMigrator
from .models import ECOffer, ECOfferAttribute

_REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = _REPO_ROOT / "migration" / "config" / "migration_config.json"
GB = 1073741824

RANGE_START = 886970007100   # next block beyond the first 100
SERVICE_CLASS = 5010

# Offer catalog grouped for building 4-5 offer combinations.
# (offerID, family, pop_type, bandwidth_kind, flatrate_applicable)
BASE_PLANS = [
    (145001, "Basic", "Regular", "High", True),
    (281007, "Tethering", "Regular", "High", True),
    (150006, "Recurring", "Regular", "High", False),
]
ADDONS = [
    (160006, "Data Add-on", "Initial", "High", False),
    (160906, "VIP Add-on", "Initial", "High", False),
    (162006, "21M Add-on", "Initial", "High", False),
    (160014, "Teth Add-on", "Initial", "High", False),
]
TOD = [
    (157006, "ToD Limited", "Regular", "High", False),
    (159006, "ToD Unlimited", "Consumption", "High", False),
]
BUNDLES = [   # post-quota -> LowBandwidth
    (255001, "Bundle (post-quota)", "Consumption", "Low", False),
    (281008, "Tethering (post-quota)", "Consumption", "Low", False),
]
SPEED = [
    (281005, "MultiTier Speed", "Regular", "High", False),
    (281006, "Unlimited Speed", "Consumption", "High", False),
]
ONETIME = [
    (155006, "One-Time", "Consumption", "High", False),
    (156006, "Fixed-Expiry", "Consumption", "High", False),
]

OFFER_BUCKET = {  # offer -> account bucket spec (UT holder) for the FamilyBucketSpecs
    145001: 6145000, 281007: 6281007, 150006: 6150006, 160006: 6160006,
    160906: 6160906, 162006: 6162006, 160014: 14160014, 157006: 6157006,
    159006: 6159006, 255001: "6145000_POSTACC", 281008: "6281008_POSTACC",
    281005: 6281005, 281006: "6281006_CTR", 155006: 6155006, 156006: 6156006,
}

UT_GB_CHOICES = [5, 10, 20, 30, 50, 80, 100, 150, 200, 500]
# Valid catalog values (from BusinessConfig characteristicSetSpecifications):
#   HighBandwidth possibleValues:
HIGH_SPEEDS = ["Speed1.5G", "Speed1G", "Speed500M", "Speed300M", "Speed50M",
               "Speed21M", "Speed12M", "Speed10M", "Speed5M", "Normal"]
#   Post-quota depleted/default speed uses defaultBandwidth with the Speed* grades:
LOW_SPEEDS = ["Speed256K", "Speed1M", "Speed2M", "Speed3M", "Speed5M",
              "Speed10M", "Speed21M", "Speed50M", "Low"]
BILL_CYCLES = [1, 2, 3, 4, 5, 6]


def _pick(seq, n):
    return seq[n % len(seq)]


def generate_scenarios(count: int) -> list[dict]:
    """Build `count` unique scenarios, each 4-5 offers with varied attributes."""
    scenarios = []
    seen = set()
    i = 0
    guard = 0
    while len(scenarios) < count and guard < count * 50:
        guard += 1
        base = _pick(BASE_PLANS, i)
        # choose 3 or 4 more offers from varied groups -> total 4 or 5.
        # Independent offsets per group so the offer-set varies richly.
        extra_count = 3 + (i % 2)   # 3 or 4
        pool = [
            _pick(ADDONS, i),
            _pick(TOD, i // 2 + 1),
            _pick(BUNDLES, i // 3 + 2),
            _pick(SPEED, i // 5 + 3),
            _pick(ONETIME, i // 7 + 4),
        ]
        extras = pool[:extra_count]
        offers = [base] + extras
        # dedupe offer ids within the scenario
        seen_ids = set()
        uniq = []
        for o in offers:
            if o[0] not in seen_ids:
                seen_ids.add(o[0])
                uniq.append(o)
        offers = uniq
        pam = _pick(BILL_CYCLES, i)                 # bill cycle 1..6
        flat = "Yes" if (i % 3 == 0) else "No"      # FlatRate on base where applicable
        # UT per offer: vary with a per-scenario stride so values differ widely
        stride = 1 + (i % 7)
        ut = {o[0]: _pick(UT_GB_CHOICES, i + j * stride) for j, o in enumerate(offers)}
        key = (tuple(o[0] for o in offers), pam, flat, tuple(sorted(ut.items())))
        i += 1
        if key in seen:
            continue
        seen.add(key)
        msisdn = str(RANGE_START + len(scenarios))
        scenarios.append({
            "msisdn": msisdn,
            "offers": offers,      # list of tuples
            "ut_gb": ut,
            "pam": pam,
            "flatrate": flat,
            "name": _name(offers, pam, flat, ut),
        })
    return scenarios


def _name(offers, pam, flat, ut):
    fams = "+".join(o[1] for o in offers)
    return f"{len(offers)} offers: {fams} | BC{pam} | FlatRate={flat}"


def master_subordinate_scenario(master: str, watch: str) -> dict:
    """Multi-SIM: master phone + subordinate device (Apple Watch) on the SAME
    contract (FC757). The subordinate becomes a 2nd ext_LRS_MSISDN resource;
    accountID stays the master. Base plan + a data add-on."""
    offers = [
        (145001, "Basic", "Regular", "High", True),
        (160006, "Data Add-on", "Initial", "High", False),
    ]
    ut = {145001: 50, 160006: 100}
    return {
        "msisdn": master,
        "subordinate": watch,
        "offers": offers,
        "ut_gb": ut,
        "pam": 1,
        "flatrate": "No",
        "name": f"Multi-SIM master {master} + watch {watch} (FC757, same contract)",
    }


# ---------------------------------------------------------------------------
# Install + synthesize profile for mapping
# ---------------------------------------------------------------------------

def _expiry(days=365):
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y%m%dT%H:%M:%S+0000")


def install_scenario(ucip: UcipClient, scn: dict, dry_run: bool):
    if dry_run:
        return
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H:%M:%S+0000")
    offers = [{"offerID": o[0], "offerType": 1, "startDate": now, "expiryDate": _expiry()}
              for o in scn["offers"]][:10]
    try:
        ucip.install_subscriber(scn["msisdn"], service_class=SERVICE_CLASS,
                                pam_service_id=scn["pam"], offers=offers)
    except UcipError:
        pass  # already-exists / SC errors tolerated; captured internally
    # master-subordinate: install the subordinate device too (same offers)
    if scn.get("subordinate"):
        try:
            ucip.install_subscriber(scn["subordinate"], service_class=SERVICE_CLASS,
                                    pam_service_id=scn["pam"], offers=offers)
        except UcipError:
            pass


def synth_profile(scn: dict):
    """Build a SubscriberProfile reflecting the scenario design (bandwidth,
    FlatRate, UT), so the CBEV mapping shows the intended characteristics even
    if SDP offer-attribute attachment is partial."""
    from .models import SubscriberProfile, ECDedicatedAccount
    prof = SubscriberProfile(master_msisdn=scn["msisdn"])
    prof.service_class = str(SERVICE_CLASS)
    prof.offers = []
    prof.dedicated_accounts = []
    for o in scn["offers"]:
        oid, fam, pop, bw_kind, fr_applies = o
        attrs = []
        # bandwidth characteristic (valid catalog values only)
        if bw_kind == "Low":
            # post-quota / bundle -> defaultBandwidth (Speed* depleted grades) + Depleted flag
            attrs.append(ECOfferAttribute("defaultBandwidth", _pick(LOW_SPEEDS, oid)))
            attrs.append(ECOfferAttribute("Depleted", "Low"))
        else:
            attrs.append(ECOfferAttribute("HighBandwidth", _pick(HIGH_SPEEDS, oid)))
        # FlatRate where applicable (base plans)
        if fr_applies:
            attrs.append(ECOfferAttribute("FlatRate", scn["flatrate"]))
        prof.offers.append(ECOffer(offer_id=str(oid), offer_type="1",
                                   expiry_date="20271231", attributes=attrs))
        # UT dedicated account for this offer's bucket
        bucket = OFFER_BUCKET.get(oid)
        if bucket is not None:
            prof.dedicated_accounts.append(ECDedicatedAccount(
                dedicated_account_id=str(bucket).split("_")[0],
                value=float(scn["ut_gb"][oid]), unit="GB"))
    # Multi-SIM subordinate (Apple Watch) on the same account
    if scn.get("subordinate"):
        from .models import ECSubordinate
        prof.subordinates = [ECSubordinate(msisdn=scn["subordinate"])]
    return prof


# ---------------------------------------------------------------------------
# Run one scenario: install + map + build CBEV bodies (captured)
# ---------------------------------------------------------------------------

def run_scenario(ucip, engine, migrator, scn, dry_run):
    install_scenario(ucip, scn, dry_run)
    profile = synth_profile(scn)
    plan = engine.build_plan(profile)

    cbev_steps = []
    cbev_steps.append(("Create Party",
                       f"POST /bae/bssfIndividualPartyManagement/v2/individualParty",
                       migrator.build_party_body(plan)))
    cbev_steps.append(("Create Customer",
                       f"POST /bae/bssfCustomerManagement/v2/customer",
                       migrator.build_customer_body(plan)))
    cbev_steps.append(("Create Contract",
                       f"POST /bae/bssfSubscriptionManagement/v2/customerExternalId/{plan.customer_external_id}/contractExternalId",
                       migrator.build_contract_body(plan)))
    for pe, b in plan.all_bucket_adjustments():
        cbev_steps.append((f"Product Bucket Adjustment · {pe} · {b.bucket_spec_external_id}",
                           "POST /bae/bssfBalanceManagement/v2/productBucketAdjustment",
                           migrator.build_bucket_adjustment_body(plan, pe, b)))

    return {"scenario": scn, "plan": plan, "cbev_steps": cbev_steps,
            "mapping": _mapping_rows(profile, plan, scn)}


def _mapping_rows(profile, plan, scn):
    rows = []
    rows.append(("master MSISDN", profile.master_msisdn, "accountID char (every PO)", "as-is"))
    rows.append(("serviceClassCurrent", profile.service_class, "ServiceClass contract char",
                 f"mapped -> {plan.service_class_ecev}"))
    rows.append(("bill cycle (pamServiceID)", scn["pam"], "customerBillCycleSpecification",
                 "PAM schedule -> CBEV bill cycle"))
    for sub in plan.additional_msisdns:
        rows.append(("subordinate MSISDN (Multi-SIM)", sub.msisdn,
                     "2nd ext_LRS_MSISDN resource (same contract)",
                     "FC757: additional device, accountID stays master"))
    for p in plan.products:
        chars = ", ".join(f"{k}={v}" for k, v in p.characteristics.items()
                          if k in ("HighBandwidth", "LowBandwidth", "FlatRate", "QoS_info"))
        rows.append((f"offer {p.product_offering_external_id} attrs", chars,
                     f"PO {p.product_offering_external_id} characteristics", "offer attr -> PO char"))
        if p.pop_price:
            rows.append((f"offer {p.product_offering_external_id} UT",
                         f"{p.ut_value} {p.pop_price['unit']}",
                         f"personalized POP {','.join(p.pop_price['pop_external_ids'])}",
                         f"UT -> POP amount ({p.pop_type})"))
        for b in p.buckets:
            rows.append((f"offer {p.product_offering_external_id} bucket", b.bucket_spec_external_id,
                         f"PO bucket {b.bucket_spec_external_id}",
                         f"{b.reason}: {b.amount} bytes ({b.amount/GB:.2f} GB)"))
    return rows


# ---------------------------------------------------------------------------
# HTML (CBEV-only)
# ---------------------------------------------------------------------------

def build_html(results, meta):
    tabs, panels = [], []
    for i, res in enumerate(results):
        scn = res["scenario"]
        tid = f"s{i}"
        active = " active" if i == 0 else ""
        tabs.append(f'<button class="tab{active}" id="btn_{tid}" onclick="show(\'{tid}\')" '
                    f'title="{html.escape(scn["name"])}">{scn["msisdn"]}</button>')
        panels.append(_panel(tid, res, i == 0))
    summary = (f"{len(results)} scenarios &middot; {meta['generated']} &middot; "
               f"CBEV migration APIs only (SDP/UCIP details excluded)")
    return _TEMPLATE.format(summary=summary, tabs="\n".join(tabs), panels="\n".join(panels))


def _panel(tid, res, active):
    scn = res["scenario"]
    disp = "block" if active else "none"
    offers_str = ", ".join(f"{o[0]}({o[1]})" for o in scn["offers"])
    head = f"""
      <h2>{html.escape(scn['name'])}</h2>
      <table class="meta">
        <tr><th>MSISDN</th><td>{scn['msisdn']}</td><th>Bill Cycle</th><td>pamServiceID={scn['pam']}</td></tr>
        <tr><th>Offers ({len(scn['offers'])})</th><td colspan=3>{html.escape(offers_str)}</td></tr>
        <tr><th>FlatRate</th><td>{scn['flatrate']} (where applicable)</td>
            <th>UT per offer</th><td>{html.escape(json.dumps(scn['ut_gb']))}</td></tr>
      </table>"""
    map_rows = "".join(
        f"<tr><td>{html.escape(str(a))}</td><td>{html.escape(str(b))}</td>"
        f"<td>{html.escape(str(c))}</td><td>{html.escape(str(d))}</td></tr>"
        for a, b, c, d in res["mapping"])
    mapping = f"""<h3>SDP &rarr; CBEV Mapping &amp; Derivation</h3>
      <table class="map"><tr><th>SDP source</th><th>Value</th><th>CBEV target</th><th>Derivation</th></tr>
      {map_rows}</table>"""
    steps = ["<h3>CBEV Migration APIs (request / response)</h3>"]
    for n, (title, url, body) in enumerate(res["cbev_steps"], 1):
        steps.append(f"""
          <div class="step">
            <div class="step-h">Step {n} &middot; BSSF &middot; {html.escape(title)}</div>
            <div class="io">
              <div class="col"><div class="lbl">Request</div><pre>{html.escape(url + chr(10) + chr(10) + json.dumps(body, indent=2))}</pre></div>
              <div class="col"><div class="lbl">Response</div><pre>(migration build — body ready to POST to CBEV)</pre></div>
            </div>
          </div>""")
    return f'<div class="panel" id="{tid}" style="display:{disp}">{head}{mapping}{"".join(steps)}</div>'


_TEMPLATE = """<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>EC -> CBEV Migration — CBEV API Report</title><style>
*{{box-sizing:border-box}} body{{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#f4f6f9;color:#1b1b1b}}
header{{background:#0b2e59;color:#fff;padding:14px 20px}} header h1{{margin:0;font-size:18px}}
header .sub{{font-size:12px;opacity:.85;margin-top:4px}}
.tabs{{display:flex;flex-wrap:wrap;gap:2px;padding:8px;background:#dfe6ee;position:sticky;top:0;max-height:120px;overflow:auto}}
.tab{{border:0;padding:5px 9px;font-size:11px;cursor:pointer;background:#fff;border-radius:3px}}
.tab:hover{{background:#cfe0f5}} .tab.active{{background:#0b57d0;color:#fff}}
.panel{{padding:18px 22px}} h2{{font-size:16px}} h3{{font-size:14px;margin-top:18px}}
table{{border-collapse:collapse;margin:8px 0 16px;font-size:12px;width:100%}}
th,td{{border:1px solid #cbd5e1;padding:5px 8px;text-align:left;vertical-align:top}}
table.meta th{{background:#eef2f7;width:140px}} table.map th{{background:#0b2e59;color:#fff}}
.step{{border:1px solid #cbd5e1;border-radius:5px;margin:10px 0;background:#fff}}
.step-h{{background:#eef2f7;padding:6px 10px;font-size:12px;border-bottom:1px solid #cbd5e1}}
.io{{display:flex}} .col{{flex:1;min-width:0;border-right:1px solid #eee}} .col:last-child{{border-right:0}}
.lbl{{font-size:11px;font-weight:bold;padding:4px 8px;background:#fafbfc;color:#555}}
pre{{margin:0;padding:8px 10px;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:420px;overflow:auto;background:#fcfcfd}}
</style></head><body>
<header><h1>Classic EC &rarr; CBEV Migration &mdash; CBEV API Report</h1><div class="sub">{summary}</div></header>
<div class="tabs">{tabs}</div>
{panels}
<script>function show(id){{document.querySelectorAll('.panel').forEach(p=>p.style.display='none');
document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
document.getElementById(id).style.display='block';document.getElementById('btn_'+id).classList.add('active');}}</script>
</body></html>"""


def _load_config(path):
    p = Path(path)
    if not p.exists():
        t = p.parent / "migration_config.template.json"
        p = t if t.exists() else p
    return json.load(open(p))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="scenario_report2")
    ap.add_argument("--config", default=str(DEFAULT_CONFIG))
    ap.add_argument("--count", type=int, default=100)
    ap.add_argument("--start", type=int, default=None,
                    help="first MSISDN in the block (default 886970007100)")
    ap.add_argument("--out", default="cbev_migration_report.html")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-subordinate", action="store_true",
                    help="skip the master-subordinate (Multi-SIM) scenario")
    args = ap.parse_args(argv)

    if args.start:
        global RANGE_START
        RANGE_START = args.start

    cfg = _load_config(args.config)
    ucip = UcipClient(cfg)
    wb = cfg.get("mapping_workbook", "migration/config/mapping_template.xlsx")
    if not Path(wb).is_absolute():
        wb = _REPO_ROOT / wb
    engine = load_engine(wb)
    migrator = BssfMigrator(defaults=cfg.get("ecev_defaults", {}))

    scenarios = generate_scenarios(args.count)
    if not args.no_subordinate:
        # master + watch on the two numbers right after the standard block
        base = RANGE_START + len(scenarios)
        scenarios.append(master_subordinate_scenario(str(base), str(base + 1)))
    print(f"Running {len(scenarios)} scenarios (dry_run={args.dry_run}) ...")
    results = []
    for n, scn in enumerate(scenarios, 1):
        res = run_scenario(ucip, engine, migrator, scn, args.dry_run)
        results.append(res)
        print(f"  [{n:3}/{len(scenarios)}] {scn['msisdn']}  {scn['name'][:55]:55} "
              f"products={len(res['plan'].products)} cbev_calls={len(res['cbev_steps'])}")

    meta = {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
    out = Path(args.out)
    out.write_text(build_html(results, meta), encoding="utf-8")
    print(f"\nHTML report: {out.resolve()}  ({len(results)} tabs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
