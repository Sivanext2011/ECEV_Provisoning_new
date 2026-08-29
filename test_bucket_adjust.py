import urllib.request, json, time

BASE = "http://seliiuvd02756.seli.gic.ericsson.se:8000/api/v1"

# First get the balance to find bucket details
print("Fetching balance for 9970099710...")
try:
    r = urllib.request.urlopen(f"{BASE}/execute/balance_enquiry_msisdn", timeout=15,
        data=json.dumps({"_params": {"msisdn": "9970099710"}}).encode())
    bal = json.loads(r.read().decode())
    print(f"Status: OK")
    
    # Find product buckets
    for prod in bal.get("product", []):
        print(f"\n  Product: {prod.get('externalId', prod.get('id',''))}")
        for b in prod.get("bucket", []):
            print(f"    Bucket: {b.get('externalId','')} specExtId={b.get('bucketSpecExternalId','')} specId={b.get('bucketSpecificationId','')} amount={b.get('amount',{}).get('number',0)} {b.get('unitOfMeasure','')}")
except urllib.error.HTTPError as e:
    print(f"Balance enquiry failed: {e.code} {e.read().decode()[:200]}")
    print("\nTrying with a different subscriber...")

# Try adjustment
print("\n" + "=" * 50)
print("Testing product bucket adjustment...")
now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

body = {
    "triggerTime": now,
    "customerExternalId": "extID-customer-9970099710",
    "contractExternalId": "extID-contract-9970099710",
    "productExternalId": "po_notiftesting-directtest1",
    "bucketSpecExternalId": "PBS_PPP_NormalData_Account",
    "reason": "Test adjustment",
    "amount": {"number": 1024000, "decimalPlaces": 0},
    "validFor": {"startDateTime": now},
    "unitOfMeasure": "byte",
    "action": "RELATIVE",
}

print(f"Request: {json.dumps(body, indent=2)}")

req = urllib.request.Request(f"{BASE}/balance/productAdjustment", json.dumps(body).encode(), method="POST")
req.add_header("Content-Type", "application/json")
try:
    r = urllib.request.urlopen(req, timeout=30)
    print(f"\nStatus: {r.status} SUCCESS!")
    print(r.read().decode()[:500])
except urllib.error.HTTPError as e:
    print(f"\nStatus: {e.code}")
    print(e.read().decode()[:500])
except Exception as e:
    print(f"\nError: {e}")
