from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def build_engine(database_url: str | None = None) -> Engine:
    url = database_url or settings.database_url
    kwargs: dict = {"future": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in url:
            kwargs["poolclass"] = StaticPool
    engine = create_engine(url, **kwargs)

    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _enable_sqlite_fks(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


engine = build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db_if_sqlite(target_engine: Engine | None = None) -> None:
    """Create tables automatically for SQLite or bootstrap empty managed Postgres via ddl/001_init.sql."""
    from pathlib import Path

    from sqlalchemy import inspect

    eng = target_engine or engine
    if str(eng.url).startswith("sqlite"):
        import app.models.orm  # noqa: F401

        Base.metadata.create_all(bind=eng)
        return

    if not inspect(eng).has_table("app_user"):
        ddl_path = Path(__file__).resolve().parents[1] / "ddl" / "001_init.sql"
        if ddl_path.exists():
            raw_sql = ddl_path.read_text(encoding="utf-8")
            with eng.begin() as conn:
                conn.exec_driver_sql(raw_sql)


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def session_scope(factory: sessionmaker = SessionLocal) -> Generator[Session, None, None]:
    session = factory()
    try:
        yield session
    finally:
        session.close()
