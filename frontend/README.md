# FactMap Scholar Front-End

React 19, TypeScript (`strict`), and Vite 8 single-page application for uploading scientific papers, running NLI claim verification, and inspecting the evidence map.

Architecture diagram, user flows, API usage, and stack notes: [../docs/frontend/ARCHITECTURE.md](../docs/frontend/ARCHITECTURE.md).

## Commands

```bash
cp .env.example .env.local   # Vite dev server proxies /api and /health to http://127.0.0.1:8000
npm install
npm run dev                  # dev server on http://localhost:5173
npm run lint                 # ESLint (no explicit any)
npm run format:check         # Prettier check
npm run build                # tsc -b + vite build
npm run test                 # Vitest + React Testing Library (6 suites)
npm run test:e2e             # Playwright Chromium E2E and adaptive tests (4 tests)
```
