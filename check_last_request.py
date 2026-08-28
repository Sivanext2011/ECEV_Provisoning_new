import urllib.request, json

r = urllib.request.urlopen("http://seliiuvd02756.seli.gic.ericsson.se:8000/api/v1/logs", timeout=10)
logs = json.loads(r.read().decode())
# Find the last PATCH contract call
for l in reversed(logs):
    if l.get("method") == "PATCH" and "contract" in l.get("url", ""):
        print(f"URL: {l['url'][:100]}")
        print(f"Status: {l['status']}")
        req = l.get("request", {})
        body = req.get("body", "")
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except:
                pass
        print(f"Request Body:\n{json.dumps(body, indent=2)[:1000]}")
        break
