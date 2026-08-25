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

# UUID-based references
sub_ref = str(uuid.uuid4())[:8]
msisdn = "9950099513"
imsi = "995009950099513"
new_msisdn = "9950099514"
now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

party_ext = f"party-{sub_ref}"
customer_ext = f"customer-{sub_ref}"
contract_ext = f"contract-{sub_ref}"
ba_ext = f"ba-{sub_ref}"
cm_ext = f"cm_CMS_SocialMedia_NTF_{sub_ref}"
product1_ext = f"255001-{sub_ref}"

print(f"Subscriber Reference: {sub_ref}")
print(f"MSISDN: {msisdn} -> {new_msisdn}")
print(f"IMSI: {imsi}")
print()

# Party body (with Contact Medium)
party_body = {
    "externalId": party_ext,
    "givenName": "Test",
    "familyName": f"Sub_{sub_ref}",
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

# Customer body (contactMediumAssociation at customer + account level ONLY)
customer_body = {
    "externalId": customer_ext,
    "customerSpecification": {"externalId": "CHT_Customer_Postpaid"},
    "status": [{"status": "CustomerActive"}],
    "account": [{
        "externalId": ba_ext,
        "billingAccountSpecExternalId": "BAS_CHT_Postpaid",
        "status": [{"status": "BillingAccountActive"}],
        "customerBillCycleSpecification": [{
            "externalId": f"cbcs-{sub_ref}",
            "billCycleSpecExternalId": "CHT_billcycle_01",
            "billCycleChangeType": "PRORATE_POS_START_NEW",
        }],
        "contactMediumAssociation": [{
            "contactRole": "Notification",
            "language": "en",
            "contactMediumExternalId": cm_ext,
            "enabled": True,
            "validFor": {"startDateTime": now},
        }],
    }],
    "engagedParty": {"externalId": party_ext, "@referredType": "Individual"},
    "contactMediumAssociation": [{
        "contactRole": "Notification",
        "language": "en",
        "contactMediumExternalId": cm_ext,
        "enabled": True,
        "validFor": {"startDateTime": now},
    }],
}

# Contract body (NO contactMediumAssociation)
contract_body = {
    "externalId": contract_ext,
    "contractSpecification": {"externalId": "CHT_Contract_Postpaid"},
    "status": [{"status": "Active"}],
    "product": [{
        "productOfferingExternalId": "255001",
        "externalId": product1_ext,
        "correlationId": "1",
        "name": "255001",
        "status": [{"status": "ProductActive"}],
        "billingAccountReference": {"externalId": ba_ext},
        "baRefForBillCycleAlignedRecurrence": {"externalId": ba_ext},
        "characteristic": [
            {"charSpecExternalId": "FlatRate", "value": [{"value": "No"}]},
        ],
    }],
    "resource": [
        {
            "externalId": f"msisdn-{sub_ref}",
            "resourceNumber": msisdn,
            "resourceSpecificationExternalId": "ext_LRS_MSISDN",
            "productCorrelationId": ["1"],
            "resourceSpecificationId": "8aabb378-affe-4bda-8ba6-55a53ccf4549",
        },
        {
            "externalId": f"imsi-{sub_ref}",
            "resourceNumber": imsi,
            "resourceSpecificationExternalId": "ext_LRS_IMSI",
            "productCorrelationId": ["1"],
            "resourceSpecificationId": "a35baba8-c815-4c2b-b418-09f8a161bff1",
        },
    ],
    "homeTimeZone": [{"timeZone": "Europe/Stockholm"}],
}

# Provision
provision_payload = {
    "partyBody": party_body,
    "customerBody": customer_body,
    "contractBody": contract_body,
    "customerExternalId": customer_ext,
}

print("=" * 60)
print("STEP 1: Provision (CM only at customer level, NOT contract)")
print("=" * 60)
status, resp = api("POST", "/subscribers/provision", provision_payload)
print(f"  Status: {status}")
if status >= 400:
    print(f"  Error: {json.dumps(resp, indent=2)[:600]}")
    print("\nAborting.")
    exit()
print(f"  Party: {resp.get('party', {}).get('id', 'N/A')}")
print(f"  Customer: {resp.get('customer', {}).get('id', 'N/A')}")
contract_resp = resp.get("contract", {})
print(f"  Contract: {contract_resp.get('id', 'N/A')}")
print(f"  Products: {len(contract_resp.get('product', []))}")
print(f"  Resources: {len(contract_resp.get('resource', []))}")

# Step 2: MSISDN Swap
print()
print("=" * 60)
print(f"STEP 2: MSISDN Swap ({msisdn} -> {new_msisdn})")
print("=" * 60)
swap_body = {
    "resource": [
        {
            "externalId": f"msisdn-{sub_ref}",
            "resourceNumber": msisdn,
            "resourceSpecificationExternalId": "ext_LRS_MSISDN",
            "resourceSpecificationId": "8aabb378-affe-4bda-8ba6-55a53ccf4549",
            "status": [{"status": "ResourceInactive"}],
        },
        {
            "externalId": f"msisdn2-{sub_ref}",
            "resourceNumber": new_msisdn,
            "resourceSpecificationExternalId": "ext_LRS_MSISDN",
            "productCorrelationId": ["1"],
            "resourceSpecificationId": "8aabb378-affe-4bda-8ba6-55a53ccf4549",
            "status": [{"status": "ResourceActive"}],
        },
    ],
    "_params": {"customerExternalId": customer_ext, "contractExternalId": contract_ext},
}
status2, resp2 = api("POST", "/execute/update_contract", swap_body)
print(f"  Status: {status2}")
if status2 >= 400:
    print(f"  Error: {json.dumps(resp2, indent=2)[:500]}")
else:
    print(f"  Success! Resources:")
    for r in resp2.get("resource", []):
        r_st = r.get("status", [])
        cur = r_st[-1].get("status", "") if r_st else ""
        print(f"    {r.get('externalId')}: {r.get('resourceNumber')} [{cur}]")

# Step 3: Update Contact Medium
print()
print("=" * 60)
print(f"STEP 3: Update Contact Medium (socialMediaId -> {new_msisdn})")
print("=" * 60)
cm_update_body = {
    "contactMedium": [{
        "externalId": cm_ext,
        "validFor": {"startDateTime": now},
        "characteristic": [
            {"charSpecExternalId": "SocialMedia", "value": [{"value": "SocialMedia"}]},
            {"charSpecExternalId": "socialMediaId", "value": [{"value": new_msisdn}]},
        ],
    }],
    "_params": {"partyExternalId": party_ext},
}
status3, resp3 = api("POST", "/execute/update_party", cm_update_body)
print(f"  Status: {status3}")
if status3 >= 400:
    print(f"  Error: {json.dumps(resp3, indent=2)[:500]}")
else:
    print(f"  Success! Contact Medium updated.")

# Final report
print()
print("=" * 60)
print("FINAL REPORT")
print("=" * 60)
print(f"  UUID Reference: {sub_ref}")
print(f"  contactMediumAssociation: Customer + Account level ONLY")
print(f"  Contract level: NO contactMediumAssociation")
print(f"  MSISDN swap: {msisdn} -> {new_msisdn}")
print(f"  Contact Medium socialMediaId: updated to {new_msisdn}")
print(f"  All external IDs stable (UUID-based)")
