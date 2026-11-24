# FactMap Scholar — Front-End SPA

React 19 + TypeScript (`strict: true`) + Vite 8 Single Page Application for scientific claim extraction and NLI evidence verification.

Full architecture diagram, user flows, API contract, and tech stack justification: [`../docs/frontend/ARCHITECTURE.md`](../docs/frontend/ARCHITECTURE.md).

## Commands

```bash
cp .env.example .env.local   # optional; Vite dev server proxies /api and /health to http://127.0.0.1:8000
npm install
npm run dev                  # local dev server on http://localhost:5173
npm run lint                 # ESLint check (zero explicit `any`)
npm run format:check         # Prettier style check
npm run build                # TypeScript strict check + Vite production bundle
npm run test                 # Vitest + React Testing Library unit tests (6 suites)
npm run test:e2e             # Playwright Chromium E2E tests (2 suites)
```
