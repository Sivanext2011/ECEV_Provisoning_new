import urllib.request, json

r = urllib.request.urlopen("http://seliiuvd02756.seli.gic.ericsson.se:8000/api/v1/spec/productOffering?externalId=po_notiftesting", timeout=10)
po = json.loads(r.read().decode())
po = po[0] if isinstance(po, list) else po

print(f"PO: {po.get('externalId')} - {po.get('name')}")
print()

for c in po.get("specCharacteristic", []):
    name = c.get("name", "")
    ext = c.get("externalId", "")
    cid = c.get("id", "")
    reg = c.get("valueRegulator", "")
    measure = c.get("measure", "")
    vals = c.get("specCharacteristicValue", [])
    print(f"  Char: {name} (extId: {ext}, id: {cid})")
    print(f"    valueRegulator: {reg}, measure: {measure}")
    for v in vals:
        val = v.get("value", "")
        unit = v.get("unitOfMeasure", "")
        vfrom = v.get("valueFrom", "")
        vto = v.get("valueTo", "")
        default = v.get("isDefault", False)
        if vfrom or vto:
            print(f"    range: {vfrom} - {vto} {unit} (default: {default})")
        else:
            print(f"    value: {val} {unit} (default: {default})")
    print()
