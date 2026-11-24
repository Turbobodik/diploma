# FactMap Scholar — API Documentation Portal

> **OpenAPI Specification:** `3.1.0` · **API Version:** `1.0.0` (`/api/v1`) · **Validation:** Redocly CLI (0 errors, 0 warnings) & `openapi-spec-validator`

FactMap Scholar exposes a resource-oriented REST API for extracting atomic scientific claims from PDF/TXT publications, retrieving cross-document candidate passages with dense embeddings, classifying claim–passage pairs via 3-way Natural Language Inference (`entailment`, `contradiction`, `neutral`), querying the resulting evidence graph, recording human overrides, and exporting structured JSON/CSV datasets.

---

## Table of Contents

| Section | File | Description |
|---|---|---|
| **OpenAPI Specification (YAML)** | [`openapi.yaml`](openapi.yaml) | Validated OpenAPI 3.1.0 contract (source of truth) |
| **OpenAPI Specification (JSON)** | [`openapi.json`](openapi.json) | Machine-readable JSON mirror for tooling & SDK generation |
| **Interactive Static Docs (ReDoc)** | [`redoc.html`](redoc.html) | Self-contained offline interactive API reference (open directly in any browser) |
| **Getting Started** | [`guides/getting-started.md`](guides/getting-started.md) | 5-minute onboarding from local startup to first authenticated API call |
| **Authentication & Security** | [`guides/authentication.md`](guides/authentication.md) | Argon2id + RFC 7519 Bearer JWT lifecycle, claims, headers, and security warnings |
| **Step-by-Step Integration Tutorial** | [`guides/integration-tutorial.md`](guides/integration-tutorial.md) | Complete scientific verification workflow from upload to NLI graph & CSV/JSON export |
| **Advanced API Topics** | [`guides/advanced-topics.md`](guides/advanced-topics.md) | Async job polling, pagination, rate limiting, SHA-256 idempotency, tracing & versioning |
| **API Architecture & Flows** | [`guides/architecture.md`](guides/architecture.md) | System context, layered component diagram, and request–response sequence diagrams |
| **Complete Endpoint Reference** | [`reference/endpoints.md`](reference/endpoints.md) | Every endpoint with parameters, sample requests, responses, status codes, and edge cases |
| **Error Taxonomy & Recovery** | [`reference/errors.md`](reference/errors.md) | `ErrorOut` envelope, all 16 `ErrorCode` values, HTTP statuses, and recovery actions |
| **Data Models & Schemas** | [`schemas/models.md`](schemas/models.md) | Complete schema reference, constraints, and enum values |
| **Postman Collection** | [`examples/factmap_scholar.postman_collection.json`](examples/factmap_scholar.postman_collection.json) | Importable Postman v2.1 collection with automatic token & ID capture |
| **Runnable cURL Walkthrough** | [`examples/walkthrough.sh`](examples/walkthrough.sh) | End-to-end executable `curl` script exercising the full API lifecycle |

---

## Accessing Interactive Documentation

1. **Offline Static ReDoc (no server required):** Open [`docs/api/redoc.html`](redoc.html) directly in any modern browser.
2. **Live Swagger UI (with `Authorize` Bearer JWT support):** Start the backend (`uvicorn app.main:app --reload`) and visit `http://127.0.0.1:8000/docs`.
3. **Live ReDoc:** Visit `http://127.0.0.1:8000/redoc`.

---

## Documentation Strategy

### Standards & Tooling
- **Contract-first + Code-synced OpenAPI 3.1.0:** FastAPI + Pydantic v2 schemas (`backend/app/models/schemas.py`) generate the spec via [`backend/scripts/export_openapi.py`](../../backend/scripts/export_openapi.py).
- **Automated Validation:** Specs are validated with both `openapi-spec-validator` (Python) and `@redocly/cli lint docs/api/openapi.yaml` (recommended ruleset — **0 errors, 0 warnings**).
- **Contract Verification:** Automated schema and integration tests in [`backend/tests/test_api_schema.py`](../../backend/tests/test_api_schema.py) and [`backend/tests/test_api_integration.py`](../../backend/tests/test_api_integration.py) verify live responses match documented models.
- **Static Publishing:** `@redocly/cli build-docs docs/api/openapi.yaml -o docs/api/redoc.html` produces an offline-ready ReDoc bundle alongside structured Markdown guides.

### Naming & Formatting Conventions
- **URI Structure:** Plural lowercase nouns under a major version prefix (`/api/v1/projects/{project_id}/claims`), with system probes (`/health`, `/metrics`) at root.
- **JSON Field Naming:** Consistent `snake_case` across all request/response payloads.
- **Timestamps & Identifiers:** UUIDv4 identifiers for all domain entities; ISO-8601 UTC timestamps (`YYYY-MM-DDTHH:MM:SS+00:00`).
- **Error Envelope:** Every `4xx`/`5xx` error returns the uniform `ErrorOut` schema (`code`, `message`, `request_id`) and echoes `X-Request-ID`.

### Versioning Policy
- **URI Major Versioning:** Breaking changes increment the URI major version (`/api/v1` → `/api/v2`).
- **Backwards-Compatible Additions:** Optional response fields, new query parameters with defaults, and new endpoints are added within `/api/v1` without breaking existing clients.
- **Deprecation Process:** Deprecated endpoints announce `Deprecation` / `Sunset` headers and are documented in the Changelog below for at least one full release cycle before removal.

### Known Limitations
- **Rate Limiting Backend:** Default sliding-window rate limiter (`60 req/min` per user+IP) runs in-memory; multi-replica deployments should configure a shared Redis store.
- **Synchronous `sync=true` Flag:** Intended only for local smoke tests and CLI scripts; production clients must use asynchronous polling via `GET /api/v1/projects/{project_id}/jobs`.
- **Token Revocation:** Access tokens are stateless JWTs valid until `exp` (`JWT_TTL_SECONDS`, default 24 h); refresh token rotation and server-side revocation lists are planned for `v1.1`.

---

## Changelog

### `v1.0.0` — 2026-11-24
- Initial stable release of FactMap Scholar REST API (`/api/v1`).
- Added Argon2id + RFC 7519 Bearer JWT authentication (`/auth/register`, `/auth/login`, `/auth/me`).
- Added project workspace lifecycle with GDPR cascading delete (`/projects`).
- Added PDF/TXT document upload with SHA-256 deduplication and 20 MB validation (`/documents`).
- Added asynchronous ML pipeline trigger & stage polling (`/analyze`, `/jobs`).
- Added filtered/paginated claims, interactive evidence graph, researcher label override preserving `model_label`, and JSON/CSV export (`/claims`, `/graph`, `/evidence/{id}`, `/export`).
- Added sliding-window rate limiting (`60 req/min`), `X-Request-ID` tracing, `/health`, and Prometheus `/metrics`.
- Validated OpenAPI 3.1.0 YAML/JSON specs with Redocly CLI (0 errors, 0 warnings) and published static ReDoc HTML, Postman collection, and `curl` walkthrough.
