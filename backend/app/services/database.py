import aiosqlite
import os
from pathlib import Path
from contextlib import asynccontextmanager

DB_PATH = Path(os.environ.get("DB_PATH", Path(__file__).parent.parent.parent / "data" / "provisioning.db"))


async def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS subscribers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                msisdn TEXT UNIQUE NOT NULL,
                party_id TEXT,
                customer_id TEXT,
                billing_account_id TEXT,
                contract_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subscriber_id INTEGER REFERENCES subscribers(id),
                product_id TEXT,
                product_offering_id TEXT,
                status TEXT,
                valid_from TEXT,
                valid_to TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                msisdn TEXT,
                action TEXT,
                request_body TEXT,
                response_body TEXT,
                status TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        """)


@asynccontextmanager
async def get_db():
    """Async context manager for database connections."""
    db = await aiosqlite.connect(DB_PATH)
    try:
        yield db
    finally:
        await db.close()
