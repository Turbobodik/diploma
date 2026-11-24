# Getting Started

## 1. Prerequisites

- Python 3.12+ (and Docker if running local PostgreSQL 16)
- `curl` and `jq`

## 2. Run the API locally

### Fast local mode (SQLite + stub ML)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-ci.txt
ML_BACKEND=stub .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Full ML mode (PostgreSQL 16 + Transformers)

```bash
cd backend
docker compose up -d
cp .env.example .env
# Set a random JWT_SECRET (32+ chars) in .env
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 3. Check `/health`

```bash
curl -s http://127.0.0.1:8000/health | jq
```

Response (`200 OK`):

```json
{
  "status": "ok",
  "version": "1.0.0",
  "ml_backend": "stub",
  "embedding_model": "BAAI/bge-small-en-v1.5",
  "nli_model": "cross-encoder/nli-deberta-v3-xsmall"
}
```

## 4. Register and get a Bearer JWT

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "researcher@ehu.lt",
    "password": "StrongPassword123!",
    "display_name": "Bahdan Kanoplich"
  }' | jq
```

Response (`201 Created`):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 86400,
  "user": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "email": "researcher@ehu.lt",
    "display_name": "Bahdan Kanoplich"
  }
}
```

Export the token for subsequent requests:

```bash
export FACTMAP_TOKEN="<jwt>"
```

## 5. Create a project

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/projects \
  -H "Authorization: Bearer $FACTMAP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "SciFact Quickstart"}' | jq
```

Response (`201 Created`):

```json
{
  "id": "a3fc0bc4-b7be-46b2-abf3-273bf7c2737a",
  "name": "SciFact Quickstart",
  "document_count": 0,
  "claim_count": 0,
  "created_at": "2026-11-24T10:15:00+00:00"
}
```

## Next steps

- Interactive docs: `http://127.0.0.1:8000/docs` (click **Authorize** and paste your JWT), `http://127.0.0.1:8000/redoc`, or [`../redoc.html`](../redoc.html).
- Full workflow: [Integration Tutorial](integration-tutorial.md) or `bash docs/api/examples/walkthrough.sh`.
