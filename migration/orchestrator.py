"""Per-subscriber migration orchestration (state machine + rollback).

Flow (LLD):
  FETCHED    -> fetch profile from Classic EC (UCIP/ACIP)
  (map)      -> build MigrationPlan from the Excel mapping workbook
  PROVISIONED-> create Party, Customer, Contract(all), then bucket adjustments
  VERIFIED   -> balance enquiry + reconciliation against the plan
  EC_DELETED -> delete from Classic EC (only after VERIFIED)
  FAILED     -> on error: compensate (rollback ECEV reverse order) + record

The EC delete runs only after ECEV is VERIFIED, so Classic EC stays the source
of truth until then. Re-running an already VERIFIED/EC_DELETED subscriber is a
no-op (idempotent). externalIds are deterministic.
"""

from __future__ import annotations

import logging
from typing import Optional

from . import ec_delete
from .bssf_migrator import BssfMigrator
from .mapping_engine import MappingEngine
from .models import MigrationResult, MigrationState
from .state_store import StateStore
from .ucip_client import UcipClient
from .verifier import Verifier

logger = logging.getLogger(__name__)


class Orchestrator:
    def __init__(
        self,
        ucip: UcipClient,
        engine: MappingEngine,
        migrator: BssfMigrator,
        verifier: Verifier,
        store: StateStore,
        *,
        do_ec_delete: bool = True,
        dry_run: bool = False,
        verify_settle_seconds: float = 5.0,
    ):
        self.ucip = ucip
        self.engine = engine
        self.migrator = migrator
        self.verifier = verifier
        self.store = store
        self.do_ec_delete = do_ec_delete
        self.dry_run = dry_run
        # Seconds to wait after bucket adjustments before reconciling, so CPM's
        # time-sliced value containers become the active 'current' value.
        self.verify_settle_seconds = verify_settle_seconds

    async def migrate(self, msisdn: str, force: bool = False) -> MigrationResult:
        result = MigrationResult(msisdn=msisdn)

        # Idempotency: skip terminal states unless forced
        existing = await self.store.get_state(msisdn)
        if existing in (MigrationState.VERIFIED, MigrationState.EC_DELETED) and not force:
            result.state = existing
            await self.store.audit(msisdn, "skip", "already_migrated", existing.value)
            return result

        # 1. FETCH --------------------------------------------------------
        try:
            profile = self.ucip.fetch_profile(msisdn)
            result.state = MigrationState.FETCHED
            result.profile = profile
            await self.store.audit(msisdn, "fetch", "ok",
                                   {"offers": [o.offer_id for o in profile.offers],
                                    "service_class": profile.service_class})
        except Exception as e:  # noqa: BLE001
            return await self._fail(result, "fetch", e)

        # 2. MAP ----------------------------------------------------------
        try:
            plan = self.engine.build_plan(profile)
            result.plan = plan
            if plan.warnings:
                await self.store.audit(msisdn, "map", "warnings", plan.warnings)
        except Exception as e:  # noqa: BLE001
            return await self._fail(result, "map", e)

        if self.dry_run:
            result.state = MigrationState.FETCHED
            result.ecev_ids = {
                "party": plan.party_external_id,
                "customer": plan.customer_external_id,
                "contract": plan.contract_external_id,
                "partition": plan.partition_id,
                "products": [p.product_offering_external_id for p in plan.products],
                "bucket_adjustments": [
                    {"product": pe, "bucket": b.bucket_spec_external_id, "amount": b.amount}
                    for pe, b in plan.all_bucket_adjustments()
                ],
            }
            await self.store.save(result)
            await self.store.audit(msisdn, "dry_run", "ok", result.ecev_ids)
            return result

        # 3. PROVISION ----------------------------------------------------
        try:
            party = await self.migrator.create_party(plan)
            customer = await self.migrator.create_customer(plan)
            contract = await self.migrator.create_contract(plan)
            result.ecev_ids = {
                "party": party.get("externalId", plan.party_external_id),
                "customer": customer.get("externalId", plan.customer_external_id),
                "contract": contract.get("externalId", plan.contract_external_id),
            }
            adjustments = await self.migrator.adjust_buckets(plan)
            result.state = MigrationState.PROVISIONED
            await self.store.save(result)
            await self.store.audit(msisdn, "provision", "ok",
                                   {"bucket_adjustments": len(adjustments)})
        except Exception as e:  # noqa: BLE001
            errors = await self.migrator.rollback(plan)
            await self.store.audit(msisdn, "rollback", "done", errors)
            res = await self._fail(result, "provision", e)
            res.state = MigrationState.FAILED
            return res

        # 4. VERIFY -------------------------------------------------------
        try:
            # Settle delay: a CPM 'Set' time-slices the bucket, opening a new value
            # container that starts at the adjustment instant. A balance enquiry in
            # the same second still sees the old (0) container as 'current'. Wait a
            # few seconds so 'now' is clearly inside the new container window before
            # reconciling.
            import asyncio as _asyncio
            await _asyncio.sleep(self.verify_settle_seconds)
            report = await self.verifier.verify(plan)
            result.verify_report = report
            if not report.get("passed"):
                # settle longer + one re-apply attempt, then roll back
                await _asyncio.sleep(self.verify_settle_seconds)
                report = await self.verifier.verify(plan)
                result.verify_report = report
            if not report.get("passed"):
                await self.migrator.adjust_buckets(plan)
                await _asyncio.sleep(self.verify_settle_seconds)
                report = await self.verifier.verify(plan)
                result.verify_report = report
            if not report.get("passed"):
                result.failed_assertion = str(report.get("first_failing_assertion"))
                errors = await self.migrator.rollback(plan)
                await self.store.audit(msisdn, "rollback", "verify_failed", errors)
                res = await self._fail(result, "verify",
                                       RuntimeError("reconciliation mismatch"))
                res.state = MigrationState.ROLLED_BACK
                return res
            result.state = MigrationState.VERIFIED
            await self.store.save(result)
            await self.store.audit(msisdn, "verify", "ok", {"checks": len(report.get("checks", []))})
        except Exception as e:  # noqa: BLE001
            return await self._fail(result, "verify", e)

        # 5. EC DELETE (only after VERIFIED) ------------------------------
        if self.do_ec_delete:
            try:
                del_result = ec_delete.delete_from_ec(self.ucip, profile)
                if del_result["all_deleted"]:
                    result.state = MigrationState.EC_DELETED
                else:
                    # keep ECEV; flag manual cleanup (do NOT roll back verified ECEV)
                    await self.store.audit(msisdn, "ec_delete", "partial", del_result)
                await self.store.save(result)
                await self.store.audit(msisdn, "ec_delete",
                                       "ok" if del_result["all_deleted"] else "manual_cleanup",
                                       del_result)
            except Exception as e:  # noqa: BLE001
                await self.store.audit(msisdn, "ec_delete", "error", str(e))
                # ECEV already verified: keep it, flag for manual cleanup
                await self.store.save(result)
        else:
            await self.store.save(result)

        return result

    async def _fail(self, result: MigrationResult, step: str, exc: Exception) -> MigrationResult:
        result.state = MigrationState.FAILED
        result.failed_step = step
        result.error = str(exc)[:1000]
        await self.store.save(result)
        await self.store.audit(result.msisdn, step, "failed", str(exc)[:500])
        logger.error(f"Migration {result.msisdn} failed at {step}: {exc}")
        return result

    async def migrate_batch(self, msisdns: list[str], force: bool = False) -> list[MigrationResult]:
        results = []
        for m in msisdns:
            results.append(await self.migrate(m.strip(), force=force))
        return results
