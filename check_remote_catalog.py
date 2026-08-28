import urllib.request, json

r = urllib.request.urlopen("http://seliiuvd02756.seli.gic.ericsson.se:8000/api/v1/specs", timeout=10)
d = json.loads(r.read().decode())
for p in d.get("productOfferings", []):
    if p.get("externalId") == "po_notiftesting":
        for ch in p.get("characteristics", []):
            if ch.get("name") == "Initial":
                print("REMOTE catalog - Initial char:")
                print(f"  unitOfMeasure: '{ch.get('unitOfMeasure', '')}'")
                print(f"  measure: '{ch.get('measure', '')}'")
                print(f"  possibleValues: {ch.get('possibleValues', [])}")
                break
        break
else:
    print("po_notiftesting NOT found in remote catalog")
