#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

# Check the provider PO spec for schedule definition / recurrence details
print("=== Provider PO - POP_RECURRENCE details ===")
try:
    r = urllib.request.urlopen(f"{BASE}/spec/productOffering?externalId=PO_Data_Sharing_Provider_CHT")
    data = json.loads(r.read())
    po = data[0] if isinstance(data, list) else data
    for pop in po.get("productOfferingPrice", []):
        if pop.get("externalId") == "POP_RECURRENCE":
            print(f"  POP: {pop.get('externalId')} | priceType={pop.get('priceType')} | priceSubType={pop.get('priceSubType')}")
            # Look for schedule definition, validity, carry-over settings
            for key in pop:
                if key not in ("productOfferingPriceRow", "specCharacteristic", "productOfferingPriceSpecification"):
                    print(f"    {key}: {pop[key]}")
            # Check specCharacteristic for carry-over related
            for sc in pop.get("specCharacteristic", []):
                print(f"    specChar: {sc.get('name')} = {[v.get('value') for v in sc.get('specCharacteristicValue', [])]}")
except urllib.error.HTTPError as e:
    print(f"  ERROR: {e.read().decode()[:300]}")

print("\n=== Schedule Definition ===")
try:
    r = urllib.request.urlopen(f"{BASE}/spec/scheduleDefinition")
    data = json.loads(r.read())
    scheds = data if isinstance(data, list) else [data]
    for s in scheds[:5]:
        print(f"  {s.get('name', '')} ({s.get('externalId', '')}) - interval={s.get('interval', '')} type={s.get('type', '')}")
        for key in ('periodUnit', 'periodValue', 'alignmentType', 'carryOverType', 'carryOverValue', 'expiryType', 'validityDuration', 'validityUnit'):
            if s.get(key):
                print(f"    {key}: {s.get(key)}")
except urllib.error.HTTPError as e:
    print(f"  ERROR: {e.read().decode()[:300]}")

print("\n=== Shared Bucket - Balance with value containers ===")
try:
    r = urllib.request.urlopen(f"{BASE}/balance?msisdn=4455667743")
    data = json.loads(r.read())
    d = data[0] if isinstance(data, list) else data
    for prod in d.get("product", []):
        if "Sharing_Provider" in prod.get("externalId", ""):
            for b in prod.get("bucket", []):
                if "Sharing_Bucket" in b.get("bucketSpecExternalId", ""):
                    print(f"  Bucket: {b.get('bucketSpecExternalId')}")
                    print(f"  Total amount: {b.get('amount',{}).get('number')}")
                    print(f"  Value Containers ({len(b.get('valueContainer',[]))}):")
                    for vc in b.get("valueContainer", []):
                        vf = vc.get("validFor", {})
                        print(f"    amount={vc.get('amount',{}).get('number')} | from={vf.get('startDateTime','')} | to={vf.get('endDateTime','')}")
except urllib.error.HTTPError as e:
    print(f"  ERROR: {e.read().decode()[:300]}")
