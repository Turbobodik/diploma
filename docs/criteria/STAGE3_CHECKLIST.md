# Stage 3 Master Checklist (Deadline: Wed, 25 Nov 2026)

## Track 1: Back-end (`backend/`)
- [ ] Layered architecture (`api/v1/` -> `services/` -> `repositories/` -> `models/`, `core/`)
- [ ] SQLAlchemy 2.0 ORM mapped 1:1 to `ddl/001_init.sql`
- [ ] Standard JWT (`PyJWT`, RFC 7519) + Argon2id password hashing (`argon2-cffi`)
- [ ] Zero magic strings (`app/core/constants.py`), env-only config + `.env.example`
- [ ] Global exception handling (`400/401/403/404/409/413/415/422/429/500`), input validation, CORS
- [ ] Structured JSON logging + `X-Request-ID` tracing middleware
- [ ] Sliding-window rate limiting (`60 req/min`, NFR-06) + Prometheus `/metrics` + optional Redis/TTL cache
- [ ] Pagination (`limit`, `offset`, `total`) on list endpoints
- [ ] Unit + API integration tests with **>= 80% coverage** (`pytest-cov`) + `pip-audit` + `ruff`
- [ ] CI/CD workflow (`.github/workflows/ci.yml`) + root `docker-compose.yml`

## Track 2: API Documentation (`docs/api/`)
- [ ] Validated `openapi.yaml` & `openapi.json` (`openapi-spec-validator`) + contract tests
- [ ] Interactive Swagger UI (`/docs`) with `HTTPBearer` Authorize + ReDoc (`/redoc`) + static `docs/api/redoc.html`
- [ ] Folder structure: `/guides`, `/reference`, `/schemas`, `/examples` + `README.md` (TOC, Strategy, Versioning, Changelog)
- [ ] Guides: Getting Started, Authentication Deep Dive, Integration Tutorial, Advanced Topics, Architecture Diagrams
- [ ] Runnable Postman collection + curl walkthrough script

## Track 3: Front-End (`frontend/` & `docs/frontend/`)
- [ ] React + TypeScript (strict, zero `any`) + Vite SPA
- [ ] Modular architecture: `components`, `pages`, `features`, `services`, `models`, `store`, `hooks`, `styles`
- [ ] 5 routes with `React.lazy` + `Suspense` (`/login`, `/projects`, `/projects/:projectId`, `/settings`, `/design-system`)
- [ ] Redux Toolkit slices (`auth`, `projects`, `workspace`, `ui`) + memoized selectors + async thunk chains
- [ ] Centralized API service with interceptors (`401/403/404/429/500`), React ErrorBoundary, Toasts, Skeletons
- [ ] Forms with validation, tables/lists, filtering/search/sorting
- [ ] Interactive Evidence Map (zoom/pan, NLI color-coded edges, filters, detail panel, explicit empty state, override, JSON/CSV export)
- [ ] Light/Dark theme + Display scale + WCAG 2.1 AA (ARIA, keyboard nav, >=4.5:1 contrast)
- [ ] ESLint + Prettier passing
- [ ] Unit tests (>=4 components/services/slices) + Integration tests (>=2 flows) with Vitest + Testing Library
- [ ] Front-End Architecture documentation (`docs/frontend/ARCHITECTURE.md`)

## Track 4: Adaptive UI (`frontend/` & `docs/adaptive-ui/`)
- [ ] Responsive across Mobile (375px), Tablet (768px), Desktop (1440px), Ultrawide/4K & foldable
- [ ] Automatic device detection hook (breakpoint, DPR, orientation, aspect ratio)
- [ ] Relative units (`rem`, `clamp()`, CSS grid/flex), >=44px touch targets, SVG icons (`lucide-react`)
- [ ] One-hand mobile bottom tab bar + mobile list/card fallback for evidence graph + keyboard-safe layout
- [ ] Interactive Design System showcase route with all component states
- [ ] Labeled PDF specification (`docs/adaptive-ui/Adaptive_UI_Specification_Kanoplich_Bahdan.pdf`) with 3 device variants + component library + states
