# Endpoint Reference

Base URL (local): `http://127.0.0.1:8000` (production: `https://factmap-scholar-api.onrender.com`).  
OpenAPI spec: [`../openapi.yaml`](../openapi.yaml). Errors: [`errors.md`](errors.md). Models: [`../schemas/models.md`](../schemas/models.md).

All responses echo `X-Request-ID`. Protected routes require `Authorization: Bearer <jwt>`.

## 1. System

### `GET /health`

- Auth: public (`security: []`)
- Status codes: `200`, `400`, `500`

```bash
curl -s http://127.0.0.1:8000/health
```

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

- Auth: public (`security: []`)
- Status codes: `200` (`text/plain` Prometheus format), `400`

```bash
curl -s http://127.0.0.1:8000/metrics | head -n 5
```

## 2. Authentication (`/api/v1/auth`)

### `POST /api/v1/auth/register`

- Auth: public (`security: []`)
- Status codes: `201`, `409` (`duplicate_email`), `422` (`validation_error`)

Request:

```json
{
  "email": "researcher@ehu.lt",
  "password": "StrongPassword123!",
  "display_name": "Bahdan Kanoplich"
}
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

Duplicate email (`409 Conflict`):

```json
{
  "code": "duplicate_email",
  "message": "An account with this email already exists",
  "request_id": "1c0f82a4-4f25-4e92-a705-32b5e0aa8331"
}
```

### `POST /api/v1/auth/login`

- Auth: public (`security: []`)
- Status codes: `200`, `401` (`invalid_login`), `422`

Request:

```json
{
  "email": "researcher@ehu.lt",
  "password": "StrongPassword123!"
}
```

Response (`200 OK`): `AuthOut` (same shape as `/register`).

Invalid credentials (`401 Unauthorized`):

```json
{
  "code": "invalid_login",
  "message": "Invalid email or password",
  "request_id": "77b41c1a-41b4-40e0-965f-94f8f5d158a2"
}
```

### `GET /api/v1/auth/me`

- Auth: `HTTPBearer`
- Status codes: `200`, `401` (`unauthorized`)

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "email": "researcher@ehu.lt",
  "display_name": "Bahdan Kanoplich"
}
```

## 3. Projects (`/api/v1/projects`)

### `GET /api/v1/projects`

- Auth: `HTTPBearer`
- Query params: `limit` (`1..200`, default `50`), `offset` (`>= 0`, default `0`)
- Status codes: `200`, `401`, `422`

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

- Auth: `HTTPBearer`
- Status codes: `201`, `401`, `409` (`duplicate_name`), `422` (`empty_name` / `validation_error`)

```json
{
  "name": "Scientific NLI Literature Review"
}
```

### `DELETE /api/v1/projects/{project_id}`

- Auth: `HTTPBearer`
- Path param: `project_id` (UUID)
- Cascades all documents, passages, claims, evidence rows, and stored files.
- Status codes: `200`, `401`, `404`, `422`

```json
{
  "deleted": "a3fc0bc4-b7be-46b2-abf3-273bf7c2737a"
}
```

## 4. Documents (`/api/v1/projects/{project_id}/documents`)

### `GET /api/v1/projects/{project_id}/documents`

- Auth: `HTTPBearer`
- Query params: `limit` (`1..200`, default `50`), `offset` (`>= 0`, default `0`)
- Status codes: `200`, `401`, `404`, `422`

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

- Auth: `HTTPBearer`, rate limited (`60 req/min`)
- Body: `multipart/form-data` with field `file` (`application/pdf` or `text/plain`, `1..20971520` bytes)
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-Request-ID`
- Status codes:
  - `201`: `DocumentOut`
  - `401`: unauthorized
  - `404`: project not found
  - `409`: `duplicate_file` (same SHA-256 already in project)
  - `413`: `bad_size` (empty or > 20 MB)
  - `415`: `bad_type` (unsupported MIME type)
  - `422`: `extract_failed` (unreadable or empty extracted text)
  - `429`: `rate_limited` (`Retry-After` header included)

```bash
curl -s -X POST "http://127.0.0.1:8000/api/v1/projects/$PROJECT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@paper.pdf;type=application/pdf"
```

## 5. Analysis (`/api/v1/projects/{project_id}`)

### `POST /api/v1/projects/{project_id}/analyze`

- Auth: `HTTPBearer`, rate limited (`60 req/min`)
- Query param: `sync` (boolean, default `false`)
- Status codes: `202`, `401`, `404`, `409` (`not_ready` or `already_running`), `422`, `429`

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

- Auth: `HTTPBearer`
- Status codes: `200`, `401`, `404`

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

## 6. Claims, Graph, Overrides, and Export

### `GET /api/v1/projects/{project_id}/claims`

- Auth: `HTTPBearer`
- Query params: `label` (`entailment|contradiction|neutral`), `document_id` (UUID), `search` (substring), `limit` (`1..200`, default `50`), `offset` (`>= 0`, default `0`)
- Status codes: `200`, `401`, `404`, `422`

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

- Auth: `HTTPBearer`
- Query params: `label`, `document_id`, `include_neutral` (boolean, default `true`)
- Status codes: `200`, `401`, `404`, `422`

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

- Auth: `HTTPBearer`
- Query params: `format` (`json` or `csv`, default `json`), `label`, `document_id`
- Status codes: `200` (`application/json` or `text/csv`), `401`, `404`, `422`

### `PATCH /api/v1/evidence/{evidence_id}`

- Auth: `HTTPBearer`
- Sets or clears `user_label` (`entailment`, `contradiction`, `neutral`, or `null`) without changing `model_label`.
- Status codes: `200`, `401`, `404`, `422`

Request:

```json
{
  "user_label": "contradiction"
}
```

Response (`200 OK`):

```json
{
  "id": "e4f2c1a0-8114-4d6b-9f12-2d1d6a1a4e09",
  "user_label": "contradiction"
}
```
