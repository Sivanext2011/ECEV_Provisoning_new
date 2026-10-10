"""Bulk test-subscriber provisioning on Classic EC (SDP) via AIR UCIP.

Creates many test subscribers with different offers, UT (dedicated account) and
UC (accumulator) values, so they can later be migrated to ECEV. Per CPI (AIR
Programmer's Guide UCIP 5.0) the flow per subscriber is:

    InstallSubscriber   -> service class + initial UT (dedicatedAccountValueNew)
                           + base offers (offerUpdateInformationList, <=10)
    UpdateAccumulators  -> UC values (accumulatorValueNew)   [separate call]

UC (accumulators) ARE settable over UCIP (not read-only). UT is set absolutely
during InstallSubscriber; UC is set in the follow-up UpdateAccumulators call.

Plan source (choose one):
  * --plan <plan.xlsx>  : an Excel sheet 'Subscribers' (see --make-plan for template)
  * --range START COUNT : generate COUNT numbers from START with a rotating set
                          of profiles defined in PROFILES below.

Usage:
  python -m migration.bulk_provision --make-plan plan.xlsx
  python -m migration.bulk_provision --plan plan.xlsx [--dry-run] [--verify]
  python -m migration.bulk_provision --range 886970007015 10 [--dry-run] [--verify]
  python -m migration.bulk_provision --range 886970007015 10 --service-class 10

Config: migration/config/migration_config.json (ucip section) — same as the
migration tool (endpoint, credentials, NAI, negotiatedCapabilities).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

from .ucip_client import UcipClient, UcipError

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = _REPO_ROOT / "migration" / "config" / "migration_config.json"

GB = 1073741824  # bytes per GiB (LLD convention)

# Rotating test profiles used by --range. Each profile defines the service
# class, offers (offerID/offerType), and per-bucket UT (dedicated account) and
# UC (accumulator) values in BYTES. dedicatedAccountID / accumulatorID are the
# SDP bucket ids (from the per-family table / Resource Specification).
PROFILES = [
    {
        "name": "Basic",
        "service_class": 10,
        "offers": [{"offerID": 145001, "offerType": 1}],
        "ut": [{"id": 6145000, "gb": 50}],   # dedicated account (UT total)
        "uc": [{"id": 6145000, "gb": 20}],   # accumulator (UC consumed)
    },
    {
        "name": "Data Add-on",
        "service_class": 10,
        "offers": [{"offerID": 145001, "offerType": 1}, {"offerID": 160006, "offerType": 1}],
        "ut": [{"id": 6145000, "gb": 50}, {"id": 6160006, "gb": 50}],
        "uc": [{"id": 6145000, "gb": 20}, {"id": 6160006, "gb": 30}],
    },
    {
        "name": "Tethering",
        "service_class": 10,
        "offers": [{"offerID": 281007, "offerType": 1}],
        "ut": [{"id": 6281007, "gb": 100}],
        "uc": [{"id": 6281007, "gb": 10}],
    },
    {
        "name": "ToD Limited",
        "service_class": 10,
        "offers": [{"offerID": 157006, "offerType": 1}],
        "ut": [{"id": 6157006, "gb": 30}],
        "uc": [{"id": 6157006, "gb": 5}],
    },
]


def _ucip_from_config(config_path: str | Path) -> UcipClient:
    p = Path(config_path)
    if not p.exists():
        tmpl = p.parent / "migration_config.template.json"
        p = tmpl if tmpl.exists() else p
    with open(p) as f:
        cfg = json.load(f)
    return UcipClient(cfg)


def _expiry(days: int = 365) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y%m%dT%H:%M:%S+0000")


# ---------------------------------------------------------------------------
# Plan model
# ---------------------------------------------------------------------------

def _profile_to_entry(msisdn: str, profile: dict) -> dict:
    """Expand a PROFILES entry into a concrete per-subscriber plan entry."""
    return {
        "msisdn": msisdn,
        "service_class": profile["service_class"],
        "pam_service_id": profile.get("pam_service_id"),
        "offers": [dict(o) for o in profile["offers"]],
        "usage_thresholds": [{"id": d["id"], "value": int(d["gb"] * GB)} for d in profile["ut"]],
        "usage_counters": [{"id": a["id"], "value": int(a["gb"] * GB)} for a in profile["uc"]],
        "profile": profile["name"],
    }


def build_plan_from_range(start: str, count: int, service_class: int | None = None) -> list[dict]:
    entries = []
    base = int(start)
    for i in range(count):
        msisdn = str(base + i)
        profile = dict(PROFILES[i % len(PROFILES)])
        if service_class is not None:
            profile = {**profile, "service_class": service_class}
        entries.append(_profile_to_entry(msisdn, profile))
    return entries


def build_plan_from_xlsx(path: str | Path) -> list[dict]:
    from openpyxl import load_workbook
    wb = load_workbook(path, data_only=True)
    ws = wb["Subscribers"] if "Subscribers" in wb.sheetnames else wb.active
    rows = list(ws.iter_rows(values_only=True))
    headers = [str(c).strip() if c is not None else "" for c in rows[0]]

    def col(row, name):
        return row[headers.index(name)] if name in headers and headers.index(name) < len(row) else None

    entries = []
    for row in rows[1:]:
        if not row or row[0] is None:
            continue
        msisdn = str(int(row[0])) if isinstance(row[0], float) else str(row[0]).strip()
        if not msisdn:
            continue
        sc = col(row, "service_class")
        pam = col(row, "pam_service_id")
        if pam is None:
            pam = col(row, "bill_cycle")
        offers = _parse_pairs(col(row, "offers"), ("offerID", "offerType"))
        ut = _parse_bucket_values(col(row, "ut_bytes"))
        uc = _parse_bucket_values(col(row, "uc_bytes"))
        entries.append({
            "msisdn": msisdn,
            "service_class": int(sc) if sc is not None else None,
            "pam_service_id": int(pam) if pam is not None else None,
            "offers": offers,
            "usage_thresholds": ut,
            "usage_counters": uc,
            "profile": col(row, "profile") or "custom",
        })
    return entries


def _parse_pairs(cell, keys) -> list[dict]:
    """Parse 'offerID:offerType;...' e.g. '145001:1;160006:1' into dicts."""
    out = []
    if not cell:
        return out
    for part in str(cell).split(";"):
        part = part.strip()
        if not part:
            continue
        bits = part.split(":")
        d = {keys[0]: int(bits[0])}
        if len(bits) > 1 and bits[1]:
            d[keys[1]] = int(bits[1])
        out.append(d)
    return out


def _parse_bucket_values(cell) -> list[dict]:
    """Parse 'id:bytes;id:bytes' e.g. '6145000:32212254720;6160006:21474836480'."""
    out = []
    if not cell:
        return out
    for part in str(cell).split(";"):
        part = part.strip()
        if not part:
            continue
        bits = part.split(":")
        if len(bits) >= 2 and bits[1]:
            out.append({"id": int(bits[0]), "value": int(bits[1])})
    return out


def make_plan_template(path: str | Path) -> Path:
    """Write an example Subscribers plan workbook."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    wb = Workbook()
    ws = wb.active
    ws.title = "Subscribers"
    headers = ["msisdn", "profile", "service_class", "offers", "ut_bytes", "uc_bytes"]
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.font = Font(bold=True, color="FFFFFFFF")
        cell.fill = PatternFill("solid", fgColor="FF305496")
    examples = [
        ["886970007015", "Basic", 10, "145001:1", f"6145000:{50*GB}", f"6145000:{20*GB}"],
        ["886970007016", "Data Add-on", 10, "145001:1;160006:1",
         f"6145000:{50*GB};6160006:{50*GB}", f"6145000:{20*GB};6160006:{30*GB}"],
        ["886970007017", "Tethering", 10, "281007:1", f"6281007:{100*GB}", f"6281007:{10*GB}"],
    ]
    for r, row in enumerate(examples, 2):
        for c, v in enumerate(row, 1):
            ws.cell(row=r, column=c, value=v)
    for c, w in enumerate([16, 14, 14, 24, 40, 40], 1):
        ws.column_dimensions[chr(64 + c)].width = w
    ws.freeze_panes = "A2"
    # notes sheet
    notes = wb.create_sheet("README")
    for i, line in enumerate([
        "Bulk test-subscriber plan.",
        "offers:   'offerID:offerType;...'  e.g. 145001:1;160006:1",
        "ut_bytes: dedicated account (UT) 'bucketId:bytes;...'  (1 GiB = 1073741824)",
        "uc_bytes: accumulator (UC)        'bucketId:bytes;...'",
        "UT is set during InstallSubscriber; UC via UpdateAccumulators (both over UCIP).",
    ], 1):
        notes.cell(row=i, column=1, value=line)
    path = Path(path)
    wb.save(path)
    return path


# ---------------------------------------------------------------------------
# Provisioning
# ---------------------------------------------------------------------------

def provision_one(ucip: UcipClient, entry: dict, dry_run: bool, verify: bool) -> dict:
    msisdn = entry["msisdn"]
    result = {"msisdn": msisdn, "profile": entry.get("profile"), "steps": {}}

    offers = entry.get("offers") or []
    for o in offers:
        o.setdefault("startDate", datetime.now(timezone.utc).strftime("%Y%m%dT%H:%M:%S+0000"))
        o.setdefault("expiryDate", _expiry())

    thresholds = entry.get("usage_thresholds") or []   # UT (quota)
    counters = entry.get("usage_counters") or []        # UC (consumed)

    if dry_run:
        result["steps"]["InstallSubscriber"] = "DRY-RUN"
        result["install_request"] = ucip._build_body(
            "InstallSubscriber", msisdn, typed_members=_install_typed(entry))
        if thresholds or counters:
            from .ucip_client import _usage_threshold_array, _usage_counter_array
            tm = {}
            if thresholds:
                tm["usageThresholdUpdateInformation"] = _usage_threshold_array(thresholds)
            if counters:
                tm["usageCounterUpdateInformation"] = _usage_counter_array(counters)
            result["steps"]["UpdateUsageThresholdsAndCounters"] = "DRY-RUN"
            result["utuc_request"] = ucip._build_body(
                "UpdateUsageThresholdsAndCounters", msisdn, typed_members=tm)
        return result

    # 1. InstallSubscriber (SC + bill cycle + offers)
    try:
        ucip.install_subscriber(
            msisdn,
            service_class=entry.get("service_class"),
            pam_service_id=entry.get("pam_service_id"),
            offers=offers or None,
        )
        result["steps"]["InstallSubscriber"] = "OK"
    except UcipError as e:
        result["steps"]["InstallSubscriber"] = f"UCIP: {e}"
        result["error"] = str(e)
        return result
    except Exception as e:  # noqa: BLE001
        result["steps"]["InstallSubscriber"] = f"ERR: {e}"
        result["error"] = str(e)
        return result

    # 2. UpdateUsageThresholdsAndCounters (UT = quota, UC = consumed)
    if thresholds or counters:
        try:
            ucip.update_usage_thresholds_and_counters(
                msisdn, thresholds=thresholds or None, counters=counters or None,
                service_class=entry.get("service_class"))
            result["steps"]["UpdateUsageThresholdsAndCounters"] = "OK"
        except UcipError as e:
            result["steps"]["UpdateUsageThresholdsAndCounters"] = f"UCIP: {e}"
            result["error"] = str(e)
        except Exception as e:  # noqa: BLE001
            result["steps"]["UpdateUsageThresholdsAndCounters"] = f"ERR: {e}"
            result["error"] = str(e)

    # 3. optional verify - read UT/UC back and compare
    if verify:
        try:
            root = ucip.get_usage_thresholds_and_counters(msisdn)
            got_ut = _collect_values(root, "usageThresholdID", "usageThresholdValue")
            got_uc = _collect_values(root, "usageCounterID", "usageCounterValue")
            checks = []
            for t in thresholds:
                exp, act = int(t["value"]), got_ut.get(str(t["id"]))
                checks.append({"UT": t["id"], "expected": exp, "actual": act, "ok": act == exp})
            for c in counters:
                exp, act = int(c["value"]), got_uc.get(str(c["id"]))
                checks.append({"UC": c["id"], "expected": exp, "actual": act, "ok": act == exp})
            all_ok = all(ch["ok"] for ch in checks) if checks else True
            result["verify"] = {"ut": got_ut, "uc": got_uc, "checks": checks, "passed": all_ok}
            result["steps"]["GetUsageThresholdsAndCounters"] = "OK" if all_ok else "MISMATCH"
            if not all_ok:
                result["error"] = "UT/UC verify mismatch"
        except Exception as e:  # noqa: BLE001
            result["steps"]["GetUsageThresholdsAndCounters"] = f"ERR: {e}"

    return result


def _collect_values(root: ET.Element, id_tag: str, value_tag: str) -> dict:
    """Pair each <id_tag> with the nearest following <value_tag> in document order."""
    out = {}
    cur_id = None
    for e in root.iter():
        ln = e.tag.split("}")[-1]
        if ln == id_tag and e.text:
            cur_id = e.text.strip()
        elif ln == value_tag and e.text and cur_id is not None:
            try:
                out[cur_id] = int(e.text.strip())
            except ValueError:
                out[cur_id] = e.text.strip()
            cur_id = None
    return out


def _install_typed(entry: dict) -> dict:
    from .ucip_client import _offer_array
    typed = {}
    if entry.get("service_class") is not None:
        typed["serviceClassNew"] = int(entry["service_class"])
    if entry.get("pam_service_id") is not None:
        typed["pamServiceID"] = int(entry["pam_service_id"])
    if entry.get("offers"):
        typed["offerUpdateInformationList"] = _offer_array(entry["offers"])
    return typed


def _first(root: ET.Element, name: str):
    for e in root.iter():
        if e.tag.split("}")[-1] == name and e.text:
            return e.text.strip()
    return None


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv=None):
    p = argparse.ArgumentParser(prog="bulk_provision",
                                description="Bulk test-subscriber provisioning via AIR UCIP")
    p.add_argument("--config", default=str(DEFAULT_CONFIG))
    p.add_argument("--make-plan", metavar="XLSX", help="write an example plan workbook and exit")
    p.add_argument("--plan", metavar="XLSX", help="provision from an Excel plan")
    p.add_argument("--range", nargs=2, metavar=("START", "COUNT"),
                   help="generate COUNT numbers from START using rotating profiles")
    p.add_argument("--service-class", type=int, help="override service class for --range")
    p.add_argument("--dry-run", action="store_true", help="print requests, do not send")
    p.add_argument("--verify", action="store_true", help="GetAccountDetails after provisioning")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if args.make_plan:
        out = make_plan_template(args.make_plan)
        print(f"Wrote plan template: {out.resolve()}")
        return 0

    if args.plan:
        plan = build_plan_from_xlsx(args.plan)
    elif args.range:
        plan = build_plan_from_range(args.range[0], int(args.range[1]), args.service_class)
    else:
        p.error("provide --plan <xlsx> or --range START COUNT (or --make-plan)")
        return 2

    ucip = _ucip_from_config(args.config)
    print(f"Provisioning {len(plan)} subscriber(s)  dry_run={args.dry_run}  verify={args.verify}\n")

    summary = {"ok": 0, "failed": 0}
    for entry in plan:
        res = provision_one(ucip, entry, dry_run=args.dry_run, verify=args.verify)
        if args.dry_run:
            print(f"[DRY-RUN] {res['msisdn']} ({res['profile']})")
            print("  InstallSubscriber:\n   ", res.get("install_request", "")[:400], "...")
            if res.get("accumulators_request"):
                print("  UpdateAccumulators:\n   ", res["accumulators_request"][:300], "...")
        else:
            steps = " ".join(f"{k}={v}" for k, v in res["steps"].items())
            ok = "error" not in res
            summary["ok" if ok else "failed"] += 1
            flag = "OK " if ok else "FAIL"
            print(f"[{flag}] {res['msisdn']} ({res['profile']})  {steps}"
                  + (f"  verify={res.get('verify')}" if res.get("verify") else ""))
        print()

    if not args.dry_run:
        print(f"=== Done: {summary['ok']} ok, {summary['failed']} failed ===")
        return 0 if summary["failed"] == 0 else 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
