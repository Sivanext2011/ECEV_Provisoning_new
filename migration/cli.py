"""Migration CLI.

Usage:
  python -m migration.cli init-template [--out migration/config/mapping_template.xlsx]
  python -m migration.cli migrate <msisdn> [--dry-run] [--no-ec-delete] [--force]
  python -m migration.cli batch <file.txt|msisdn,msisdn,...> [--dry-run] [--force]
  python -m migration.cli report

Config:
  --config migration/config/migration_config.json   (UCIP endpoint, ECEV defaults, options)
  The ECEV BSSF connection (OAuth2, hosts, TLS, proxy) is read from the existing
  config/config.json used by the provisioning tool.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from dataclasses import asdict
from pathlib import Path

from . import excel_template
from .bssf_migrator import BssfMigrator
from .mapping_engine import load_engine
from .models import MigrationState
from .orchestrator import Orchestrator
from .state_store import StateStore
from .ucip_client import UcipClient
from .verifier import Verifier

_REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = _REPO_ROOT / "migration" / "config" / "migration_config.json"


def _load_config(path: str | Path) -> dict:
    p = Path(path)
    if not p.exists():
        template = p.parent / "migration_config.template.json"
        if template.exists():
            print(f"[!] {p} not found; using template {template.name}. "
                  f"Copy & edit it for your environment.")
            p = template
        else:
            raise SystemExit(f"Config not found: {p}")
    with open(p) as f:
        return json.load(f)


def _build_orchestrator(config: dict, *, dry_run: bool, do_ec_delete: bool) -> Orchestrator:
    ucip = UcipClient(config)
    wb_path = config.get("mapping_workbook", "migration/config/mapping_template.xlsx")
    if not Path(wb_path).is_absolute():
        wb_path = _REPO_ROOT / wb_path
    engine = load_engine(wb_path)
    # The authoritative ECEV spec externalIds (partySpecExternalId,
    # customerSpecExternalId, contractSpecExternalId, billingAccountSpecExternalId,
    # partitionId, msisdnResourceSpecExternalId, ...) live in the backend
    # config.json 'defaults' validated against the live environment. Start from
    # those and let the migration config's 'ecev_defaults' override only what it
    # explicitly sets, so we never post placeholder spec ids (which 404).
    merged_defaults: dict = {}
    try:
        from backend.app.services.ericsson_client import ericsson_client as _ec  # type: ignore
        merged_defaults.update(_ec.defaults or {})
    except Exception as e:
        logging.getLogger(__name__).warning(
            "Could not load backend config.json defaults (%s); using migration ecev_defaults only", e)
    merged_defaults.update(config.get("ecev_defaults", {}) or {})
    migrator = BssfMigrator(defaults=merged_defaults)
    tolerance = config.get("options", {}).get("verify_tolerance_bytes", 0)
    verifier = Verifier(migrator, tolerance_bytes=tolerance)
    store = StateStore()
    return Orchestrator(ucip, engine, migrator, verifier, store,
                        do_ec_delete=do_ec_delete, dry_run=dry_run)


async def _cmd_migrate(args):
    config = _load_config(args.config)
    do_del = config.get("options", {}).get("do_ec_delete", True) and not args.no_ec_delete
    orch = _build_orchestrator(config, dry_run=args.dry_run, do_ec_delete=do_del)
    await orch.store.init()
    result = await orch.migrate(args.msisdn, force=args.force)
    _print_result(result)
    return 0 if result.state not in (MigrationState.FAILED,) else 2


async def _cmd_batch(args):
    config = _load_config(args.config)
    do_del = config.get("options", {}).get("do_ec_delete", True) and not args.no_ec_delete
    orch = _build_orchestrator(config, dry_run=args.dry_run, do_ec_delete=do_del)
    await orch.store.init()

    src = args.source
    if Path(src).exists():
        msisdns = [l.strip() for l in Path(src).read_text().splitlines()
                   if l.strip() and not l.startswith("#")]
    else:
        msisdns = [m.strip() for m in src.split(",") if m.strip()]

    results = await orch.migrate_batch(msisdns, force=args.force)
    for r in results:
        _print_result(r)
    report = await orch.store.report()
    print("\n=== Reconciliation report ===")
    print(json.dumps(report, indent=2))
    failed = sum(1 for r in results if r.state == MigrationState.FAILED)
    return 0 if failed == 0 else 2


async def _cmd_report(args):
    store = StateStore()
    await store.init()
    print(json.dumps(await store.report(), indent=2))
    return 0


def _cmd_init_template(args):
    out = args.out or "migration/config/mapping_template.xlsx"
    path = excel_template.generate(out)
    print(f"Wrote mapping workbook: {path.resolve()}")
    print("Edit the sheets (Settings / ServiceClassMap / FamilyBucketSpecs / "
          "OfferAttributeMap / ParameterMapping) then point migration_config.json "
          "'mapping_workbook' at it.")
    return 0


def _print_result(result):
    print(f"[{result.state.value:12}] {result.msisdn}"
          + (f"  step={result.failed_step}" if result.failed_step else "")
          + (f"  error={result.error}" if result.error else ""))
    if result.ecev_ids:
        print("    ecev:", json.dumps(result.ecev_ids))
    if result.verify_report and result.verify_report.get("checks"):
        passed = sum(1 for c in result.verify_report["checks"] if c.get("passed"))
        total = len(result.verify_report["checks"])
        print(f"    verify: {passed}/{total} checks passed")
    # On successful migration, show the SDP <-> ECEV comparison table.
    if result.state in (MigrationState.VERIFIED, MigrationState.EC_DELETED):
        _print_sdp_ecev_comparison(result)


def _print_sdp_ecev_comparison(result):
    """Render a side-by-side SDP (source) vs ECEV (target) comparison table."""
    prof = result.profile
    plan = result.plan
    if not prof or not plan:
        return
    actual = (result.verify_report or {}).get("actual_buckets", {}) or {}

    rows = []  # (field, SDP value, ECEV value)
    # identity / account-level
    rows.append(("MSISDN", prof.master_msisdn, prof.master_msisdn))
    rows.append(("Service Class", prof.service_class or "-", plan.service_class_ecev or "-"))
    rows.append(("PAM schedule", getattr(prof, "pam_schedule_id", None) or "-",
                 f"{plan.bill_cycle_spec_external_id or '-'} (sched {plan.pam_schedule_id or '-'})"))
    rows.append(("Party / Customer / Contract", "(n/a in EC)",
                 f"{plan.party_external_id} / {plan.customer_external_id} / {plan.contract_external_id}"))

    # per-offer / product + buckets
    # SDP UT/UC per counter (bytes) from the fetched profile
    sdp_ut = {d.dedicated_account_id: int(d.value) for d in prof.dedicated_accounts}
    sdp_uc = {a.accumulator_id: int(a.value) for a in prof.accumulators}
    sdp_offers = {o.offer_id for o in prof.offers}
    for p in plan.products:
        po = p.product_offering_external_id
        in_ec = "yes" if po in sdp_offers else "(derived)"
        rows.append((f"Offer/PO {po}", f"present in EC: {in_ec}",
                     f"PO {po} (aligned={'Y' if p.bill_cycle_aligned else 'N'})"))
        for b in p.buckets:
            spec = b.bucket_spec_external_id
            # SDP source for this bucket (UT-UC for account; UC for counter) if known
            base = spec.split("_")[0]
            if spec.endswith("_CTR"):
                sdp_val = sdp_uc.get(base, 0)
                label = f"  bucket {spec} (UC)"
            else:
                ut = sdp_ut.get(base, 0); uc = sdp_uc.get(base, 0)
                sdp_val = max(ut - uc, 0) if (ut or uc) else b.amount
                label = f"  bucket {spec} (UT-UC)"
            ecev_val = actual.get(spec, b.amount)
            match = "OK" if int(ecev_val) == int(b.amount) else "DIFF"
            rows.append((label, f"{sdp_val:,} B", f"{int(ecev_val):,} B [{match}]"))

    # render
    w1 = max(len(r[0]) for r in rows + [("Field", "", "")])
    w2 = max(len(str(r[1])) for r in rows + [("", "SDP (Classic EC)", "")])
    w3 = max(len(str(r[2])) for r in rows + [("", "", "ECEV (CBEV)")])
    sep = "    +" + "-" * (w1 + 2) + "+" + "-" * (w2 + 2) + "+" + "-" * (w3 + 2) + "+"
    print("\n    === SDP  <->  ECEV comparison ===")
    print(sep)
    print(f"    | {'Field'.ljust(w1)} | {'SDP (Classic EC)'.ljust(w2)} | {'ECEV (CBEV)'.ljust(w3)} |")
    print(sep)
    for f, s, e in rows:
        print(f"    | {str(f).ljust(w1)} | {str(s).ljust(w2)} | {str(e).ljust(w3)} |")
    print(sep)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="migration", description="Classic EC -> CBEV migration tool")
    p.add_argument("--config", default=str(DEFAULT_CONFIG), help="migration config json")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="command", required=True)

    pt = sub.add_parser("init-template", help="generate the Excel mapping workbook")
    pt.add_argument("--out", help="output xlsx path")

    pm = sub.add_parser("migrate", help="migrate a single subscriber")
    pm.add_argument("msisdn")
    pm.add_argument("--dry-run", action="store_true", help="fetch+map only, no ECEV writes")
    pm.add_argument("--no-ec-delete", action="store_true", help="do not delete from EC")
    pm.add_argument("--force", action="store_true", help="re-run even if already migrated")

    pb = sub.add_parser("batch", help="migrate many subscribers (file or comma list)")
    pb.add_argument("source", help="path to a file of MSISDNs, or comma-separated list")
    pb.add_argument("--dry-run", action="store_true")
    pb.add_argument("--no-ec-delete", action="store_true")
    pb.add_argument("--force", action="store_true")

    sub.add_parser("report", help="print the reconciliation report")
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if args.command == "init-template":
        return _cmd_init_template(args)
    if args.command == "migrate":
        return asyncio.run(_cmd_migrate(args))
    if args.command == "batch":
        return asyncio.run(_cmd_batch(args))
    if args.command == "report":
        return asyncio.run(_cmd_report(args))
    return 1


if __name__ == "__main__":
    sys.exit(main())
