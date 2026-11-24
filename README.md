# FactMap Scholar

Web service for extracting factual claims from scientific papers (PDF/TXT) and verifying them against retrieved passages using Natural Language Inference (`entailment`, `contradiction`, `neutral`).

Diploma project by Bahdan Kanoplich (EHU, Computer Science), supervised by Maksym Lipchanskyi (NTU "KhPI").

## Live deployment

- Web app: https://factmap-scholar-web.onrender.com
- API: https://factmap-scholar-api.onrender.com
- Swagger UI: https://factmap-scholar-api.onrender.com/docs
- ReDoc: https://factmap-scholar-api.onrender.com/redoc
- Health check: https://factmap-scholar-api.onrender.com/health

Hosted on Render free tier, so the first request after inactivity may take 30-50 seconds while the container wakes up.

## Where each criterion is implemented

### Front-end

- SPA (`React 19`, `TypeScript` strict without `any`, `Vite 8`): [frontend/](frontend/)
- Architecture diagram, user flows, stack choices, API usage: [docs/frontend/ARCHITECTURE.md](docs/frontend/ARCHITECTURE.md)
- Structure: `components/` (reusable UI kit and layout), `features/` (`auth`, `projects`, `workspace`), `pages/` (5 lazy-loaded routes + 404), `routes/`, `services/` (Axios client and interceptors), `store/` (Redux Toolkit slices and selectors), `models/`, `hooks/`, `styles/`
- Forms with validation: [AuthForm.tsx](frontend/src/features/auth/AuthForm.tsx), [CreateProjectForm.tsx](frontend/src/features/projects/CreateProjectForm.tsx), [DocumentUploader.tsx](frontend/src/features/workspace/DocumentUploader.tsx), [ClaimDetailDrawer.tsx](frontend/src/features/workspace/ClaimDetailDrawer.tsx)
- Error handling and loading states: [httpClient.ts](frontend/src/services/httpClient.ts), [ErrorBoundary.tsx](frontend/src/components/common/ErrorBoundary.tsx), [ToastContainer.tsx](frontend/src/components/common/ToastContainer.tsx), [Skeleton.tsx](frontend/src/components/common/Skeleton.tsx)
- Evidence graph and inspector: [EvidenceMap.tsx](frontend/src/features/workspace/EvidenceMap.tsx) (full-width interactive graph, auto-focus mode, verdict-priority sorting), [ClaimDetailDrawer.tsx](frontend/src/features/workspace/ClaimDetailDrawer.tsx) (overlay drawer with key-sentence highlighting and Show more/less), [ClaimsTable.tsx](frontend/src/features/workspace/ClaimsTable.tsx), [ProjectTable.tsx](frontend/src/features/projects/ProjectTable.tsx), collapsible navigation in [AppShell.tsx](frontend/src/components/layout/AppShell.tsx), and one-click Russian CyberLeninka demo launcher in [ProjectsPage.tsx](frontend/src/pages/ProjectsPage.tsx)
- Tests: 6 Vitest unit suites (21 tests) under `frontend/src/**/*.test.*` and Playwright E2E specs in [frontend/e2e/app.spec.ts](frontend/e2e/app.spec.ts) and [frontend/e2e/adaptive.spec.ts](frontend/e2e/adaptive.spec.ts)

### API documentation

- Portal index, strategy, versioning, changelog: [docs/api/README.md](docs/api/README.md)
- OpenAPI 3.1.0 spec (validated with Redocly CLI and `openapi-spec-validator`): [docs/api/openapi.yaml](docs/api/openapi.yaml), [docs/api/openapi.json](docs/api/openapi.json)
- Offline interactive ReDoc HTML: [docs/api/redoc.html](docs/api/redoc.html)
- Guides: [getting-started.md](docs/api/guides/getting-started.md), [authentication.md](docs/api/guides/authentication.md), [integration-tutorial.md](docs/api/guides/integration-tutorial.md), [advanced-topics.md](docs/api/guides/advanced-topics.md), [architecture.md](docs/api/guides/architecture.md)
- Reference and schemas: [endpoints.md](docs/api/reference/endpoints.md), [errors.md](docs/api/reference/errors.md), [models.md](docs/api/schemas/models.md)
- Runnable examples: [factmap_scholar.postman_collection.json](docs/api/examples/factmap_scholar.postman_collection.json), [walkthrough.sh](docs/api/examples/walkthrough.sh)

### Adaptive UI

- Mockups and component library PDF (Mobile 375px, Tablet 768px, Desktop 1440px, interactive states): [docs/adaptive-ui/Adaptive_UI_Specification_Kanoplich_Bahdan.pdf](docs/adaptive-ui/Adaptive_UI_Specification_Kanoplich_Bahdan.pdf)
- Breakpoints, contrast ratios, and notes: [docs/adaptive-ui/README.md](docs/adaptive-ui/README.md)
- Responsive CSS tokens, 44px touch targets, light/dark themes, keyboard-safe landscape rules: [tokens.css](frontend/src/styles/tokens.css), [layout.css](frontend/src/styles/layout.css), [components.css](frontend/src/styles/components.css), [AppShell.tsx](frontend/src/components/layout/AppShell.tsx)
- Device detection hook (`breakpoint`, DPR, orientation, aspect ratio): [useDeviceProfile.ts](frontend/src/hooks/useDeviceProfile.ts)
- Live component showcase route (`/design-system`): [DesignSystemPage.tsx](frontend/src/pages/DesignSystemPage.tsx)
- Multi-viewport Playwright checks (320px to 2560px, 0px horizontal overflow, >=44px touch targets): [adaptive.spec.ts](frontend/e2e/adaptive.spec.ts)

### Back-end

- Stack: FastAPI, PostgreSQL 16 ([backend/ddl/001_init.sql](backend/ddl/001_init.sql)), SQLAlchemy 2.0 ORM ([orm.py](backend/app/models/orm.py))
- Layered layout: `backend/app/api/v1/` (routers, including one-click `POST /api/v1/projects/demo` Russian CyberLeninka corpus), `backend/app/services/` (business logic), `backend/app/repositories/` (data access), `backend/app/models/` (ORM + Pydantic), `backend/app/core/` (config, security, errors, logging, metrics, rate limit, cache), `backend/app/ml/` (multilingual EN/RU chunking, claim extraction, retrieval, and NLI)
- Security: Argon2id password hashing + RFC 7519 Bearer JWT ([security.py](backend/app/core/security.py), [deps.py](backend/app/api/deps.py))
- Observability and errors: [exceptions.py](backend/app/core/exceptions.py), [logging.py](backend/app/core/logging.py) (`X-Request-ID`), [metrics.py](backend/app/core/metrics.py), [rate_limit.py](backend/app/core/rate_limit.py)
- Tests and quality checks: `pytest --cov=app --cov-fail-under=80` (17 passed, 88.2% coverage), `ruff check`, `pip-audit`
- Deployment and CI: [docker-compose.yml](docker-compose.yml), [backend/Dockerfile](backend/Dockerfile), [frontend/Dockerfile](frontend/Dockerfile), [render.yaml](render.yaml), [.github/workflows/ci.yml](.github/workflows/ci.yml)

## Running the project

### Docker Compose (full stack)

```bash
docker compose up --build
```

- Web UI: `http://localhost:8080`
- API / Swagger UI: `http://localhost:8000/docs`
- Health / Metrics: `http://localhost:8000/health`, `http://localhost:8000/metrics`

### Back-end local run and tests

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements-ci.txt   # or requirements.txt for local Transformers ML
ML_BACKEND=stub .venv/bin/uvicorn app.main:app --reload
```

Checks and tests:

```bash
cd backend
.venv/bin/ruff check app tests scripts
.venv/bin/pip-audit
ML_BACKEND=stub .venv/bin/pytest --cov=app --cov-report=term-missing --cov-fail-under=80 -v
```

### Front-end local run and tests

Requires Node.js 20+ and npm 10+.

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                  # http://localhost:5173 (proxies /api and /health to :8000)
```

Lint, build, and tests (no running backend required):

```bash
cd frontend
npm run lint
npm run format:check
npm run build
npm run test
npx playwright install chromium
npm run test:e2e
```

### API docs validation and cURL walkthrough

```bash
npx -y @redocly/cli@latest lint docs/api/openapi.yaml
bash docs/api/examples/walkthrough.sh          # requires running backend on :8000
```

## Repository layout

```text
diploma/
├── frontend/                  # React + TypeScript + Vite SPA
├── backend/                   # FastAPI backend + ML/NLI pipeline
├── docs/
│   ├── frontend/              # FE architecture, user flows, stack rationale
│   ├── adaptive-ui/           # Adaptive UI PDF specification and notes
│   ├── api/                   # OpenAPI 3.1 spec, ReDoc HTML, guides, Postman, cURL
│   └── ml/                    # SciFact retrieval/NLI and claim-span benchmarks
├── expertise-database/        # Stage 2 Database review package
├── docker-compose.yml         # Full-stack local container setup
├── render.yaml                # Render deployment blueprint
└── .github/workflows/ci.yml   # GitHub Actions CI checks
```

## Secrets

No API keys, JWT secrets, or production passwords are stored in the repository. Local configuration uses environment variables templated in [frontend/.env.example](frontend/.env.example) and [backend/.env.example](backend/.env.example).
