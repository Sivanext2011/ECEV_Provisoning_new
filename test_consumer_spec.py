#!/usr/bin/env python3.11
import urllib.request, json

url = "http://localhost:8000/api/v1/spec/productOffering?externalId=PO_Data_Sharing_Consumer_CHT"
r = urllib.request.urlopen(url)
data = json.loads(r.read())
po = data[0] if isinstance(data, list) else data

# Show type and POPs
print("Type:", po.get("type"))
print("\nPOPs:")
for p in po.get("productOfferingPrice", []):
    print(f"  - {p.get('externalId')} ({p.get('name')}) priceType={p.get('priceType')}")
    for row in p.get("productOfferingPriceRow", []):
        actions = row.get("action") or (row.get("actionGroup") or {}).get("action") or []
        for a in actions:
            for c in a.get("specCharacteristic", []):
                if c.get("valueRegulator") in ("CAN_BE_PERSONALIZED", "MUST_BE_PERSONALIZED"):
                    vals = c.get("specCharacteristicValue", [])
                    defval = next((v for v in vals if v.get("isDefault")), {})
                    print(f"    PERSONALIZABLE: {c.get('name')} = {defval.get('value')} {defval.get('unitOfMeasure','')}")
                    print(f"      purpose: {c.get('purpose')}, id: {c.get('id')}")
