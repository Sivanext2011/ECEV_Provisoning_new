import urllib.request, json

BASE = "http://localhost:8001/api/v1"

# Check settings
r = urllib.request.urlopen(f"{BASE}/settings", timeout=5)
settings = json.loads(r.read().decode())
print("ROOT_BAE:", settings.get("environment", {}).get("ROOT_BAE", ""))
print("ROOT_RMCA:", settings.get("environment", {}).get("ROOT_RMCA", ""))
print("Token EP:", settings.get("auth", {}).get("token_endpoint", ""))
print("TLS verify:", settings.get("tls", {}).get("verify", ""))
print("Cert:", settings.get("tls", {}).get("cert_path", ""))
print()

# Try to get a token via the backend's token test
try:
    r = urllib.request.urlopen(f"{BASE}/token-test", timeout=10)
    print("Token test:", r.status, r.read().decode()[:100])
except urllib.error.HTTPError as e:
    print("Token test error:", e.code, e.read().decode()[:200])
except Exception as e:
    print("Token test exception:", e)
