# Complete API Endpoint Reference

Base URL (local): `http://127.0.0.1:8000`  
OpenAPI 3.1.0 Contract: [`../openapi.yaml`](../openapi.yaml) · Error Reference: [`errors.md`](errors.md) · Data Models: [`../schemas/models.md`](../schemas/models.md)

Every response includes `X-Request-ID` for log correlation. Protected endpoints require `Authorization: Bearer <jwt>`.

---

## 1. System Endpoints

### `GET /health`
- **Auth:** Public (`security: []`)
- **Purpose:** Verify API availability, version, and active ML configuration.
- **Status Codes:** `200 OK`, `400 Bad Request`, `500 Internal Server Error`

**Sample Request:**
```bash
curl -s http://127.0.0.1:8000/health
```

**Sample Response (`200 OK`):**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "ml_backend": "transformers",
  "embedding_model": "BAAI/bge-small-en-v1.5",
  "nli_model": "cross-encoder/nli-deberta-v3-xsmall"
}
```

### `GET /metrics`
- **Auth:** Public (`security: []`)
- **Purpose:** Expose Prometheus text exposition metrics (`factmap_http_requests_total`, `factmap_http_request_duration_seconds`).
- **Status Codes:** `200 OK` (`text/plain`), `400 Bad Request`

**Sample Request:**
```bash
curl -s http://127.0.0.1:8000/metrics | head -n 5
```

---

## 2. Authentication (`/api/v1/auth`)

### `POST /api/v1/auth/register`
- **Auth:** Public (`security: []`)
- **Purpose:** Register a researcher account (Argon2id password hash) and issue a Bearer JWT.
- **Status Codes:** `201 Created`, `409 Conflict` (`duplicate_email`), `422 Unprocessable Entity` (`validation_error`)

**Sample Request:**
```json
{
  "email": "researcher@ehu.lt",
  "password": "StrongPassword123!",
  "display_name": "Bahdan Kanoplich"
}
```

**Sample Response (`201 Created`):**
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

**Edge-Case Error (`409 Conflict`):**
```json
{
  "code": "duplicate_email",
  "message": "An account with this email already exists",
  "request_id": "1c0f82a4-4f25-4e92-a705-32b5e0aa8331"
}
```

### `POST /api/v1/auth/login`
- **Auth:** Public (`security: []`)
- **Purpose:** Authenticate an existing account and obtain a Bearer JWT.
- **Status Codes:** `200 OK`, `401 Unauthorized` (`invalid_login`), `422 Unprocessable Entity`

**Sample Request:**
```json
{
  "email": "researcher@ehu.lt",
  "password": "StrongPassword123!"
}
```

**Sample Response (`200 OK`):** Same `AuthOut` schema as `/register`.

**Error (`401 Unauthorized`):**
```json
{
  "code": "invalid_login",
  "message": "Invalid email or password",
  "request_id": "77b41c1a-41b4-40e0-965f-94f8f5d158a2"
}
```

### `GET /api/v1/auth/me`
- **Auth:** `HTTPBearer`
- **Purpose:** Return the authenticated researcher's profile (`UserOut`).
- **Status Codes:** `200 OK`, `401 Unauthorized` (`unauthorized`)

**Sample Response (`200 OK`):**
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "email": "researcher@ehu.lt",
  "display_name": "Bahdan Kanoplich"
}
```

---

## 3. Projects (`/api/v1/projects`)

### `GET /api/v1/projects`
- **Auth:** `HTTPBearer`
- **Query Params:** `limit` (`1..200`, default `50`), `offset` (`>= 0`, default `0`)
- **Status Codes:** `200 OK`, `401 Unauthorized`, `422 Unprocessable Entity`

**Sample Response (`200 OK`):**
```json
{
  "projects": [
    {
      "id": "a3fc0bc4-b7be-46b2-abf3-273bf7c2737a",
      "name": "Scientific NLI Literature Review",
      "document_count": 2,
      "claim_count": 14,
      "created_at": "2026-11-24T10:15:00+00:00"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### `POST /api/v1/projects`
- **Auth:** `HTTPBearer`
- **Purpose:** Create a new owner-scoped project workspace.
- **Status Codes:** `201 Created`, `401 Unauthorized`, `409 Conflict` (`duplicate_name`), `422 Unprocessable Entity` (`empty_name` / `validation_error`)

**Sample Request:**
```json
{
  "name": "Scientific NLI Literature Review"
}
```

**Sample Response (`201 Created`):** `ProjectOut` object.

### `DELETE /api/v1/projects/{project_id}`
- **Auth:** `HTTPBearer`
- **Path Params:** `project_id` (UUID)
- **Purpose:** Permanently delete a project and cascade all documents, passages, claims, evidence edges, and stored files (GDPR US-11).
- **Status Codes:** `200 OK`, `401 Unauthorized`, `404 Not Found`, `422 Unprocessable Entity`

**Sample Response (`200 OK`):**
```json
{
  "deleted": "a3fc0bc4-b7be-46b2-abf3-273bf7c2737a"
}
```

---

## 4. Documents (`/api/v1/projects/{project_id}/documents`)

### `GET /api/v1/projects/{project_id}/documents`
- **Auth:** `HTTPBearer`
- **Query Params:** `limit` (`1..200`, default `50`), `offset` (`>= 0`, default `0`)
- **Status Codes:** `200 OK`, `401 Unauthorized`, `404 Not Found`, `422 Unprocessable Entity`

**Sample Response (`200 OK`):**
```json
{
  "documents": [
    {
      "id": "60912035-012f-4d08-8c1e-f7d3b3b42fb2",
      "original_name": "scifact_2020.pdf",
      "media_type": "application/pdf",
      "size_bytes": 482910,
      "status": "ready",
      "error_message": null,
      "page_count": 11,
      "created_at": "2026-11-24T10:16:00+00:00"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### `POST /api/v1/projects/{project_id}/documents`
- **Auth:** `HTTPBearer` + Sliding-Window Rate Limiter (`60 req/min`)
- **Content-Type:** `multipart/form-data` (`file`: `.pdf` or `.txt`, 1 byte..20 MB)
- **Response Headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-Request-ID`
- **Status Codes:**
  - `201 Created` (`DocumentOut`)
  - `401 Unauthorized`
  - `404 Not Found` (project missing or owned by another user)
  - `409 Conflict` (`duplicate_file` — identical SHA-256 already exists in project)
  - `413 Payload Too Large` (`bad_size` — empty or > 20 MB)
  - `415 Unsupported Media Type` (`bad_type` — only `application/pdf` and `text/plain`)
  - `422 Unprocessable Entity` (`extract_failed` — unreadable/scanned PDF with no text)
  - `429 Too Many Requests` (`rate_limited` + `Retry-After`)

**Sample Request:**
```bash
curl -s -X POST "http://127.0.0.1:8000/api/v1/projects/$PROJECT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@paper.pdf;type=application/pdf"
```

---

## 5. Analysis Pipeline (`/api/v1/projects/{project_id}`)

### `POST /api/v1/projects/{project_id}/analyze`
- **Auth:** `HTTPBearer` + Sliding-Window Rate Limiter (`60 req/min`)
- **Query Params:** `sync` (boolean, default `false` — inline execution for tests/CLI only)
- **Status Codes:**
  - `202 Accepted` (`AnalyzeStartedOut`)
  - `401 Unauthorized`
  - `404 Not Found`
  - `409 Conflict` (`not_ready` if no ready docs, or `already_running` if active jobs exist)
  - `429 Too Many Requests`

**Sample Response (`202 Accepted`):**
```json
{
  "status": "queued",
  "project_id": "a3fc0bc4-b7be-46b2-abf3-273bf7c2737a",
  "job_ids": [
    "9f2b1c10-20c8-4c59-a8b8-c74a498f5c10",
    "4d3e8a21-6c8b-4a91-9f33-b81e7e99f1c2",
    "7c91e04b-5572-4d4a-94ab-12c9f15a4a01"
  ]
}
```

### `GET /api/v1/projects/{project_id}/jobs`
- **Auth:** `HTTPBearer`
- **Purpose:** Poll recent ML pipeline stage jobs (`extract_text`, `extract_claims`, `retrieve`, `nli`) and completion percentages (`0..100`).
- **Status Codes:** `200 OK`, `401 Unauthorized`, `404 Not Found`

**Sample Response (`200 OK`):**
```json
{
  "jobs": [
    {
      "id": "7c91e04b-5572-4d4a-94ab-12c9f15a4a01",
      "kind": "nli",
      "status": "succeeded",
      "progress_pct": 100,
      "error_message": null,
      "created_at": "2026-11-24T10:17:00+00:00",
      "started_at": "2026-11-24T10:17:01+00:00",
      "finished_at": "2026-11-24T10:17:04+00:00"
    }
  ]
}
```

---

## 6. Claims, Evidence Graph, Overrides & Export

### `GET /api/v1/projects/{project_id}/claims`
- **Auth:** `HTTPBearer`
- **Query Params:**
  - `label`: `entailment | contradiction | neutral` (filters by `effective_label`)
  - `document_id`: UUID (filters claims/evidence touching this document)
  - `search`: case-insensitive substring across claim text and source document title
  - `limit`: `1..200` (default `50`), `offset`: `>= 0` (default `0`)
- **Status Codes:** `200 OK`, `401 Unauthorized`, `404 Not Found`, `422 Unprocessable Entity`

**Sample Response (`200 OK`):**
```json
{
  "claims": [
    {
      "id": "c1f80e44-29d7-4f88-9b7a-12d390ab4f10",
      "source_document_id": "60912035-012f-4d08-8c1e-f7d3b3b42fb2",
      "source_name": "scifact_2020.pdf",
      "page_no": 2,
      "char_start": 412,
      "char_end": 538,
      "text": "Dense retrieval improves recall on scientific claim verification benchmarks.",
      "confidence": 0.892,
      "extractor_name": "local-hybrid-claim-v1:BAAI/bge-small-en-v1.5",
      "has_evidence": true,
      "evidence": [
        {
          "id": "e4f2c1a0-8114-4d6b-9f12-2d1d6a1a4e09",
          "passage_id": "p981a3d0-...",
          "document_id": "d8812f01-...",
          "document_name": "scinli_2022.pdf",
          "page_no": 4,
          "char_start": 1204,
          "char_end": 1480,
          "passage_text": "Dense passage embeddings yielded a 14% recall gain over lexical baselines.",
          "model_name": "cross-encoder/nli-deberta-v3-xsmall",
          "model_label": "entailment",
          "model_score": 0.864,
          "user_label": null,
          "effective_label": "entailment"
        }
      ]
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0,
  "jobs": []
}
```

### `GET /api/v1/projects/{project_id}/graph`
- **Auth:** `HTTPBearer`
- **Query Params:** `label`, `document_id`, `include_neutral` (boolean, default `true`)
- **Status Codes:** `200 OK`, `401 Unauthorized`, `404 Not Found`, `422 Unprocessable Entity`

**Sample Response (`200 OK`):**
```json
{
  "project_id": "a3fc0bc4-b7be-46b2-abf3-273bf7c2737a",
  "nodes": [
    { "id": "doc:60912035-...", "type": "document", "label": "scifact_2020.pdf", "document_id": "60912035-...", "page_no": null, "has_evidence": null, "confidence": null },
    { "id": "claim:c1f80e44-...", "type": "claim", "label": "Dense retrieval improves recall...", "document_id": "60912035-...", "page_no": 2, "has_evidence": true, "confidence": 0.892 },
    { "id": "passage:p981a3d0-...", "type": "passage", "label": "Dense passage embeddings yielded...", "document_id": "d8812f01-...", "page_no": 4, "has_evidence": null, "confidence": null }
  ],
  "edges": [
    { "id": "src:c1f80e44-...", "source": "doc:60912035-...", "target": "claim:c1f80e44-...", "kind": "extracted_from", "label": null, "model_label": null, "user_label": null, "score": null },
    { "id": "e4f2c1a0-...", "source": "claim:c1f80e44-...", "target": "passage:p981a3d0-...", "kind": "evidence", "label": "entailment", "model_label": "entailment", "user_label": null, "score": 0.864 }
  ]
}
```

### `GET /api/v1/projects/{project_id}/export`
- **Auth:** `HTTPBearer`
- **Query Params:** `format` (`json` | `csv`, default `json`), `label`, `document_id`
- **Status Codes:** `200 OK` (`application/json` or `text/csv` attachment), `401 Unauthorized`, `404 Not Found`, `422 Unprocessable Entity`

### `PATCH /api/v1/evidence/{evidence_id}`
- **Auth:** `HTTPBearer`
- **Purpose:** Override an evidence edge's NLI label (`user_label`) while preserving `model_label` and `model_score`. Pass `null` to restore the model's prediction.
- **Status Codes:** `200 OK`, `401 Unauthorized`, `404 Not Found`, `422 Unprocessable Entity`

**Sample Request:**
```json
{
  "user_label": "contradiction"
}
```

**Sample Response (`200 OK`):**
```json
{
  "id": "e4f2c1a0-8114-4d6b-9f12-2d1d6a1a4e09",
  "user_label": "contradiction"
}
```
