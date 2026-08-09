#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

# Update POP_RECURRENCE on PO_SINGLE_ACCOUNT_INSTANCE_A-4455667720
# Close existing price and add new one with updated value

body = {
    "_pathParams": {
        "customerExternalId": "extID-customer-4455667720",
        "contractExternalId": "extID-contract-4455667720"
    },
    "product": [{
        "externalId": "PO_SINGLE_ACCOUNT_INSTANCE_A-4455667720",
        "price": [
            {
                "id": "A7061E59D7BB4C5ABF12A8E27C56B498",
                "validFor": {
                    "startDateTime": "2026-08-07T14:48:33.812Z",
                    "endDateTime": "2026-08-09T00:00:00.000Z"
                }
            },
            {
                "productOfferingPrice": {
                    "id": "a032533c27d448eab8123bbb96c08cc6",
                    "externalId": "POP_ACTIVATION"
                },
                "validFor": {
                    "startDateTime": "2026-08-09T00:00:00.000Z"
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
            }
        ]
    }]
}

print("Sending POP update with validity approach...")
print(f"Body: {json.dumps(body, indent=2)}")

data = json.dumps(body).encode()
req = urllib.request.Request(
    f"{BASE}/execute/update_contract",
    data=data,
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    r = urllib.request.urlopen(req)
    print(f"\nSUCCESS: {r.status}")
    print(r.read().decode()[:500])
except urllib.error.HTTPError as e:
    print(f"\nFAILED: {e.code}")
    print(e.read().decode()[:500])
