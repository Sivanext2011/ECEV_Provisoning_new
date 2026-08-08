from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import shutil
from pathlib import Path

from .routers.provisioning import router as provisioning_router
from .routers.bssf_apis import router as bssf_router
from .routers.trace_traffic import router as trace_router
from .services.database import init_db
from .services.ericsson_client import ericsson_client

CONFIG_PATH = Path(os.environ.get("CONFIG_PATH", Path(__file__).parent.parent.parent / "config" / "config.json"))
CONFIG_TEMPLATE = Path(__file__).parent.parent.parent / "config" / "config.template.json"


def _ensure_config():
    if not CONFIG_PATH.exists() and CONFIG_TEMPLATE.exists():
        shutil.copy(CONFIG_TEMPLATE, CONFIG_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_config()
    await init_db()
    yield
    await ericsson_client.close()


app = FastAPI(
    title="ECEV Provisioning Tool",
    description="Provisioning tool for Ericsson BSSF/CPM/RMCA",
    version="2.0.0",
    lifespan=lifespan,
)

allowed_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(provisioning_router)
app.include_router(bssf_router)
app.include_router(trace_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/bssf")
async def health_bssf():
    try:
        token = await ericsson_client._get_token()
        return {"status": "ok" if token else "no_token", "has_token": bool(token)}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# Serve frontend static files (for production deployment without separate web server)
FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIR.exists():
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = FRONTEND_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        # SPA fallback — serve index.html for any non-file route
        return FileResponse(FRONTEND_DIR / "index.html")
