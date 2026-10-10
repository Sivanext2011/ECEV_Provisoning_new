"""Persistent migration state (idempotency + resume + reconciliation).

Each subscriber carries a migration state (PENDING / FETCHED / PROVISIONED /
VERIFIED / EC_DELETED / FAILED / ROLLED_BACK) so an interrupted batch resumes
safely and re-runs are no-ops for already-migrated subscribers.

Uses aiosqlite (already a repo dependency). Separate DB file from the main
provisioning tool so migration runs are self-contained.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import aiosqlite

from .models import MigrationResult, MigrationState

DEFAULT_DB = Path(__file__).resolve().parent / "data" / "migration_state.db"


class StateStore:
    def __init__(self, db_path: str | Path = DEFAULT_DB):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    @asynccontextmanager
    async def _db(self):
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            yield db

    async def init(self):
        async with self._db() as db:
            await db.execute(
                """CREATE TABLE IF NOT EXISTS migration (
                    msisdn TEXT PRIMARY KEY,
                    state TEXT NOT NULL,
                    error TEXT,
                    failed_step TEXT,
                    plan_json TEXT,
                    verify_json TEXT,
                    ecev_ids_json TEXT,
                    updated_at TEXT
                )"""
            )
            await db.execute(
                """CREATE TABLE IF NOT EXISTS migration_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    msisdn TEXT, step TEXT, status TEXT, detail TEXT, ts TEXT
                )"""
            )
            await db.commit()

    async def get_state(self, msisdn: str) -> Optional[MigrationState]:
        async with self._db() as db:
            cur = await db.execute("SELECT state FROM migration WHERE msisdn=?", (msisdn,))
            row = await cur.fetchone()
            return MigrationState(row["state"]) if row else None

    async def save(self, result: MigrationResult):
        async with self._db() as db:
            await db.execute(
                """INSERT INTO migration
                   (msisdn, state, error, failed_step, plan_json, verify_json, ecev_ids_json, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)
                   ON CONFLICT(msisdn) DO UPDATE SET
                     state=excluded.state, error=excluded.error, failed_step=excluded.failed_step,
                     plan_json=excluded.plan_json, verify_json=excluded.verify_json,
                     ecev_ids_json=excluded.ecev_ids_json, updated_at=excluded.updated_at""",
                (
                    result.msisdn,
                    result.state.value,
                    result.error,
                    result.failed_step,
                    _dumps(result.plan.__dict__ if result.plan else None, plan=True),
                    _dumps(result.verify_report),
                    _dumps(result.ecev_ids),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            await db.commit()

    async def audit(self, msisdn: str, step: str, status: str, detail: Any = None):
        async with self._db() as db:
            await db.execute(
                "INSERT INTO migration_audit (msisdn, step, status, detail, ts) VALUES (?,?,?,?,?)",
                (msisdn, step, status, _dumps(detail), datetime.now(timezone.utc).isoformat()),
            )
            await db.commit()

    async def report(self) -> dict:
        counts: dict[str, int] = {}
        failed: list[dict] = []
        async with self._db() as db:
            cur = await db.execute("SELECT state, COUNT(*) c FROM migration GROUP BY state")
            for row in await cur.fetchall():
                counts[row["state"]] = row["c"]
            cur = await db.execute(
                "SELECT msisdn, failed_step, error FROM migration WHERE state=?",
                (MigrationState.FAILED.value,))
            for row in await cur.fetchall():
                failed.append({"msisdn": row["msisdn"], "failed_step": row["failed_step"],
                               "error": row["error"]})
        return {"counts": counts, "failed": failed}


def _dumps(obj: Any, plan: bool = False) -> Optional[str]:
    if obj is None:
        return None
    try:
        return json.dumps(obj, default=_default)
    except TypeError:
        return json.dumps(str(obj))


def _default(o):
    # dataclasses / enums fall back to their dict / value
    if hasattr(o, "__dict__"):
        return o.__dict__
    if hasattr(o, "value"):
        return o.value
    return str(o)
