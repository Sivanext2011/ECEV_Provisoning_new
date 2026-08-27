import urllib.request, json
r = urllib.request.urlopen("http://localhost:8001/api/v1/specs", timeout=5)
d = json.loads(r.read().decode())
print("CommID specs:", d.get("communicationIdentifierSpecifications", []))
print("Resource specs:", [s.get("externalId") for s in d.get("resourceSpecifications", [])])
