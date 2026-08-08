#!/usr/bin/env python3.11
import urllib.request, json

r = urllib.request.urlopen("http://localhost:8000/api/v1/spec/productOffering?externalId=TestProductA")
data = json.loads(r.read())
po = data[0] if isinstance(data, list) else data

print("=== TestProductA - specCharacteristic ===")
for c in po.get("specCharacteristic", []):
    name = c.get("name", "")
    ext_id = c.get("externalId", "")
    reg = c.get("valueRegulator", "")
    vals = c.get("specCharacteristicValue", [])
    if "nitial" in name or "nitial" in ext_id or c.get("id") == "ab5d2462df69432bb547748c76344198":
        print(f"\n  *** FOUND: {name} (extId={ext_id}, id={c.get('id')})")
        print(f"      valueRegulator: {reg}")
        print(f"      valueType: {c.get('valueType')}")
        print(f"      measure: {c.get('measure')}")
        print(f"      values: {json.dumps(vals, indent=6)}")
    else:
        print(f"  {name} ({ext_id}) - {reg} - {c.get('valueType')}")
