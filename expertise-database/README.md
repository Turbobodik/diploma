# FactMap Scholar

A web service that extracts and checks claims from scientific papers. This folder is the database package. The schema is created only by `ddl/001_init.sql`.

Column dictionary: `DATA_DICTIONARY.md`. Logical model: `LOGICAL_SCHEMA.md`. Diagram: `er/`. No real passwords are in the repository. `local-dev-only` is the local database password.

From this directory:

```powershell
docker compose up -d
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --reload
```

Postgres listens on `localhost:5433`. The app uses `postgresql://factmap:local-dev-only@localhost:5433/factmap`. I open http://127.0.0.1:8000, create a project, and upload `scripts/sample_a.txt` and `scripts/sample_b.txt`. The file stays in `storage/`. The database stores `object_key` only.

```powershell
psql "postgresql://factmap:local-dev-only@localhost:5433/factmap" -c "\dt"
.\.venv\Scripts\python scripts\smoke.py
```

I expect `app_user`, `project`, `document`, `analysis_job`, `passage`, `passage_embedding`, `claim`, `retrieval_candidate`, `claim_evidence`. After a DDL change I recreate the volume: `docker compose down -v`, then `docker compose up -d`.
