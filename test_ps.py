#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

# Get provider product spec
print("=== Provider Product Spec: PS_Data_Sharing_Provider_CHT ===")
try:
    r = urllib.request.urlopen(f"{BASE}/spec/product?externalId=PS_Data_Sharing_Provider_CHT")
    data = json.loads(r.read())
    ps = data[0] if isinstance(data, list) else data
    print(f"  Name: {ps.get('name')}")
    print(f"  ExternalId: {ps.get('externalId')}")
    # Look for resource specs (buckets linked to product spec)
    for rs in ps.get("resourceSpecification", ps.get("resourceSpecifications", [])):
        print(f"  ResourceSpec: {rs.get('name', '')} ({rs.get('externalId', '')}) type={rs.get('type', '')} role={rs.get('role', '')}")
    # Look for any bucket references
    for key in ps:
        if "bucket" in key.lower() or "limit" in key.lower() or "sharing" in key.lower():
            print(f"  {key}: {json.dumps(ps[key])[:200]}")
    print(f"\n  Full keys: {list(ps.keys())}")
except urllib.error.HTTPError as e:
    print(f"  ERROR {e.code}: {e.read().decode()[:300]}")

print("\n\n=== Consumer Product Spec: PS_Data_Sharing_Consumer_CHT ===")
try:
    r = urllib.request.urlopen(f"{BASE}/spec/product?externalId=PS_Data_Sharing_Consumer_CHT")
    data = json.loads(r.read())
    ps = data[0] if isinstance(data, list) else data
    print(f"  Name: {ps.get('name')}")
    print(f"  ExternalId: {ps.get('externalId')}")
    for rs in ps.get("resourceSpecification", ps.get("resourceSpecifications", [])):
        print(f"  ResourceSpec: {rs.get('name', '')} ({rs.get('externalId', '')}) type={rs.get('type', '')} role={rs.get('role', '')}")
    for key in ps:
        if "bucket" in key.lower() or "limit" in key.lower() or "sharing" in key.lower():
            print(f"  {key}: {json.dumps(ps[key])[:200]}")
    print(f"\n  Full keys: {list(ps.keys())}")
except urllib.error.HTTPError as e:
    print(f"  ERROR {e.code}: {e.read().decode()[:300]}")

print("\n\n=== Sharing Provider Spec ===")
try:
    r = urllib.request.urlopen(f"{BASE}/spec/sharingProvider")
    data = json.loads(r.read())
    for sp in (data if isinstance(data, list) else [data]):
        print(f"  Name: {sp.get('name')} ({sp.get('externalId')})")
        for bd in sp.get("bucketDeterminationSpecification", sp.get("bucketDetermination", [])):
            print(f"    BDS: {bd.get('name', '')} ({bd.get('externalId', '')})")
            for key in bd:
                if "limit" in key.lower() or "shared" in key.lower() or "bucket" in key.lower():
                    print(f"      {key}: {json.dumps(bd[key])[:300]}")
except urllib.error.HTTPError as e:
    print(f"  ERROR {e.code}: {e.read().decode()[:300]}")
