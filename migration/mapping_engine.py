"""Excel-driven mapping and value-derivation engine.

Loads the user-supplied mapping workbook (see excel_template.py) and turns a
raw SubscriberProfile fetched from Classic EC into a MigrationPlan describing
exactly what to provision on ECEV.

All mapping and derivation logic lives in the workbook, not in code. The engine
only:
  * reads the sheets,
  * resolves per-offer family specs,
  * derives bucket values by evaluating the (safe) expressions from the sheet,
  * maps characteristics and the service class.

Derivation expressions are evaluated with a restricted eval: only the names in
the supplied context dict and a small set of helper functions are available
(no builtins), so a workbook cannot execute arbitrary code.
"""

from __future__ import annotations

import hashlib
import math
import uuid
from pathlib import Path
from typing import Any, Optional

from openpyxl import load_workbook

from .models import (
    BucketValue,
    DerivedProduct,
    ECOffer,
    MigrationPlan,
    SubscriberProfile,
)


class MappingError(Exception):
    pass


# ---------------------------------------------------------------------------
# Safe expression evaluation
# ---------------------------------------------------------------------------

_ALLOWED_FUNCS = {
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "int": int,
    "float": float,
    "floor": math.floor,
    "ceil": math.ceil,
}


def safe_eval(expr: str, context: dict[str, Any]) -> Any:
    """Evaluate a derivation expression with no access to builtins."""
    if expr is None or str(expr).strip() == "":
        return None
    expr = str(expr).strip()
    env = {"__builtins__": {}}
    env.update(_ALLOWED_FUNCS)
    env.update(context)
    try:
        return eval(expr, env, {})  # noqa: S307 - restricted env, workbook-controlled
    except Exception as e:  # pragma: no cover - surfaces as a clear mapping error
        raise MappingError(f"Failed to evaluate derivation '{expr}': {e}") from e


# ---------------------------------------------------------------------------
# Workbook model
# ---------------------------------------------------------------------------

class MappingWorkbook:
    """Parsed representation of the mapping workbook."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        if not self.path.exists():
            raise MappingError(f"Mapping workbook not found: {self.path}")
        wb = load_workbook(self.path, data_only=True, read_only=True)
        self.settings: dict[str, Any] = {}
        # Which UCIP FETCH operations are enabled (from the FetchOperations sheet).
        # {operation_name: bool}. Empty => all default-on in the client.
        self.fetch_operations: dict[str, bool] = {}
        self.service_class_map: dict[str, str] = {}
        self.schedule_bill_cycle_map: dict[str, str] = {}
        self.family_specs: dict[str, dict[str, Any]] = {}
        self.offer_attr_map: list[dict[str, Any]] = []
        self.parameter_mapping: list[dict[str, Any]] = []
        self.pop_mapping: dict[str, dict[str, Any]] = {}  # pop_type -> POP price spec
        # Authoritative per-offer, per-POP price recipe (action/char/unit), decoded
        # from the RMCA export. {offer_id: {pop_externalId: {price_row, action,
        # amount_char, unit}}}. Each POP has its OWN recipe (e.g. 160006's
        # POP_Initial_Activation uses Action_SetInitialAllocation, not Action_FlatRate_No).
        self.pop_recipes: dict[str, dict[str, dict]] = self._load_pop_recipes()
        self._parse(wb)
        wb.close()

    @staticmethod
    def _load_pop_recipes() -> dict:
        import json as _json
        import os as _os
        here = _os.path.dirname(__file__)
        for p in (_os.path.join(here, "config", "rmca_pop_recipes_clean.json"),
                  "migration/config/rmca_pop_recipes_clean.json",
                  "config/rmca_pop_recipes_clean.json"):
            try:
                return _json.load(open(p))
            except Exception:
                continue
        return {}

    @staticmethod
    def _rows(ws) -> list[dict[str, Any]]:
        rows = list(ws.iter_rows(values_only=True))
        # find the header row: first row where all leading cells are non-empty
        # strings. The template may have a note row above the header.
        header_idx = 0
        for i, row in enumerate(rows):
            non_empty = [c for c in row if c is not None and str(c).strip() != ""]
            if len(non_empty) >= 2 and all(isinstance(c, str) for c in non_empty[:2]):
                # heuristic: header has short identifier-like tokens
                if any(" " not in str(c) for c in non_empty[:2]):
                    header_idx = i
                    break
        headers = [str(c).strip() if c is not None else "" for c in rows[header_idx]]
        out = []
        for row in rows[header_idx + 1:]:
            if all(c is None or str(c).strip() == "" for c in row):
                continue
            rec = {}
            for h, v in zip(headers, row):
                if h:
                    rec[h] = v
            out.append(rec)
        return out, headers

    def _parse(self, wb):
        names = wb.sheetnames

        if "Settings" in names:
            rows, _ = self._rows(wb["Settings"])
            for r in rows:
                k = r.get("key")
                if k:
                    self.settings[str(k).strip()] = r.get("value")

        if "FetchOperations" in names:
            rows, _ = self._rows(wb["FetchOperations"])
            for r in rows:
                op = r.get("operation")
                if op:
                    en = str(r.get("enabled") or "").strip().lower()
                    self.fetch_operations[str(op).strip()] = en in ("yes", "true", "1", "y")

        if "ServiceClassMap" in names:
            rows, _ = self._rows(wb["ServiceClassMap"])
            for r in rows:
                src = r.get("sdp_service_class")
                dst = r.get("ecev_service_class_value")
                if src is not None:
                    self.service_class_map[str(src).strip()] = (
                        str(dst).strip() if dst is not None else str(src).strip()
                    )

        if "ScheduleBillCycleMap" in names:
            rows, _ = self._rows(wb["ScheduleBillCycleMap"])
            for r in rows:
                sid = r.get("sdp_schedule_id")
                bc = r.get("ecev_bill_cycle_spec_external_id")
                if sid is not None and bc is not None and str(bc).strip():
                    self.schedule_bill_cycle_map[str(sid).strip()] = str(bc).strip()

        if "FamilyBucketSpecs" in names:
            rows, _ = self._rows(wb["FamilyBucketSpecs"])
            for r in rows:
                oid = r.get("offer_id")
                if oid is None:
                    continue
                self.family_specs[str(oid).strip()] = {
                    "family": r.get("family"),
                    "po_external_id": str(r.get("po_external_id") or oid).strip(),
                    "pop_type": (str(r.get("pop_type")).strip() if r.get("pop_type") else ""),
                    "bill_cycle_aligned": str(r.get("bill_cycle_aligned") or "").strip().lower() in ("yes", "true", "1", "y"),
                    "account_bucket_spec": _s(r.get("account_bucket_spec")),
                    "counter_bucket_spec": _s(r.get("counter_bucket_spec")),
                    "sdp_ut_id": _s(r.get("sdp_ut_id")),
                    "sdp_uc_id": _s(r.get("sdp_uc_id")),
                    "allocation_type": _s(r.get("allocation_type")),
                    "balance_mechanism": _s(r.get("balance_mechanism")),
                    "balance_pops": [p.strip() for p in str(r.get("balance_pops") or "").split(";") if p.strip()],
                    "consume_pop": _s(r.get("consume_pop")),
                    "initial_balance_char": _s(r.get("initial_balance_char")),
                    "carryover_account_bucket_spec": _s(r.get("carryover_account_bucket_spec")),
                    "carryover_flag_bucket_spec": _s(r.get("carryover_flag_bucket_spec")),
                    "flat_rate_default": _s(r.get("flat_rate_default")),
                    "reference_ut_id": _s(r.get("reference_ut_id")),
                }

        if "OfferAttributeMap" in names:
            rows, _ = self._rows(wb["OfferAttributeMap"])
            for r in rows:
                if r.get("sdp_attribute_name"):
                    self.offer_attr_map.append({
                        "sdp_attribute_name": str(r["sdp_attribute_name"]).strip(),
                        "ecev_char_name": _s(r.get("ecev_char_name")),
                        "target": (_s(r.get("target")) or "product"),
                        "value_transform": (_s(r.get("value_transform")) or "asis"),
                    })

        if "ParameterMapping" in names:
            rows, _ = self._rows(wb["ParameterMapping"])
            for r in rows:
                if r.get("sdp_source"):
                    self.parameter_mapping.append({
                        "sdp_source": str(r["sdp_source"]).strip(),
                        "ecev_target": _s(r.get("ecev_target")),
                        "target_scope": _s(r.get("target_scope")),
                        "derivation": r.get("derivation"),
                    })

        if "POPMapping" in names:
            rows, _ = self._rows(wb["POPMapping"])
            for r in rows:
                pt = _s(r.get("pop_type"))
                if not pt:
                    continue
                _raw_ids = str(r.get("pop_external_ids") or "")
                if _raw_ids.strip().lower().replace("-", "").replace(" ", "") == "nopop":
                    _raw_ids = ""   # '-- no POP --' documentation marker => no POP
                ids = [x.strip() for x in _raw_ids.split(";") if x.strip()]
                self.pop_mapping[pt.lower()] = {
                    "pop_external_ids": ids,
                    "price_row_external_id": _s(r.get("price_row_external_id")),
                    "amount_char_spec": _s(r.get("amount_char_spec")),
                    "action_external_id": _s(r.get("action_external_id")),
                    "unit": _s(r.get("unit")) or "gibibyte",
                    "ut_value_source": _s(r.get("ut_value_source")) or "sdp_ut_id",
                }

    # -- settings helpers -------------------------------------------------
    def setting(self, key: str, default: Any = None) -> Any:
        v = self.settings.get(key, default)
        return v if v is not None else default

    def bytes_per_unit(self, unit: str) -> int:
        unit = (unit or "GB").upper()
        key = f"bytes_per_{unit}"
        v = self.setting(key)
        if v is None:
            # sensible fallbacks
            return {"GB": 1073741824, "MB": 1048576, "KB": 1024, "B": 1}.get(unit, 1073741824)
        return int(v)


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class MappingEngine:
    def __init__(self, workbook: MappingWorkbook):
        self.wb = workbook

    # -- public API -------------------------------------------------------
    def build_plan(self, profile: SubscriberProfile) -> MigrationPlan:
        wb = self.wb
        plan = MigrationPlan(master_msisdn=profile.master_msisdn)

        plan.partition_id = self._pick_partition(profile.master_msisdn)
        # externalIds use a RANDOM per-subscriber reference (subRef), NOT the
        # MSISDN, to match the production ProvisionWizard convention
        # (party-<subRef> / customer-<subRef> / contract-<subRef> / ba-<subRef>,
        # subRef = first 8 chars of a UUID4). The MSISDN is carried only on the
        # MSISDN identification resource, not in the party/customer/contract ids.
        sub_ref = uuid.uuid4().hex[:8]
        plan.sub_ref = sub_ref
        plan.party_external_id = self._ext_id("party_external_id_pattern", sub_ref, "party-{subref}")
        plan.customer_external_id = self._ext_id("customer_external_id_pattern", sub_ref, "customer-{subref}")
        plan.contract_external_id = self._ext_id("contract_external_id_pattern", sub_ref, "contract-{subref}")
        plan.billing_account_external_id = self._ext_id("billing_account_external_id_pattern", sub_ref, "ba-{subref}")

        # Bill cycle is set PER PAM SCHEDULE: map the subscriber's SDP PAM
        # schedule id -> CBEV billCycleSpecExternalId via the ScheduleBillCycleMap
        # sheet. Falls back to the global billCycleSpecExternalId setting.
        plan.pam_schedule_id = str(profile.pam_schedule_id or "")
        plan.bill_cycle_spec_external_id = self._map_bill_cycle(profile.pam_schedule_id)

        # Service class (contract characteristic)
        sc_name = wb.setting("service_class_char_name", "ServiceClass")
        if profile.service_class is not None:
            mapped = self.map_service_class(profile.service_class)
            plan.service_class_ecev = mapped
            plan.contract_characteristics[sc_name] = mapped

        # Multi-SIM / subordinate devices on the same contract
        plan.additional_msisdns = list(profile.subordinates)

        # Group carryover companions with their base offer
        carryover_by_base = self._index_carryover(profile)

        for offer in profile.offers:
            if offer.is_carryover_companion:
                continue  # folded into the base offer below
            product = self._derive_product(profile, offer, carryover_by_base, plan)
            if product:
                plan.products.append(product)

        return plan

    def map_service_class(self, sdp_sc: str) -> str:
        key = str(sdp_sc).strip()
        if key in self.wb.service_class_map:
            return self.wb.service_class_map[key]
        self._warn_sc = key
        return key  # pass-through if unmapped (engine records a warning via plan)

    def _map_bill_cycle(self, pam_schedule_id) -> str:
        """Resolve the CBEV billCycleSpecExternalId for the subscriber's SDP PAM
        schedule. Bill cycle is per PAM schedule (schedule 1=1st, 2=6th, ...).
        Uses the ScheduleBillCycleMap sheet; falls back to the global
        billCycleSpecExternalId setting if the schedule isn't mapped."""
        sid = str(pam_schedule_id).strip() if pam_schedule_id is not None else ""
        if sid and sid in self.wb.schedule_bill_cycle_map:
            return self.wb.schedule_bill_cycle_map[sid]
        return str(self.wb.setting("billCycleSpecExternalId", "") or "")

    # -- derivation helpers ----------------------------------------------
    def _derive_product(
        self,
        profile: SubscriberProfile,
        offer: ECOffer,
        carryover_by_base: dict[str, ECOffer],
        plan: MigrationPlan,
    ) -> Optional[DerivedProduct]:
        spec = self.wb.family_specs.get(offer.offer_id)
        if not spec:
            plan.warnings.append(
                f"offer {offer.offer_id}: no FamilyBucketSpecs row - skipped")
            return None

        po_ext = spec["po_external_id"]
        pop_type = spec["pop_type"] or ""
        product = DerivedProduct(product_offering_external_id=po_ext, pop_type=pop_type,
                                 bill_cycle_aligned=bool(spec.get("bill_cycle_aligned")))

        # FlatRate detection: offer attribute wins, else family default
        flat_rate = self._is_flat_rate(offer, spec)
        product.flat_rate = flat_rate

        # characteristics from offer attributes (per OfferAttributeMap)
        for amap in self.wb.offer_attr_map:
            raw = offer.attr(amap["sdp_attribute_name"])
            if raw is None:
                continue
            value = self._transform(raw, amap["value_transform"])
            char_name = amap["ecev_char_name"] or amap["sdp_attribute_name"]
            if amap["target"] == "contract":
                plan.contract_characteristics[char_name] = value
            else:
                product.characteristics[char_name] = value

        # accountID char = master MSISDN (always)
        product.characteristics.setdefault("accountID", profile.master_msisdn)
        # QoS_info default if not provided by attributes
        product.characteristics.setdefault(
            "QoS_info", str(self.wb.setting("default_qos_info", "HIGH")))

        # UT / UC lookups for this offer's buckets
        ut = self._lookup_ut(profile, spec)
        uc = self._lookup_uc(profile, spec)

        ctx = self._expr_context(profile, offer, ut, uc, flat_rate, carryover_by_base)

        # product valid-to (fixed-expiry)
        if offer.expiry_date:
            product.valid_to = offer.expiry_date

        if flat_rate:
            # unlimited -> no bucket set (LLD rule). Still carry FlatRate char.
            product.characteristics.setdefault("FlatRate", "Yes")
            return product

        # --- Authoritative balance mechanism (from RMCA-decoded sheet) ---
        mech = spec.get("balance_mechanism") or ""
        product.balance_mechanism = mech
        product.balance_pops = list(spec.get("balance_pops") or [])
        product.consume_pop = spec.get("consume_pop") or None

        # Account bucket = UT - UC ; Counter bucket = UC.
        acc_spec = spec["account_bucket_spec"]
        ctr_spec = spec["counter_bucket_spec"]
        acc_expr = self._param_derivation("account_bucket", "to_bytes(UT - UC)")
        ctr_expr = self._param_derivation("counter_bucket", "to_bytes(UC)")
        acc_amount = self._as_int(safe_eval(acc_expr, ctx))

        if mech == "InitialChar":
            # One-Time 155xxx / Fixed-Expiry 156xxx / VIP 160906. Balance is set via
            # the 'Initial' PO characteristic to a FIXED activation value (the real
            # quota is granted by the consumption POP at activation). The 'Initial'
            # characteristic has a constrained value range -- the subscriber's raw
            # UT-UC is NOT accepted. Verified from a working 201 contract: Initial
            # = 102400 (byte), with NO price array and NO bucket adjustment.
            init_val = int(self.wb.setting("initial_char_value", 102400) or 102400)
            product.initial_balance = init_val
            product.characteristics["Initial"] = str(init_val)
            # No buckets, no POP for InitialChar offers.
        else:
            # POP / BucketReset / ConsumeOnly / CounterOnly / PAM_Provisioned:
            # set the account bucket (UT-UC) when there is one, and the counter (UC).
            if acc_spec and acc_amount is not None and acc_amount >= 0:
                product.buckets.append(BucketValue(acc_spec, acc_amount, "MIGRATION"))
            if ctr_spec:
                camt = self._as_int(safe_eval(ctr_expr, ctx))
                if camt is not None and camt >= 0:
                    product.buckets.append(BucketValue(ctr_spec, camt, "MIGRATION"))

        # Carryover: FLAG-ONLY. If the subscriber has the carryover companion offer,
        # set the carryover flag bucket = 1 (no byte amount migrated).
        companion = carryover_by_base.get(offer.offer_id)
        if companion is not None:
            flag_expr = self._param_derivation("carryover_flag", "1")
            co_flag_spec = spec["carryover_flag_bucket_spec"]
            if co_flag_spec:
                flag = self._as_int(safe_eval(flag_expr, ctx)) or 1
                product.buckets.append(BucketValue(co_flag_spec, flag, "CARRYOVER_FLAG"))

        # Personalized POP (Price Logic): only offers whose balance_mechanism is POP
        # carry a balance POP price. ut_value_source (POPMapping) decides the amount id.
        if mech == "POP":
            self._apply_pop_price(product, pop_type, ut, profile, spec)

        return product

    def _apply_pop_price(self, product: DerivedProduct, pop_type: str, ut_bytes: float,
                         profile: "SubscriberProfile" = None, spec: dict = None):
        """Attach the personalized POP price spec + UT value from POPMapping."""
        popspec = self.wb.pop_mapping.get((pop_type or "").lower())
        if not popspec or not popspec.get("pop_external_ids"):
            return  # Consumption / FlatRate / unmapped -> no POP price

        # Resolve WHICH id supplies the POP amount (POPMapping.ut_value_source names
        # a FamilyBucketSpecs column):
        #   'reference_ut_id' -> live value of the offer's reference_ut_id; if that id
        #                        is blank/unavailable, FALL BACK to sdp_ut_id (actual).
        #   'sdp_ut_id' (or anything else) -> the subscriber's actual UT (sdp_ut_id).
        source = (popspec.get("ut_value_source") or "").strip().lower()
        amount_bytes = ut_bytes
        if source == "reference_ut_id" and profile is not None and spec:
            ref_id = (spec.get("reference_ut_id") or "").strip()
            if ref_id:
                ref_da = profile.dedicated_account(ref_id)
                if ref_da is not None:
                    amount_bytes = float(ref_da.value) * self.wb.bytes_per_unit(ref_da.unit)
                # else: reference id not in fetched profile -> keep sdp_ut_id value
            # else: offer has no reference_ut_id -> keep sdp_ut_id value (fallback)
        ut_bytes = amount_bytes
        # Build ONE price entry per balance POP, each using its OWN recipe
        # (action/char/unit) decoded from RMCA. Different POPs use different actions
        # (e.g. SetInitialAllocation vs FlatRate_No) -- a single shared recipe is wrong.
        oid = getattr(product, "product_offering_external_id", "")
        recipes = self.wb.pop_recipes.get(str(oid), {})
        pop_ids = list(spec.get("balance_pops") or []) if spec else []
        if not pop_ids:
            pop_ids = list(popspec.get("pop_external_ids") or [])

        def _amount_in(unit):
            div = {"gibibyte": 1024 ** 3, "mebibyte": 1024 ** 2, "kibibyte": 1024,
                   "byte": 1, "gigabyte": 10 ** 9, "megabyte": 10 ** 6}.get(unit, 1)
            v = ut_bytes / div if ut_bytes else 0
            return int(v) if float(v).is_integer() else round(v, 3)

        price_entries = []
        for pid in pop_ids:
            rec = recipes.get(pid)
            if rec:
                price_entries.append({
                    "pop_external_id": pid,
                    "price_row_external_id": rec["price_row"],
                    "action_external_id": rec["action"],
                    "amount_char_spec": rec["amount_char"],
                    "unit": rec.get("unit", "byte"),
                    "amount": _amount_in(rec.get("unit", "byte")),
                })
            # else: this POP has NO personalized price recipe in RMCA (e.g. an
            # add-on's POP_RegularRecurrence) -> emit NO price entry for it. Do NOT
            # fall back to the generic Basic recipe (that caused CPM 2103 'Missing
            # recipe of FlatRate_No').
        product.ut_value = price_entries[0]["amount"] if price_entries else 0
        product.pop_price = {
            "pop_external_ids": pop_ids,
            "price_entries": price_entries,
            # keep legacy single-recipe fields for backward compat (first entry)
            "price_row_external_id": price_entries[0]["price_row_external_id"] if price_entries else None,
            "amount_char_spec": price_entries[0]["amount_char_spec"] if price_entries else None,
            "action_external_id": price_entries[0]["action_external_id"] if price_entries else None,
            "unit": price_entries[0]["unit"] if price_entries else "byte",
        }
        return
        # (legacy code below retained but unreachable)
        unit = popspec.get("unit", "gibibyte")
        # convert UT bytes to the POP unit value
        divisor = {"gibibyte": 1024 ** 3, "mebibyte": 1024 ** 2, "kibibyte": 1024,
                   "byte": 1, "gigabyte": 10 ** 9, "megabyte": 10 ** 6}.get(unit, 1024 ** 3)
        ut_value = ut_bytes / divisor if ut_bytes else 0
        # whole number if exact, else keep decimal
        ut_out = int(ut_value) if float(ut_value).is_integer() else round(ut_value, 3)
        product.ut_value = ut_out
        # Prefer the authoritative per-offer balance POP externalIds (from the sheet,
        # decoded from RMCA). Fall back to the POPMapping generic list.
        pop_ids = list(spec.get("balance_pops") or []) if spec else []
        if not pop_ids:
            pop_ids = list(popspec["pop_external_ids"])
        product.pop_price = {
            "pop_external_ids": pop_ids,
            "price_row_external_id": popspec.get("price_row_external_id"),
            "amount_char_spec": popspec.get("amount_char_spec"),
            "action_external_id": popspec.get("action_external_id"),
            "unit": unit,
        }

    def _expr_context(self, profile, offer, ut, uc, flat_rate, carryover_by_base) -> dict:
        companion = carryover_by_base.get(offer.offer_id)
        carried_bytes = 0.0
        carried_raw = 0.0
        if companion is not None and companion.carried_amount is not None:
            carried_raw = float(companion.carried_amount)
            carried_bytes = carried_raw * self.wb.bytes_per_unit(companion.carried_unit or "GB")

        def to_bytes(x, unit=None):
            # UT/UC are already provided in bytes; raw numbers pass through.
            return int(round(float(x)))

        return {
            "master_msisdn": profile.master_msisdn,
            "service_class": profile.service_class,
            "offer_id": offer.offer_id,
            "offer_expiry": offer.expiry_date,
            "offer_start": offer.start_date,
            "UT": ut,
            "UC": uc,
            "carried": carried_bytes,
            "carried_raw": carried_raw,
            "flat_rate": flat_rate,
            "to_bytes": to_bytes,
            "map_service_class": self.map_service_class,
            "bytes_per_unit": self.wb.bytes_per_unit,
        }

    def _lookup_ut(self, profile: SubscriberProfile, spec: dict) -> float:
        """UT (total allocation) in bytes from the dedicated account matching the
        SDP UT id (sdp_ut_id if given, else the account bucket spec base id)."""
        acc_spec = spec.get("sdp_ut_id") or spec["account_bucket_spec"]
        da = None
        if acc_spec:
            da = profile.dedicated_account(acc_spec) or profile.dedicated_account(
                acc_spec.split("_")[0])
        if da is None and profile.dedicated_accounts:
            da = profile.dedicated_accounts[0]
        if da is None:
            return 0.0
        return float(da.value) * self.wb.bytes_per_unit(da.unit)

    def _lookup_uc(self, profile: SubscriberProfile, spec: dict) -> float:
        """UC (consumed) in bytes from the accumulator matching the counter/account id."""
        acc_spec = spec.get("sdp_uc_id") or spec["account_bucket_spec"] or spec["counter_bucket_spec"]
        acc = None
        if acc_spec:
            base = acc_spec.split("_")[0]
            acc = profile.accumulator(base) or profile.accumulator(acc_spec)
        if acc is None:
            return 0.0
        return float(acc.value) * self.wb.bytes_per_unit(acc.unit)

    def _index_carryover(self, profile: SubscriberProfile) -> dict[str, ECOffer]:
        """Map base offer_id -> carryover companion offer."""
        out: dict[str, ECOffer] = {}
        for o in profile.offers:
            if o.is_carryover_companion:
                base = o.offer_id.replace("_CARRYOVER", "").replace("_carryover", "")
                out[base] = o
        return out

    def _is_flat_rate(self, offer: ECOffer, spec: dict) -> bool:
        raw = offer.attr("FlatRate")
        if raw is not None:
            return str(raw).strip().lower() in ("yes", "true", "1", "y")
        return str(spec.get("flat_rate_default") or "").strip().lower() in ("yes", "true", "1", "y")

    def _param_derivation(self, sdp_source: str, default: str) -> str:
        for m in self.wb.parameter_mapping:
            if m["sdp_source"] == sdp_source and m.get("derivation"):
                return str(m["derivation"])
        return default

    def _transform(self, value: str, transform: str) -> str:
        transform = (transform or "asis").strip()
        if transform == "asis":
            return str(value)
        if transform == "upper":
            return str(value).upper()
        if transform == "lower":
            return str(value).lower()
        if transform.startswith("map:"):
            pairs = transform[4:].split(";")
            table = {}
            for p in pairs:
                if "=" in p:
                    k, v = p.split("=", 1)
                    table[k.strip()] = v.strip()
            return table.get(str(value).strip(), str(value))
        return str(value)

    def _pick_partition(self, msisdn: str) -> str:
        strategy = str(self.wb.setting("partition_strategy", "hash")).strip().lower()
        values = [v.strip() for v in str(self.wb.setting("partition_values", "1")).split(",") if v.strip()]
        if not values:
            values = ["1"]
        if strategy == "fixed":
            return values[0]
        if strategy == "roundrobin":
            # deterministic per-msisdn round robin by last digit
            idx = int(msisdn[-1]) % len(values) if msisdn[-1:].isdigit() else 0
            return values[idx]
        # hash (default): stable across runs
        h = int(hashlib.sha1(msisdn.encode()).hexdigest(), 16)
        return values[h % len(values)]

    def _ext_id(self, pattern_key: str, sub_ref: str, default_pattern: str = None) -> str:
        # Default convention: "<name>-<subRef>" (random ref), matching the
        # production ProvisionWizard. A workbook may override the pattern; both
        # {subref} and {msisdn} placeholders are supported for flexibility.
        default = default_pattern or (pattern_key.replace("_pattern", "") + "-{subref}")
        pattern = str(self.wb.setting(pattern_key, default))
        return (pattern
                .replace("{subref}", sub_ref)
                .replace("{subRef}", sub_ref)
                .replace("{msisdn}", sub_ref))  # legacy pattern -> uses subRef, not MSISDN

    @staticmethod
    def _as_int(v) -> Optional[int]:
        if v is None:
            return None
        try:
            return int(round(float(v)))
        except (TypeError, ValueError):
            return None


def load_engine(workbook_path: str | Path) -> MappingEngine:
    return MappingEngine(MappingWorkbook(workbook_path))
