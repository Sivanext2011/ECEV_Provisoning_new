#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

# Approach: Delete existing POP then add new one
# Try using status termination on the price, or removing it

print("=== Approach 1: Set price status to terminated ===")
body1 = {
    "_pathParams": {
        "customerExternalId": "extID-customer-4455667720",
        "contractExternalId": "extID-contract-4455667720"
    },
    "product": [{
        "externalId": "PO_SINGLE_ACCOUNT_INSTANCE_A-4455667720",
        "price": [{
            "id": "A7061E59D7BB4C5ABF12A8E27C56B498",
            "status": [{"status": "Terminated"}]
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
    print(e.read().decode()[:400])

print("\n=== Approach 2: Remove price by sending empty price array ===")
body2 = {
    "_pathParams": {
        "customerExternalId": "extID-customer-4455667720",
        "contractExternalId": "extID-contract-4455667720"
    },
    "product": [{
        "externalId": "PO_SINGLE_ACCOUNT_INSTANCE_A-4455667720",
        "price": []
    }]
}

data = json.dumps(body2).encode()
req = urllib.request.Request(f"{BASE}/execute/update_contract", data=data, headers={"Content-Type": "application/json"}, method="POST")
try:
    r = urllib.request.urlopen(req)
    print(f"SUCCESS: {r.status}")
    print(r.read().decode()[:300])
except urllib.error.HTTPError as e:
    print(f"FAILED: {e.code}")
    print(e.read().decode()[:400])

print("\n=== Approach 3: Delete price using deletePrice flag ===")
body3 = {
    "_pathParams": {
        "customerExternalId": "extID-customer-4455667720",
        "contractExternalId": "extID-contract-4455667720"
    },
    "product": [{
        "externalId": "PO_SINGLE_ACCOUNT_INSTANCE_A-4455667720",
        "deletePrice": [{"id": "A7061E59D7BB4C5ABF12A8E27C56B498"}]
    }]
}

data = json.dumps(body3).encode()
req = urllib.request.Request(f"{BASE}/execute/update_contract", data=data, headers={"Content-Type": "application/json"}, method="POST")
try:
    r = urllib.request.urlopen(req)
    print(f"SUCCESS: {r.status}")
    print(r.read().decode()[:300])
except urllib.error.HTTPError as e:
    print(f"FAILED: {e.code}")
    print(e.read().decode()[:400])
