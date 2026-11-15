import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://factmap:local-dev-only@localhost:5433/factmap",
)
ROOT = Path(__file__).resolve().parents[1]
STORAGE = Path(os.environ.get("STORAGE_DIR", ROOT / "storage"))


def connect():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)
