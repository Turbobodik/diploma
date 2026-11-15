"""Build an ER diagram from the live public schema.

On the server, from the project directory:

    DATABASE_URL=postgresql://factmap:local-dev-only@127.0.0.1:5432/factmap python scripts/generate_er.py
    python -m http.server 8080 --directory er

Then open http://<server>:8080/
Inside Compose the database host is the service name and port 5432, not 5433.
"""

import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "er"
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://factmap:local-dev-only@localhost:5433/factmap",
)

COLUMNS = """
SELECT table_name, column_name, data_type, udt_name, is_nullable,
       character_maximum_length, numeric_precision, numeric_scale
  FROM information_schema.columns
 WHERE table_schema = 'public'
 ORDER BY table_name, ordinal_position
"""

PRIMARY_KEYS = """
SELECT kcu.table_name, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.table_schema = tc.table_schema
 WHERE tc.table_schema = 'public'
   AND tc.constraint_type = 'PRIMARY KEY'
"""

FOREIGN_KEYS = """
SELECT tc.table_name AS from_table,
       kcu.column_name AS from_column,
       ccu.table_name AS to_table,
       ccu.column_name AS to_column,
       kcu.ordinal_position
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.table_schema = tc.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema = tc.table_schema
 WHERE tc.table_schema = 'public'
   AND tc.constraint_type = 'FOREIGN KEY'
 ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
"""


def column_type(row: dict) -> str:
    if row["data_type"] == "ARRAY":
        base = row["udt_name"].lstrip("_")
        return {"float4": "real_array", "float8": "double_array"}.get(base, "array")
    names = {
        "uuid": "uuid",
        "text": "text",
        "integer": "int",
        "smallint": "smallint",
        "bigint": "bigint",
        "boolean": "bool",
        "numeric": "numeric",
        "character varying": "varchar",
        "character": "char",
        "timestamp with time zone": "timestamptz",
        "timestamp without time zone": "timestamp",
    }
    return names.get(row["data_type"], "text")


def mermaid(columns, primary_keys, foreign_keys) -> str:
    pk = {(row["table_name"], row["column_name"]) for row in primary_keys}
    fk = {(row["from_table"], row["from_column"]) for row in foreign_keys}
    by_table: dict[str, list] = {}
    for row in columns:
        by_table.setdefault(row["table_name"], []).append(row)

    lines = ["erDiagram"]
    for table, cols in by_table.items():
        lines.append(f"    {table} {{")
        for col in cols:
            marks = []
            if (table, col["column_name"]) in pk:
                marks.append("PK")
            if (table, col["column_name"]) in fk:
                marks.append("FK")
            suffix = (" " + ",".join(marks)) if marks else ""
            lines.append(f"        {column_type(col)} {col['column_name']}{suffix}")
        lines.append("    }")
    for row in foreign_keys:
        # Parent is mandatory when the FK column is NOT NULL. Child is optional.
        nullable = next(
            col["is_nullable"] == "YES"
            for col in by_table[row["from_table"]]
            if col["column_name"] == row["from_column"]
        )
        left = "o|" if nullable else "||"
        lines.append(
            f"    {row['to_table']} {left}--o{{ {row['from_table']} : {row['from_column']}"
        )
    return "\n".join(lines) + "\n"


def html(diagram: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FactMap Scholar ER</title>
  <style>
    body {{ margin: 0; font-family: Georgia, serif; background: #f7f4ee; color: #1c1c1c; }}
    h1 {{ font-size: 1.3rem; font-weight: normal; padding: 1rem 1.2rem 0; }}
    .mermaid {{ padding: 1rem 1.2rem 2rem; }}
  </style>
</head>
<body>
  <h1>FactMap Scholar — ER diagram</h1>
  <pre class="mermaid">
{diagram}</pre>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    mermaid.initialize({{ startOnLoad: true, theme: "neutral" }});
  </script>
</body>
</html>
"""


def main() -> None:
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        columns = conn.execute(COLUMNS).fetchall()
        primary_keys = conn.execute(PRIMARY_KEYS).fetchall()
        foreign_keys = conn.execute(FOREIGN_KEYS).fetchall()
    if not columns:
        raise SystemExit("public schema has no tables")
    diagram = mermaid(columns, primary_keys, foreign_keys)
    OUT.mkdir(exist_ok=True)
    (OUT / "schema.mmd").write_text(diagram, encoding="utf-8")
    (OUT / "index.html").write_text(html(diagram), encoding="utf-8")
    print(f"wrote {OUT / 'schema.mmd'}")
    print(f"wrote {OUT / 'index.html'}")


if __name__ == "__main__":
    main()
