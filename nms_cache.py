"""nms_cache.py — SQLite-backed translation memory."""
from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

_conn: sqlite3.Connection | None = None


def init_cache(db_path: Path) -> None:
    global _conn
    db_path.parent.mkdir(parents=True, exist_ok=True)
    _conn = sqlite3.connect(str(db_path), check_same_thread=False)
    _conn.execute(
        "CREATE TABLE IF NOT EXISTS cache "
        "(key TEXT PRIMARY KEY, translated TEXT, "
        " ts REAL DEFAULT (unixepoch('now')))"
    )
    _conn.commit()


def cache_key(source_text: str, direction: str, model: str) -> str:
    raw = f"{direction}\n{model}\n{source_text.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def lookup(key: str) -> str | None:
    if _conn is None:
        return None
    row = _conn.execute(
        "SELECT translated FROM cache WHERE key = ?", (key,)
    ).fetchone()
    return row[0] if row else None


def store(key: str, translated_text: str) -> None:
    if _conn is None:
        return
    _conn.execute(
        "INSERT OR REPLACE INTO cache (key, translated) VALUES (?, ?)",
        (key, translated_text),
    )
    _conn.commit()


def count() -> int:
    if _conn is None:
        return 0
    row = _conn.execute("SELECT COUNT(*) FROM cache").fetchone()
    return row[0] if row else 0


def clear() -> None:
    if _conn is None:
        return
    _conn.execute("DELETE FROM cache")
    _conn.commit()
