import urllib.request, json, uuid, time

BASE = "http://localhost:8001/api/v1"

def api(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        r = urllib.request.urlopen(req, timeout=60)
        return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

sub_ref = str(uuid.uuid4())[:8]
msisdn = "9950099517"
imsi = "995009950099517"
now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

party_ext = f"party-{sub_ref}"
customer_ext = f"customer-{sub_ref}"
contract_ext = f"contract-{sub_ref}"
ba_ext = f"ba-{sub_ref}"
cm_ext = f"cm_CMS_SocialMedia_NTF_{sub_ref}"

print(f"Test: Provisioning WITHOUT correlationId")
print(f"Sub ref: {sub_ref}, MSISDN: {msisdn}")
print()

# Party
party_body = {
    "externalId": party_ext,
    "givenName": "Test", "familyName": f"NoCorrId_{sub_ref}",
    "individualSpecification": {"externalId": "Party_Individual_CHT"},
    "status": [{"status": "PartyActive"}],
    "contactMedium": [{
        "contactMediumSpecExternalId": "CMS_SocialMedia_NTF",
        "externalId": cm_ext,
        "validFor": {"startDateTime": now},
        "characteristic": [
            {"charSpecExternalId": "SocialMedia", "value": [{"value": "SocialMedia"}]},
            {"charSpecExternalId": "socialMediaId", "value": [{"value": msisdn}]},
        ],
    }],
}

# Customer
customer_body = {
    "externalId": customer_ext,
    "customerSpecification": {"externalId": "CHT_Customer_Postpaid"},
    "status": [{"status": "CustomerActive"}],
    "account": [{
        "externalId": ba_ext,
        "billingAccountSpecExternalId": "BAS_CHT_Postpaid",
        "status": [{"status": "BillingAccountActive"}],
        "customerBillCycleSpecification": [{"externalId": f"cbcs-{sub_ref}", "billCycleSpecExternalId": "CHT_billcycle_01", "billCycleChangeType": "PRORATE_POS_START_NEW"}],
        "contactMediumAssociation": [{"contactRole": "Notification", "language": "en", "contactMediumExternalId": cm_ext, "enabled": True, "validFor": {"startDateTime": now}}],
    }],
    "engagedParty": {"externalId": party_ext, "@referredType": "Individual"},
    "contactMediumAssociation": [{"contactRole": "Notification", "language": "en", "contactMediumExternalId": cm_ext, "enabled": True, "validFor": {"startDateTime": now}}],
}

# Contract WITHOUT correlationId on product, and WITHOUT productCorrelationId on resources
contract_body = {
    "externalId": contract_ext,
    "contractSpecification": {"externalId": "CHT_Contract_Postpaid"},
    "status": [{"status": "Active"}],
    "product": [{
        "productOfferingExternalId": "145001",
        "externalId": f"145001-{sub_ref}",
        "name": "145001",
        "status": [{"status": "ProductActive"}],
        "billingAccountReference": {"externalId": ba_ext},
        "baRefForBillCycleAlignedRecurrence": {"externalId": ba_ext},
        "characteristic": [
            {"charSpecExternalId": "FlatRate", "value": [{"value": "No"}]},
        ],
        "price": [
            {
                "productOfferingPrice": {"externalId": "POP_Prorating_Activation"},
                "priceRow": [{"productOfferingPriceRow": {"externalId": "Action_FlatRate_No"}, "priceAction": [{"characteristic": [{"value": [{"value": "1", "unitOfMeasure": "gibibyte"}], "charSpecExternalId": "FlatRate_No_Amount"}], "action": {"externalId": "FlatRate_No_PB_Set"}}]}],
            },
            {
                "productOfferingPrice": {"externalId": "POP_RegularRecurrence"},
                "priceRow": [{"productOfferingPriceRow": {"externalId": "Action_FlatRate_No"}, "priceAction": [{"characteristic": [{"value": [{"value": "1", "unitOfMeasure": "gibibyte"}], "charSpecExternalId": "FlatRate_No_Amount"}], "action": {"externalId": "FlatRate_No_PB_Set"}}]}],
            },
        ],
    }],
    "resource": [
        {"externalId": f"msisdn-{sub_ref}", "resourceNumber": msisdn, "resourceSpecificationExternalId": "ext_LRS_MSISDN", "resourceSpecificationId": "8aabb378-affe-4bda-8ba6-55a53ccf4549"},
        {"externalId": f"imsi-{sub_ref}", "resourceNumber": imsi, "resourceSpecificationExternalId": "ext_LRS_IMSI", "resourceSpecificationId": "a35baba8-c815-4c2b-b418-09f8a161bff1"},
    ],
    "homeTimeZone": [{"timeZone": "Europe/Stockholm"}],
}

provision_payload = {
    "partyBody": party_body,
    "customerBody": customer_body,
    "contractBody": contract_body,
    "customerExternalId": customer_ext,
}

print("=" * 60)
print("Provisioning WITHOUT correlationId / productCorrelationId")
print("=" * 60)
status, resp = api("POST", "/subscribers/provision", provision_payload)
print(f"  Status: {status}")
if status >= 400:
    print(f"  Error: {json.dumps(resp, indent=2)[:600]}")
else:
    print(f"  SUCCESS!")
    print(f"  Party: {resp.get('party', {}).get('id', 'N/A')}")
    print(f"  Customer: {resp.get('customer', {}).get('id', 'N/A')}")
    cr = resp.get("contract", {})
    print(f"  Contract: {cr.get('id', 'N/A')}")
    print(f"  Products: {len(cr.get('product', []))}")
    print(f"  Resources: {len(cr.get('resource', []))}")
    for p in cr.get("product", []):
        print(f"    Product: {p.get('externalId')} (correlationId in response: {p.get('correlationId', 'NONE')})")
    for r in cr.get("resource", []):
        print(f"    Resource: {r.get('externalId')}: {r.get('resourceNumber')} (productCorrelationId: {r.get('productCorrelationId', 'NONE')})")

print()
print("CONCLUSION: correlationId", "NOT required" if status == 200 else "REQUIRED")
