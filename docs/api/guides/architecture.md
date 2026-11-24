# API Architecture & Request Flows

This document explains how the FactMap Scholar API fits into the overall client–server system and details the layered backend architecture and asynchronous verification lifecycle.

---

## 1. System Context Diagram

```mermaid
flowchart LR
  Researcher(["Researcher / Browser"])
  APIUser(["External Script / Postman / CLI"])
  FE["Front-End SPA\n(React 19 + TS + Vite)"]
  API["FactMap Scholar API\n(FastAPI /api/v1)"]
  ML["Local ML Pipeline\n(Hybrid Claims + BGE-small + DeBERTa NLI)"]
  DB[("PostgreSQL 16\n(3NF Schema + Project Isolation Triggers)")]
  FS[("Object / File Storage\n(PDF & TXT payloads)")]
  Obs["Observability\n(JSON Logs + Prometheus /metrics)"]

  Researcher --> FE
  FE -- "HTTPS + Bearer JWT" --> API
  APIUser -- "HTTPS + Bearer JWT" --> API
  API --> DB
  API --> FS
  API --> ML
  ML --> DB
  API --> Obs
```

---

## 2. Layered API Architecture

The backend (`backend/app/`) separates transport, domain orchestration, persistence, and ML execution cleanly:

```mermaid
flowchart TB
  subgraph Transport["Transport & Middleware (app/main.py, app/api/)"]
    MW["CORS + X-Request-ID Tracing + Prometheus Metrics"]
    EH["Global Exception Handlers -> ErrorOut"]
    Deps["HTTPBearer Auth + Sliding-Window Rate Limiter"]
    Routers["v1 Routers: system, auth, projects, documents, analysis, claims"]
  end

  subgraph Services["Domain Services (app/services/)"]
    AuthS["AuthService (Argon2id + JWT)"]
    ProjS["ProjectService (CRUD + Cascade Storage Cleanup)"]
    DocS["DocumentService (MIME/Size/SHA-256 + Text Extraction)"]
    AnaS["AnalysisService (Async Job Orchestrator)"]
    GraphS["GraphService (Claims, Graph, Override, JSON/CSV Export)"]
  end

  subgraph Data["Data & ML Layer"]
    Repos["Repositories (SQLAlchemy 2.0 ORM)"]
    MLPipe["ML Pipeline (chunker, claim_extractor, embedder, nli)"]
    PG[("PostgreSQL 16 / SQLite")]
  end

  MW --> Deps --> Routers
  Routers --> EH
  Routers --> AuthS & ProjS & DocS & AnaS & GraphS
  AuthS & ProjS & DocS & AnaS & GraphS --> Repos
  AnaS --> MLPipe
  MLPipe --> Repos
  Repos --> PG
```

---

## 3. End-to-End Request–Response Sequence Diagram

```mermaid
sequenceDiagram
  autonumber
  actor Client as Client (SPA / cURL / SDK)
  participant API as FastAPI (/api/v1)
  participant DB as PostgreSQL 16
  participant Worker as Async ML Worker

  Client->>API: POST /api/v1/auth/login (email, password)
  API->>DB: Lookup user & verify Argon2id hash
  API-->>Client: 200 OK { token (JWT), expires_in, user }

  Client->>API: POST /api/v1/projects (Bearer JWT, name)
  API->>DB: Insert project (owner_id = sub)
  API-->>Client: 201 Created { id, name, ... }

  Client->>API: POST /api/v1/projects/{id}/documents (multipart PDF/TXT)
  API->>API: Validate MIME, <= 20 MB, SHA-256, rate limit
  API->>DB: Save document metadata + extracted text (status=ready)
  API-->>Client: 201 Created { id, status: "ready", ... }

  Client->>API: POST /api/v1/projects/{id}/analyze
  API->>DB: Enqueue jobs [extract_claims, retrieve, nli]
  API-->>Client: 202 Accepted { status: "queued", job_ids }
  API-)Worker: Launch background pipeline

  loop Poll every 2-3s
    Client->>API: GET /api/v1/projects/{id}/jobs
    API->>DB: Read job statuses & progress_pct
    API-->>Client: 200 OK { jobs: [...] }
  end

  Worker->>DB: Persist passages, embeddings, claims, NLI evidence edges

  Client->>API: GET /api/v1/projects/{id}/graph?include_neutral=false
  API->>DB: Query nodes & edges (owner-scoped)
  API-->>Client: 200 OK { project_id, nodes, edges }

  Client->>API: PATCH /api/v1/evidence/{evidence_id} { user_label: "contradiction" }
  API->>DB: Update user_label (model_label untouched)
  API-->>Client: 200 OK { id, user_label: "contradiction" }
```
