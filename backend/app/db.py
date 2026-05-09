from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator
import os
import sqlite3

DEFAULT_DB_PATH = Path(os.environ.get("BUILDINGAGENT_DB_PATH", Path(__file__).resolve().parents[1] / "buildingagent.sqlite3"))


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def token_expiry() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=8)).replace(microsecond=0).isoformat()


def get_db_path() -> Path:
    return Path(os.environ.get("BUILDINGAGENT_DB_PATH", DEFAULT_DB_PATH))


def connect() -> sqlite3.Connection:
    path = get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 3000")
    return conn


def init_db() -> None:
    from .models import SCHEMA
    from .seed import seed_dev_data

    with connect() as conn:
        conn.executescript(SCHEMA)
        seed_dev_data(conn)
        conn.commit()


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
