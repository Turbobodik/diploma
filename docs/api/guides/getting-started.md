# Getting Started with the FactMap Scholar API

This guide takes you from a clean checkout to your first authenticated API calls in under 5 minutes.

---

## 1. Prerequisites

- **Python 3.12+** (or Docker for PostgreSQL 16)
- `curl` and `jq` (optional, for formatting JSON responses)

## 2. Start the Local API Server

You can run the API in **fast local mode** (SQLite + deterministic stub ML — zero external downloads) or **full ML mode** (PostgreSQL 16 + Sentence-Transformers + DeBERTa NLI).

### Option A: Fast Local Mode (Recommended for API Exploration)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
ML_BACKEND=stub .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Option B: Full PostgreSQL + Transformers ML Mode

```bash
cd backend
docker compose up -d
cp .env.example .env
# Edit .env and set a random JWT_SECRET (32+ chars)
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

---

## 3. Verify Service Health

```bash
curl -s http://127.0.0.1:8000/health | jq
```

Expected response (`200 OK`):

```json
{
  "status": "ok",
  "version": "1.0.0",
  "ml_backend": "stub",
  "embedding_model": "BAAI/bge-small-en-v1.5",
  "nli_model": "cross-encoder/nli-deberta-v3-xsmall"
}
```

---

## 4. Register an Account and Obtain a Bearer JWT

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "researcher@ehu.lt",
    "password": "StrongPassword123!",
    "display_name": "Bahdan Kanoplich"
  }' | jq
```

Expected response (`201 Created`):

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

Save the token in an environment variable for subsequent calls:

```bash
export FACTMAP_TOKEN="<paste-jwt-here>"
```

---

## 5. Make Your First Authenticated Request

Create a research project workspace:

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/projects \
  -H "Authorization: Bearer $FACTMAP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "SciFact Quickstart"}' | jq
```

Expected response (`201 Created`):

```json
{
  "id": "a3fc0bc4-b7be-46b2-abf3-273bf7c2737a",
  "name": "SciFact Quickstart",
  "document_count": 0,
  "claim_count": 0,
  "created_at": "2026-11-24T10:15:00+00:00"
}
```

---

## 6. Explore Interactively

- Open **Swagger UI** at `http://127.0.0.1:8000/docs`, click **Authorize**, and paste your JWT token to test any endpoint in the browser.
- Open **ReDoc** at `http://127.0.0.1:8000/redoc` or the static bundle [`../redoc.html`](../redoc.html).
- Next step: follow the complete [Step-by-Step Integration Tutorial](integration-tutorial.md) or run [`../examples/walkthrough.sh`](../examples/walkthrough.sh).
