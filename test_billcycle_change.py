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

# First check bill cycle specs available
print("Checking available bill cycle specs...")
specs = api("GET", "/specs")[1]
bcs = specs.get("billingCycleSpecifications", [])
print(f"  Bill cycle specs: {[s.get('externalId') for s in bcs]}")

pos = [p.get("externalId") for p in specs.get("productOfferings", [])]
print(f"  POs available: {pos[:20]}")
needed = ["145001", "255001", "160006", "150006", "145002", "255002"]
missing = [p for p in needed if p not in pos]
if missing:
    print(f"  WARNING: Missing POs: {missing}")
print()

# Generate references
sub_ref = str(uuid.uuid4())[:8]
msisdn = "9950099519"
imsi = "995009950099519"
now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

party_ext = f"party-{sub_ref}"
customer_ext = f"customer-{sub_ref}"
contract_ext = f"contract-{sub_ref}"
ba_ext = f"ba-{sub_ref}"
cm_ext = f"cm_CMS_SocialMedia_NTF_{sub_ref}"

# Use first available bill cycle
bc_spec_1 = "CHT_billcycle_01"
# For bill cycle change, we need a second bill cycle spec - check what's available
bc_spec_2 = bcs[0].get("externalId") if bcs and bcs[0].get("externalId") != bc_spec_1 else (bcs[1].get("externalId") if len(bcs) > 1 else bc_spec_1)
print(f"  Initial bill cycle: {bc_spec_1}")
print(f"  New bill cycle: {bc_spec_2}")
print(f"  Sub ref: {sub_ref}, MSISDN: {msisdn}")
print()

# ============================================================
# STEP 1: Provision with 4 POs (145001, 255001, 160006, 150006)
# ============================================================
print("=" * 70)
print("STEP 1: Provision with POs 145001, 255001, 160006, 150006")
print("=" * 70)

party_body = {
    "externalId": party_ext,
    "givenName": "BillCycle", "familyName": f"Test_{sub_ref}",
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

customer_body = {
    "externalId": customer_ext,
    "customerSpecification": {"externalId": "CHT_Customer_Postpaid"},
    "status": [{"status": "CustomerActive"}],
    "account": [{
        "externalId": ba_ext,
        "billingAccountSpecExternalId": "BAS_CHT_Postpaid",
        "status": [{"status": "BillingAccountActive"}],
        "customerBillCycleSpecification": [{"externalId": f"cbcs-{sub_ref}", "billCycleSpecExternalId": bc_spec_1, "billCycleChangeType": "NO_PRORATE"}],
        "contactMediumAssociation": [{"contactRole": "Notification", "language": "en", "contactMediumExternalId": cm_ext, "enabled": True, "validFor": {"startDateTime": now}}],
    }],
    "engagedParty": {"externalId": party_ext, "@referredType": "Individual"},
    "contactMediumAssociation": [{"contactRole": "Notification", "language": "en", "contactMediumExternalId": cm_ext, "enabled": True, "validFor": {"startDateTime": now}}],
}

products = []
for po in ["145001", "255001", "160006", "150006"]:
    p = {
        "productOfferingExternalId": po,
        "externalId": f"{po}-{sub_ref}",
        "name": po,
        "status": [{"status": "ProductActive"}],
        "billingAccountReference": {"externalId": ba_ext},
        "baRefForBillCycleAlignedRecurrence": {"externalId": ba_ext},
    }
    # Add FlatRate characteristic for POs that need it
    if po in ["145001", "255001"]:
        p["characteristic"] = [{"charSpecExternalId": "FlatRate", "value": [{"value": "No"}]}]
    products.append(p)

contract_body = {
    "externalId": contract_ext,
    "contractSpecification": {"externalId": "CHT_Contract_Postpaid"},
    "status": [{"status": "Active"}],
    "product": products,
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

status, resp = api("POST", "/subscribers/provision", provision_payload)
print(f"  Status: {status}")
if status >= 400:
    print(f"  Error: {json.dumps(resp, indent=2)[:800]}")
    print("\n  ABORTING - Fix provisioning first")
    exit()

cr = resp.get("contract", {})
print(f"  Contract: {cr.get('id', 'N/A')}")
print(f"  Products: {[p.get('externalId') for p in cr.get('product', [])]}")
print(f"  Resources: {[r.get('resourceNumber') for r in cr.get('resource', [])]}")

# ============================================================
# STEP 2: Update bill cycle date with NO_PRORATE
# ============================================================
print()
print("=" * 70)
print("STEP 2: Update bill cycle (change to new spec, NO_PRORATE)")
print("=" * 70)

# New bill cycle date - set to 1st of next month
import datetime
today = datetime.date.today()
if today.month == 12:
    new_bc_date = datetime.date(today.year + 1, 1, 1)
else:
    new_bc_date = datetime.date(today.year, today.month + 1, 1)
new_bc_datetime = f"{new_bc_date.isoformat()}T00:00:00.000Z"

print(f"  New bill cycle start date: {new_bc_datetime}")
print(f"  New bill cycle spec: {bc_spec_2}")
print(f"  Change type: NO_PRORATE")

bc_change_body = {
    "account": [{
        "externalId": ba_ext,
        "customerBillCycleSpecification": [{
            "externalId": f"cbcs-{sub_ref}",
            "billCycleSpecExternalId": bc_spec_2,
            "billCycleChangeType": "NO_PRORATE",
        }],
    }],
    "_params": {"customerExternalId": customer_ext},
}

status2, resp2 = api("POST", "/execute/update_customer", bc_change_body)
print(f"  Status: {status2}")
if status2 >= 400:
    print(f"  Error: {json.dumps(resp2, indent=2)[:500]}")
else:
    print(f"  Success! Bill cycle updated.")

# ============================================================
# STEP 3: Add new POs 145002, 255002 with start date of new bill cycle
# ============================================================
print()
print("=" * 70)
print(f"STEP 3: Add POs 145002, 255002 (start date: {new_bc_datetime})")
print("=" * 70)

new_products = []
for po in ["145002", "255002"]:
    p = {
        "productOfferingExternalId": po,
        "externalId": f"{po}-{sub_ref}",
        "name": po,
        "status": [{"status": "ProductActive", "validFor": {"startDateTime": new_bc_datetime}}],
        "billingAccountReference": {"externalId": ba_ext},
        "baRefForBillCycleAlignedRecurrence": {"externalId": ba_ext},
    }
    new_products.append(p)

add_body = {
    "product": new_products,
    "_params": {"customerExternalId": customer_ext, "contractExternalId": contract_ext},
}

status3, resp3 = api("POST", "/execute/update_contract", add_body)
print(f"  Status: {status3}")
if status3 >= 400:
    print(f"  Error: {json.dumps(resp3, indent=2)[:500]}")
else:
    print(f"  Success! Products added: {len(resp3.get('product', []))}")

# ============================================================
# STEP 4: Set expiry date for 145001 & 255001
# ============================================================
print()
print("=" * 70)
print(f"STEP 4: Set expiry for 145001, 255001 (end: {new_bc_datetime})")
print("=" * 70)

expiry_body = {
    "product": [
        {
            "externalId": f"145001-{sub_ref}",
            "status": [{"status": "ProductActive", "validFor": {"endDateTime": new_bc_datetime}}],
        },
        {
            "externalId": f"255001-{sub_ref}",
            "status": [{"status": "ProductActive", "validFor": {"endDateTime": new_bc_datetime}}],
        },
    ],
    "_params": {"customerExternalId": customer_ext, "contractExternalId": contract_ext},
}

status4, resp4 = api("POST", "/execute/update_contract", expiry_body)
print(f"  Status: {status4}")
if status4 >= 400:
    print(f"  Error: {json.dumps(resp4, indent=2)[:500]}")
else:
    print(f"  Success! Expiry set.")

# ============================================================
# STEP 5: Update bill cycle ref for remaining POs (160006, 150006) if required
# ============================================================
print()
print("=" * 70)
print("STEP 5: Update baRefForBillCycleAlignedRecurrence for 160006, 150006")
print("=" * 70)
print("  Note: baRefForBillCycleAlignedRecurrence already points to the same BA.")
print("  The bill cycle change on the BA affects all products referencing it.")
print("  No additional product-level update needed for bill cycle alignment.")

# ============================================================
# FINAL REPORT
# ============================================================
print()
print("=" * 70)
print("FINAL REPORT")
print("=" * 70)
print(f"  UUID Reference: {sub_ref}")
print(f"  Customer: {customer_ext}")
print(f"  Contract: {contract_ext}")
print(f"  BA: {ba_ext}")
print()
print(f"  Initial provisioning:")
print(f"    Products: 145001, 255001, 160006, 150006")
print(f"    Bill cycle: {bc_spec_1}")
print()
print(f"  After bill cycle change:")
print(f"    New bill cycle spec: {bc_spec_2}")
print(f"    Change type: NO_PRORATE")
print(f"    New cycle date: {new_bc_datetime}")
print()
print(f"  Product changes:")
print(f"    145001-{sub_ref}: expiry set to {new_bc_datetime}")
print(f"    255001-{sub_ref}: expiry set to {new_bc_datetime}")
print(f"    145002-{sub_ref}: added with start {new_bc_datetime}")
print(f"    255002-{sub_ref}: added with start {new_bc_datetime}")
print(f"    160006-{sub_ref}: unchanged (BA ref handles cycle alignment)")
print(f"    150006-{sub_ref}: unchanged (BA ref handles cycle alignment)")
