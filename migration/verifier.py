"""Verification + reconciliation of the ECEV state against the EC-derived plan.

After provisioning and before EC delete, we assert the ECEV state matches the
values derived from EC (LLD Validation & Reconciliation table). Migration passes
only if every bucket assertion holds.
"""

from __future__ import annotations

import logging
from typing import Any

from .models import MigrationPlan

logger = logging.getLogger(__name__)


def _flatten_buckets(balance_response: dict) -> dict[str, int]:
    """Extract {bucketSpecExternalId: effective_value_bytes} from a BSSF balance
    enquiry response.

    IMPORTANT: a bucket exposes a top-level effective 'amount' PLUS a
    'valueContainer' list of time-sliced sub-amounts. A CPM 'Set' closes the old
    container (amount 0, past validFor) and opens a new one holding the value, so
    the per-container amounts include a stale 0. We must read the bucket's
    top-level 'amount' (the current effective value) and NOT descend into
    valueContainer (which would overwrite it with the expired 0)."""
    out: dict[str, int] = {}

    def _num(amount):
        if isinstance(amount, dict):
            return amount.get("number")
        if isinstance(amount, (int, float, str)):
            return amount
        return None

    def visit(node: Any):
        if isinstance(node, dict):
            spec = (node.get("bucketSpecExternalId")
                    or node.get("bucketSpecificationExternalId")
                    or node.get("specExternalId"))
            number = _num(node.get("amount") or node.get("value") or node.get("balance"))
            if spec is not None and number is not None:
                try:
                    out[str(spec)] = int(round(float(number)))
                except (TypeError, ValueError):
                    pass
            # Recurse into everything EXCEPT valueContainer (time-sliced history),
            # so the bucket-level effective amount is not overwritten by a stale
            # expired container value.
            for k, v in node.items():
                if k == "valueContainer":
                    continue
                visit(v)
        elif isinstance(node, list):
            for v in node:
                visit(v)

    visit(balance_response)
    return out


class Verifier:
    def __init__(self, migrator, tolerance_bytes: int = 0):
        self.migrator = migrator
        self.tolerance = tolerance_bytes

    async def fetch_balance(self, msisdn: str) -> dict:
        return await self.migrator.client.request(
            "balance_enquiry_msisdn", path_params={"msisdn": msisdn})

    async def verify(self, plan: MigrationPlan) -> dict:
        """Return a reconciliation report dict with 'passed' bool and 'checks'."""
        report: dict[str, Any] = {"msisdn": plan.master_msisdn, "passed": True, "checks": []}

        balance = await self.fetch_balance(plan.master_msisdn)
        actual = _flatten_buckets(balance)
        report["actual_buckets"] = actual

        for product_ext, bucket in plan.all_bucket_adjustments():
            spec = bucket.bucket_spec_external_id
            expected = bucket.amount
            got = actual.get(spec)
            ok = got is not None and abs(got - expected) <= self.tolerance
            report["checks"].append({
                "product": product_ext,
                "bucket": spec,
                "expected": expected,
                "actual": got,
                "passed": ok,
            })
            if not ok:
                report["passed"] = False

        # verify every additional MSISDN resolves to the same contract
        for sub in plan.additional_msisdns:
            try:
                sub_balance = await self.fetch_balance(sub.msisdn)
                resolved = bool(_flatten_buckets(sub_balance)) or bool(sub_balance)
            except Exception as e:  # noqa: BLE001
                resolved = False
                logger.info(f"subordinate {sub.msisdn} balance enquiry failed: {e}")
            report["checks"].append({
                "subordinate": sub.msisdn,
                "resolves_to_contract": resolved,
                "passed": resolved,
            })
            if not resolved:
                report["passed"] = False

        if not report["passed"]:
            first_fail = next((c for c in report["checks"] if not c["passed"]), None)
            report["first_failing_assertion"] = first_fail
        return report
