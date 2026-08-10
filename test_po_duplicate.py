#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

# Fetch PO spec for POP_ReucrringTest_2
req = urllib.request.Request(
    f"{BASE}/execute/spec_product_offering",
    data=json.dumps({"_pathParams": {"productOfferingExternalId": "POPOPP_recurrance_test2"}}).encode(),
    headers={"Content-Type": "application/json"}, method="POST"
)

try:
    r = urllib.request.urlopen(req)
    data = json.loads(r.read().decode())
    po = data[0] if isinstance(data, list) else data
    
    print(f"PO: {po.get('externalId')} (version: {po.get('version')})")
    print(f"\nPOPs:")
    for pop in po.get("productOfferingPrice", []):
        print(f"  - {pop.get('externalId')} (id={pop.get('id')}) priceType={pop.get('priceType')} priceSubType={pop.get('priceSubType', '')}")
    
    print(f"\nproductOfferingPolicyRef ({len(po.get('productOfferingPolicyRef', []))}):")
    for ref in po.get("productOfferingPolicyRef", []):
        pop_info = ref.get("productOfferingPrice", {})
        print(f"  - id={ref.get('id')} → POP: {pop_info.get('externalId')} (popId={pop_info.get('id')})")
    
    # Compare counts per POP
    from collections import Counter
    pop_counts = Counter(ref.get("productOfferingPrice", {}).get("externalId") for ref in po.get("productOfferingPolicyRef", []))
    print(f"\nPolicy refs per POP:")
    for pop_ext, count in pop_counts.items():
        print(f"  {pop_ext}: {count} ref(s) {'⚠️ DUPLICATE - effective price!' if count > 1 else '✓ single'}")

except urllib.error.HTTPError as e:
    print(f"ERROR: {e.code} - {e.read().decode()[:300]}")
except Exception as e:
    print(f"ERROR: {e}")
