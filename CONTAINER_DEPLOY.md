# ECEV Provisioning Tool v2 - Container Deployment Guide

## Prerequisites
- Docker or Podman installed on the target RHEL machine
- Git access to clone the repo (or copy the code)

---

## Option 1: Build and Run with Podman (Recommended for RHEL)

### 1. Clone the repo on the server

```bash
git clone https://github.com/Sivanext2011/ECEV_Provisoning_new.git
cd ECEV_Provisoning_new
```

### 2. Prepare config

```bash
cp config/config.template.json config/config.json
# Edit config.json with your environment details
vi config/config.json
```

### 3. Build the container image

```bash
podman build -t ecev-tool:latest .
```

### 4. Run the container

```bash
podman run -d \
  --name ecev-tool \
  -p 8000:8000 \
  -v $(pwd)/config:/app/config:Z \
  --restart unless-stopped \
  ecev-tool:latest
```

### 5. Verify

```bash
# Check container is running
podman ps

# Check health
curl http://localhost:8000/health

# View logs
podman logs -f ecev-tool
```

### 6. Access the tool

Open in browser: `http://<server-hostname>:8000`

---

## Option 2: Build and Run with Docker

Same as above, replace `podman` with `docker`:

```bash
docker build -t ecev-tool:latest .
docker run -d \
  --name ecev-tool \
  -p 8000:8000 \
  -v $(pwd)/config:/app/config \
  --restart unless-stopped \
  ecev-tool:latest
```

---

## Managing the Container

### Stop
```bash
podman stop ecev-tool
```

### Start (after stop)
```bash
podman start ecev-tool
```

### Restart
```bash
podman restart ecev-tool
```

### Remove and rebuild (after code update)
```bash
podman stop ecev-tool && podman rm ecev-tool
git pull
podman build -t ecev-tool:latest .
podman run -d \
  --name ecev-tool \
  -p 8000:8000 \
  -v $(pwd)/config:/app/config:Z \
  --restart unless-stopped \
  ecev-tool:latest
```

### View logs
```bash
podman logs -f ecev-tool
```

---

## Quick Update Script

Save as `redeploy.sh` in the project root:

```bash
#!/bin/bash
echo "=== ECEV Tool Redeployment ==="
cd ~/ECEV_Provisoning_new

echo "Pulling latest code..."
git pull

echo "Stopping old container..."
podman stop ecev-tool 2>/dev/null
podman rm ecev-tool 2>/dev/null

echo "Building new image..."
podman build -t ecev-tool:latest .

echo "Starting new container..."
podman run -d \
  --name ecev-tool \
  -p 8000:8000 \
  -v $(pwd)/config:/app/config:Z \
  --restart unless-stopped \
  ecev-tool:latest

echo "Waiting for startup..."
sleep 5

echo "Health check:"
curl -s http://localhost:8000/health
echo ""
echo "=== Done ==="
```

Make executable: `chmod +x redeploy.sh`

---

## With mTLS Certificates

If your BSSF environment requires client certificates, mount them:

```bash
podman run -d \
  --name ecev-tool \
  -p 8000:8000 \
  -v $(pwd)/config:/app/config:Z \
  -v /path/to/certs:/app/certs:Z,ro \
  --restart unless-stopped \
  ecev-tool:latest
```

Then in `config.json`, set cert paths relative to the container:
```json
{
  "tls": {
    "cert_path": "/app/certs/client.pem",
    "key_path": "/app/certs/client-key.pem",
    "ca_path": "/app/certs/ca.pem"
  }
}
```

---

## Run as Systemd Service (auto-start on boot)

```bash
# Generate systemd unit file
podman generate systemd --name ecev-tool --new > ~/.config/systemd/user/ecev-tool.service

# Enable and start
systemctl --user daemon-reload
systemctl --user enable ecev-tool.service
systemctl --user start ecev-tool.service

# Check status
systemctl --user status ecev-tool.service
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails at npm ci | Ensure `package-lock.json` exists in `frontend/` |
| Port 8000 in use | Change `-p 8000:8000` to `-p 9000:8000` and access on port 9000 |
| Config not loading | Ensure `config/config.json` exists and volume mount path is correct |
| Permission denied on config | Add `:Z` suffix to volume mount on SELinux systems |
| Container exits immediately | Check `podman logs ecev-tool` for errors |
| Can't reach BSSF APIs | Verify network/VPN from container, check `podman exec ecev-tool curl <url>` |
