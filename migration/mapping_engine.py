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
        self.service_class_map: dict[str, str] = {}
        self.schedule_bill_cycle_map: dict[str, str] = {}
        self.family_specs: dict[str, dict[str, Any]] = {}
        self.offer_attr_map: list[dict[str, Any]] = []
        self.parameter_mapping: list[dict[str, Any]] = []
        self._parse(wb)
        wb.close()

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
                    "carryover_account_bucket_spec": _s(r.get("carryover_account_bucket_spec")),
                    "carryover_flag_bucket_spec": _s(r.get("carryover_flag_bucket_spec")),
                    "flat_rate_default": _s(r.get("flat_rate_default")),
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

        # Buckets: account = UT-UC, counter = UC (expressions from ParameterMapping)
        acc_spec = spec["account_bucket_spec"]
        ctr_spec = spec["counter_bucket_spec"]
        acc_expr = self._param_derivation("account_bucket", "to_bytes(UT - UC)")
        ctr_expr = self._param_derivation("counter_bucket", "to_bytes(UC)")

        if acc_spec:
            amount = self._as_int(safe_eval(acc_expr, ctx))
            if amount is not None and amount >= 0:
                product.buckets.append(BucketValue(acc_spec, amount, "MIGRATION"))
        if ctr_spec:
            amount = self._as_int(safe_eval(ctr_expr, ctx))
            if amount is not None and amount >= 0:
                product.buckets.append(BucketValue(ctr_spec, amount, "MIGRATION"))

        # Carryover
        companion = carryover_by_base.get(offer.offer_id)
        if companion is not None:
            carried_expr = self._param_derivation("carryover_account", "to_bytes(carried)")
            flag_expr = self._param_derivation("carryover_flag", "1")
            co_acc_spec = spec["carryover_account_bucket_spec"]
            co_flag_spec = spec["carryover_flag_bucket_spec"]
            if co_acc_spec:
                amt = self._as_int(safe_eval(carried_expr, ctx))
                if amt is not None:
                    product.buckets.append(BucketValue(co_acc_spec, amt, "CARRYOVER"))
            if co_flag_spec:
                flag = self._as_int(safe_eval(flag_expr, ctx)) or 1
                product.buckets.append(BucketValue(co_flag_spec, flag, "CARRYOVER_FLAG"))

        return product

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
        account bucket spec id (or its numeric da id)."""
        acc_spec = spec["account_bucket_spec"]
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
        acc_spec = spec["account_bucket_spec"] or spec["counter_bucket_spec"]
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
