#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

print("=== Provider 4455667743 - All product buckets ===")
try:
    r = urllib.request.urlopen(f"{BASE}/balance?msisdn=4455667743")
    data = json.loads(r.read())
    d = data[0] if isinstance(data, list) else data
    for prod in d.get("product", []):
        print(f"\n  Product: {prod.get('externalId')}")
        buckets = prod.get("bucket", [])
        if not buckets:
            print("    (no buckets)")
        for b in buckets:
            print(f"    {b.get('bucketSpecExternalId')} = {b.get('amount',{}).get('number')} {b.get('unitOfMeasure','')}")
except urllib.error.HTTPError as e:
    print(f"  ERROR {e.code}: {e.read().decode()[:300]}")

print("\n\n=== Consumer 4455667744 - All product buckets ===")
try:
    r = urllib.request.urlopen(f"{BASE}/balance?msisdn=4455667744")
    data = json.loads(r.read())
    d = data[0] if isinstance(data, list) else data
    for prod in d.get("product", []):
        print(f"\n  Product: {prod.get('externalId')}")
        buckets = prod.get("bucket", [])
        if not buckets:
            print("    (no buckets)")
        for b in buckets:
            print(f"    {b.get('bucketSpecExternalId')} = {b.get('amount',{}).get('number')} {b.get('unitOfMeasure','')}")
except urllib.error.HTTPError as e:
    print(f"  ERROR {e.code}: {e.read().decode()[:300]}")

print("\n\n=== Verify Product Spec now has limit bucket ===")
try:
    r = urllib.request.urlopen(f"{BASE}/spec/product?externalId=PS_Data_Sharing_Provider_CHT")
    data = json.loads(r.read())
    ps = data[0] if isinstance(data, list) else data
    print("  Provider PS resource specs:")
    for rs in ps.get("resourceSpecification", []):
        print(f"    {rs.get('name', '')} ({rs.get('externalId', '')}) type={rs.get('type', '')}")
except urllib.error.HTTPError as e:
    print(f"  ERROR {e.code}: {e.read().decode()[:300]}")

try:
    r = urllib.request.urlopen(f"{BASE}/spec/product?externalId=PS_Data_Sharing_Consumer_CHT")
    data = json.loads(r.read())
    ps = data[0] if isinstance(data, list) else data
    print("\n  Consumer PS resource specs:")
    for rs in ps.get("resourceSpecification", []):
        print(f"    {rs.get('name', '')} ({rs.get('externalId', '')}) type={rs.get('type', '')}")
except urllib.error.HTTPError as e:
    print(f"  ERROR {e.code}: {e.read().decode()[:300]}")
