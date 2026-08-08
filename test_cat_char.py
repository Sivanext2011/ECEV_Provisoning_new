#!/usr/bin/env python3.11
import urllib.request, json

# Check catalog (parsed from BusinessConfig)
r = urllib.request.urlopen("http://localhost:8000/api/v1/specs")
specs = json.loads(r.read())
pos = specs.get("productOfferings", [])
for po in pos:
    if po.get("externalId") == "TestProductA":
        print("=== Catalog: TestProductA characteristics ===")
        for c in po.get("characteristics", []):
            print(f"  {c.get('name','')} ({c.get('externalId','')}):")
            print(f"    unitOfMeasure: {c.get('unitOfMeasure', 'NONE')}")
            print(f"    measure: {c.get('measure', 'NONE')}")
            print(f"    possibleValues: {json.dumps(c.get('possibleValues', []))[:200]}")
            print()
        break
else:
    print("TestProductA not found in catalog")
