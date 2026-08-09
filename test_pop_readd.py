#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

# Check current state of the product
print("=== Check current product prices ===")
req = urllib.request.Request(f"{BASE}/execute/get_contract_by_external_id", 
    data=json.dumps({"_pathParams": {"customerExternalId": "extID-customer-4455667720", "contractExternalId": "extID-contract-4455667720"}}).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
try:
    r = urllib.request.urlopen(req)
    data = json.loads(r.read().decode())
    for p in data.get("product", []):
        if p.get("externalId") == "PO_SINGLE_ACCOUNT_INSTANCE_A-4455667720":
            prices = p.get("price", [])
            print(f"Product: {p['externalId']}")
            print(f"Prices count: {len(prices)}")
            for pr in prices:
                print(f"  - id={pr.get('id')}, POP={pr.get('productOfferingPriceExternalId') or pr.get('productOfferingPrice', {}).get('externalId')}")
            break
except Exception as e:
    print(f"Error: {e}")

# Now add new POP_ACTIVATION with 100MB
print("\n=== Add new POP_ACTIVATION with 100MB ===")
body = {
    "_pathParams": {
        "customerExternalId": "extID-customer-4455667720",
        "contractExternalId": "extID-contract-4455667720"
    },
    "product": [{
        "externalId": "PO_SINGLE_ACCOUNT_INSTANCE_A-4455667720",
        "price": [{
            "productOfferingPrice": {
                "id": "a032533c27d448eab8123bbb96c08cc6",
                "externalId": "POP_ACTIVATION"
            },
            "priceRow": [{
                "productOfferingPriceRow": {"id": "e69675e6ca1848b1bff6eccf67f2bd10"},
                "priceAction": [{
                    "action": {"id": "a577284576d05d50aa336a3bca603883"},
                    "characteristic": [{
                        "charSpecId": "df7524f101125fd6aef81dd32c2854f6",
                        "value": [{"value": "100", "unitOfMeasure": "megabyte"}]
                    }]
                }]
            }]
        }]
    }]
}

data = json.dumps(body).encode()
req = urllib.request.Request(f"{BASE}/execute/update_contract", data=data, headers={"Content-Type": "application/json"}, method="POST")
try:
    r = urllib.request.urlopen(req)
    print(f"SUCCESS: {r.status}")
    resp = r.read().decode()[:500]
    print(resp)
except urllib.error.HTTPError as e:
    print(f"FAILED: {e.code}")
    print(e.read().decode()[:500])
