#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

try:
    r = urllib.request.urlopen(f"{BASE}/spec/productOffering?externalId=POPOPP_recurrance_test2")
    data = json.loads(r.read().decode())
    po = data[0] if isinstance(data, list) else data
    
    print(f"PO: {po.get('externalId')} (version: {po.get('version')})")
    print(f"Type: {po.get('type')}")
    
    print(f"\nPOPs ({len(po.get('productOfferingPrice', []))}):")
    for pop in po.get("productOfferingPrice", []):
        print(f"  - {pop.get('externalId')} | priceType={pop.get('priceType')} | priceSubType={pop.get('priceSubType', '')}")
    
    refs = po.get("productOfferingPolicyRef", [])
    print(f"\nproductOfferingPolicyRef ({len(refs)}):")
    for ref in refs:
        pop_info = ref.get("productOfferingPrice", {})
        print(f"  - id={ref.get('id')} → POP: {pop_info.get('externalId')}")
    
    from collections import Counter
    pop_counts = Counter(ref.get("productOfferingPrice", {}).get("externalId") for ref in refs)
    print(f"\nPolicy refs per POP:")
    for pop_ext, count in pop_counts.items():
        status = "⚠️ DUPLICATE" if count > 1 else "✓ single"
        print(f"  {pop_ext}: {count} ref(s) {status}")

except urllib.error.HTTPError as e:
    print(f"ERROR: {e.code} - {e.read().decode()[:300]}")
except Exception as e:
    print(f"ERROR: {e}")
