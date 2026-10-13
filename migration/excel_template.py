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


def _write_sheet(wb: Workbook, title: str, headers: list[str], rows: list[list],
                 notes: str = "", col_comments: dict | None = None):
    from openpyxl.styles import Border, Side, PatternFill as _PF
    from openpyxl.comments import Comment
    ws = wb.create_sheet(title=title)
    thin = Side(style="thin", color="FFD0D7E2")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    band = _PF(start_color="FFF2F6FB", end_color="FFF2F6FB", fill_type="solid")

    start = 1
    if notes:
        c = ws.cell(row=1, column=1, value=notes)
        c.font = NOTE_FONT
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(len(headers), 1))
        ws.row_dimensions[1].height = 42
        c.alignment = Alignment(wrap_text=True, vertical="top")
        start = 2

    # header row
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=start, column=col, value=h)
        c.fill = HEADER_FILL
        c.font = HEADER_FONT
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="left")
        c.border = border
        if col_comments and h in col_comments:
            cm = Comment(col_comments[h], "mapping")
            cm.width, cm.height = 320, 120
            c.comment = cm
    ws.row_dimensions[start].height = 30

    # data rows with zebra striping + borders
    for r, row in enumerate(rows, start=start + 1):
        for col, val in enumerate(row, start=1):
            cell = ws.cell(row=r, column=col, value=val)
            cell.border = border
            cell.alignment = Alignment(vertical="center")
            if (r - start) % 2 == 0:
                cell.fill = band

    # column widths
    for col in range(1, len(headers) + 1):
        letter = get_column_letter(col)
        maxlen = len(str(headers[col - 1]))
        for row in rows:
            if col - 1 < len(row) and row[col - 1] is not None:
                maxlen = max(maxlen, len(str(row[col - 1])))
        ws.column_dimensions[letter].width = min(max(maxlen + 2, 12), 55)

    ws.freeze_panes = ws.cell(row=start + 1, column=1)
    ws.sheet_view.showGridLines = False
    return ws


def build_workbook() -> Workbook:
    wb = Workbook()
    # drop the default sheet
    wb.remove(wb.active)

    # ---- Glossary / Legend (read this first) ----------------------------
    _write_sheet(
        wb, "Glossary",
        ["term", "meaning"],
        [
            ["SDP", "Service Delivery Platform (Classic EC / Ericsson Charging). The migration SOURCE."],
            ["CBEV / ECEV", "The migration TARGET charging system. CBEV and ECEV refer to the SAME target."],
            ["SOURCE ids", "Columns sdp_ut_id, sdp_uc_id, reference_ut_id hold SDP-side ids (values read "
                            "live from the subscriber on SDP)."],
            ["TARGET ids", "Columns po_external_id, account_bucket_spec, counter_bucket_spec, "
                            "carryover_flag_bucket_spec, initial_balance_char hold CBEV-side externalIds."],
            ["UT (Usage Threshold)", "SDP data allocation/limit for a bucket id. Read live from sdp_ut_id."],
            ["UC (Usage Counter)", "SDP consumed data for a bucket id. Read live from sdp_uc_id. On SDP, "
                                    "UT and UC share the same base id (so sdp_ut_id == sdp_uc_id is normal)."],
            ["INITIAL BALANCE", "The starting balance set on CBEV = ACTUAL UT - ACTUAL UC."],
            ["account bucket", "CBEV bucket holding the remaining data balance; set to UT - UC."],
            ["counter bucket (_CTR)", "CBEV bucket holding consumption; set to UC. The '_CTR' suffix is "
                                       "CBEV naming only (not an SDP id)."],
            ["POP", "Product Offering Price. The personalized price block emitted in the CBEV contract."],
            ["PAM", "Periodic Account Management (SDP). Runs the periodic/bill-cycle logic, including "
                     "copying reference UT values and auto-provisioning carryover offers."],
            ["reference UT", "An SDP Usage Threshold id whose LIVE value is used as the personalized POP "
                              "amount. direct_copy = copied verbatim; prorated = base UT * AdjustedDays/30."],
            ["AdjustedDays", "Days from activation to the next bill-cycle day (used in prorating)."],
            ["prorated prefix", "906xxx = prorated DATA working threshold; 914xxx = prorated TETHERING "
                                 "working threshold; 506xxx = direct-copy reference. Confirmed per offer."],
            ["Initial (PO char)", "A CBEV Product Offering characteristic (DECIMAL, unit=byte, measure=Data) "
                                   "that holds the initial balance for offers that define it (One-Time, "
                                   "Fixed-Expiry, VIP add-ons). See FamilyBucketSpecs.initial_balance_char."],
            ["allocation_type", "metered = has a data allocation (account bucket). unlimited = no account "
                                 "bucket (counter only); a BLANK account_bucket_spec is intentional here."],
            ["carryover", "FLAG-ONLY on CBEV: PAM provisions the SDP carryover_offer_id; CBEV just sets "
                           "carryover_flag_bucket_spec = 1 to indicate carryover. No bytes are migrated."],
            ["BLANK cell", "A blank cell means 'not applicable to this offer' (e.g. reference_ut_id blank "
                            "when reference_ut_type=none; account blank when allocation_type=unlimited)."],
            ["FlatRate", "A per-subscriber SDP attribute (Yes=unlimited). It is NOT a pop_type value."],
            ["QoS / QoS_info", "Quality of Service class characteristic (HIGH / LOW)."],
            ["MDVPN", "Mobile Data VPN offer family."],
            ["ToD", "Time-of-Day plan offers (PLAN_A..PLAN_F)."],
            ["GiB/MiB/KiB", "Binary units (1 GiB = 1073741824 bytes). Settings 'GB' keys hold GiB values."],
            ["byte (unit)", "Raw bytes; POP/bucket amounts use byte so no GiB conversion is applied."],
        ],
        notes="READ THIS FIRST. Defines every term and the SOURCE (SDP) vs TARGET (CBEV/ECEV) split used "
              "across the workbook. Hover any column header on the other sheets for a per-column definition.",
    )

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
            ["initial_char_value", 102400, "Fixed byte value written to the 'Initial' PO characteristic for "
                                            "InitialChar offers (One-Time/Fixed-Expiry/VIP). The real quota "
                                            "is granted by the consumption POP; this is the activation token "
                                            "value (verified from a 201 contract). Must be within the "
                                            "characteristic's allowed range."],
        ],
        notes="Global settings. 'key'/'value' pairs are read by the mapping engine. "
              "Edit values to match the target ECEV catalog (BusinessConfig).",
    )

    # ---- FetchOperations (which SDP/UCIP calls to run during FETCH) -----
    _write_sheet(
        wb, "FetchOperations",
        ["operation", "enabled", "purpose"],
        [
            ["GetAccountDetails", "Yes", "Master MSISDN, service class, IMSI, language, PAM schedule (bill cycle). REQUIRED."],
            ["GetOffers", "Yes", "Active offers + offer attributes (HighBandwidth, FlatRate, Installer, ...). REQUIRED."],
            ["GetUsageThresholdsAndCounters", "Yes", "UT (quota) + UC (consumed) in bytes -- THE data balance source for CHT 5G PPP. REQUIRED."],
            ["GetBalanceAndDate", "No", "Dedicated-account balances. NOT used by CHT 5G PPP (balance is in UT/UC). "
                                        "Returns rc=126 'account not active' on this SDP. Disabled by default."],
            ["GetAccumulators", "No", "Accumulator values. NOT used by CHT 5G PPP (consumption is in UC via "
                                      "GetUsageThresholdsAndCounters). Disabled by default."],
        ],
        notes="Controls which UCIP calls FETCH performs. Set enabled=Yes/No. "
              "GetBalanceAndDate and GetAccumulators are OFF because CHT 5G PPP keeps the data balance in "
              "Usage Thresholds/Counters (GetUsageThresholdsAndCounters), not dedicated accounts -- no "
              "migration logic uses them. Enable them only for an SDP/offer that stores balance in "
              "dedicated accounts.",
        col_comments={
            "operation": "The UCIP operation name invoked during FETCH.",
            "enabled": "Yes = call it; No = skip it. REQUIRED ops (GetAccountDetails, GetOffers, "
                        "GetUsageThresholdsAndCounters) should stay Yes.",
            "purpose": "What the call provides and whether CHT 5G PPP uses it.",
        },
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
              "Add one row per service class in use. ECEV ServiceClass values come from the CBEV "
              "BusinessConfig/catalog (contract characteristic 'ServiceClass').",
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
    # carryover account bucket, carryover counter/flag bucket, flat_rate_default,
    # reference_ut_id (SDP reference Usage Threshold id whose LIVE value feeds the
    # personalized POP recurrence+prorating amount; validated per offer from the
    # PAM tree node gated on that offer).
    from . import gen_family_specs

    # Reference UT id per offer -- VALIDATED one-by-one against pam.xml.
    # (empty => offer has no distinct reference UT; POP uses the actual UT value)
    REFERENCE_UT = {
        "145001": "506289006",   # validated: PAM node (145001 AND 289006) copies 506289006 -> 6145000
        "145002": "506289006",   # validated: same PAM node gated on (145002 OR 145001) AND 289006
        "150006": "906150006",   # validated: Recurring promo prorated working threshold (906 prefix);
                                  #   PAM: UT[906150006] = base UT[6150006] * AdjustedDays/30 (prorated).
                                  #   Its LIVE value is the prorated POP amount.
        # Recurring variants -- each confirmed from its OWN PAM prorate node
        # (DestField UT[<ref>] computed from base UT[6<offer>]), not assumed by prefix.
        "150106": "906150106",
        "150206": "906150206",
        "150306": "906150306",
        "150406": "906150406",
        "150506": "906150506",
        "150606": "906150606",
        "150706": "906150706",
        "150806": "906150806",
        "150906": "906150906",
        # Tethering base -- validated from its own PAM Data Quota node:
        #   SetField UT[6281007] <- CopyFrom UT[506281007]  (direct copy, like Basic 506).
        "281007": "506281007",
        # Speed / MDVPN direct_copy -- validated from own Data Quota CopyFrom nodes.
        "281005": "506281005",   # MultiTier Speed (direct copy)
        "281107": "506281107",   # MDVPN Tethering (direct copy)
        # ToD Limited -- prorated working threshold (906 prefix), same shape as Recurring,
        # each confirmed from its OWN Set Pro-Rate node.
        "157006": "906157006", "157106": "906157106", "157206": "906157206",
        "157306": "906157306", "157406": "906157406", "157506": "906157506",
        "157606": "906157606", "157706": "906157706", "157806": "906157806",
        "157906": "906157906",
        # Teth Recurring -- prorated working threshold (914 prefix, tethering variant),
        # each confirmed from its OWN Set Pro-Rate node ("Recurring Promotion Data Normal").
        "150014": "914150014", "150114": "914150114", "150214": "914150214",
        "150314": "914150314", "150414": "914150414", "150514": "914150514",
        "150614": "914150614", "150714": "914150714", "150814": "914150814",
        "150914": "914150914",
    }

    # SDP carryover companion offer that PAM auto-provisions when the base add-on
    # has remaining quota (validated from PAM: "when PAM schedule to add 161006
    # offer" / "Add-On set expiry date logic for 161006/161106/161206", and the
    # 160006 node sets Offer start/expiry PAM period[161006] when RemainingQuotaAdd1>0).
    CARRYOVER_OFFER = {
        "160006": "161006",   # validated
        "160106": "161106",   # validated
        "160206": "161206",   # validated
        # 21M add-ons -> 163xxx (validated: base node sets PAM period[163xxx] on RemainingQuotaAdd1>0)
        "162006": "163006", "162106": "163106", "162206": "163206",
        # Teth add-ons -> 161xxx (validated: base node sets PAM period[161xxx] on RemainingQuotaAdd1>0)
        "160014": "161014", "160114": "161114", "160214": "161214",
    }

    # Authoritative per-offer POP wiring, decoded from the live RMCA BusinessConfig
    # export (productOfferings). Keys: balance_pops (RECURRING/Initial/Prorating POP
    # externalIds that set/replenish the balance), consume_pop (USAGE consumption POP),
    # has_initial_char (True => balance set via the 'Initial' PO characteristic).
    def _load_rmca_pop_map() -> dict:
        import json, os
        for p in (os.path.join(os.path.dirname(__file__), "config", "rmca_offer_pop_map.json"),
                  "migration/config/rmca_offer_pop_map.json",
                  "config/rmca_offer_pop_map.json"):
            try:
                return json.load(open(p))
            except Exception:
                continue
        return {}

    RMCA = _load_rmca_pop_map()

    _fbs_headers = ["offer_id", "family", "po_external_id", "pop_type", "balance_mechanism",
                    "bill_cycle_aligned",
                    "allocation_type",
                    "sdp_ut_id", "sdp_uc_id", "reference_ut_type", "reference_ut_id",
                    "account_bucket_spec", "counter_bucket_spec",
                    "balance_pops", "consume_pop", "initial_balance_char",
                    "carryover_offer_id", "carryover_flag_bucket_spec"]

    def _balance_mechanism(rm: dict, alloc: str) -> str:
        """One-word HOW-the-balance-is-set signal (the key differentiator):
          POP         -> set via balance_pops (Data Add-on, Basic, Recurring, ToD, Tethering)
          InitialChar -> set via the 'Initial' PO characteristic (One-Time, Fixed-Expiry, VIP)
          BucketReset -> post-quota bundle reset POP (255xxx, 281008/281108)
          CounterOnly -> unlimited, no balance set (counter only)
        """
        bps = rm.get("balance_pops", [])
        if not rm.get("in_rmca", False):
            # Carryover companion offers (161xxx/163xxx) are provisioned on SDP by PAM
            # and are NOT in the CBEV RMCA catalog -> no CBEV POP/balance to migrate.
            return "PAM_Provisioned"
        if rm.get("has_initial_char"):
            return "InitialChar"
        if any("Bucket_Reset" in p for p in bps):
            return "BucketReset"
        if bps:
            return "POP"
        if alloc == "unlimited":
            return "CounterOnly"
        # metered, has a consumption POP but no balance POP and no Initial char
        # (e.g. ToD Unlimited 159xxx) -> consumption only, balance not reset via POP/char.
        if rm.get("consume_pop"):
            return "ConsumeOnly"
        return ""

    def _sdp_base(cbev_bucket_id: str) -> str:
        """SDP UT/UC id = the account bucket's base number (strip CBEV-only suffixes)."""
        s = str(cbev_bucket_id or "").strip()
        for suf in ("_POST_CTR", "_POSTACC", "_CTR", "_carryover"):
            if s.endswith(suf):
                s = s[: -len(suf)]
                break
        return s

    def _ref_type(ref_id: str) -> str:
        """How the reference UT value is derived (validated per offer)."""
        s = str(ref_id or "").strip()
        if not s:
            return "none"
        if s.startswith("906") or s.startswith("914"):
            return "prorated"      # working threshold = base UT * AdjustedDays/30 (906=data, 914=teth)
        if s.startswith("506"):
            return "direct_copy"   # reference UT copied verbatim into the actual UT
        return "direct_copy"

    # column indexes from gen_family_specs row:
    # 0 offer_id,1 family,2 po,3 pop_type,4 bca,5 account,6 counter,7 co_acc,8 co_flag,9 flat
    _fbs_rows = []
    for _r in gen_family_specs.build_rows():
        _oid = str(_r[0]).strip()
        # SDP UT/UC share one base id. UT applies only when the offer has an
        # account/allocation bucket. Unlimited post-quota bundles have NO account
        # bucket -> no UT (blank), only a UC on the counter bucket's base id.
        _acc_base = _sdp_base(_r[5])
        _ctr_base = _sdp_base(_r[6])
        _sdp_ut = _acc_base                       # blank when no account bucket (unlimited)
        _sdp_uc = _acc_base or _ctr_base          # UC from account base, else counter base
        _ref_id = REFERENCE_UT.get(_oid, "")
        # metered = has an account/allocation bucket; unlimited = counter-only
        _alloc = "metered" if str(_r[5]).strip() else "unlimited"
        # authoritative POP wiring from RMCA export
        _rm = RMCA.get(_oid, {})
        _balance_pops = ";".join(_rm.get("balance_pops", []))
        _consume_pop = _rm.get("consume_pop", "")
        _init_char = "Initial" if _rm.get("has_initial_char") else ""
        _mech = _balance_mechanism(_rm, _alloc)
        # pop_type is DERIVED from the authoritative mechanism so it can never
        # contradict balance_mechanism (e.g. VIP add-on has no balance POP -> it is
        # NOT 'Initial'; it is 'InitialChar'). Mapping:
        #   InitialChar -> InitialChar ; BucketReset/CounterOnly -> Consumption ;
        #   POP with POP_Initial_Activation -> Initial (add-on) ;
        #   POP with Prorating/RegularRecurrence -> Regular.
        if _mech == "InitialChar":
            _pop_type = "InitialChar"
        elif _mech == "PAM_Provisioned":
            _pop_type = "PAM_Provisioned"   # SDP carryover companion; not a CBEV-priced offer
        elif _mech in ("BucketReset", "CounterOnly", "ConsumeOnly"):
            _pop_type = "Consumption"
        elif _mech == "POP":
            _pop_type = "Initial" if "POP_Initial_Activation" in _rm.get("balance_pops", []) else "Regular"
        else:
            _pop_type = str(_r[3] or "")   # fall back to hand-coded (offers not in RMCA)
        new_row = (
            list(_r[0:3])                                      # offer_id, family, po_external_id
            + [_pop_type]                                      # pop_type (DERIVED from RMCA mechanism)
            + [_mech]                                          # balance_mechanism (the key differentiator)
            + [_r[4]]                                          # bill_cycle_aligned
            + [_alloc]                                         # allocation_type
            + [_sdp_ut, _sdp_uc, _ref_type(_ref_id), _ref_id]  # sdp_ut, sdp_uc, reference_ut_type, reference_ut_id
            + list(_r[5:7])                                     # account, counter
            + [_balance_pops, _consume_pop, _init_char]        # balance_pops, consume_pop, initial_balance_char
            + [CARRYOVER_OFFER.get(_oid, "")]                  # carryover_offer_id (SDP companion offer)
            + [_r[8]]                                          # carryover_flag_bucket_spec
        )
        _fbs_rows.append(new_row)

    _write_sheet(
        wb, "FamilyBucketSpecs",
        _fbs_headers,
        _fbs_rows,
        notes="Per-offer bucket mapping. SOURCE = SDP (subscriber's live values). sdp_ut_id / sdp_uc_id "
              "are the SDP ids you read the subscriber's Usage Threshold (UT) and Usage Counter (UC) from "
              "(they share the same base id). reference_ut_id = SDP reference UT id for the personalized "
              "POP. account_bucket_spec / counter_bucket_spec (and carryover_*) are the CBEV bucket-spec "
              "externalIds (TARGET buckets on CBEV). ACCOUNT bucket = actual UT - actual UC; COUNTER bucket "
              "= actual UC. FLATRATE: read live from the subscriber's SDP FlatRate attribute - if Yes "
              "(unlimited) NO buckets/POP are set and only FlatRate=Yes char is placed on the CBEV product; "
              "if No/absent, buckets + POP are set as normal.",
        col_comments={
            "offer_id": "SDP offer id (what the subscriber has on SDP).",
            "family": "Offer family grouping (Basic, Data Add-on, Tethering, Bundle, ToD, ...).",
            "po_external_id": "CBEV Product Offering externalId (TARGET). 1:1 with the SDP offer id.",
            "pop_type": "Pricing kind, one of: Regular | Initial | Consumption. "
                         "NOTE: pop_type alone does NOT tell you how the balance is set -- see "
                         "balance_mechanism for that.",
            "balance_mechanism": "THE KEY DIFFERENTIATOR -- how this offer's balance is set on CBEV: "
                                  "POP = via the balance_pops price logic (Data Add-on uses "
                                  "POP_Initial_Activation+POP_RegularRecurrence; Basic/Recurring/ToD/"
                                  "Tethering use POP_RegularRecurrence+POP_Prorating_Activation). "
                                  "InitialChar = via the 'Initial' PO characteristic, NO balance POP "
                                  "(One-Time 155xxx, Fixed-Expiry 156xxx, VIP 160906). "
                                  "BucketReset = post-quota bundle reset POP. "
                                  "CounterOnly = unlimited, no balance set. "
                                  "ConsumeOnly = metered with only a consumption POP, no balance-reset "
                                  "POP and no Initial char (e.g. ToD Unlimited 159xxx). "
                                  "PAM_Provisioned = SDP carryover companion offer (161xxx/163xxx), "
                                  "created on SDP by PAM, not a CBEV-priced offer (no CBEV POP). "
                                  "This is what distinguishes Data Add-on (POP) from One-Time (InitialChar).",
            "bill_cycle_aligned": "Yes => CBEV product carries baRefForBillCycleAlignedRecurrence. "
                                   "No for One-Time (155xxx) / Fixed-Expiry (156xxx).",
            "allocation_type": "metered = offer has a data allocation (account bucket set to UT-UC). "
                                "unlimited = post-quota/unlimited offer with NO account bucket (counter "
                                "only). Tells you a blank account_bucket_spec is intentional, not missing.",
            "reference_ut_type": "How reference_ut_id's value is derived (validated per offer): "
                                  "direct_copy = reference UT copied verbatim into the actual UT (e.g. "
                                  "Basic 506xxx); prorated = Recurring promo working threshold = base UT * "
                                  "AdjustedDays/30 (906xxx); none = no reference UT (add-ons use the actual "
                                  "UT for POP; unlimited offers have no POP).",
            "sdp_ut_id": "SDP Usage Threshold id. READ the subscriber's live UT value from THIS id on SDP "
                          "(via GetUsageThresholdsAndCounters). This is the SDP source id for UT.",
            "sdp_uc_id": "SDP Usage Counter id. READ the subscriber's live UC value from THIS id on SDP. "
                          "Same base number as sdp_ut_id (UT and UC share the id on SDP).",
            "reference_ut_id": "SDP REFERENCE Usage Threshold id (an SDP id, NOT a CBEV bucket). On "
                                "bill-cycle day PAM copies this reference UT's value into the actual UT. "
                                "Its LIVE SDP value is used as the personalized POP (RegularRecurrence + "
                                "Prorating) amount -- NOT the actual UT. Blank => POP falls back to actual UT.",
            "account_bucket_spec": "CBEV ACCOUNT bucket-spec externalId (TARGET), e.g. 6145000. "
                                    "INITIAL BALANCE written = subscriber's ACTUAL UT - ACTUAL UC "
                                    "(UT from sdp_ut_id, UC from sdp_uc_id). Applies to every metered "
                                    "offer, including Initial add-ons (e.g. 160006).",
            "counter_bucket_spec": "CBEV COUNTER bucket-spec externalId (TARGET), e.g. 6145000_CTR "
                                    "(the _CTR suffix is CBEV naming only, not an SDP id). "
                                    "VALUE written = subscriber's ACTUAL UC (from sdp_uc_id). Applies to "
                                    "every metered offer, including Initial add-ons.",
            "balance_pops": "CBEV Product Offering Price externalIds (';'-separated) that SET/REPLENISH "
                             "the balance for this offer, decoded from the live RMCA export. "
                             "POP_RegularRecurrence+POP_Prorating_Activation = Basic/Recurring/ToD/Tethering; "
                             "POP_Initial_Activation+POP_RegularRecurrence = Data Add-on; "
                             "POP_Bundle_Bucket_Reset / POP_TetheringBundle_Bucket_Reset = post-quota bundle; "
                             "BLANK = balance set via initial_balance_char instead (One-Time/Fixed-Expiry/VIP).",
            "consume_pop": "CBEV USAGE (consumption/rating) POP externalId: POP_NormalData_Consumption or "
                            "POP_TetheringData_Consumption. From the RMCA export. Present on all offers.",
            "initial_balance_char": "'Initial' when this PO sets its initial balance via the 'Initial' PO "
                                     "CHARACTERISTIC (byte/Data), decoded from the RMCA export. Offers with "
                                     "balance_pops BLANK use this (One-Time 155xxx, Fixed-Expiry 156xxx, VIP "
                                     "160906). Balance value = ACTUAL UT - ACTUAL UC. Blank => this PO uses "
                                     "balance_pops instead.",
            "carryover_offer_id": "SDP carryover companion OFFER that PAM auto-provisions when this base "
                                   "add-on has remaining quota (e.g. 160006 -> 161006). This offer is "
                                   "created on SDP by PAM, NOT migrated as a value. On CBEV we only set "
                                   "carryover_flag_bucket_spec = 1 to indicate carryover happened. "
                                   "Blank => offer has no carryover companion.",
            "carryover_flag_bucket_spec": "The CBEV carryover-flag BUCKET-SPEC externalId (e.g. "
                                           "6160006_carryover). The VALUE 1 (indicating carryover) is "
                                           "applied to this bucket via ParameterMapping.carryover_flag. "
                                           "Present only for add-ons with carryover; blank => no carryover.",
        },
    )

    # ---- OfferAttributeMap ---------------------------------------------
    _write_sheet(
        wb, "OfferAttributeMap",
        ["sdp_attribute_name", "ecev_char_name", "target", "value_transform", "description"],
        [
            ["HighBandwidth", "HighBandwidth", "product", "asis", "Catalog HighBandwidth values: Normal/Speed1.5G/Speed1G/Speed500M/Speed300M/Speed50M/Speed21M/Speed12M/Speed10M/Speed5M/5G_Normal"],
            ["defaultBandwidth", "defaultBandwidth", "product", "asis", "Post-quota/depleted speed: Low/Speed256K/Speed1M/Speed2M/Speed3M/Speed5M/Speed10M/Speed21M/Speed50M"],
            ["2ndTierBandwidth", "2ndTierBandwidth", "product", "asis", "2nd-tier speed (M-Low/M-256K/M-1M/M-2M/M-3M/M-21M) where that char is used"],
            ["Depleted", "Depleted", "product", "asis", "Depleted-state flag for post-quota/bundle offers (default Low)"],
            ["FlatRate", "FlatRate", "product", "asis", "Yes/No. Yes->unlimited (no bucket); only Basic/Tethering-base carry it"],
            ["ToD", "TimeOfDayPlan", "product", "asis", "PLAN_A..PLAN_F"],
            ["Installer", "InstallerID", "product", "asis", "Installer id as-is (ESP/carryover = OCSG)"],
            ["QoS", "QoS_info", "product", "asis", "HIGH / LOW (LOW for post-quota)"],
        ],
        notes="SDP offerAttribute name -> ECEV characteristic. target=product|contract. "
              "value_transform: asis | upper | lower | map:<FromValue>=<ToValue>;... "
              "Valid values are from the catalog (BusinessConfig characteristicSetSpecifications). "
              "Post-quota/bundle depleted speed is 'defaultBandwidth' with Speed* grades "
              "(Speed256K..Speed50M, or Low); it is NOT the M-* set and there is no 'LowBandwidth' char in PPP.",
    )

    # ---- POPMapping (personalized Price Logic / POP per pop_type) -------
    # Verified externalIds from a successful (200) CBEV provisioning of PO 145001
    # (Basic, Regular): POP_RegularRecurrence + POP_Prorating_Activation, row
    # Action_FlatRate_No, amount charSpec FlatRate_No_Amount, action
    # FlatRate_No_PB_Set. The UT value is injected into the amount characteristic.
    # unit=byte -> set the raw byte value directly (no GiB conversion/rounding);
    # change to 'gibibyte' if the POP amount char expects GB. Add-on (Initial)
    # POP externalId to be confirmed from catalog.
    _write_sheet(
        wb, "POPMapping",
        ["pop_type", "pop_external_ids", "price_row_external_id",
         "amount_char_spec", "action_external_id", "unit", "ut_value_source"],
        [
            ["Regular", "POP_RegularRecurrence;POP_Prorating_Activation",
             "Action_FlatRate_No", "FlatRate_No_Amount", "FlatRate_No_PB_Set",
             "byte", "reference_ut_id"],
            ["Initial", "POP_Initial_Activation",
             "Action_FlatRate_No", "FlatRate_No_Amount", "FlatRate_No_PB_Set",
             "byte", "sdp_ut_id"],
            ["Consumption", "-- no POP --", "", "", "", "", ""],
            ["FlatRate", "-- no POP --", "", "", "", "", ""],
        ],
        notes="Personalized POP (Price Logic) per pop_type, emitted as the product 'price' array in "
              "Create Contract. ut_value_source names the FamilyBucketSpecs COLUMN whose id supplies the "
              "POP amount (the script reads that id's LIVE value from SDP): 'reference_ut_id' => use the "
              "value of the offer's reference_ut_id (Regular: Basic/Recurring/Tethering); 'sdp_ut_id' => "
              "use the value of the offer's sdp_ut_id (Initial ADD-ONS, which have NO reference UT). "
              "FALLBACK: if ut_value_source=reference_ut_id but that column is blank for the offer, the "
              "script falls back to sdp_ut_id. The value is written into amount_char_spec with 'unit'. "
              "Consumption/FlatRate: no POP (blank).",
        col_comments={
            "pop_type": "Pricing kind for the offer (from FamilyBucketSpecs.pop_type): "
                         "Regular | Initial | Consumption. (FlatRate is NOT a pop_type.)",
            "pop_external_ids": "';'-separated ECEV Product Offering Price externalIds. Each one "
                                 "receives the derived amount (e.g. RegularRecurrence + Prorating).",
            "price_row_external_id": "ECEV priceRow externalId under the POP.",
            "amount_char_spec": "charSpec externalId that holds the derived amount value.",
            "action_external_id": "priceAction externalId that applies the amount (Set).",
            "unit": "unitOfMeasure for the amount: byte = raw bytes (no conversion); "
                     "gibibyte = GB value.",
            "ut_value_source": "Names the FamilyBucketSpecs COLUMN whose id supplies the POP amount "
                                "(the script reads that id's LIVE value from SDP). "
                                "'reference_ut_id' = use the offer's reference_ut_id value (Regular). "
                                "'sdp_ut_id' = use the offer's sdp_ut_id value (Initial add-ons, which "
                                "have NO reference UT). Blank = no POP amount. If reference_ut_id is named "
                                "but blank for an offer, falls back to sdp_ut_id. Using column names "
                                "removes ambiguity about which id is read.",
        },
    )

    # ---- ParameterMapping ----------------------------------------------
    # The engine-driven mapping of top-level profile fields. Derivation column
    # holds an expression evaluated with the safe context (see mapping_engine).
    _write_sheet(
        wb, "ParameterMapping",
        ["sdp_source", "ecev_target", "target_scope", "derivation", "description"],
        [
            ["master_msisdn", "accountID", "product_char", "master_msisdn",
             "SDP master MSISDN -> accountID char on every CBEV PO."],
            ["service_class", "ServiceClass", "contract_char", "map_service_class(service_class)",
             "SDP serviceClass -> CBEV ServiceClass (mapped via ServiceClassMap sheet); set on contract."],
            ["offer_id", "productOfferingExternalId", "product", "offer_id",
             "SDP offer id -> CBEV productOfferingExternalId (1:1)."],
            ["account_bucket", "account_bucket_spec", "bucket", "to_bytes(UT - UC)",
             "INITIAL BALANCE for the offer = subscriber's SDP UT (Usage Threshold for the account bucket "
             "base id) minus SDP UC (Usage Counter for the same base id). Written into the CBEV account "
             "bucket. Applies to all metered offers incl. Initial add-ons. Skip when flat_rate (unlimited)."],
            ["counter_bucket", "counter_bucket_spec", "bucket", "to_bytes(UC)",
             "UC = subscriber's SDP Usage Counter value for the account's base id. Writes UC bytes into "
             "the CBEV counter bucket (FamilyBucketSpecs.counter_bucket_spec, the _CTR id)."],
            ["carryover_flag", "carryover_flag_bucket_spec", "bucket", "1",
             "Carryover is FLAG-ONLY: we do NOT migrate a carried byte amount (PAM provisions the "
             "carryover companion offer, see FamilyBucketSpecs.carryover_offer_id). This sets the CBEV "
             "carryover flag bucket (FamilyBucketSpecs.carryover_flag_bucket_spec) to 1 to INDICATE "
             "carryover on CBEV."],
            ["offer_expiry", "product_valid_to", "product", "offer_expiry",
             "SDP offer expiry date -> CBEV product lifecycle valid-to (fixed-expiry offers)."],
        ],
        notes="Top-level parameter mapping. SOURCE = SDP. target_scope: product_char | contract_char | "
              "product | bucket. Expression context: master_msisdn, service_class, offer_id, UT "
              "(subscriber's SDP Usage Threshold value), UC (subscriber's SDP Usage Counter value), "
              "offer_expiry, flat_rate, to_bytes(x), map_service_class(x). "
              "WHICH ID: UT and UC are read from the SAME SDP base id = the account_bucket_spec base number "
              "in FamilyBucketSpecs (the counter's _CTR suffix is CBEV naming, not an SDP id). "
              "Account bucket = UT - UC ; Counter bucket = UC. Carryover is FLAG-ONLY: carryover_flag = 1 "
              "(no byte amount is migrated; PAM provisions the carryover_offer_id on SDP).",
        col_comments={
            "sdp_source": "The SDP-side input (field or derived quantity) feeding this mapping.",
            "ecev_target": "The CBEV-side target (bucket-spec externalId, characteristic, or product field).",
            "target_scope": "Where the target lives: product_char | contract_char | product | bucket.",
            "derivation": "Expression evaluated to produce the value. UT/UC are the subscriber's live "
                           "SDP Usage Threshold / Usage Counter values; carried = SDP carried bytes.",
            "description": "Plain-language explanation of the SDP source id and the CBEV target.",
        },
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
