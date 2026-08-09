#!/usr/bin/env python3.11
import urllib.request, json, time

BASE = "http://localhost:8000/api/v1"

# Step 1: Close existing POP_ACTIVATION price by setting endDateTime
print("=== Step 1: Close existing price ===")
body1 = {
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
            "validFor": {
                "startDateTime": "2026-08-07T14:48:33.812Z",
                "endDateTime": "2026-08-09T00:00:00.000Z"
            }
        }]
    }]
}

data = json.dumps(body1).encode()
req = urllib.request.Request(f"{BASE}/execute/update_contract", data=data, headers={"Content-Type": "application/json"}, method="POST")
try:
    r = urllib.request.urlopen(req)
    print(f"SUCCESS: {r.status}")
    print(r.read().decode()[:300])
except urllib.error.HTTPError as e:
    print(f"FAILED: {e.code}")
    resp = e.read().decode()[:500]
    print(resp)
    # If step 1 fails, try alternative: just add new price without closing old
    print("\n=== Alternative: Add new price with future startDateTime only ===")
    body_alt = {
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
                "validFor": {
                    "startDateTime": "2026-08-09T08:57:00.000Z"
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
    data = json.dumps(body_alt).encode()
    req = urllib.request.Request(f"{BASE}/execute/update_contract", data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        r = urllib.request.urlopen(req)
        print(f"SUCCESS: {r.status}")
        print(r.read().decode()[:300])
    except urllib.error.HTTPError as e2:
        print(f"FAILED: {e2.code}")
        print(e2.read().decode()[:500])
