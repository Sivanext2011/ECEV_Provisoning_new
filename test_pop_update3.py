#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

# Try updating by referencing the existing price id and changing the characteristic value
# Use POP_RECURRENCE (not ACTIVATION) - it's recurring so maybe it allows changes
print("=== Update POP_RECURRENCE by price instance id ===")
body = {
    "_pathParams": {
        "customerExternalId": "extID-customer-4455667720",
        "contractExternalId": "extID-contract-4455667720"
    },
    "product": [{
        "externalId": "PO_SINGLE_ACCOUNT_INSTANCE_A-4455667720",
        "price": [{
            "id": "A7061E59D7BB4C5ABF12A8E27C56B498",
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
    print(r.read().decode()[:500])
except urllib.error.HTTPError as e:
    print(f"FAILED: {e.code}")
    print(e.read().decode()[:500])

# Also try with just the characteristic at price level (not priceRow/priceAction)
print("\n=== Try with price-level characteristic (flat structure) ===")
body2 = {
    "_pathParams": {
        "customerExternalId": "extID-customer-4455667720",
        "contractExternalId": "extID-contract-4455667720"
    },
    "product": [{
        "externalId": "PO_SINGLE_ACCOUNT_INSTANCE_A-4455667720",
        "price": [{
            "id": "A7061E59D7BB4C5ABF12A8E27C56B498",
            "characteristic": [{
                "charSpecId": "df7524f101125fd6aef81dd32c2854f6",
                "value": [{"value": "100", "unitOfMeasure": "megabyte"}]
            }]
        }]
    }]
}

data = json.dumps(body2).encode()
req = urllib.request.Request(f"{BASE}/execute/update_contract", data=data, headers={"Content-Type": "application/json"}, method="POST")
try:
    r = urllib.request.urlopen(req)
    print(f"SUCCESS: {r.status}")
    print(r.read().decode()[:500])
except urllib.error.HTTPError as e:
    print(f"FAILED: {e.code}")
    print(e.read().decode()[:500])
