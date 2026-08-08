#!/usr/bin/env python3.11
import urllib.request, json, os

# Check bamctl binary
bin_path = os.path.expanduser("~/ECEV_Provisoning_new/bin/bamctl")
print(f"bamctl path: {bin_path}")
print(f"exists: {os.path.exists(bin_path)}")

# Check trace status
try:
    r = urllib.request.urlopen("http://localhost:8000/api/v1/trace/status")
    print(f"\nTrace status: {r.read().decode()}")
except Exception as e:
    print(f"\nTrace status ERROR: {e}")

# Try login (will fail but show the error)
try:
    data = json.dumps({"username": "test", "password": "test", "iam_url": "https://test.com/token"}).encode()
    req = urllib.request.Request("http://localhost:8000/api/v1/trace/setup/login", data=data, headers={"Content-Type": "application/json"})
    r = urllib.request.urlopen(req)
    print(f"\nLogin result: {r.read().decode()}")
except urllib.error.HTTPError as e:
    print(f"\nLogin HTTP error {e.code}: {e.read().decode()[:300]}")
except Exception as e:
    print(f"\nLogin error: {e}")
