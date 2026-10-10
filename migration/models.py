"""Data models for the EC -> ECEV migration.

These dataclasses are the contract between the stages:
  ucip_client   -> SubscriberProfile (raw EC data)
  mapping_engine -> MigrationPlan     (derived ECEV provisioning plan)
  bssf_migrator -> uses MigrationPlan to build BSSF bodies
  verifier      -> compares ECEV state against MigrationPlan expectations
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Raw Classic EC (SDP) profile - produced by ucip_client
# ---------------------------------------------------------------------------

@dataclass
class ECOfferAttribute:
    name: str
    value: str


@dataclass
class ECOffer:
    offer_id: str
    offer_type: Optional[str] = None
    start_date: Optional[str] = None
    expiry_date: Optional[str] = None
    attributes: list[ECOfferAttribute] = field(default_factory=list)
    # Carryover companion metadata (if this offer is a *_CARRYOVER companion)
    is_carryover_companion: bool = False
    carried_amount: Optional[float] = None  # in the unit given by carried_unit
    carried_unit: Optional[str] = None

    def attr(self, name: str) -> Optional[str]:
        for a in self.attributes:
            if a.name.lower() == name.lower():
                return a.value
        return None


@dataclass
class ECDedicatedAccount:
    """A dedicated account / quota (UT = Usage Threshold total allocation)."""
    dedicated_account_id: str
    value: float            # quota value in `unit`
    unit: str = "GB"
    expiry_date: Optional[str] = None


@dataclass
class ECAccumulator:
    """A usage accumulator (UC = Usage Counter, consumed)."""
    accumulator_id: str
    value: float
    unit: str = "GB"


@dataclass
class ECSubordinate:
    """Subordinate device (e.g. Apple Watch) under the master MSISDN."""
    msisdn: str
    imsi: Optional[str] = None


@dataclass
class SubscriberProfile:
    """Full subscriber snapshot fetched from Classic EC via UCIP/ACIP."""
    master_msisdn: str
    service_class: Optional[str] = None
    imsi: Optional[str] = None
    language: Optional[str] = None
    currency: Optional[str] = None
    account_flags: Optional[str] = None
    supervision_expiry: Optional[str] = None
    service_fee_expiry: Optional[str] = None

    # Periodic Account Management (drives the CBEV bill cycle). From
    # GetAccountDetails pamInformationList (the bill-cycle PAM service).
    pam_service_id: Optional[str] = None
    pam_class_id: Optional[str] = None
    pam_schedule_id: Optional[str] = None
    pam_current_period: Optional[str] = None

    offers: list[ECOffer] = field(default_factory=list)
    dedicated_accounts: list[ECDedicatedAccount] = field(default_factory=list)
    accumulators: list[ECAccumulator] = field(default_factory=list)
    subordinates: list[ECSubordinate] = field(default_factory=list)

    # raw operation payloads kept for audit / debugging
    raw: dict[str, Any] = field(default_factory=dict)

    def dedicated_account(self, da_id: str) -> Optional[ECDedicatedAccount]:
        for da in self.dedicated_accounts:
            if da.dedicated_account_id == da_id:
                return da
        return None

    def accumulator(self, acc_id: str) -> Optional[ECAccumulator]:
        for acc in self.accumulators:
            if acc.accumulator_id == acc_id:
                return acc
        return None


# ---------------------------------------------------------------------------
# Derived ECEV provisioning plan - produced by mapping_engine
# ---------------------------------------------------------------------------

@dataclass
class BucketValue:
    """A bucket to set via Product Bucket Adjustment (amount is in bytes)."""
    bucket_spec_external_id: str
    amount: int              # absolute target value in bytes (or flag int)
    reason: str = "MIGRATION"
    decimal_places: int = 0


@dataclass
class DerivedProduct:
    """One ECEV Product Offering to add to the contract, plus its buckets."""
    product_offering_external_id: str
    characteristics: dict[str, str] = field(default_factory=dict)   # charSpecExternalId -> value
    buckets: list[BucketValue] = field(default_factory=list)
    valid_to: Optional[str] = None          # product lifecycle valid-to (fixed-expiry)
    pop_type: Optional[str] = None          # Regular / Initial / Consumption / FlatRate
    bill_cycle_aligned: bool = False        # True if offer has a POP (catalog) -> BA recurrence ref
    flat_rate: bool = False                 # FlatRate=Yes -> unlimited, no bucket


@dataclass
class MigrationPlan:
    """Everything needed to provision + verify one subscriber on ECEV."""
    master_msisdn: str
    partition_id: str = "1"
    service_class_ecev: Optional[str] = None     # mapped ServiceClass contract char
    contract_characteristics: dict[str, str] = field(default_factory=dict)
    products: list[DerivedProduct] = field(default_factory=list)
    additional_msisdns: list[ECSubordinate] = field(default_factory=list)  # Multi-SIM / watch

    # external ids — random per-subscriber reference (subRef), matching the
    # production ProvisionWizard. NOT derived from the MSISDN.
    sub_ref: str = ""
    party_external_id: str = ""
    customer_external_id: str = ""
    contract_external_id: str = ""
    billing_account_external_id: str = ""
    # Bill cycle resolved from the subscriber's PAM schedule (per-schedule).
    bill_cycle_spec_external_id: str = ""
    pam_schedule_id: str = ""

    warnings: list[str] = field(default_factory=list)

    def all_bucket_adjustments(self) -> list[tuple[str, BucketValue]]:
        """Flatten to (productOfferingExternalId, BucketValue) tuples."""
        out: list[tuple[str, BucketValue]] = []
        for p in self.products:
            for b in p.buckets:
                out.append((p.product_offering_external_id, b))
        return out


# ---------------------------------------------------------------------------
# Migration state machine
# ---------------------------------------------------------------------------

class MigrationState(str, Enum):
    PENDING = "PENDING"
    FETCHED = "FETCHED"
    PROVISIONED = "PROVISIONED"
    VERIFIED = "VERIFIED"
    EC_DELETED = "EC_DELETED"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"


@dataclass
class MigrationResult:
    msisdn: str
    state: MigrationState = MigrationState.PENDING
    error: Optional[str] = None
    failed_step: Optional[str] = None
    failed_assertion: Optional[str] = None
    plan: Optional[MigrationPlan] = None
    verify_report: dict[str, Any] = field(default_factory=dict)
    ecev_ids: dict[str, Any] = field(default_factory=dict)
    profile: Optional[Any] = None   # SDP SubscriberProfile (for SDP<->ECEV comparison)
