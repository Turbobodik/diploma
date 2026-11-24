# FactMap Scholar API Documentation

OpenAPI version: `3.1.0`. API version: `1.0.0` (`/api/v1`).

REST API for uploading scientific publications (PDF/TXT), extracting verbatim claims with character spans, retrieving candidate passages with dense embeddings, running 3-way NLI verification (`entailment`, `contradiction`, `neutral`), querying the evidence graph, saving human overrides, and exporting JSON/CSV.

## Contents

| Section | File | Description |
|---|---|---|
| OpenAPI spec (YAML) | [openapi.yaml](openapi.yaml) | Validated OpenAPI 3.1.0 specification |
| OpenAPI spec (JSON) | [openapi.json](openapi.json) | JSON copy of the OpenAPI specification |
| Static ReDoc HTML | [redoc.html](redoc.html) | Offline interactive API reference |
| Getting Started | [guides/getting-started.md](guides/getting-started.md) | Local setup and first authenticated requests |
| Authentication | [guides/authentication.md](guides/authentication.md) | Argon2id, Bearer JWT structure, security notes |
| Integration Tutorial | [guides/integration-tutorial.md](guides/integration-tutorial.md) | End-to-end workflow from upload to graph and export |
| Advanced Topics | [guides/advanced-topics.md](guides/advanced-topics.md) | Async job polling, pagination, rate limits, idempotency, tracing, versioning |
| Architecture | [guides/architecture.md](guides/architecture.md) | System context, layered backend diagram, request sequence |
| Endpoint Reference | [reference/endpoints.md](reference/endpoints.md) | All 16 endpoints with sample requests, responses, and status codes |
| Error Reference | [reference/errors.md](reference/errors.md) | `ErrorOut` format, all 16 error codes, recovery actions |
| Data Models | [schemas/models.md](schemas/models.md) | Request/response schemas, constraints, enums |
| Postman Collection | [examples/factmap_scholar.postman_collection.json](examples/factmap_scholar.postman_collection.json) | Postman v2.1 collection with automatic token and ID capture |
| cURL Walkthrough | [examples/walkthrough.sh](examples/walkthrough.sh) | Executable shell script covering the full lifecycle |

## Interactive viewers

- Offline ReDoc: open [`docs/api/redoc.html`](redoc.html) in a browser.
- Live Swagger UI (with `HTTPBearer` Authorize): `http://127.0.0.1:8000/docs` or https://factmap-scholar-api.onrender.com/docs.
- Live ReDoc: `http://127.0.0.1:8000/redoc` or https://factmap-scholar-api.onrender.com/redoc.

## Documentation strategy

### Tooling and validation

- OpenAPI 3.1.0 files are exported from FastAPI + Pydantic v2 schemas (`backend/app/models/schemas.py`) using [`backend/scripts/export_openapi.py`](../../backend/scripts/export_openapi.py).
- Specs are validated with `openapi-spec-validator` and `npx -y @redocly/cli@latest lint docs/api/openapi.yaml` (0 errors, 0 warnings).
- Live responses are checked against documented behavior in [`backend/tests/test_api_schema.py`](../../backend/tests/test_api_schema.py) and [`backend/tests/test_api_integration.py`](../../backend/tests/test_api_integration.py).
- Static HTML docs are built with `@redocly/cli build-docs docs/api/openapi.yaml -o docs/api/redoc.html`.

### Conventions

- URIs use plural lowercase nouns under `/api/v1` (`/api/v1/projects/{project_id}/claims`), with `/health` and `/metrics` at root.
- JSON fields use `snake_case`.
- Entity IDs are UUIDv4 strings; timestamps are ISO-8601 UTC.
- Error responses use `ErrorOut` (`code`, `message`, `request_id`) and echo `X-Request-ID`.

### Versioning

- Breaking changes increment the URI major version (`/api/v1` -> `/api/v2`).
- Backwards-compatible additions (optional fields, query params with defaults, new endpoints) stay in `/api/v1`.
- Deprecations are announced via `Deprecation` / `Sunset` headers and noted in the changelog below.

### Known limitations

- Rate limiting (`60 req/min` per user+IP) uses an in-memory sliding window; multi-instance deployments need a shared Redis backend.
- `?sync=true` on `/analyze` is for tests and CLI scripts only; production clients should poll `/jobs`.
- JWT access tokens are stateless until `exp` (`JWT_TTL_SECONDS`, default 24h); refresh rotation and revocation lists are not yet implemented.

## Changelog

### v1.0.0 (2026-11-24)

- Initial `/api/v1` release: auth (`/register`, `/login`, `/me`), projects CRUD with cascade delete, PDF/TXT upload with SHA-256 deduplication, async analysis jobs and polling, filtered claims, evidence graph, NLI label overrides preserving `model_label`, JSON/CSV export, rate limiting, `X-Request-ID` tracing, `/health`, and `/metrics`.
- Added Redocly-validated OpenAPI 3.1.0 YAML/JSON, static ReDoc HTML, guides, Postman collection, and cURL walkthrough.
