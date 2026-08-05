#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

# Provider: 4455667743
print("=== PROVIDER 4455667743 - Balance (product level) ===")
try:
    r = urllib.request.urlopen(f"{BASE}/balance?msisdn=4455667743")
    data = json.loads(r.read())
    # Look for product buckets, especially sharing limit types
    if isinstance(data, list):
        for item in data:
            for prod in item.get("product", []):
                print(f"\n  Product: {prod.get('externalId')}")
                for bucket in prod.get("bucket", []):
                    spec = bucket.get("bucketSpecExternalId", bucket.get("bucketName", "unknown"))
                    amt = bucket.get("amount", {})
                    print(f"    Bucket: {spec} | amount: {amt.get('number')} {bucket.get('unitOfMeasure','')}")
    else:
        for prod in data.get("product", []):
            print(f"\n  Product: {prod.get('externalId')}")
            for bucket in prod.get("bucket", []):
                spec = bucket.get("bucketSpecExternalId", bucket.get("bucketName", "unknown"))
                amt = bucket.get("amount", {})
                print(f"    Bucket: {spec} | amount: {amt.get('number')} {bucket.get('unitOfMeasure','')}")
except urllib.error.HTTPError as e:
    print(f"  ERROR {e.code}: {e.read().decode()[:300]}")

print("\n\n=== CONSUMER 4455667742 - Balance (product level) ===")
try:
    r = urllib.request.urlopen(f"{BASE}/balance?msisdn=4455667742")
    data = json.loads(r.read())
    if isinstance(data, list):
        for item in data:
            for prod in item.get("product", []):
                print(f"\n  Product: {prod.get('externalId')}")
                for bucket in prod.get("bucket", []):
                    spec = bucket.get("bucketSpecExternalId", bucket.get("bucketName", "unknown"))
                    amt = bucket.get("amount", {})
                    print(f"    Bucket: {spec} | amount: {amt.get('number')} {bucket.get('unitOfMeasure','')}")
    else:
        for prod in data.get("product", []):
            print(f"\n  Product: {prod.get('externalId')}")
            for bucket in prod.get("bucket", []):
                spec = bucket.get("bucketSpecExternalId", bucket.get("bucketName", "unknown"))
                amt = bucket.get("amount", {})
                print(f"    Bucket: {spec} | amount: {amt.get('number')} {bucket.get('unitOfMeasure','')}")
except urllib.error.HTTPError as e:
    print(f"  ERROR {e.code}: {e.read().decode()[:300]}")
