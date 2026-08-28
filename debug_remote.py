import urllib.request, json

r = urllib.request.urlopen("http://seliiuvd02756.seli.gic.ericsson.se:8000/api/v1/specs", timeout=10)
d = json.loads(r.read().decode())

po = None
for p in d.get("productOfferings", []):
    if p.get("externalId") == "po_notiftesting":
        po = p
        break

if not po:
    print("po_notiftesting NOT in catalog. This is why unit is missing!")
    print("The 360 view uses catalog poList - if PO is not in catalog, characteristics have no unit info.")
    print()
    print("Available POs:", [p.get("externalId") for p in d.get("productOfferings", [])])
else:
    print("PO found in catalog")
    chars = po.get("characteristics", [])
    initial = [c for c in chars if c.get("name") == "Initial" or c.get("externalId") == "Initial"]
    if initial:
        print(f"Initial char: {json.dumps(initial[0], indent=2)}")
    else:
        print("Initial char NOT in catalog characteristics")
        print("Available chars:", [c.get("name") or c.get("externalId") for c in chars])
