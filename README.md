# ECEV Provisioning Tool v2

Manual provisioning tool for Ericsson BSSF/CPM/RMCA environment.

## Architecture

```
+--------------+     +------------------+     +------------------+
|  React UI    |---->|  FastAPI Backend  |---->|  Ericsson BSSF   |
|  (Vite/TS)   |     |  (Python 3.11)   |     |  REST APIs       |
+--------------+     +------------------+     +------------------+
                            |
                     +------+------+
                     |   SQLite    |
                     | (audit/log) |
                     +-------------+
```

## Quick Start

### Docker (recommended)

```bash
cp config/config.template.json config/config.json
# Edit config/config.json with your BSSF credentials
docker-compose up --build
```

- UI: http://localhost:3000
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs

### Local Development

```bash
# Backend
cd backend
python -m venv .venv
.venv/Scripts/activate  # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Project Structure

```
backend/
  app/
    main.py              # FastAPI application
    routers/
      provisioning.py    # Core provisioning endpoints
      bssf_apis.py       # BSSF API proxy endpoints
    services/
      ericsson_client.py # HTTP client with mTLS + OAuth2
      provisioning.py    # Provisioning orchestration logic
      catalog.py         # Catalog parsing & management
      catalog_fetch.py   # Live catalog fetching from BSSF
      catalog_manager.py # PO template management
      bae_client.py      # BAE/RMCA catalog client
      database.py        # SQLite async database
    models/
      schemas.py         # Pydantic request/response models
    schemas/             # JSON schemas for API bodies
frontend/
  src/
    App.tsx              # Main app with tab navigation
    components/
      ProvisionWizard.tsx
      CRMView.tsx
      CatalogPanel.tsx
      OperationsPanel.tsx
      POPublishPanel.tsx
      SettingsPanel.tsx
      ApiLogsPanel.tsx
config/
  config.template.json   # Configuration template
helm/                    # Kubernetes Helm chart
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/subscribers/provision | Full provisioning wizard |
| POST | /api/v1/party | Create Individual |
| POST | /api/v1/customer | Create Customer |
| POST | /api/v1/contract | Create Contract |
| POST | /api/v1/balance/topup | Balance Top-Up |
| GET | /api/v1/balance | Balance Enquiry |
| POST | /api/v1/terminate/party | Terminate Party |
| POST | /api/v1/terminate/customer | Terminate Customer |
| POST | /api/v1/execute/{api_key} | Generic API executor |
| GET | /api/v1/specs | Get parsed specifications |
| POST | /api/v1/specs/upload | Upload BusinessConfig |
| GET | /api/v1/settings | Get configuration |
| PUT | /api/v1/settings | Update configuration |
| GET | /api/v1/logs | API call logs |

## Configuration

Edit `config/config.json` to configure:
- Ericsson BSSF base URLs and OAuth2 credentials
- mTLS certificates
- API paths per TMF interface
- Product offering defaults
- Network settings (proxy, timeout)
