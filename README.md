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

## How to Run the Project

### 1. Front-End SPA (Development, Tests, Build)

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

### 2. Full-Stack Mode (FastAPI Backend + React Front-End)

To run the live FastAPI API together with the SPA (fast offline mode with SQLite and stub ML, or full PostgreSQL + Transformers ML):

```bash
# Terminal 1 — Backend API on http://127.0.0.1:8000
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# Fast local start (SQLite + stub ML, no heavy model download):
ML_BACKEND=stub .venv/bin/uvicorn app.main:app --reload
# For PostgreSQL + real Transformers ML, see backend/README.md

# Terminal 2 — Frontend SPA on http://localhost:5173
cd frontend
npm run dev
```

- **Front-End SPA:** `http://localhost:5173`
- **Backend Swagger UI:** `http://127.0.0.1:8000/docs`
- **Backend Health Check:** `http://127.0.0.1:8000/health`

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
│   ├── api/                   # Validated OpenAPI 3.1 spec (yaml/json)
│   ├── ml/                    # SciFact retrieval/NLI & claim-span benchmarks
│   └── criteria/              # Stage 3 diploma review rubrics & checklists
├── expertise-database/        # Frozen Stage 2 Database criterion review package
└── BA_Kanoplich_Bahdan.md     # Business Analysis document
```

---

## Security & Credentials Policy

- **No secrets, API keys, JWT secrets, or production passwords are stored in this repository.**
- Configuration is loaded strictly from environment variables. Use [`frontend/.env.example`](frontend/.env.example) and [`backend/.env.example`](backend/.env.example) as templates for local `.env` / `.env.local` files (ignored by Git).
