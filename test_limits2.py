#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

# Try balance enquiry with specific bucket specs
print("=== Provider 4455667743 - Full raw balance response ===")
try:
    r = urllib.request.urlopen(f"{BASE}/balance?msisdn=4455667743")
    data = json.loads(r.read())
    # Print full structure to see all fields
    print(json.dumps(data, indent=2)[:3000])
except urllib.error.HTTPError as e:
    print(f"ERROR {e.code}: {e.read().decode()[:500]}")

print("\n\n=== Try bucket-specific query for common limit ===")
try:
    r = urllib.request.urlopen(f"{BASE}/execute/balance_enquiry_msisdn_bucket?msisdn=4455667743&bucketSpecExternalId=PBS_Data_Sharing_Limit_Common_CHT")
    data = json.loads(r.read())
    print(json.dumps(data, indent=2)[:1000])
except urllib.error.HTTPError as e:
    print(f"ERROR {e.code}: {e.read().decode()[:300]}")

print("\n\n=== Try bucket-specific query for individual limit on consumer ===")
try:
    r = urllib.request.urlopen(f"{BASE}/execute/balance_enquiry_msisdn_bucket?msisdn=4455667742&bucketSpecExternalId=PBS_Data_Sharing_Limit_CHT")
    data = json.loads(r.read())
    print(json.dumps(data, indent=2)[:1000])
except urllib.error.HTTPError as e:
    print(f"ERROR {e.code}: {e.read().decode()[:300]}")
