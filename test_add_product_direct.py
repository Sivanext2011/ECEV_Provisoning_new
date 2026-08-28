import urllib.request, json

BASE = "http://seliiuvd02756.seli.gic.ericsson.se:8000/api/v1"

body = {
    "product": [{
        "productOfferingExternalId": "po_notiftesting",
        "externalId": "po_notiftesting-directtest1",
        "name": "po_notiftesting",
        "status": [{"status": "ProductCreated"}],
        "characteristic": [
            {"charSpecExternalId": "InstallerID", "value": [{"value": "test"}]},
            {"charSpecExternalId": "Initial", "value": [{"value": "1024000", "unitOfMeasure": "byte"}]},
        ],
    }],
    "_params": {
        "customerExternalId": "extID-customer-9970099710",
        "contractExternalId": "extID-contract-9970099710",
    },
}

req = urllib.request.Request(f"{BASE}/execute/update_contract", json.dumps(body).encode(), method="POST")
req.add_header("Content-Type", "application/json")
try:
    r = urllib.request.urlopen(req, timeout=30)
    print(f"Status: {r.status}")
    print("SUCCESS!")
except urllib.error.HTTPError as e:
    print(f"Status: {e.code}")
    print(e.read().decode()[:500])
