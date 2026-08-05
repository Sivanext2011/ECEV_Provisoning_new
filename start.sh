#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"
pkill -f "uvicorn app.main" 2>/dev/null
pkill -f "http.server 3000" 2>/dev/null

cd ~/ECEV_Provisoning_new/backend
nohup python3.11 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/ecev-backend.log 2>&1 &
echo "Backend PID: $!"

cd ~/ECEV_Provisoning_new/frontend/dist
nohup python3.11 -m http.server 3000 --bind 0.0.0.0 > /tmp/ecev-frontend.log 2>&1 &
echo "Frontend PID: $!"

python3.11 -c "
import time, urllib.request
time.sleep(3)
try:
    r = urllib.request.urlopen('http://localhost:8000/health')
    print('Backend:', r.read().decode())
except Exception as e:
    print('Backend FAIL:', e)
try:
    r = urllib.request.urlopen('http://localhost:3000/')
    print('Frontend: HTTP', r.status)
except Exception as e:
    print('Frontend FAIL:', e)
"
