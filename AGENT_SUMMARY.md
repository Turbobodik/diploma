# Agent Summary — FactMap Scholar (Diploma Project)

> Quick-start context for AI agents working on this repository remotely or locally.

## 1. Project Identity & Goal

- **Product name:** FactMap Scholar
- **Student:** Bahdan Kanoplich (EHU, Computer Science, 4th year)
- **Supervisor:** Maksym Lipchanskyi (NTU "KhPI")
- **Thesis topic:** *Web service for the automatic extraction and verification of facts from scientific publications based on NLI models*
- **Core idea:** Upload scientific papers (PDF/TXT) into a project → split into passages → extract factual claims → retrieve candidate evidence passages across documents → classify claim–passage pairs with NLI (`entailment` / `contradiction` / `neutral`) → render an interactive visual evidence map.

### 5 Diploma Complexity Criteria (from `43I-00_Diploma_Application_Kanoplich_Bahdan.txt`)

1. **Back-end & Front-end:** Client–server architecture (FastAPI backend + interactive frontend for uploads and dynamic evidence graph).
2. **Adaptive UI (Web/Mobile):** Responsive desktop/mobile UI with zooming and navigation over the evidence map.
3. **Database & ML model:** Normalized relational DB + embeddings/graph representation; ML/NLP models for claim extraction, semantic retrieval (Sentence Transformers), and NLI classification.
4. **Cloud:** Docker containerization, cloud deployment (demo), CI/CD pipeline (lint/test/build).
5. **API documentation:** REST API documented with OpenAPI/Swagger.

## 2. Repository Structure

| Path | Purpose |
|---|---|
| `43I-00_Diploma_Application_Kanoplich_Bahdan.txt` | Official diploma topic application & 5 required criteria |
| `BA_Kanoplich_Bahdan.md` / `.docx` / `BA.pdf` | Business Analysis (chapter layout, stakeholders, user stories `US-01`–`US-16`, use cases, NFRs, GDPR/legal, backlog, architecture & data-flow diagrams) |
| `expertise-database/` | Database review package + runnable FastAPI MVP |
| `expertise-database/ddl/001_init.sql` | **Single source of truth** for PostgreSQL 16 schema (9 tables, constraints, indexes, 3 triggers) |
| `expertise-database/LOGICAL_SCHEMA.md` | 3NF logical model, Mermaid ER diagram, key DB design decisions |
| `expertise-database/DATA_DICTIONARY.md` | Column-level dictionary |
| `expertise-database/er/` | Generated Mermaid schema (`schema.mmd`), HTML viewer, PNG diagram |
| `expertise-database/docker-compose.yml` | Local PostgreSQL 16 service (`localhost:5433`, db/user `factmap`) |
| `expertise-database/app/main.py` | FastAPI app with auth, projects, document upload (PDF/TXT ≤ 20 MB), analysis trigger, claims/evidence query, label override |
| `expertise-database/app/db.py` | `psycopg` connection helper (`DATABASE_URL`, `STORAGE_DIR`) |
| `expertise-database/app/auth.py` | PBKDF2-SHA256 password hashing + HMAC-SHA256 bearer tokens (`TOKEN_SECRET`) |
| `expertise-database/app/pipeline.py` | Heuristic MVP pipeline (`mvp-sentence-v1`, `mvp-bow-v1` 16-dim BoW, `mvp-overlap-v1` NLI) |
| `expertise-database/app/static/index.html` | Minimal single-file HTML/JS UI served at `/` |
| `expertise-database/scripts/smoke.py` | End-to-end smoke test against `http://127.0.0.1:8000` |
| `expertise-database/scripts/generate_er.py` | ER diagram generator script |
| `expertise-database/scripts/sample_a.txt`, `sample_b.txt` | Sample documents for testing |

## 3. Current Implementation State

### What is already built (in `expertise-database/`)
- **Database schema (3NF, PostgreSQL 16):** 9 tables (`app_user`, `project`, `document`, `analysis_job`, `passage`, `passage_embedding`, `claim`, `retrieval_candidate`, `claim_evidence`) with cascading deletes from `project` and triggers (`trg_claim_same_project`, `trg_candidate_same_project`, `trg_evidence_same_project`) enforcing project isolation.
- **Backend API (`app/main.py`):**
  - `GET /` — serves `app/static/index.html`
  - `POST /api/register`, `POST /api/login`
  - `GET /api/projects`, `POST /api/projects`, `DELETE /api/projects/{project_id}`
  - `GET /api/projects/{project_id}/documents`, `POST /api/projects/{project_id}/documents` (SHA-256 deduplication per project, file bytes saved to `storage/`, only `object_key` stored in DB)
  - `POST /api/projects/{project_id}/analyze`
  - `GET /api/projects/{project_id}/claims`
  - `PATCH /api/evidence/{evidence_id}` (sets `user_label` while preserving `model_label`)
- **Smoke test (`scripts/smoke.py`):** Verifies register/login, duplicate project rejection, uploading `sample_a.txt` + `sample_b.txt`, running analysis jobs (`extract_text`, `extract_claims`, `retrieve`, `nli`), label override, and cascade project delete.

### What is NOT yet implemented / Next milestones
- **Real ML/NLP pipeline** (`app/pipeline.py` currently uses deterministic regex/BoW/word-overlap placeholders):
  - Replace claim extraction with real NLP/LLM extractor
  - Replace 16-dim BoW embeddings with Sentence Transformers (optionally migrate `passage_embedding.vector` from `real[]` to `pgvector`)
  - Replace overlap heuristic with real NLI model (e.g., DeBERTa/RoBERTa NLI)
- **Production Frontend (React/Vue + Adaptive UI):** Interactive evidence graph (`US-05`, `US-05b`, `US-05c`, `US-07`), filtering by label/document, claim/excerpt detail drawer, mobile responsiveness.
- **Additional BA requirements:** Export results (`US-08`), rate limiting (`US-16`), async/background job execution if needed.
- **DevOps / Cloud (`US-12`, `US-13`, `US-14`):** App `Dockerfile`, full-stack `docker-compose.yml`, GitHub Actions CI (lint/test/build), cloud deployment + object storage (S3/R2) instead of local `storage/`.
- **API Docs polish (`US-06`, `US-06b`):** Complete OpenAPI schemas/examples and response models.

## 4. Key Engineering Invariants (Do Not Break)

1. **DDL-only schema:** All schema changes must go through `expertise-database/ddl/001_init.sql` (or versioned SQL migrations); never rely on manual GUI edits.
2. **Preserve `model_label`:** User label overrides write only to `claim_evidence.user_label`; never overwrite `model_label` (`US-09`).
3. **Project isolation & cascade deletion:** Keep cross-project triggers intact. When deleting a project (`US-11`), DB cascades rows, and app code must also remove files from `storage/` (or object storage).
4. **No secrets in git:** Keep `local-dev-only` strictly for local dev; use env vars (`DATABASE_URL`, `TOKEN_SECRET`, `STORAGE_DIR`) in production.

## 5. How to Run Locally

From `expertise-database/`:

```bash
docker compose up -d
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload
```

Run smoke test (while server is running):

```bash
.venv/bin/python scripts/smoke.py
```

Reset DB after DDL changes:

```bash
docker compose down -v && docker compose up -d
```
