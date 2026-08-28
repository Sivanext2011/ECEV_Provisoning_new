import urllib.request, json

BASE = "http://seliiuvd02756.seli.gic.ericsson.se:8000/api/v1"

# First check what the catalog has for po_notiftesting characteristics
r = urllib.request.urlopen(f"{BASE}/specs", timeout=10)
specs = json.loads(r.read().decode())
po = None
for p in specs.get("productOfferings", []):
    if p.get("externalId") == "po_notiftesting":
        po = p
        break

if po:
    print("PO found in catalog:")
    for c in po.get("characteristics", []):
        name = c.get("name", "")
        ext = c.get("externalId", c.get("id", ""))
        unit = c.get("unitOfMeasure", "")
        measure = c.get("measure", "")
        pvs = c.get("possibleValues", [])
        pv_units = [pv.get("unitOfMeasure", "") for pv in pvs if pv.get("unitOfMeasure")]
        print(f"  {name} (ext: {ext})")
        print(f"    unitOfMeasure: '{unit}', measure: '{measure}'")
        print(f"    possibleValues units: {pv_units}")
        print()
else:
    print("PO po_notiftesting not found in catalog. Checking live spec...")

# Also check what the live spec returns
print("=" * 50)
print("Live spec from BSSF:")
try:
    r2 = urllib.request.urlopen(f"{BASE}/spec/productOffering?externalId=po_notiftesting", timeout=10)
    live = json.loads(r2.read().decode())
    live = live[0] if isinstance(live, list) else live
    for c in live.get("specCharacteristic", []):
        name = c.get("name", "")
        if name in ("Initial", "InstallerID"):
            print(f"  {name} (id: {c.get('id','')})")
            print(f"    valueRegulator: {c.get('valueRegulator','')}")
            print(f"    measure: {c.get('measure','')}")
            for sv in c.get("specCharacteristicValue", []):
                print(f"    sv: value={sv.get('value','')}, unit={sv.get('unitOfMeasure','')}, from={sv.get('valueFrom','')}, to={sv.get('valueTo','')}, default={sv.get('isDefault','')}")
            print()
except Exception as e:
    print(f"  Error: {e}")
