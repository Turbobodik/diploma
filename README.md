# FactMap Scholar — Diploma Project

**Web service for automatic extraction and verification of scientific claims based on Natural Language Inference (NLI).**

- **Student:** Bahdan Kanoplich (EHU, Computer Science, 4th year)
- **Supervisor:** Maksym Lipchanskyi (NTU "KhPI")

FactMap Scholar lets researchers upload scientific publications (PDF/TXT) into isolated project workspaces, extract verbatim factual claims with exact character spans, retrieve candidate passages across documents using dense embeddings, classify claim–passage pairs with 3-way NLI (`entailment`, `contradiction`, `neutral`), and explore or audit the resulting interactive **Evidence Map**.

---

## Stage 3 — Front-End Criterion Compliance Map

Every requirement for the **Front-End Architecture and Development** review is implemented and verifiable at the paths below:

| Requirement | Implementation Location |
|---|---|
| **SPA built with modern framework + bundler** | `frontend/` — React 19 + TypeScript (`strict: true`, zero `any`) + Vite 8 ([`frontend/package.json`](frontend/package.json), [`frontend/vite.config.ts`](frontend/vite.config.ts)) |
| **Architecture diagram, user flows, tech stack justification & API docs** | [`docs/frontend/ARCHITECTURE.md`](docs/frontend/ARCHITECTURE.md) + OpenAPI 3.1 spec in [`docs/api/openapi.yaml`](docs/api/openapi.yaml) |
| **Component-based structure (`components`, `pages`, `features`, `services`, `models`, `store`, `hooks`, `styles`)** | Reusable UI kit in [`frontend/src/components/`](frontend/src/components/), lazy-loaded route pages in [`frontend/src/pages/`](frontend/src/pages/), domain features in [`frontend/src/features/`](frontend/src/features/), API services in [`frontend/src/services/`](frontend/src/services/), Redux Toolkit store in [`frontend/src/store/`](frontend/src/store/) |
| **Routing & Lazy Loading (5 routes + 404)** | [`frontend/src/routes/AppRouter.tsx`](frontend/src/routes/AppRouter.tsx), [`frontend/src/routes/ProtectedRoute.tsx`](frontend/src/routes/ProtectedRoute.tsx) (`/login`, `/projects`, `/projects/:projectId`, `/settings`, `/design-system`) |
| **Forms with validation** | [`AuthForm.tsx`](frontend/src/features/auth/AuthForm.tsx), [`CreateProjectForm.tsx`](frontend/src/features/projects/CreateProjectForm.tsx), [`DocumentUploader.tsx`](frontend/src/features/workspace/DocumentUploader.tsx), [`ClaimDetailDrawer.tsx`](frontend/src/features/workspace/ClaimDetailDrawer.tsx) |
| **Global error handling & loading states** | Axios interceptors (`401/403/404/409/413/415/422/429/500`) in [`httpClient.ts`](frontend/src/services/httpClient.ts), React [`ErrorBoundary.tsx`](frontend/src/components/common/ErrorBoundary.tsx), [`ToastContainer.tsx`](frontend/src/components/common/ToastContainer.tsx), [`Skeleton.tsx`](frontend/src/components/common/Skeleton.tsx) |
| **Data tables, filtering, search, sorting & interactive visualization** | [`ProjectTable.tsx`](frontend/src/features/projects/ProjectTable.tsx), [`ClaimsTable.tsx`](frontend/src/features/workspace/ClaimsTable.tsx), interactive pan/zoom SVG [`EvidenceMap.tsx`](frontend/src/features/workspace/EvidenceMap.tsx) |
| **Code quality (ESLint + Prettier + strict TS)** | [`frontend/eslint.config.js`](frontend/eslint.config.js), [`frontend/.prettierrc`](frontend/.prettierrc), [`frontend/tsconfig.app.json`](frontend/tsconfig.app.json) |
| **Unit tests (≥ 3 key components — 6 suites implemented)** | [`AuthForm.test.tsx`](frontend/src/features/auth/AuthForm.test.tsx), [`CreateProjectForm.test.tsx`](frontend/src/features/projects/CreateProjectForm.test.tsx), [`ClaimDetailDrawer.test.tsx`](frontend/src/features/workspace/ClaimDetailDrawer.test.tsx), [`EvidenceMap.test.tsx`](frontend/src/features/workspace/EvidenceMap.test.tsx), [`httpClient.test.ts`](frontend/src/services/httpClient.test.ts), [`projectsSlice.test.ts`](frontend/src/store/projectsSlice.test.ts) |
| **E2E tests (1–2 tests — 2 Playwright flows implemented)** | [`frontend/e2e/app.spec.ts`](frontend/e2e/app.spec.ts), [`frontend/playwright.config.ts`](frontend/playwright.config.ts) |
| **Advanced / Bonus (Theme, Scale, Responsive Mobile Nav, Design System)** | Light/Dark theme + text scale in [`SettingsPage.tsx`](frontend/src/pages/SettingsPage.tsx), live `useDeviceProfile` in [`useDeviceProfile.ts`](frontend/src/hooks/useDeviceProfile.ts), component showcase in [`DesignSystemPage.tsx`](frontend/src/pages/DesignSystemPage.tsx) |

---

## Stage 3 — API Documentation Criterion Compliance Map

Every requirement for the **API Documentation** review is implemented and verifiable at the paths below:

| Requirement | Implementation Location |
|---|---|
| **Validated OpenAPI 3.1.0 Specification (YAML & JSON)** | [`docs/api/openapi.yaml`](docs/api/openapi.yaml) & [`docs/api/openapi.json`](docs/api/openapi.json) — validated with Redocly CLI (**0 errors, 0 warnings**) & `openapi-spec-validator` ([`backend/scripts/export_openapi.py`](backend/scripts/export_openapi.py)) |
| **Documentation Portal, Strategy, Versioning & Changelog** | [`docs/api/README.md`](docs/api/README.md) (TOC, tooling, naming conventions, versioning policy, known limitations, changelog) |
| **Complete Endpoint Reference (all 16 endpoints, requests/responses/codes)** | [`docs/api/reference/endpoints.md`](docs/api/reference/endpoints.md) |
| **Error Taxonomy & Recovery Guide (`ErrorOut` + 16 `ErrorCode` values)** | [`docs/api/reference/errors.md`](docs/api/reference/errors.md) |
| **Data Models & Enum Schemas** | [`docs/api/schemas/models.md`](docs/api/schemas/models.md) |
| **Getting Started Guide** | [`docs/api/guides/getting-started.md`](docs/api/guides/getting-started.md) |
| **Authentication & Security Deep Dive (Argon2id + RFC 7519 JWT)** | [`docs/api/guides/authentication.md`](docs/api/guides/authentication.md) |
| **Step-by-Step Integration Tutorial** | [`docs/api/guides/integration-tutorial.md`](docs/api/guides/integration-tutorial.md) |
| **Advanced Topics (Async Polling, Pagination, Rate Limits, Tracing, Idempotency)** | [`docs/api/guides/advanced-topics.md`](docs/api/guides/advanced-topics.md) |
| **API Architecture & Sequence Diagrams** | [`docs/api/guides/architecture.md`](docs/api/guides/architecture.md) |
| **Developer-Accessible Interactive Publishing** | Offline static ReDoc bundle [`docs/api/redoc.html`](docs/api/redoc.html) + live Swagger UI (`/docs`, with `HTTPBearer` Authorize) + live ReDoc (`/redoc`) |
| **Runnable Examples (Postman & cURL)** | [`docs/api/examples/factmap_scholar.postman_collection.json`](docs/api/examples/factmap_scholar.postman_collection.json) & [`docs/api/examples/walkthrough.sh`](docs/api/examples/walkthrough.sh) |
| **Contract & Schema Verification Tests** | [`backend/tests/test_api_schema.py`](backend/tests/test_api_schema.py) & [`backend/tests/test_api_integration.py`](backend/tests/test_api_integration.py) |

---

## Stage 3 — Adaptive UI (Web/Mobile) Criterion Compliance Map

Every requirement for the **Adaptive UI (Web/Mobile)** review is implemented and verifiable at the paths below:

| Requirement | Implementation Location |
|---|---|
| **Labeled PDF Mockup Specification (3 Device Variants + Component Library + Interactive States)** | [`docs/adaptive-ui/Adaptive_UI_Specification_Kanoplich_Bahdan.pdf`](docs/adaptive-ui/Adaptive_UI_Specification_Kanoplich_Bahdan.pdf) (overview in [`docs/adaptive-ui/README.md`](docs/adaptive-ui/README.md), generator in [`frontend/scripts/generate_adaptive_pdf.mjs`](frontend/scripts/generate_adaptive_pdf.mjs)) |
| **3 Device Types + Foldable/Ultrawide + Orientation + Keyboard-Safe Layout** | [`frontend/src/styles/layout.css`](frontend/src/styles/layout.css), [`frontend/src/styles/workspace.css`](frontend/src/styles/workspace.css), [`AppShell.tsx`](frontend/src/components/layout/AppShell.tsx) (desktop sidebar + one-hand mobile bottom tab bar + card fallbacks) |
| **Relative Units (`rem`, `clamp()`, CSS Grid/Flex) & ≥ 44px Touch Targets** | [`frontend/src/styles/tokens.css`](frontend/src/styles/tokens.css) (`--touch-target: 2.75rem`) & [`frontend/src/styles/components.css`](frontend/src/styles/components.css) |
| **WCAG 2.1 AA Contrast (≥ 4.5:1), Consistent Typography, Light/Dark Themes & Text Scale (90%–125%)** | [`frontend/src/styles/tokens.css`](frontend/src/styles/tokens.css) & [`SettingsPage.tsx`](frontend/src/pages/SettingsPage.tsx) |
| **Automatic Device Detection (Breakpoint, DPR, Orientation, Aspect Ratio)** | [`frontend/src/hooks/useDeviceProfile.ts`](frontend/src/hooks/useDeviceProfile.ts) |
| **Live Reusable Component Library Showcase (All States)** | `/design-system` route — [`frontend/src/pages/DesignSystemPage.tsx`](frontend/src/pages/DesignSystemPage.tsx) |
| **Automated Multi-Viewport Playwright Verification (6 viewports, 0px overflow, ≥ 44px touch targets)** | [`frontend/e2e/adaptive.spec.ts`](frontend/e2e/adaptive.spec.ts) |

---

## Stage 3 — Back-End Criterion Compliance Map

Every requirement for the **Back-End** review is implemented and verifiable at the paths below:

| Requirement | Implementation Location |
|---|---|
| **Modern Framework, Database & ORM** | FastAPI + PostgreSQL 16 ([`backend/ddl/001_init.sql`](backend/ddl/001_init.sql)) + SQLAlchemy 2.0 ORM ([`backend/app/models/orm.py`](backend/app/models/orm.py), [`backend/app/db.py`](backend/app/db.py)) |
| **Layered Architecture (SOLID)** | Presentation routers ([`backend/app/api/v1/`](backend/app/api/v1/)), business services ([`backend/app/services/`](backend/app/services/)), repository data access ([`backend/app/repositories/`](backend/app/repositories/)), core infrastructure ([`backend/app/core/`](backend/app/core/)), Pydantic schemas ([`backend/app/models/schemas.py`](backend/app/models/schemas.py)) |
| **Standard Security (Argon2id + RFC 7519 JWT, Zero Secrets)** | [`backend/app/core/security.py`](backend/app/core/security.py), [`backend/app/api/deps.py`](backend/app/api/deps.py), [`backend/.env.example`](backend/.env.example) |
| **Described API (OpenAPI 3.1 / Swagger UI / ReDoc)** | [`docs/api/openapi.yaml`](docs/api/openapi.yaml), [`docs/api/README.md`](docs/api/README.md), live `/docs` & `/redoc` |
| **Global Error Handling, Structured JSON Logging, Tracing, Metrics & Rate Limiting** | [`exceptions.py`](backend/app/core/exceptions.py), [`logging.py`](backend/app/core/logging.py) (`X-Request-ID`), [`metrics.py`](backend/app/core/metrics.py) (`/metrics`), [`rate_limit.py`](backend/app/core/rate_limit.py) (`60 req/min`), [`cache.py`](backend/app/core/cache.py) |
| **Unit & Integration Tests with ≥ 70% / ≥ 80% Coverage (88% verified)** | [`backend/tests/`](backend/tests/) — `pytest --cov=app --cov-fail-under=80` (**15 passed, 88% coverage**), `ruff check` (**0 errors**), `pip-audit` (**0 vulnerabilities**) |
| **Containerization, CI/CD & Cloud Deployment Blueprint** | Root [`docker-compose.yml`](docker-compose.yml), [`backend/Dockerfile`](backend/Dockerfile), [`frontend/Dockerfile`](frontend/Dockerfile), [`.github/workflows/ci.yml`](.github/workflows/ci.yml), 1-click [`render.yaml`](render.yaml) |

---

## How to Run the Project

### 0. One-Command Full-Stack via Docker Compose (PostgreSQL + FastAPI + React SPA)

```bash
docker compose up --build
```

- **Web Application (Nginx + React SPA):** `http://localhost:8080`
- **Backend API & Swagger UI:** `http://localhost:8000/docs`
- **Backend Health / Metrics:** `http://localhost:8000/health` · `http://localhost:8000/metrics`

### 1. Back-End Tests, Coverage & Quality Gates

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements-ci.txt
.venv/bin/ruff check app tests scripts
.venv/bin/pip-audit
ML_BACKEND=stub .venv/bin/pytest --cov=app --cov-report=term-missing --cov-fail-under=80 -v
```

### 2. View & Validate API Documentation

- **Offline Interactive ReDoc (no server required):** open [`docs/api/redoc.html`](docs/api/redoc.html) directly in a browser.
- **Structured Markdown Portal:** start at [`docs/api/README.md`](docs/api/README.md).
- **Validate OpenAPI 3.1.0 Spec:**
  ```bash
  npx -y @redocly/cli@latest lint docs/api/openapi.yaml
  ```
- **Run End-to-End cURL Walkthrough** (while backend is running on `:8000`):
  ```bash
  bash docs/api/examples/walkthrough.sh
  ```

### 3. Front-End SPA (Development, Tests, Build)

Requires **Node.js 20+** and **npm 10+**.

```bash
cd frontend
cp .env.example .env.local   # optional; Vite proxies /api and /health to http://127.0.0.1:8000
npm install
npm run dev                  # starts SPA at http://localhost:5173
```

Run checks and test suites (standalone — no database or Python backend required for tests):

```bash
cd frontend
npm run lint                 # ESLint check
npm run format:check         # Prettier check
npm run build                # TypeScript strict check + Vite production build
npm run test                 # Vitest + React Testing Library unit tests
npx playwright install chromium   # one-time browser install (if not already present)
npm run test:e2e             # Playwright Chromium end-to-end tests
```

### 4. Full-Stack Local Dev (FastAPI Backend + React Front-End)

To run the live FastAPI API together with the SPA (fast offline mode with SQLite and stub ML, or full PostgreSQL + Transformers ML):

```bash
# Terminal 1 — Backend API on http://127.0.0.1:8000
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-ci.txt   # or requirements.txt for full Transformers ML
ML_BACKEND=stub .venv/bin/uvicorn app.main:app --reload
# For PostgreSQL + real Transformers ML, see backend/README.md

# Terminal 2 — Frontend SPA on http://localhost:5173
cd frontend
npm run dev
```

- **Front-End SPA:** `http://localhost:5173`
- **Backend Swagger UI:** `http://127.0.0.1:8000/docs`
- **Backend Health Check:** `http://127.0.0.1:8000/health`

### 5. Cloud Production Deployment (Render Blueprint)

The repository includes [`render.yaml`](render.yaml), which provisions:
1. Managed PostgreSQL 16 (`factmap-scholar-db`, auto-bootstrapped from `backend/ddl/001_init.sql` on first startup).
2. Containerized FastAPI API (`factmap-scholar-api`) with auto-generated `JWT_SECRET` and `/health` check.
3. Static React SPA (`factmap-scholar-web`) with SPA rewrite rules.

Deploy via **Render Dashboard → New → Blueprint → Connect `Turbobodik/diploma`**.

---

## Repository Structure

```text
diploma/
├── frontend/                  # React 19 + TypeScript + Vite SPA (Stage 3 Front-End)
│   ├── src/
│   │   ├── components/        # Reusable UI kit + responsive AppShell layout
│   │   ├── features/          # auth, projects, workspace (EvidenceMap, Claims, Uploader)
│   │   ├── pages/             # Lazy-loaded route pages (5 routes + 404)
│   │   ├── routes/            # AppRouter + ProtectedRoute guard
│   │   ├── services/          # Centralized Axios client, interceptors, API services, logger
│   │   ├── store/             # Redux Toolkit slices & memoized selectors
│   │   ├── models/            # Strict TypeScript API & UI interfaces
│   │   ├── hooks/             # useDeviceProfile, useDebounce, useDocumentTitle
│   │   └── styles/            # Vanilla CSS design tokens (light/dark, responsive)
│   └── e2e/                   # Playwright E2E test specifications
├── backend/                   # FastAPI layered backend + local ML/NLI pipeline
├── docs/
│   ├── frontend/              # Front-End architecture, user flows, stack justification
│   ├── adaptive-ui/           # Labeled Adaptive UI PDF spec, 3-device screenshots & guide
│   ├── api/                   # Validated OpenAPI 3.1 spec, ReDoc HTML, guides, Postman, cURL
│   ├── ml/                    # SciFact retrieval/NLI & claim-span benchmarks
│   └── criteria/              # Stage 3 diploma review rubrics & checklists
├── expertise-database/        # Frozen Stage 2 Database criterion review package
└── BA_Kanoplich_Bahdan.md     # Business Analysis document
```

---

## Security & Credentials Policy

- **No secrets, API keys, JWT secrets, or production passwords are stored in this repository.**
- Configuration is loaded strictly from environment variables. Use [`frontend/.env.example`](frontend/.env.example) and [`backend/.env.example`](backend/.env.example) as templates for local `.env` / `.env.local` files (ignored by Git).
