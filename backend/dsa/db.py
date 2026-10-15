from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from . import config
from .models import Base

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def _set_sqlite_pragmas(dbapi_conn, _record) -> None:
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.close()


# Columns added to existing tables after release. create_all() only creates missing tables, so
# older databases get these via ALTER TABLE on startup.
_ADDED_COLUMNS = {
    "books": {"page_updated_at": "DATETIME"},
    "schedule_blocks": {"moved_from_date": "VARCHAR(10)"},
}


def _add_missing_columns(engine: Engine) -> None:
    insp = inspect(engine)
    for table, cols in _ADDED_COLUMNS.items():
        have = {c["name"] for c in insp.get_columns(table)}
        for name, ddl in cols.items():
            if name not in have:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def init_db(url: str | None = None) -> Engine:
    """Create the engine and tables. Safe to call repeatedly; tests pass an in-memory URL."""
    global _engine, _SessionLocal
    if url is None:
        config.ensure_dirs()
        url = f"sqlite:///{config.DB_PATH}"
    _engine = create_engine(url, connect_args={"check_same_thread": False})
    event.listen(_engine, "connect", _set_sqlite_pragmas)
    Base.metadata.create_all(_engine)
    _add_missing_columns(_engine)
    _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    assert _SessionLocal is not None, "init_db() not called"
    with _SessionLocal() as s:
        yield s


@contextmanager
def session_scope() -> Iterator[Session]:
    assert _SessionLocal is not None, "init_db() not called"
    with _SessionLocal() as s:
        try:
            yield s
            s.commit()
        except Exception:
            s.rollback()
            raise
