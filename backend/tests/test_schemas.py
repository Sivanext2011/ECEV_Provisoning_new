"""Unit tests for Pydantic schema validation."""
import pytest
from pydantic import ValidationError

from app.models.schemas import (
    BalanceTopUp, BucketAdjustment, SubscriberProvision,
    TerminateRequest, ContractCreate,
)


def test_valid_msisdn():
    req = BalanceTopUp(
        customerExternalId="C1", msisdn="+46701234567",
        amount=100, unitOfMeasure="euro",
    )
    assert req.msisdn == "+46701234567"


def test_invalid_msisdn_rejects():
    with pytest.raises(ValidationError) as exc_info:
        BalanceTopUp(
            customerExternalId="C1", msisdn="abc",
            amount=100, unitOfMeasure="euro",
        )
    assert "MSISDN" in str(exc_info.value)


def test_access_channel_mandatory():
    """accessChannel defaults to WEB but cannot be empty."""
    req = BalanceTopUp(
        customerExternalId="C1", msisdn="+46701234567",
        amount=100, unitOfMeasure="euro",
    )
    assert req.accessChannel == "WEB"


def test_access_channel_empty_rejects():
    with pytest.raises(ValidationError):
        BalanceTopUp(
            customerExternalId="C1", msisdn="+46701234567",
            amount=100, unitOfMeasure="euro", accessChannel="",
        )


def test_bucket_adjustment_action_validation():
    """action must be Relative or Absolute."""
    with pytest.raises(ValidationError):
        BucketAdjustment(
            customerExternalId="C1", billingAccountExternalId="BA1",
            bucketSpecExternalId="BS1", amount=100,
            action="Invalid",
        )


def test_payment_context_validation():
    """paymentContext must be Prepaid or Postpaid."""
    with pytest.raises(ValidationError):
        ContractCreate(
            customerExternalId="C1", msisdn="+46701234567",
            paymentContext="Invalid",
        )


def test_valid_payment_contexts():
    for ctx in ("Prepaid", "Postpaid"):
        req = ContractCreate(
            customerExternalId="C1", msisdn="+46701234567",
            paymentContext=ctx,
        )
        assert req.paymentContext == ctx


def test_terminate_request_cascade_default():
    req = TerminateRequest(externalId="EXT_1")
    assert req.cascade is False


def test_imsi_validation():
    req = SubscriberProvision(
        givenName="Test", familyName="User", msisdn="+46701234567",
        imsi="240071234567890",
    )
    assert req.imsi == "240071234567890"

    with pytest.raises(ValidationError):
        SubscriberProvision(
            givenName="Test", familyName="User", msisdn="+46701234567",
            imsi="123",  # too short
        )
