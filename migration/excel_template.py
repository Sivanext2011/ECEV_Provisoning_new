"""Generate the user-editable Excel mapping workbook.

The workbook is the single place where the user controls *all* mapping and
value-derivation logic without touching code. The mapping_engine reads it at
run time. Sheets:

  Settings          - global constants (bytes per unit, partition strategy, ...)
  ServiceClassMap   - SDP serviceClassCurrent -> ECEV ServiceClass value
  FamilyBucketSpecs - offerID -> PO externalId, POP type, bucket spec ext ids
  OfferAttributeMap - SDP offer attribute -> ECEV PO characteristic
  ParameterMapping  - SDP source field -> ECEV target + derivation expression

Derivation expressions are small, safe Python-like expressions evaluated by the
mapping_engine against a restricted context (see mapping_engine.evaluate()).
Variables available: UT, UC, carried, bytes_per_unit(unit), flat_rate, etc.
"""

from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter


HEADER_FILL = PatternFill(start_color="FF305496", end_color="FF305496", fill_type="solid")
HEADER_FONT = Font(color="FFFFFFFF", bold=True)
NOTE_FONT = Font(italic=True, color="FF808080")


def _write_sheet(wb: Workbook, title: str, headers: list[str], rows: list[list], notes: str = ""):
    ws = wb.create_sheet(title=title)
    start = 1
    if notes:
        ws.cell(row=1, column=1, value=notes).font = NOTE_FONT
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(len(headers), 1))
        ws.row_dimensions[1].height = 28
        ws.cell(row=1, column=1).alignment = Alignment(wrap_text=True, vertical="top")
        start = 2

    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=start, column=col, value=h)
        c.fill = HEADER_FILL
        c.font = HEADER_FONT
    for r, row in enumerate(rows, start=start + 1):
        for col, val in enumerate(row, start=1):
            ws.cell(row=r, column=col, value=val)

    # autosize-ish
    for col in range(1, len(headers) + 1):
        letter = get_column_letter(col)
        maxlen = len(str(headers[col - 1]))
        for row in rows:
            if col - 1 < len(row) and row[col - 1] is not None:
                maxlen = max(maxlen, len(str(row[col - 1])))
        ws.column_dimensions[letter].width = min(max(maxlen + 2, 12), 60)
    ws.freeze_panes = ws.cell(row=start + 1, column=1)
    return ws


def build_workbook() -> Workbook:
    wb = Workbook()
    # drop the default sheet
    wb.remove(wb.active)

    # ---- Settings -------------------------------------------------------
    _write_sheet(
        wb, "Settings",
        ["key", "value", "description"],
        [
            ["bytes_per_GB", 1073741824, "1 GiB = 1073741824 bytes (LLD convention)"],
            ["bytes_per_MB", 1048576, "1 MiB in bytes"],
            ["bytes_per_KB", 1024, "1 KiB in bytes"],
            ["default_qos_info", "HIGH", "QoS_info char default; LOW for post-quota families"],
            ["partition_strategy", "hash", "hash | roundrobin | fixed  (how OCSG picks CP partition)"],
            ["partition_values", "1,2", "comma-separated partition ids to balance across (e.g. CP1=1,CP2=2)"],
            ["party_external_id_pattern", "party-{subref}", "party externalId; {subref}=random 8-char ref (NOT msisdn)"],
            ["customer_external_id_pattern", "customer-{subref}", "customer externalId; {subref}=random ref"],
            ["contract_external_id_pattern", "contract-{subref}", "contract externalId; {subref}=random ref"],
            ["billing_account_external_id_pattern", "ba-{subref}", "billing account externalId; {subref}=random ref"],
            ["msisdn_resource_spec_external_id", "ext_LRS_MSISDN", "resourceSpecificationExternalId for MSISDN identity"],
            ["contract_spec_external_id", "CHT_Contract_Postpaid", "contractSpecification externalId"],
            ["customer_spec_external_id", "CHT_Customer_Postpaid", "customerSpecification externalId"],
            ["billing_account_spec_external_id", "BAS_CHT_Postpaid", "billingAccountSpecExternalId"],
            ["service_class_char_name", "ServiceClass", "contract charSpecExternalId carrying service class"],
        ],
        notes="Global settings. 'key'/'value' pairs are read by the mapping engine. "
              "Edit values to match the target ECEV catalog (BusinessConfig).",
    )

    # ---- ServiceClassMap ------------------------------------------------
    _write_sheet(
        wb, "ServiceClassMap",
        ["sdp_service_class", "sdp_plan_description", "ecev_service_class_value"],
        [
            ["5101", "Postpaid 5G PPP standard", "5101"],
            ["5102", "Postpaid 5G PPP VIP", "5102"],
            ["5103", "Postpaid 5G PPP high-bandwidth", "5103"],
        ],
        notes="SDP serviceClassCurrent -> ECEV ServiceClass contract characteristic value. "
              "Add one row per service class. Complete from the Resource Specification sheet.",
    )

    # ---- ScheduleBillCycleMap ------------------------------------------
    # SDP PAM schedule id -> CBEV billCycleSpecExternalId. Bill cycle is set
    # PER PAM SCHEDULE (schedule 1 = Bill Cycle 1st, 2 = 6th, 3 = 11th, ...).
    _write_sheet(
        wb, "ScheduleBillCycleMap",
        ["sdp_schedule_id", "sdp_schedule_name", "ecev_bill_cycle_spec_external_id"],
        [
            ["1", "Bill Cycle 1st (Days=32)",  "CHT_billcycle_01"],
            ["2", "Bill Cycle 6th (Days=5)",   "CHT_billcycle_06"],
            ["3", "Bill Cycle 11th (Days=10)", "CHT_billcycle_11"],
            ["4", "Bill Cycle 16th (Days=15)", "CHT_billcycle_16"],
            ["5", "Bill Cycle 21st (Days=20)", "CHT_billcycle_21"],
            ["6", "Bill Cycle 26th (Days=25)", "CHT_billcycle_26"],
        ],
        notes="SDP PAM scheduleID -> CBEV billCycleSpecExternalId (verified live: CHT_billcycle_01..28). "
              "The migrator reads the subscriber's PAM schedule (GetAccountDetails 'Periodic account "
              "management' / scheduleID) and sets the matching bill cycle on the billing account. "
              "Mapping derived from SDP Schedule config (schedule N -> bill-cycle start day). "
              "Unmapped schedules fall back to the global billCycleSpecExternalId setting.",
    )

    # ---- FamilyBucketSpecs ---------------------------------------------
    # offerID, PO ext (same id), POP type, account bucket, counter bucket,
    # carryover account bucket, carryover counter/flag bucket, flat_rate_default
    from . import gen_family_specs
    _write_sheet(
        wb, "FamilyBucketSpecs",
        ["offer_id", "family", "po_external_id", "pop_type", "bill_cycle_aligned",
         "account_bucket_spec", "counter_bucket_spec",
         "carryover_account_bucket_spec", "carryover_flag_bucket_spec",
         "flat_rate_default"],
        gen_family_specs.build_rows(),
        notes="offerID -> ECEV PO externalId. COMPLETE catalog (all PPP/MDVPN offers + sequential "
              "variants). bill_cycle_aligned per catalog: 'Yes' for all offers EXCEPT One-Time (155xxx) "
              "and Fixed-Expiry (156xxx) promos. Post-quota/bundle offers (255xxx, 281008/281108, 25001) "
              "have NO POP but ARE bill-cycle-aligned -> Yes. Account=UT-UC, Counter=UC.",
    )

    # ---- OfferAttributeMap ---------------------------------------------
    _write_sheet(
        wb, "OfferAttributeMap",
        ["sdp_attribute_name", "ecev_char_name", "target", "value_transform", "description"],
        [
            ["HighBandwidth", "HighBandwidth", "product", "asis", "Speed value for non-post-quota offers (Basic/Addon/Tethering/ToD/etc.)"],
            ["LowBandwidth", "LowBandwidth", "product", "asis", "Speed value for POST-QUOTA/Bundle offers (255xxx, 281008) - Depleted-state speed"],
            ["FlatRate", "FlatRate", "product", "asis", "Yes->unlimited (no bucket); only Basic/Tethering-base carry it"],
            ["ToD", "TimeOfDayPlan", "product", "asis", "PLAN_A..PLAN_F selects Band_A..F"],
            ["Installer", "InstallerID", "product", "asis", "Installer id as-is (ESP/carryover = OCSG)"],
            ["QoS", "QoS_info", "product", "asis", "HIGH for non-post-quota; LOW for post-quota"],
        ],
        notes="SDP offerAttribute name -> ECEV characteristic. target=product|contract. "
              "value_transform: asis | upper | lower | map:<FromValue>=<ToValue>;... "
              "Post-quota/bundle offers (255xxx, 281008) use LowBandwidth (Depleted speed), not HighBandwidth.",
    )

    # ---- ParameterMapping ----------------------------------------------
    # The engine-driven mapping of top-level profile fields. Derivation column
    # holds an expression evaluated with the safe context (see mapping_engine).
    _write_sheet(
        wb, "ParameterMapping",
        ["sdp_source", "ecev_target", "target_scope", "derivation", "description"],
        [
            ["master_msisdn", "accountID", "product_char", "master_msisdn",
             "accountID char on every PO = master MSISDN"],
            ["service_class", "ServiceClass", "contract_char", "map_service_class(service_class)",
             "mapped via ServiceClassMap sheet; set on contract"],
            ["offer_id", "productOfferingExternalId", "product", "offer_id",
             "1:1 same id; add via agreement product"],
            ["account_bucket", "account_bucket_spec", "bucket", "to_bytes(UT - UC)",
             "Account bucket value in bytes. Skip when flat_rate."],
            ["counter_bucket", "counter_bucket_spec", "bucket", "to_bytes(UC)",
             "Counter bucket value in bytes."],
            ["carryover_account", "carryover_account_bucket_spec", "bucket", "to_bytes(carried)",
             "Carried bytes into carryover account bucket."],
            ["carryover_flag", "carryover_flag_bucket_spec", "bucket", "1",
             "Carryover counter/flag = 1 when carryover present."],
            ["offer_expiry", "product_valid_to", "product", "offer_expiry",
             "Set product lifecycle valid-to = EC expiry date (fixed-expiry)."],
        ],
        notes="Top-level parameter mapping with derivation expressions. target_scope: "
              "product_char | contract_char | product | bucket. Expression context exposes: "
              "master_msisdn, service_class, offer_id, UT, UC, carried, offer_expiry, flat_rate, "
              "to_bytes(x), map_service_class(x). Account=UT-UC, Counter=UC.",
    )

    return wb


def generate(path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    wb = build_workbook()
    wb.save(path)
    return path


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "migration/config/mapping_template.xlsx"
    p = generate(out)
    print(f"Wrote mapping workbook: {p.resolve()}")
