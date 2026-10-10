"""BSSF provisioning for the migration (ECEV side).

Builds the minimized call set from the LLD and executes it via the existing
EricssonClient (OAuth2 + mTLS + config-driven API registry):

  1. Create Individual Party   (with partitionId)
  2. Create Customer           (with billing account)
  3. Create Contract           (ALL products + characteristics + resources in ONE call)
  4. N x Product Bucket Adjustment (override buckets to the migrated values)

Delete helpers (reverse order) support rollback and are used by the orchestrator.

This module reuses backend.app.services.ericsson_client so the exact HTTP
behaviour (token refresh, partition header, logging, proxy, TLS) matches the
production provisioning tool. The MigrationPlan drives the request bodies, and
all externalIds are deterministic for idempotency.
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .models import MigrationPlan

logger = logging.getLogger(__name__)

# Make the backend package importable (migration/ sits next to backend/)
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def _get_client():
    """Import lazily so unit tests can run without the backend config present."""
    from backend.app.services.ericsson_client import ericsson_client  # type: ignore
    return ericsson_client


def _now_bssf() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _char(name: str, value: str) -> dict:
    return {"charSpecExternalId": name, "value": [{"value": str(value)}]}


def _to_bssf_datetime(raw: str) -> str:
    """Normalise a date/time to BSSF ISO-8601 (YYYY-MM-DDThh:mm:ss.000Z).

    Accepts SDP/UCIP forms like '20261108T12:00:00+0000', '20261108T120000',
    '20261108', or already-ISO strings. Falls back to the raw value if it can't
    be parsed."""
    if not raw:
        return raw
    s = str(raw).strip()
    if "-" in s[:10] and "T" in s:  # already ISO-ish
        return s if s.endswith("Z") else (s.split("+")[0].rstrip() + ".000Z" if "." not in s else s)
    import re as _re
    m = _re.match(r"^(\d{4})(\d{2})(\d{2})(?:T(\d{2}):?(\d{2}):?(\d{2}))?", s)
    if not m:
        return s
    y, mo, d, hh, mm, ss = m.groups()
    hh = hh or "00"; mm = mm or "00"; ss = ss or "00"
    return f"{y}-{mo}-{d}T{hh}:{mm}:{ss}.000Z"


class BssfMigrator:
    def __init__(self, defaults: Optional[dict] = None, client=None):
        self._client = client
        self.defaults = defaults or {}

    @property
    def client(self):
        if self._client is None:
            self._client = _get_client()
        return self._client

    # -- body builders (pure functions, unit-testable) -------------------
    def build_party_body(self, plan: MigrationPlan) -> dict:
        # partitionId: prefer the environment-configured partition (defaults from
        # the live config.json, e.g. "1"); fall back to the plan's hashed value
        # only if config has none. Posting a non-existent partition yields 404.
        partition = str(self.defaults.get("partitionId") or plan.partition_id or "1")
        body: dict[str, Any] = {
            "externalId": plan.party_external_id,
            "partitionId": partition,
            # BSSF individualParty requires a name; migrated subs carry the MSISDN
            # on the resource, so use a deterministic placeholder name.
            "givenName": self.defaults.get("defaultGivenName", "Migrated"),
            "familyName": self.defaults.get("defaultFamilyName", plan.master_msisdn),
            "status": [{"status": "PartyActive"}],
        }
        spec = self.defaults.get("partySpecExternalId")
        if spec:
            body["individualSpecification"] = {"externalId": spec}
        return body

    def build_customer_body(self, plan: MigrationPlan) -> dict:
        body: dict[str, Any] = {
            "externalId": plan.customer_external_id,
            "engagedParty": {"externalId": plan.party_external_id, "@referredType": "Individual"},
            "status": [{"status": "CustomerActive"}],
        }
        cust_spec = self.defaults.get("customerSpecExternalId", "CHT_Customer_Postpaid")
        if cust_spec:
            body["customerSpecification"] = {"externalId": cust_spec}

        ba_spec = self.defaults.get("billingAccountSpecExternalId", "BAS_CHT_Postpaid")
        ba = {
            "externalId": plan.billing_account_external_id,
            "status": [{"status": "BillingAccountActive"}],
        }
        if ba_spec:
            ba["billingAccountSpecExternalId"] = ba_spec
        # Bill cycle is resolved PER PAM SCHEDULE in the plan; fall back to config.
        bill_cycle = plan.bill_cycle_spec_external_id or self.defaults.get("billCycleSpecExternalId")
        if bill_cycle:
            ba["customerBillCycleSpecification"] = [{
                "externalId": f"cbcs-{plan.sub_ref}",
                "billCycleSpecExternalId": bill_cycle,
                "billCycleChangeType": self.defaults.get("billCycleChangeType", "NO_PRORATE"),
            }]
        body["account"] = [ba]
        return body

    def build_contract_body(self, plan: MigrationPlan) -> dict:
        now = _now_bssf()
        body: dict[str, Any] = {
            "externalId": plan.contract_external_id,
            "paymentContext": self.defaults.get("paymentContext", "Postpaid"),
            "billingAccountReference": {"externalId": plan.billing_account_external_id},
            # Plain "Active" with NO validFor. Adding a validFor startDateTime makes
            # CPM treat this as a future-dated status and require a
            # preInitializationState (403 BusinessLogicForbids /
            # CPMCDAL.MissingMandatoryInputFor). The production tool uses a bare status.
            "status": [{"status": "Active"}],
        }
        tz = self.defaults.get("homeTimeZone")
        if tz:
            body["homeTimeZone"] = [{"timeZone": tz}]
        ctr_spec = self.defaults.get("contractSpecExternalId", "CHT_Contract_Postpaid")
        if ctr_spec:
            body["contractSpecification"] = {"externalId": ctr_spec}

        # contract characteristics (ServiceClass etc.) — skip empty-named chars
        chars = [_char(k, v) for k, v in plan.contract_characteristics.items() if k]
        if chars:
            body["characteristic"] = chars

        # resources: master MSISDN + each subordinate (Multi-SIM / watch).
        # Reference the resource spec by externalId if configured, else by spec
        # id (UUID) — matches the production provisioning behaviour.
        def _msisdn_resource(number: str) -> dict:
            r: dict[str, Any] = {"resourceNumber": number}
            spec_ext = str(self.defaults.get("msisdnResourceSpecExternalId", "")).strip()
            spec_id = str(self.defaults.get("msisdnResourceSpecId", "")).strip()
            if spec_ext:
                r["resourceSpecificationExternalId"] = spec_ext
            elif spec_id:
                r["resourceSpecificationId"] = spec_id
            return r
        resources = [_msisdn_resource(plan.master_msisdn)]
        for sub in plan.additional_msisdns:
            resources.append(_msisdn_resource(sub.msisdn))
        body["resource"] = resources

        # products with their characteristics
        products = []
        for idx, p in enumerate(plan.products, start=1):
            prod: dict[str, Any] = {
                "externalId": f"extID_{p.product_offering_external_id}-{plan.sub_ref}",
                "productOfferingExternalId": p.product_offering_external_id,
                "correlationId": str(idx),
                "name": p.product_offering_external_id,
                "billingAccountReference": {"externalId": plan.billing_account_external_id},
                "characteristic": [_char(k, v) for k, v in p.characteristics.items() if k],
            }
            # Per catalog rule: an offer that HAS a POP is bill-cycle-aligned and
            # must carry baRefForBillCycleAlignedRecurrence; offers without a POP
            # must NOT. Driven by the FamilyBucketSpecs 'bill_cycle_aligned' flag.
            if p.bill_cycle_aligned:
                prod["baRefForBillCycleAlignedRecurrence"] = {
                    "externalId": plan.billing_account_external_id}
            products.append(prod)
        if products:
            body["product"] = products

        return body

    def _product_instance_ext_id(self, plan: MigrationPlan, product_offering_ext: str) -> str:
        """Per-product instance externalId, subRef-based (matches ProvisionWizard)."""
        return f"extID_{product_offering_ext}-{plan.sub_ref}"

    def build_bucket_adjustment_body(self, plan: MigrationPlan, product_ext: str, bucket,
                                     container_start: str = None,
                                     container_end: str = None,
                                     bucket_spec_id: str = None) -> dict:
        # Mirrors the proven-successful productBucketAdjustment/adjust request.
        # CRITICAL: validFor.startDateTime must be the EXISTING value container's
        # start (read via a prior GET / balance enquiry), so the Set updates that
        # container IN PLACE instead of creating a brand-new time slice. If the
        # existing start is unknown we fall back to a wide window.
        now = _now_bssf()
        start = container_start or "0001-01-01T12:00:00.001+00:00"
        end = container_end or "9999-12-31T12:00:00.001+00:00"
        body = {
            "triggerTime": now,
            "customerExternalId": plan.customer_external_id,
            "contractExternalId": plan.contract_external_id,
            "productExternalId": self._product_instance_ext_id(plan, product_ext),
            "bucketSpecExternalId": bucket.bucket_spec_external_id,
            "reason": bucket.reason or "MIGRATION",
            "amount": {"number": bucket.amount, "decimalPlaces": bucket.decimal_places},
            "validFor": {"startDateTime": start, "endDateTime": end},
            "unitOfMeasure": "byte",
            "action": "Set",
        }
        spec_id = bucket_spec_id or (self.defaults.get("bucketSpecIds", {}) or {}).get(
            bucket.bucket_spec_external_id)
        if spec_id:
            body["bucketSpecId"] = spec_id
        return body

    def _find_bucket(self, balance_response, spec: str):
        """Return the bucket dict for a given bucketSpecExternalId from a balance
        enquiry response (or None)."""
        found = []

        def visit(n):
            if isinstance(n, dict):
                if n.get("bucketSpecExternalId") == spec:
                    found.append(n)
                for v in n.values():
                    visit(v)
            elif isinstance(n, list):
                for v in n:
                    visit(v)
        visit(balance_response)
        return found[0] if found else None

    def _current_container(self, bucket: dict):
        """Return (startDateTime, endDateTime, bucketSpecId) to target the bucket's
        existing/active value container in the Set.

        The successful manual request used the bucket's REAL creation start (a
        recent timestamp), NOT the historical 0001-01-01 container start (which
        the API rejects with 403). So we prefer the bucket-level
        validFor.startDateTime; fall back to the active container window only if
        it is a real (non-0001) date."""
        if not bucket:
            return (None, None, None)
        spec_id = bucket.get("bucketSpecId")
        # bucket-level validFor start is the real creation time (settable).
        bucket_vf = bucket.get("validFor", {}) or {}
        start = bucket_vf.get("startDateTime")
        end = None
        containers = bucket.get("valueContainer") or []
        for c in containers:
            vf = c.get("validFor", {}) or {}
            if str(vf.get("endDateTime", "")).startswith("9999"):
                end = vf.get("endDateTime")
                # if bucket-level start missing/0001, use this container start when real
                cs = vf.get("startDateTime", "")
                if (not start or str(start).startswith("0001")) and cs and not str(cs).startswith("0001"):
                    start = cs
        if not end:
            end = "9999-12-31T12:00:00.001+00:00"
        # never send the unsettable 0001-01-01 start
        if start and str(start).startswith("0001"):
            start = None
        return (start, end, spec_id)

    # -- API calls --------------------------------------------------------
    async def create_party(self, plan: MigrationPlan) -> dict:
        return await self.client.request("create_party", body=self.build_party_body(plan))

    async def create_customer(self, plan: MigrationPlan) -> dict:
        return await self.client.request("create_customer", body=self.build_customer_body(plan))

    async def create_contract(self, plan: MigrationPlan) -> dict:
        return await self.client.request(
            "create_contract",
            body=self.build_contract_body(plan),
            path_params={"customerExternalId": plan.customer_external_id},
        )

    async def adjust_buckets(self, plan: MigrationPlan) -> list[dict]:
        results = []
        # GET the current balance once so we can target each bucket's EXISTING
        # value container (its validFor + bucketSpecId) in the Set — updating in
        # place rather than creating a new container.
        try:
            balance = await self.client.request(
                "balance_enquiry_msisdn", path_params={"msisdn": plan.master_msisdn})
        except Exception:  # noqa: BLE001
            balance = {}
        for product_ext, bucket in plan.all_bucket_adjustments():
            cur = self._find_bucket(balance, bucket.bucket_spec_external_id)
            start, end, spec_id = self._current_container(cur)
            body = self.build_bucket_adjustment_body(
                plan, product_ext, bucket,
                container_start=start, container_end=end, bucket_spec_id=spec_id)
            resp = await self.client.request("product_bucket_adjustment", body=body)
            results.append({"product": product_ext, "bucket": bucket.bucket_spec_external_id,
                            "amount": bucket.amount, "response": resp})
        return results

    # -- deletes (rollback, reverse order) -------------------------------
    async def delete_contract(self, plan: MigrationPlan):
        return await self.client.request(
            "delete_contract_by_external_id",
            path_params={"customerExternalId": plan.customer_external_id,
                         "contractExternalId": plan.contract_external_id},
        )

    async def delete_customer(self, plan: MigrationPlan):
        return await self.client.request(
            "delete_customer_by_external_id",
            path_params={"customerExternalId": plan.customer_external_id},
        )

    async def delete_party(self, plan: MigrationPlan):
        return await self.client.request(
            "delete_party_by_external_id",
            path_params={"partyExternalId": plan.party_external_id},
        )

    async def rollback(self, plan: MigrationPlan) -> list[str]:
        """Reverse-order compensation. Best-effort; collects per-step errors."""
        errors: list[str] = []
        for step, fn in (("contract", self.delete_contract),
                         ("customer", self.delete_customer),
                         ("party", self.delete_party)):
            try:
                await fn(plan)
            except Exception as e:  # noqa: BLE001 - best effort cleanup
                errors.append(f"{step}: {e}")
                logger.warning(f"Rollback {step} failed for {plan.master_msisdn}: {e}")
        return errors
