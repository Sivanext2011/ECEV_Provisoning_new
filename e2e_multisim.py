#!/usr/bin/env python
"""Install a MASTER + SUBORDINATE (multi-SIM) subscriber on SDP, then migrate.

Steps:
 1. Find fresh master + subordinate MSISDNs in the AF-routable range.
 2. InstallSubscriber the master (sc=5010, pam=1, offer 145001) and set a UT.
 3. UpdateMultiSubscriberNumbers to add the subordinate (action=0, with IMSI).
 4. GetMultiSubscriberNumbers to confirm the subordinate is linked.
 5. Migrate the master via the tool and confirm the subordinate is carried into
    the CBEV contract (plan.additional_msisdns + verify resolves it).
"""
import asyncio
import json
import sys
import xml.etree.ElementTree as ET

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
SC, PAM = 5010, 1
UT_BYTES = 2 * 1024 ** 3


def is_fresh(u, msisdn) -> bool:
    try:
        u.fetch_profile(msisdn)
        return False
    except Exception as e:
        return "102" in str(e)   # rc=102 subscriber not found


def find_two_fresh(u):
    found = []
    for n in range(400, 460):
        m = f"886970007{n:03d}"
        if is_fresh(u, m):
            found.append(m)
        if len(found) == 2:
            break
    return found


async def main():
    ucip = UcipClient(CFG)
    master, sub = find_two_fresh(ucip)
    sub_imsi = "466920000" + sub[-6:]
    print(f"MASTER={master}  SUBORDINATE={sub}  (imsi {sub_imsi})")

    # 1. install master with offer + UT
    print("[SDP] InstallSubscriber master")
    ucip.install_subscriber(master, service_class=SC, pam_service_id=PAM,
                            offers=[{"offerID": 145001, "offerType": 0}])
    try:
        ucip.update_usage_thresholds_and_counters(
            master, thresholds=[{"id": 6145000, "value": UT_BYTES}])
    except Exception as e:
        print("  UT set note:", str(e)[:80])

    # 2. install the subordinate as its own subscriber first
    print("[SDP] InstallSubscriber subordinate")
    ucip.install_subscriber(sub, service_class=SC, pam_service_id=PAM)

    # 3. link subordinate -> master account (ACIP LinkSubordinateSubscriber)
    print("[SDP] LinkSubordinateSubscriber (subordinate -> master)")
    el = ucip.link_subordinate_subscriber(sub, master_account_number=master)
    print("  resp:", ET.tostring(el, encoding="unicode")[:160])

    # 4. read back the relationship via GetAccountDetails on the subordinate
    try:
        root = ucip.call("GetAccountDetails", sub, typed_members={
            "requestSubscriberInformationFlag": True})
        txt = ET.tostring(root, encoding="unicode")
        print("[SDP] subordinate GetAccountDetails has master link:", master in txt or "masterSubscriber" in txt)
    except Exception as e:
        print("  readback note:", str(e)[:80])

    # 4. migrate the master
    report = MigrationReport(master)
    ucip.recorder = report.ucip_calls
    _ec.api_logs.clear()
    engine = load_engine(CFG["mapping_workbook"])
    if getattr(engine.wb, "fetch_operations", None):
        ucip.fetch_operations = dict(engine.wb.fetch_operations)
    migrator = BssfMigrator(defaults=CFG.get("ecev_defaults", {}))
    verifier = Verifier(migrator)
    store = StateStore("e2e_state.db")
    await store.init()
    orch = Orchestrator(ucip=ucip, engine=engine, migrator=migrator,
                        verifier=verifier, store=store,
                        do_ec_delete=False, dry_run=False)

    print("\n=== MIGRATE master (with user-supplied subordinate) ===")
    result = await orch.migrate(master, force=True,
                                subordinates=[{"msisdn": sub, "imsi": sub_imsi}])
    report.profile = result.profile
    report.plan = result.plan
    report.result = result
    report.bssf_calls = list(_ec.api_logs)

    print("state:", result.state)
    if result.plan:
        subs = [s.msisdn for s in result.plan.additional_msisdns]
        print("subordinates in plan:", subs)
    for chk in (getattr(result, "verify_report", {}) or {}).get("checks", []):
        if "subordinate" in chk:
            print("subordinate check:", chk)

    report.render_html("migration_report_multisim.html")
    print("report: migration_report_multisim.html")


if __name__ == "__main__":
    asyncio.run(main())
