"""
Shared bootstrap + helpers for the ECEV CLI.

The CLI REUSES the existing backend logic (no duplicated provisioning/batch logic):
it puts the repo's `backend/` on sys.path and imports app.services / app.routers.
"""
import os
import sys
import json
import asyncio
from pathlib import Path

# --- make backend/app importable ---
_CLI_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _CLI_DIR.parent
_BACKEND = _REPO_ROOT / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# Import shared backend modules (single source of truth for all logic)
from app.services.ericsson_client import (  # noqa: E402
    ericsson_client, load_config, api_logs, CONFIG_PATH, LOG_FILE,
    invalidate_config_cache,
)
from app.services import catalog as catalog_svc  # noqa: E402
from app.services import provisioning as prov_svc  # noqa: E402
from app.routers import batch as batch_mod  # noqa: E402


def run(coro):
    """Run an async coroutine from a sync click command."""
    return asyncio.run(coro)


# ----------------------------- output helpers -----------------------------
def emit(data, as_json: bool, human_fn=None):
    """Emit a result either as JSON (machine) or human-readable text.

    data     : the structured result (dict/list/str)
    as_json  : when True, print json.dumps(data)
    human_fn : optional callable(data) that prints a human view; if None, pretty JSON.
    """
    if as_json:
        print(json.dumps(data, indent=2, default=str))
        return
    if human_fn is not None:
        human_fn(data)
    else:
        if isinstance(data, (dict, list)):
            print(json.dumps(data, indent=2, default=str))
        else:
            print(data)


def table(rows, headers):
    """Print a simple fixed-width table. rows = list[list[str]]."""
    cols = len(headers)
    widths = [len(str(h)) for h in headers]
    srows = []
    for r in rows:
        sr = [("" if v is None else str(v)) for v in r]
        srows.append(sr)
        for i in range(cols):
            if i < len(sr):
                widths[i] = max(widths[i], len(sr[i]))
    sep = "  "
    print(sep.join(str(h).ljust(widths[i]) for i, h in enumerate(headers)))
    print(sep.join("-" * widths[i] for i in range(cols)))
    for sr in srows:
        print(sep.join((sr[i] if i < len(sr) else "").ljust(widths[i]) for i in range(cols)))


def err(msg):
    print(f"ERROR: {msg}", file=sys.stderr)


def load_json_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def reinit_client():
    """Reload config + reset the shared client (after a config change)."""
    ericsson_client.reinit()
