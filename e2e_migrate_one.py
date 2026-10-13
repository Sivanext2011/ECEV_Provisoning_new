#!/usr/bin/env python
"""E2E: migrate a REAL existing SDP subscriber through the tool, with HTML report.

Captures the UCIP fetch requests/responses, the mapping decisions, the CBEV
provisioning requests/responses, and the final validation into an HTML page.

Usage: python e2e_migrate_one.py [MSISDN] [--report PATH]
"""
import asyncio
import json
import sys

sys.path.insert(0, ".")
from migration.ucip_client import UcipClient
from migration.mapping_engine import load_engine
from migration.bssf_migrator import BssfMigrator
from migration.verifier import Verifier
from migration.state_store import StateStore
from migration.orchestrator import Orchestrator
from migration.migration_report import MigrationReport
from backend.app.services import ericsson_client as _ec

CFG = json.load(open("migration/config/migration_config.json"))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
MSISDN = args[0] if args else "886970007050"
REPORT = "migration_report.html"
if "--report" in sys.argv:
    REPORT = sys.argv[sys.argv.index("--report") + 1]
SUBORDINATES = None
if "--subordinates" in sys.argv:
    raw = sys.argv[sys.argv.index("--subordinates") + 1]
    SUBORDINATES = [{"msisdn": x.strip()} for x in raw.split(",") if x.strip()]


async def main():
    report = MigrationReport(MSISDN)

    ucip = UcipClient(CFG)
    ucip.recorder = report.ucip_calls          # capture every UCIP request/response
    _ec.api_logs.clear()                        # fresh BSSF capture

    print(f"=== E2E migrate REAL subscriber {MSISDN} (report -> {REPORT}) ===")

    engine = load_engine(CFG["mapping_workbook"])
    # Apply the FetchOperations toggles from the mapping workbook to the UCIP client,
    # so FETCH only runs the enabled SDP calls (e.g. skip GetBalanceAndDate/Accumulators).
    if getattr(engine.wb, "fetch_operations", None):
        ucip.fetch_operations = dict(engine.wb.fetch_operations)
        print("[cfg] fetch operations:",
              {k: v for k, v in ucip.fetch_operations.items()})
    migrator = BssfMigrator(defaults=CFG.get("ecev_defaults", {}))
    verifier = Verifier(migrator)
    store = StateStore("e2e_state.db")
    await store.init()
    orch = Orchestrator(ucip=ucip, engine=engine, migrator=migrator,
                        verifier=verifier, store=store,
                        do_ec_delete=False, dry_run=False)

    result = await orch.migrate(MSISDN, force=True, subordinates=SUBORDINATES)

    # populate report
    report.profile = result.profile
    report.plan = result.plan
    report.result = result
    report.bssf_calls = list(_ec.api_logs)      # snapshot BSSF requests/responses

    print("state:", result.state)
    print("ecev_ids:", json.dumps(result.ecev_ids, indent=1))
    if result.plan:
        for p in result.plan.products:
            pops = (p.pop_price or {}).get("pop_external_ids", []) if p.pop_price else []
            print(f"  {p.product_offering_external_id}: mech={p.balance_mechanism} "
                  f"Initial={p.characteristics.get('Initial')} POPs={pops}")

    path = report.render_html(REPORT)
    print("\nHTML report written:", path)
    print("  UCIP calls captured:", len(report.ucip_calls))
    print("  BSSF calls captured:", len(report.bssf_calls))


if __name__ == "__main__":
    asyncio.run(main())
