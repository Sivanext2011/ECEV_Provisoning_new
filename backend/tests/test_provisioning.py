"""Unit tests for provisioning service — verifies CBEV 23.10 correctness."""
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.services import provisioning as prov


@pytest.fixture
def mock_config():
    """Minimal config for testing."""
    return {
        "environment": {"ROOT_BAE": "https://test.example.com", "SITE": ""},
        "auth": {"token_endpoint": "", "username": "", "password": ""},
        "tls": {"ssl_verify": False},
        "network": {"timeout_seconds": 10, "retry_attempts": 1},
        "apis": {
            "create_party": {"method": "POST", "url": "{{ROOT_BAE}}/bae/bssfIndividualPartyManagement/v1/individualParty"},
            "create_customer": {"method": "POST", "url": "{{ROOT_BAE}}/bae/bssfCustomerManagement/v1/customer/"},
            "create_contract": {"method": "POST", "url": "{{ROOT_BAE}}/bae/bssfSubscriptionManagement/v1/customerExternalId/{{customerExternalId}}/contractExternalId"},
            "balance_topup": {"method": "POST", "url": "{{ROOT_BAE}}/bae/bssfBalanceManagement/v1/balanceTopUp"},
            "balance_adjustment": {"method": "POST", "url": "{{ROOT_BAE}}/bae/bssfBalanceManagement/v1/bucketAdjustment/adjust"},
            "terminate_party_cascade": {"method": "PATCH", "url": "{{ROOT_BAE}}/bae/bssfIndividualPartyManagement/v1/individualPartyExternalId/{{partyExternalId}}"},
            "terminate_customer_cascade": {"method": "PATCH", "url": "{{ROOT_BAE}}/bae/bssfCustomerManagement/v1/customerExternalId/{{customerExternalId}}"},
            "terminate_contract_cascade": {"method": "PATCH", "url": "{{ROOT_BAE}}/bae/bssfSubscriptionManagement/v1/customerExternalId/{{customerExternalId}}/contractExternalId/{{contractExternalId}}"},
            "update_contract": {"method": "PATCH", "url": "{{ROOT_BAE}}/bae/bssfSubscriptionManagement/v1/customerExternalId/{{customerExternalId}}/contractExternalId/{{contractExternalId}}"},
            "replace_product": {"method": "POST", "url": "{{ROOT_BAE}}/bae/bssfSubscriptionManagement/v1/replaceProduct"},
        },
        "defaults": {
            "partySpecExternalId": "TestPartySpec",
            "customerSpecExternalId": "TestCustSpec",
            "billingAccountSpecExternalId": "TestBASpec",
            "customerBAExternalId": "BA_TEST",
            "contractSpecExternalId": "TestContractSpec",
            "basePlanProductOfferingExternalId": "TestPO",
            "homeTimeZone": "Europe/Stockholm",
            "accessChannel": "WEB",
            "paymentContext": "Prepaid",
            "msisdnResourceSpecExternalId": "MSISDN_RS",
            "communicationIdentifierSpecExternalId": "CIS_1",
            "SMS_contactMediumExternalId": "cm_SMS",
            "SMS_contactMediumSpecExternalId": "CMS_SMS",
            "REST_contactMediumExternalId": "cm_REST",
            "REST_contactMediumSpecExternalId": "CMS_REST",
            "EMAIL_contactMediumExternalId": "cm_EMAIL",
            "EMAIL_contactMediumSpecExternalId": "CMS_EMAIL",
        },
    }


@pytest.fixture
def mock_client(mock_config):
    """Mock the ericsson_client.request method."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        with patch("app.services.provisioning.ericsson_client") as mock:
            mock.request = AsyncMock(return_value={"id": "123", "externalId": "ext_123"})
            yield mock


# === Test Balance TopUp body correctness ===

@pytest.mark.asyncio
async def test_balance_topup_has_access_channel(mock_client, mock_config):
    """CBEV 23.10: accessChannel is MANDATORY in balance topup."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.balance_topup("CUST_1", "+46701234567", 100, "euro", 0, "WEB")

    call_args = mock_client.request.call_args
    assert call_args[0][0] == "balance_topup"
    body = call_args[1]["body"]
    assert "accessChannel" in body
    assert body["accessChannel"] == "WEB"


@pytest.mark.asyncio
async def test_balance_topup_uses_related_party(mock_client, mock_config):
    """CBEV 23.10: uses relatedParty (not deprecated customerExternalId)."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.balance_topup("CUST_EXT", "+46701234567", 500, "TWD", 0, "WEB")

    body = mock_client.request.call_args[1]["body"]
    assert "relatedParty" in body
    assert body["relatedParty"]["@referredType"] == "Customer"
    assert body["relatedParty"]["externalId"] == "CUST_EXT"
    # Must NOT have deprecated flat customerExternalId
    assert "customerExternalId" not in body


@pytest.mark.asyncio
async def test_balance_topup_amount_structure(mock_client, mock_config):
    """Amount must be nested {number, decimalPlaces} per CBEV."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.balance_topup("C1", "+46701234567", 1050, "euro", 2, "WEB")

    body = mock_client.request.call_args[1]["body"]
    assert body["amount"] == {"number": 1050, "decimalPlaces": 2}
    assert body["unitOfMeasure"] == "euro"


# === Test Bucket Adjustment body correctness ===

@pytest.mark.asyncio
async def test_bucket_adjustment_structure(mock_client, mock_config):
    """CBEV 23.10: bucket adjustment uses billingAccountAdjustments array."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.bucket_adjustment("CUST_1", "BA_1", "BUCKET_SPEC_1", 200, "usd", 0, "Relative", "WEB")

    call_args = mock_client.request.call_args
    assert call_args[0][0] == "balance_adjustment"
    body = call_args[1]["body"]
    assert "billingAccountAdjustments" in body
    ba_adj = body["billingAccountAdjustments"][0]
    assert ba_adj["billingAccountRef"]["externalId"] == "BA_1"
    bucket = ba_adj["billingAccountBuckets"][0]
    assert bucket["billingAccountBucketSpecExternalId"] == "BUCKET_SPEC_1"
    assert bucket["action"] == "Relative"
    assert bucket["amount"] == {"number": 200, "decimalPlaces": 0}


@pytest.mark.asyncio
async def test_bucket_adjustment_has_access_channel(mock_client, mock_config):
    """CBEV 23.10: accessChannel mandatory in adjustment too."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.bucket_adjustment("C1", "BA_1", "BS_1", 100, "euro", 0, "Absolute", "API")

    body = mock_client.request.call_args[1]["body"]
    assert body["accessChannel"] == "API"


# === Test Termination status values ===

@pytest.mark.asyncio
async def test_terminate_party_uses_party_inactive(mock_client, mock_config):
    """CBEV 23.10: Party termination status is 'PartyInactive' (not 'Inactive')."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.terminate_party("PARTY_1", cascade=False)

    body = mock_client.request.call_args[1]["body"]
    assert body["status"][0]["status"] == "PartyInactive"
    assert "cascadeTermination" not in body


@pytest.mark.asyncio
async def test_terminate_party_cascade(mock_client, mock_config):
    """CBEV 23.10: cascade must be explicitly passed."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.terminate_party("PARTY_1", cascade=True)

    body = mock_client.request.call_args[1]["body"]
    assert body["cascadeTermination"] is True


@pytest.mark.asyncio
async def test_terminate_customer_uses_customer_inactive(mock_client, mock_config):
    """CBEV 23.10: Customer termination status is 'CustomerInactive'."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.terminate_customer("CUST_1", cascade=False)

    body = mock_client.request.call_args[1]["body"]
    assert body["status"][0]["status"] == "CustomerInactive"


@pytest.mark.asyncio
async def test_terminate_contract_uses_terminated(mock_client, mock_config):
    """CBEV 23.10: Contract termination status is 'Terminated'."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.terminate_contract("CUST_1", "CTR_1", cascade=True)

    body = mock_client.request.call_args[1]["body"]
    assert body["status"][0]["status"] == "Terminated"
    assert body["cascadeTermination"] is True


# === Test Contract creation includes paymentContext ===

@pytest.mark.asyncio
async def test_create_contract_has_payment_context(mock_client, mock_config):
    """CBEV 23.10: contract must include paymentContext."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.create_contract("CUST_1", "+46701234567", "PO_1", "BA_1", None, "Postpaid")

    body = mock_client.request.call_args[1]["body"]
    assert body["paymentContext"] == "Postpaid"


# === Test Product Lifecycle ===

@pytest.mark.asyncio
async def test_suspend_product_uses_product_halt(mock_client, mock_config):
    """CBEV 23.10: Suspended product status is 'ProductHalt'."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.suspend_product("CUST_1", "CTR_1", "PROD_1")

    body = mock_client.request.call_args[1]["body"]
    assert body["product"][0]["status"][0]["status"] == "ProductHalt"


@pytest.mark.asyncio
async def test_resume_product_uses_product_active(mock_client, mock_config):
    """CBEV 23.10: Resumed product status is 'ProductActive'."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.resume_product("CUST_1", "CTR_1", "PROD_1")

    body = mock_client.request.call_args[1]["body"]
    assert body["product"][0]["status"][0]["status"] == "ProductActive"


@pytest.mark.asyncio
async def test_replace_product_structure(mock_client, mock_config):
    """Test replaceProduct body structure."""
    with patch("app.services.provisioning.load_config", return_value=mock_config):
        await prov.replace_product("CUST_1", "CTR_1", "OLD_PROD", "NEW_PO", "NEW_PROD_EXT")

    body = mock_client.request.call_args[1]["body"]
    assert body["customerExternalId"] == "CUST_1"
    assert body["contractExternalId"] == "CTR_1"
    assert body["replacedProduct"]["externalId"] == "OLD_PROD"
    assert body["replacingProduct"]["productOfferingExternalId"] == "NEW_PO"
    assert body["replacingProduct"]["externalId"] == "NEW_PROD_EXT"
