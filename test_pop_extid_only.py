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

# First, let's check the POP personalization for 145001 to see what externalIds are available
print("=" * 60)
print("Fetching POP personalization for PO 145001...")
print("=" * 60)
status, pops = api("GET", "/spec/productOffering/popPersonalization?externalId=145001")
if status != 200:
    print(f"Error: {status} {pops}")
    exit()

print(f"Found {len(pops)} POPs:")
for pop in pops:
    print(f"\n  POP: {pop.get('popExternalId', '')} (id: {pop.get('popId', '')})")
    for row in pop.get("rows", []):
        print(f"    Row: {row.get('rowExternalId', '')} (id: {row.get('rowId', '')})")
        for c in row.get("chars", []):
            print(f"      Char: {c.get('externalId', '')} (id: {c.get('id', '')}) = {c.get('defaultValue', '')} {c.get('defaultUnit', '')}")
            print(f"        actionExternalId: {c.get('actionExternalId', '')}")
            print(f"        actionId: {c.get('actionId', '')}")

# Now provision with POP using ONLY externalIds (no internal ids)
print()
print("=" * 60)
print("Provisioning 145001 with POP (externalId only, no internal ids)")
print("=" * 60)

sub_ref = str(uuid.uuid4())[:8]
msisdn = "9950099515"
imsi = "995009950099515"
now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

party_ext = f"party-{sub_ref}"
customer_ext = f"customer-{sub_ref}"
contract_ext = f"contract-{sub_ref}"
ba_ext = f"ba-{sub_ref}"
cm_ext = f"cm_CMS_SocialMedia_NTF_{sub_ref}"

print(f"  Sub ref: {sub_ref}, MSISDN: {msisdn}")

# Party
party_body = {
    "externalId": party_ext,
    "givenName": "Test", "familyName": f"POP_{sub_ref}",
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

# Contract with POP - using ONLY externalIds
# POP_Prorating_Activation (positive proration) -> FlatRate_No_Amount = 1 gibibyte
# POP_RegularRecurrence (recurring normal) -> FlatRate_No_Amount = 1 gibibyte
contract_body = {
    "externalId": contract_ext,
    "contractSpecification": {"externalId": "CHT_Contract_Postpaid"},
    "status": [{"status": "Active"}],
    "product": [{
        "productOfferingExternalId": "145001",
        "externalId": f"145001-{sub_ref}",
        "correlationId": "1",
        "name": "145001",
        "status": [{"status": "ProductActive"}],
        "billingAccountReference": {"externalId": ba_ext},
        "baRefForBillCycleAlignedRecurrence": {"externalId": ba_ext},
        "characteristic": [
            {"charSpecExternalId": "FlatRate", "value": [{"value": "No"}]},
        ],
        "price": [
            {
                "productOfferingPrice": {
                    "externalId": "POP_Prorating_Activation"
                },
                "priceRow": [{
                    "productOfferingPriceRow": {"externalId": "Action_FlatRate_No"},
                    "priceAction": [{
                        "characteristic": [{
                            "value": [{"value": "1", "unitOfMeasure": "gibibyte"}],
                            "charSpecExternalId": "FlatRate_No_Amount",
                        }],
                        "action": {"externalId": "FlatRate_No_PB_Set"},
                    }],
                }],
            },
            {
                "productOfferingPrice": {
                    "externalId": "POP_RegularRecurrence"
                },
                "priceRow": [{
                    "productOfferingPriceRow": {"externalId": "Action_FlatRate_No"},
                    "priceAction": [{
                        "characteristic": [{
                            "value": [{"value": "1", "unitOfMeasure": "gibibyte"}],
                            "charSpecExternalId": "FlatRate_No_Amount",
                        }],
                        "action": {"externalId": "FlatRate_No_PB_Set"},
                    }],
                }],
            },
        ],
    }],
    "resource": [
        {"externalId": f"msisdn-{sub_ref}", "resourceNumber": msisdn, "resourceSpecificationExternalId": "ext_LRS_MSISDN", "productCorrelationId": ["1"], "resourceSpecificationId": "8aabb378-affe-4bda-8ba6-55a53ccf4549"},
        {"externalId": f"imsi-{sub_ref}", "resourceNumber": imsi, "resourceSpecificationExternalId": "ext_LRS_IMSI", "productCorrelationId": ["1"], "resourceSpecificationId": "a35baba8-c815-4c2b-b418-09f8a161bff1"},
    ],
    "homeTimeZone": [{"timeZone": "Europe/Stockholm"}],
}

provision_payload = {
    "partyBody": party_body,
    "customerBody": customer_body,
    "contractBody": contract_body,
    "customerExternalId": customer_ext,
}

status, resp = api("POST", "/subscribers/provision", provision_payload)
print(f"\n  Provision Status: {status}")
if status >= 400:
    print(f"  Error: {json.dumps(resp, indent=2)[:800]}")
else:
    print(f"  Party: {resp.get('party', {}).get('id', 'N/A')}")
    print(f"  Customer: {resp.get('customer', {}).get('id', 'N/A')}")
    cr = resp.get("contract", {})
    print(f"  Contract: {cr.get('id', 'N/A')}")
    print(f"  Products: {len(cr.get('product', []))}")
    # Show price details
    for p in cr.get("product", []):
        print(f"  Product: {p.get('externalId')}")
        for price in p.get("price", []):
            print(f"    POP: {price.get('productOfferingPriceExternalId', price.get('productOfferingPrice', {}).get('externalId', ''))}")
            for row in price.get("priceRow", []):
                for pa in row.get("priceAction", []):
                    for ch in pa.get("characteristic", []):
                        print(f"      {ch.get('charSpecExternalId', ch.get('charSpecId', ''))}: {ch.get('value', [{}])[0].get('value', '')} {ch.get('value', [{}])[0].get('unitOfMeasure', '')}")

print()
print("=" * 60)
print("CONCLUSION")
print("=" * 60)
print(f"  POP personalization using ONLY externalIds (no internal ids):")
print(f"    productOfferingPrice.externalId = POP_Prorating_Activation / POP_RegularRecurrence")
print(f"    productOfferingPriceRow.externalId = Action_FlatRate_No")
print(f"    action.externalId = FlatRate_No_PB_Set")
print(f"    charSpecExternalId = FlatRate_No_Amount")
print(f"  Value: 1 gibibyte (1GB) for both prorate and recurring allocation")
