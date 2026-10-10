"""End-to-end unit tests for the migration tool against the LLD worked example.

Verifies:
  * UCIP XML parsing -> SubscriberProfile
  * Excel-driven mapping/derivation -> MigrationPlan (bytes correct)
  * BSSF body building (party/customer/contract/bucket adjustment)

Expected derived bytes (LLD):
  Basic 145001:   account 6145000 = 30GB = 32212254720 ; counter 6145000_CTR = 20GB = 21474836480
  Add-on 160006:  account 6160006 = 20GB = 21474836480 ; counter 6160006_CTR = 30GB = 32212254720
                  carryover 6169006 = 5GB = 5368709120 ; flag 6160006_carryover = 1
  ServiceClass contract char = 5101 ; partition picked ; watch 886955550000 on same contract.
"""

from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

from migration import excel_template
from migration.bssf_migrator import BssfMigrator
from migration.mapping_engine import load_engine, safe_eval, MappingError
from migration.ucip_client import UcipClient, _normalise_xmlrpc_response
from migration.tests import sample_ucip_responses as fx

GB = 1073741824
MASTER = "886912345678"
WATCH = "886955550000"


def _norm(xml_rpc_text):
    """Parse an XML-RPC methodResponse fixture into the normalised element tree."""
    return _normalise_xmlrpc_response(ET.fromstring(xml_rpc_text))


@pytest.fixture(scope="module")
def workbook(tmp_path_factory):
    path = tmp_path_factory.mktemp("wb") / "mapping.xlsx"
    excel_template.generate(path)
    return path


@pytest.fixture
def profile():
    """Build a SubscriberProfile by feeding the sample XML-RPC through the parsers."""
    ucip = UcipClient({"ucip": {"endpoint": "http://unused"}})

    from migration.models import SubscriberProfile
    prof = SubscriberProfile(master_msisdn=MASTER)
    acct = _norm(fx.GET_ACCOUNT_DETAILS)
    prof.service_class = acct.find("serviceClassCurrent").text
    prof.imsi = acct.find("imsi").text
    prof.offers = ucip._parse_offers(_norm(fx.GET_OFFERS))
    prof.dedicated_accounts = ucip._parse_dedicated_accounts(_norm(fx.GET_BALANCE_AND_DATE))
    prof.accumulators = ucip._parse_accumulators(_norm(fx.GET_ACCUMULATORS))
    prof.subordinates = ucip._parse_subordinates(_norm(fx.GET_MULTI), MASTER)
    return prof


# --- UCIP parsing ----------------------------------------------------------

def test_ucip_parse_offers(profile):
    ids = [o.offer_id for o in profile.offers]
    assert "145001" in ids and "160006" in ids
    carry = [o for o in profile.offers if o.is_carryover_companion]
    assert len(carry) == 1
    assert carry[0].carried_amount == 5


def test_ucip_parse_attributes(profile):
    basic = next(o for o in profile.offers if o.offer_id == "145001")
    assert basic.attr("HighBandwidth") == "Speed1.5G"
    assert basic.attr("FlatRate") == "No"


def test_ucip_parse_dedicated_and_accumulators(profile):
    assert profile.dedicated_account("6145000").value == 50
    assert profile.accumulator("6145000").value == 20
    assert profile.accumulator("6160006").value == 30


def test_ucip_parse_subordinate(profile):
    assert len(profile.subordinates) == 1
    assert profile.subordinates[0].msisdn == WATCH
    assert profile.subordinates[0].imsi == "466920000009999"


# --- mapping / derivation --------------------------------------------------

def test_safe_eval_restricted():
    assert safe_eval("UT - UC", {"UT": 50, "UC": 20}) == 30
    with pytest.raises(MappingError):
        safe_eval("__import__('os').system('echo hi')", {})


def test_build_plan_service_class_and_partition(workbook, profile):
    engine = load_engine(workbook)
    plan = engine.build_plan(profile)
    assert plan.service_class_ecev == "5101"
    assert plan.contract_characteristics["ServiceClass"] == "5101"
    # externalIds use a random 8-char subRef (NOT the MSISDN), shared across the
    # party/customer/contract/BA for one subscriber.
    assert len(plan.sub_ref) == 8
    assert MASTER not in plan.party_external_id
    assert plan.party_external_id == f"party-{plan.sub_ref}"
    assert plan.customer_external_id == f"customer-{plan.sub_ref}"
    assert plan.contract_external_id == f"contract-{plan.sub_ref}"
    assert plan.billing_account_external_id == f"ba-{plan.sub_ref}"
    assert plan.partition_id in ("1", "2")


def test_build_plan_buckets_basic(workbook, profile):
    engine = load_engine(workbook)
    plan = engine.build_plan(profile)
    basic = next(p for p in plan.products if p.product_offering_external_id == "145001")
    buckets = {b.bucket_spec_external_id: b.amount for b in basic.buckets}
    assert buckets["6145000"] == 30 * GB        # account = UT - UC = 50-20
    assert buckets["6145000_CTR"] == 20 * GB    # counter = UC
    assert basic.characteristics["accountID"] == MASTER
    assert basic.characteristics["HighBandwidth"] == "Speed1.5G"
    assert basic.characteristics["FlatRate"] == "No"
    assert basic.characteristics["QoS_info"] == "HIGH"


def test_build_plan_buckets_addon_with_carryover(workbook, profile):
    engine = load_engine(workbook)
    plan = engine.build_plan(profile)
    addon = next(p for p in plan.products if p.product_offering_external_id == "160006")
    buckets = {b.bucket_spec_external_id: b.amount for b in addon.buckets}
    assert buckets["6160006"] == 20 * GB         # account = 50-30
    assert buckets["6160006_CTR"] == 30 * GB     # counter = UC
    assert buckets["6169006"] == 5 * GB          # carryover carried bytes
    assert buckets["6160006_carryover"] == 1     # carryover flag


def test_build_plan_multisim(workbook, profile):
    engine = load_engine(workbook)
    plan = engine.build_plan(profile)
    assert [s.msisdn for s in plan.additional_msisdns] == [WATCH]


def test_flat_rate_skips_buckets(workbook, profile):
    # Flip the basic plan to FlatRate=Yes -> unlimited, no buckets
    basic = next(o for o in profile.offers if o.offer_id == "145001")
    for a in basic.attributes:
        if a.name == "FlatRate":
            a.value = "Yes"
    engine = load_engine(workbook)
    plan = engine.build_plan(profile)
    bp = next(p for p in plan.products if p.product_offering_external_id == "145001")
    assert bp.flat_rate is True
    assert bp.buckets == []
    assert bp.characteristics["FlatRate"] == "Yes"


# --- BSSF body building ----------------------------------------------------

def test_bssf_bodies(workbook, profile):
    engine = load_engine(workbook)
    plan = engine.build_plan(profile)
    mig = BssfMigrator(defaults={
        "customerSpecExternalId": "CHT_Customer_Postpaid",
        "contractSpecExternalId": "CHT_Contract_Postpaid",
        "billingAccountSpecExternalId": "BAS_CHT_Postpaid",
        "msisdnResourceSpecExternalId": "ext_LRS_MSISDN",
    })

    party = mig.build_party_body(plan)
    assert party["externalId"] == f"party-{plan.sub_ref}"
    assert MASTER not in party["externalId"]
    assert party["partitionId"] == plan.partition_id

    cust = mig.build_customer_body(plan)
    assert cust["externalId"] == f"customer-{plan.sub_ref}"
    assert cust["account"][0]["billingAccountSpecExternalId"] == "BAS_CHT_Postpaid"

    ctr = mig.build_contract_body(plan)
    assert ctr["externalId"] == f"contract-{plan.sub_ref}"
    # ServiceClass contract characteristic present
    sc = [c for c in ctr["characteristic"] if c["charSpecExternalId"] == "ServiceClass"]
    assert sc and sc[0]["value"][0]["value"] == "5101"
    # master + watch MSISDN as two resources on same contract
    res_numbers = [r["resourceNumber"] for r in ctr["resource"]]
    assert MASTER in res_numbers and WATCH in res_numbers
    # each product carries a subRef-based instance externalId + BA reference
    for p in ctr["product"]:
        assert p["externalId"].endswith(f"-{plan.sub_ref}")
        assert p["billingAccountReference"]["externalId"] == f"ba-{plan.sub_ref}"
    # products present
    po_ids = [p["productOfferingExternalId"] for p in ctr["product"]]
    assert "145001" in po_ids and "160006" in po_ids

    # bucket adjustment body (flat productBucketAdjustment structure)
    first_prod, first_bucket = plan.all_bucket_adjustments()[0]
    adj = mig.build_bucket_adjustment_body(plan, first_prod, first_bucket)
    assert adj["customerExternalId"] == f"customer-{plan.sub_ref}"
    assert adj["contractExternalId"] == f"contract-{plan.sub_ref}"
    assert adj["productExternalId"] == f"extID_{first_prod}-{plan.sub_ref}"
    assert adj["bucketSpecExternalId"] == first_bucket.bucket_spec_external_id
    assert adj["amount"]["number"] == first_bucket.amount
    assert adj["amount"]["decimalPlaces"] == 0
    assert adj["action"] == "Set"
    assert adj["unitOfMeasure"] == "byte"


def test_all_bucket_adjustments_count(workbook, profile):
    engine = load_engine(workbook)
    plan = engine.build_plan(profile)
    # Basic: 2 buckets ; Add-on: 2 + carryover account + flag = 4 -> total 6
    assert len(plan.all_bucket_adjustments()) == 6


# --- XML-RPC request building (CPI protocol) -------------------------------

def test_xmlrpc_request_body():
    ucip = UcipClient({"ucip": {"endpoint": "http://x/Air", "origin_host": "OCSG",
                                "username": "u", "password": "p"}})
    body = ucip._build_body("GetAccountDetails", MASTER)
    root = ET.fromstring(body)
    assert root.tag == "methodCall"
    assert root.find("methodName").text == "GetAccountDetails"
    # struct members
    members = {m.find("name").text: m.find("value/string").text
               for m in root.iter("member") if m.find("value/string") is not None}
    assert members["subscriberNumber"] == MASTER
    assert members["originNodeType"] == "EXT"
    assert members["originHostName"] == "OCSG"
    assert "originTransactionID" in members


def test_xmlrpc_deleteoffer_has_offer_member():
    ucip = UcipClient({"ucip": {"endpoint": "http://x/Air"}})
    body = ucip._build_body("DeleteOffer", MASTER, offer_id="145001")
    root = ET.fromstring(body)
    members = {m.find("name").text: m.find("value/string").text
               for m in root.iter("member") if m.find("value/string") is not None}
    assert members["offerID"] == "145001"


def test_xmlrpc_fault_raises():
    import pytest as _pytest
    from migration.ucip_client import _normalise_xmlrpc_response, UcipError
    fault = ('<?xml version="1.0"?><methodResponse><fault><value><struct>'
             '<member><name>faultCode</name><value><int>4</int></value></member>'
             '<member><name>faultString</name><value><string>Subscriber unknown</string></value></member>'
             '</struct></value></fault></methodResponse>')
    norm = _normalise_xmlrpc_response(ET.fromstring(fault))
    with _pytest.raises(UcipError):
        UcipClient._check_response_code("GetAccountDetails", norm)


# --- provisioning request builders (UT / UC / offers) ----------------------

def test_install_subscriber_body_with_ut_and_offers():
    ucip = UcipClient({"ucip": {"endpoint": "http://x/Air"}})
    body = ucip._build_body(
        "InstallSubscriber", MASTER,
        typed_members={
            "serviceClassCurrent": 10,
            "dedicatedAccountUpdateInformation": __import__(
                "migration.ucip_client", fromlist=["_dedicated_account_array"]
            )._dedicated_account_array([{"id": 6145000, "value": 32212254720}], absolute_only=True),
            "offerUpdateInformationList": __import__(
                "migration.ucip_client", fromlist=["_offer_array"]
            )._offer_array([{"offerID": 145001, "offerType": 1}]),
        },
    )
    root = ET.fromstring(body)
    assert root.find("methodName").text == "InstallSubscriber"
    names = [m.find("name").text for m in root.iter("member")]
    assert "dedicatedAccountID" in names
    assert "dedicatedAccountValueNew" in names
    assert "offerID" in names
    # the dedicated account value is an i4
    da_val = None
    for m in root.iter("member"):
        if m.find("name").text == "dedicatedAccountValueNew":
            da_val = m.find("value/i8").text
    assert da_val == "32212254720"


def test_update_accumulators_body():
    from migration.ucip_client import _accumulator_array
    arr = _accumulator_array([{"id": 6145000, "value": 21474836480}])
    ucip = UcipClient({"ucip": {"endpoint": "http://x/Air"}})
    body = ucip._build_body("UpdateAccumulators", MASTER,
                            typed_members={"accumulatorUpdateInformation": arr})
    root = ET.fromstring(body)
    assert root.find("methodName").text == "UpdateAccumulators"
    acc_val = None
    for m in root.iter("member"):
        if m.find("name").text == "accumulatorValueNew":
            acc_val = m.find("value/i8").text
    assert acc_val == "21474836480"


def test_negotiated_capabilities_present():
    ucip = UcipClient({"ucip": {"endpoint": "http://x/Air"}})
    body = ucip._build_body("GetAccountDetails", MASTER)
    root = ET.fromstring(body)
    names = [m.find("name").text for m in root.iter("member")]
    assert "negotiatedCapabilities" in names
    # it's an array of i4
    for m in root.iter("member"):
        if m.find("name").text == "negotiatedCapabilities":
            assert m.find("value/array/data/value/i4") is not None
