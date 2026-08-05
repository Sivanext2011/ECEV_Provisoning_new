#!/usr/bin/env python3.11
import urllib.request, json

# Test 1: communicationId only
url1 = "http://localhost:8000/api/v1/subscription/consumerProduct?communicationId=4455667741&communicationIdType=E.164"
print(f"Test 1: {url1}")
try:
    r = urllib.request.urlopen(url1)
    print(f"  OK: {r.read().decode()[:300]}")
except urllib.error.HTTPError as e:
    print(f"  FAIL {e.code}: {e.read().decode()[:200]}")

# Test 2: Try getting customer first to get the externalId
url2 = "http://localhost:8000/api/v1/customer?msisdn=4455667741"
print(f"\nTest 2: GET customer by msisdn")
try:
    r = urllib.request.urlopen(url2)
    data = json.loads(r.read().decode())
    cust = data[0] if isinstance(data, list) else data
    custExtId = cust.get("externalId", "")
    print(f"  Customer externalId: {custExtId}")

    # Test 3: with customerExternalId
    url3 = f"http://localhost:8000/api/v1/subscription/consumerProduct?customerExternalId={custExtId}&communicationId=4455667741&communicationIdType=E.164"
    print(f"\nTest 3: {url3}")
    try:
        r = urllib.request.urlopen(url3)
        print(f"  OK: {r.read().decode()[:300]}")
    except urllib.error.HTTPError as e:
        print(f"  FAIL {e.code}: {e.read().decode()[:200]}")
except urllib.error.HTTPError as e:
    print(f"  FAIL {e.code}: {e.read().decode()[:200]}")
except Exception as e:
    print(f"  Error: {e}")
