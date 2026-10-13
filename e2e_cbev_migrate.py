#!/usr/bin/env python
"""E2E (CBEV side): since the SDP/UCIP user lacks provisioning+read privileges
(403 Insufficient user privileges), build a synthetic SubscriberProfile exactly
as fetch_profile would produce, then run the tool's MAP -> CBEV PROVISION ->
VERIFY path live. Proves the updated engine (balance_mechanism) end-to-end.

Covers both mechanisms:
  145001 Basic  -> balance_mechanism POP  (POP_RegularRecurrence+POP_Prorating_Activation)
  155006 OneTime-> balance_mechanism InitialChar (Initial PO characteristic)
"""
import asyncio
import json
import sys

sys.path.insert(0, ".")
from migration.mapping_engine import load_engine
from migration.bssf_migrator import BssfMigrator
from migration.verifier import Verifier
from migration.models import (SubscriberProfile, ECOffer, ECOfferAttribute,
                              ECDedicatedAccount, ECAccumulator)

GB = 1024 ** 3
CFG = json.load(open("migration/config/migration_config.json"))
MSISDN = "886970007090"


def synth_profile():
    p = SubscriberProfile(master_msisdn=MSISDN)
    p.service_class = "10"
    p.imsi = "466920000007090"
    p.offers = [
        ECOffer(offer_id="145001", attributes=[
            ECOfferAttribute(name="HighBandwidth", value="Speed1G"),
            ECOfferAttribute(name="FlatRate", value="No")]),
        ECOffer(offer_id="155006", attributes=[
            ECOfferAttribute(name="HighBandwidth", value="Speed1G")]),
    ]
    p.dedicated_accounts = [
        ECDedicatedAccount(dedicated_account_id="6145000", value=30, unit="gibibyte"),
        ECDedicatedAccount(dedicated_account_id="6155006", value=10, unit="gibibyte"),
    ]
    p.accumulators = [
        ECAccumulator(accumulator_id="6145000", value=20, unit="gibibyte"),
        ECAccumulator(accumulator_id="6155006", value=4, unit="gibibyte"),
    ]
    return p


async def main():
    print("=== E2E (CBEV live) migrate", MSISDN, "===")
    engine = load_engine(CFG["mapping_workbook"])
    migrator = BssfMigrator(defaults=CFG.get("ecev_defaults", {}))
    verifier = Verifier(migrator)

    prof = synth_profile()
    plan = engine.build_plan(prof)
    print("MAP ok. products + mechanisms:")
    for p in plan.products:
        pops = (p.pop_price or {}).get("pop_external_ids", []) if p.pop_price else []
        print(f"  {p.product_offering_external_id}: mech={p.balance_mechanism} "
              f"Initial={p.characteristics.get('Initial')} POPs={pops} "
              f"buckets={[(b.bucket_spec_external_id,b.amount) for b in p.buckets]}")

    print("\nPROVISION on CBEV ...")
    try:
        party = await migrator.create_party(plan)
        print("  party:", party.get("externalId"))
        customer = await migrator.create_customer(plan)
        print("  customer:", customer.get("externalId"), "(settling 8s for propagation)")
        await asyncio.sleep(8)
        contract = await migrator.create_contract(plan)
        print("  contract:", contract.get("externalId"))
        adj = await migrator.adjust_buckets(plan)
        print("  bucket adjustments:", len(adj) if adj else 0)
    except Exception as e:
        print("  CBEV ERROR:", type(e).__name__, str(e)[:400])
        return

    print("\nVERIFY on CBEV ...")
    try:
        v = await verifier.verify(plan)
        print("  verify:", v)
    except Exception as e:
        print("  VERIFY ERROR:", type(e).__name__, str(e)[:300])


if __name__ == "__main__":
    asyncio.run(main())
