# ECEV Provisioning Tool v2 - Local Setup Guide (Windows)

## Prerequisites

1. **Python 3.11+** — Download from https://www.python.org/downloads/
   - During install, check "Add Python to PATH"
   - Verify: `python --version`

2. **Node.js 18+** — Download from https://nodejs.org/
   - Verify: `node --version` and `npm --version`

3. **Git** — Download from https://git-scm.com/downloads
   - Verify: `git --version`

---

## Setup Steps

### 1. Clone the repository

```cmd
git clone https://github.com/Sivanext2011/ECEV_Provisoning_new.git
cd ECEV_Provisoning_new
```

### 2. Configure

Copy the config template and edit with your environment details:

```cmd
copy config\config.template.json config\config.json
```

Edit `config\config.json` with:
- Your BSSF OAM/TRF base URLs
- OAuth2 credentials (token endpoint, username, password)
- mTLS certificate paths (if applicable)

### 3. Install Backend Dependencies

```cmd
cd backend
python -m pip install -r requirements.txt
cd ..
```

### 4. Install Frontend Dependencies

```cmd
cd frontend
npm install
cd ..
```

---

## Running Locally

Open **two terminal windows**:

### Terminal 1 — Backend (Port 8001)

```cmd
cd ECEV_Provisoning_new\backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8001
```

### Terminal 2 — Frontend (Port 5173)

```cmd
cd ECEV_Provisoning_new\frontend
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

### Open in Browser

Go to: **http://localhost:5173**

---

## Quick Start Script (Optional)

Save this as `start_local.bat` in the project root:

```bat
@echo off
echo Starting ECEV Provisioning Tool...
echo.

start "ECEV Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload"
timeout /t 3 /nobreak >nul
start "ECEV Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo Backend running on http://localhost:8001
echo Frontend running on http://localhost:5173
echo.
echo Close the terminal windows to stop the servers.
```

Double-click `start_local.bat` to launch everything.

---

## Configuration Notes

### config/config.json key fields:

| Field | Description | Example |
|-------|-------------|---------|
| `environment.ROOT_BAE` | BSSF OAM base URL | `https://bss-oam-gui.xxx.ericsson.se` |
| `environment.ROOT_RMCA` | RMCA TRF base URL | `https://bss-trf.xxx.ericsson.se` |
| `auth.token_endpoint` | OAuth2 token URL | `https://iam.xxx.ericsson.se/auth/realms/oam/protocol/openid-connect/token` |
| `auth.username` | OAuth2 username | `your-username` |
| `auth.password` | OAuth2 password | `your-password` |
| `tls.cert_path` | Client cert for mTLS | `C:/path/to/cert.pem` |
| `tls.key_path` | Client key for mTLS | `C:/path/to/key.pem` |
| `tls.ca_path` | CA bundle (optional) | `C:/path/to/ca.pem` |
| `tls.verify` | Verify TLS | `true` or `false` |

### Upload BusinessConfig

After launching, go to **Settings** tab and upload your `BusinessConfig.xml` to populate spec dropdowns (Party, Customer, Contract, BA specs, PO list, etc.)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `python` not found | Use `python3` or check PATH |
| Port 8001 in use | Kill existing process or change port in both `backend` command and `frontend/vite.config.ts` |
| npm install fails | Delete `node_modules` folder and retry |
| Can't reach BSSF APIs | Check VPN connection, config URLs, and certificate paths |
| Blank page | Check browser console (F12) for errors; ensure backend is running |

---

## Architecture

```
Browser (localhost:5173)
    │
    ├── Static UI (React/Vite)
    │
    └── /api/* requests ──proxy──► Backend (localhost:8001)
                                        │
                                        └──► Ericsson BSSF REST APIs (mTLS + OAuth2)
```
