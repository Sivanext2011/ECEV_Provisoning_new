#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

# Update POP "RT" on POP_ReucrringTest-7850078700
# Current value: 1000 kilobyte → Change to: 2000 kilobyte
print("=== Update POP RT: 1000 KB → 2000 KB ===")
body = {
    "_pathParams": {
        "customerExternalId": "extID-customer-7850078700",
        "contractExternalId": "extID-contract-7850078700"
    },
    "product": [{
        "externalId": "POP_ReucrringTest-7850078700",
        "price": [{
            "id": "8947728829304C1582A895813E531C2E",
            "productOfferingPrice": {
                "id": "a11c926defb442ffa5083e47c4fd2d05",
                "externalId": "RT"
            },
            "priceRow": [{
                "productOfferingPriceRow": {
                    "id": "cf63181d5bfc429d9aa65ba208acf93f",
                    "externalId": "ActionRow1"
                },
                "priceAction": [{
                    "action": {"id": "a577284576d05d50aa336a3bca603883"},
                    "characteristic": [{
                        "charSpecId": "df7524f101125fd6aef81dd32c2854f6",
                        "value": [{"value": "2000", "unitOfMeasure": "kilobyte"}]
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
    # Check the updated value in response
    resp = json.loads(r.read().decode())
    for p in resp.get("product", []):
        if "ReucrringTest" in p.get("externalId", ""):
            for pr in p.get("price", []):
                print(f"  Price ID: {pr.get('id')}")
                print(f"  POP: {pr.get('productOfferingPriceExternalId')}")
                for comp in pr.get("comprisedOf", []):
                    for ch in comp.get("characteristic", []):
                        if ch.get("charSpecId") == "df7524f101125fd6aef81dd32c2854f6":
                            print(f"  Value: {ch.get('value')}")
                for row in pr.get("priceRow", []):
                    for pa in row.get("priceAction", []):
                        for ch in pa.get("characteristic", []):
                            if ch.get("charSpecId") == "df7524f101125fd6aef81dd32c2854f6":
                                print(f"  PriceRow Value: {ch.get('value')}")
except urllib.error.HTTPError as e:
    print(f"FAILED: {e.code}")
    print(e.read().decode()[:500])
