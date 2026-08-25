import urllib.request, json, time

BASE = "http://localhost:8001/api/v1"

time.sleep(3)

body = {
    "externalId": "party-test-swap-001",
    "partySpecification": {"externalId": "Party_Individual_CHT"},
    "status": [{"status": "PartyActive"}],
    "givenName": "Test",
    "familyName": "SwapUser",
}

req = urllib.request.Request(f"{BASE}/party", json.dumps(body).encode(), method="POST")
req.add_header("Content-Type", "application/json")
try:
    r = urllib.request.urlopen(req, timeout=30)
    print(f"Status: {r.status}")
    print(json.dumps(json.loads(r.read().decode()), indent=2)[:300])
except urllib.error.HTTPError as e:
    print(f"Error: {e.code}")
    print(e.read().decode()[:300])
except Exception as e:
    print(f"Exception: {e}")
