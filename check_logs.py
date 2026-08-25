import urllib.request, json
r = urllib.request.urlopen("http://localhost:8001/api/v1/logs", timeout=5)
logs = json.loads(r.read().decode())
for l in logs[-6:]:
    print(f"{l['method']} {l['url'][:90]} -> {l['status']}")
    if l['status'] >= 400:
        resp = l.get('response', {})
        body = resp.get('body', '')
        if isinstance(body, str):
            print(f"  Response: {body[:200]}")
        else:
            print(f"  Response: {json.dumps(body)[:200]}")
