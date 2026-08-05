#!/bin/bash
# Run ECEV Provisioning Tool on the server (no containers)
# Backend: Python 3.11 + uvicorn on port 8000
# Frontend: served as static files by the backend

cd ~/ECEV_Provisoning_new

# Setup config
if [ ! -f config/config.json ]; then
  cp config/config.template.json config/config.json
  echo "Created config/config.json from template - edit with your BSSF credentials"
fi

# Install backend dependencies
echo "Installing backend dependencies..."
pip3.11 install --user -q -r backend/requirements.txt 2>&1 | tail -3

# Kill any existing instances
pkill -f "uvicorn app.main:app" 2>/dev/null
sleep 1

# Start backend (serves API + static frontend)
echo "Starting backend on port 8000..."
cd backend
python3.11 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

sleep 3

# Verify
if curl -s http://localhost:8000/health | grep -q ok; then
  echo "✓ Backend running on http://$(hostname):8000"
  echo "  API:     http://$(hostname):8000/docs"
  echo "  Health:  http://$(hostname):8000/health"
else
  echo "✗ Backend failed to start"
  exit 1
fi

# Serve frontend on port 3000
echo "Starting frontend on port 3000..."
cd frontend/dist
python3.11 -m http.server 3000 --bind 0.0.0.0 &
FRONTEND_PID=$!
cd ../..

sleep 2
echo "✓ Frontend running on http://$(hostname):3000"
echo ""
echo "PIDs: backend=$BACKEND_PID frontend=$FRONTEND_PID"
echo "To stop: kill $BACKEND_PID $FRONTEND_PID"
