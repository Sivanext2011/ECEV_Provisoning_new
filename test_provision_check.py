import urllib.request, json

BASE = "http://localhost:8001/api/v1"

def get(path):
    r = urllib.request.urlopen(f"{BASE}{path}", timeout=10)
    return json.loads(r.read().decode())

specs = get("/specs")
print("Contract specs:", [s["externalId"] for s in specs.get("contractSpecifications", [])])
print("Customer specs:", [s["externalId"] for s in specs.get("customerSpecifications", [])])
print("Party specs:", [s["externalId"] for s in specs.get("partySpecifications", [])])
print("BA specs:", [s["externalId"] for s in specs.get("billingAccountSpecifications", [])])
print("Resource specs:", [s["externalId"] for s in specs.get("resourceSpecifications", [])])
print("PO list:", [p["externalId"] for p in specs.get("productOfferings", [])][:20])
