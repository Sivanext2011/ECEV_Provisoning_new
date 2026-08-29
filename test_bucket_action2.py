import urllib.request, json, time

BASE = "http://seliiuvd02756.seli.gic.ericsson.se:8000/api/v1"
now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

for action_val in ["Relative", "Absolute", "Set"]:
    body = {
        "triggerTime": now,
        "customerExternalId": "extID-customer-9970099710",
        "contractExternalId": "extID-contract-9970099710",
        "productExternalId": "po_notiftesting-directtest1",
        "bucketSpecExternalId": "PBS_PPP_NormalData_Account",
        "reason": "Test",
        "amount": {"number": 1024, "decimalPlaces": 0},
        "validFor": {"startDateTime": now},
        "unitOfMeasure": "byte",
        "action": action_val,
    }
    req = urllib.request.Request(f"{BASE}/balance/productAdjustment", json.dumps(body).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        r = urllib.request.urlopen(req, timeout=15)
        print(f"  action='{action_val}' -> {r.status} SUCCESS!")
        print(f"  Response: {r.read().decode()[:200]}")
        break
    except urllib.error.HTTPError as e:
        code = e.code
        err = e.read().decode()[:200]
        status = "VALID (CHA error)" if code == 500 else "INVALID"
        print(f"  action='{action_val}' -> {code} [{status}] {err}")
