# API Documentation — Criteria (Stage 3)

Source: EHU Diploma Project Knowledge Base (`04-technical-requirements/04a-business-and-docs/api-documentation/`).

---

## Minimum Requirements (for 5 points)

- **Structured API Reference:** Endpoints, parameters, request/response formats, authentication, errors — clear, accurate, easy to navigate.
- **Validated Industry-Standard Spec:** Complete OpenAPI 3.x (YAML/JSON) committed in version control and validated with a linter/validator (`Spectral`, `Redocly CLI`, `openapi-spec-validator`, or Swagger Editor).
- **Meaningful Examples for Every Endpoint:** Sample requests, sample responses, HTTP status codes, error messages, data model descriptions — covering both typical and edge-case scenarios.
- **Guides & Tutorial:** At least one **Getting Started** guide and one **step-by-step integration tutorial** (auth + practical workflow).
- **High-Level Architecture Overview:** System context diagram, request flow diagram, explanation of modules/resources.
- **Developer-Accessible Publishing Format:** Online site (Redoc / Swagger UI / Docusaurus / GitBook) or well-structured Markdown docs repository + interactive Swagger UI & ReDoc.
- **Documentation Strategy Section:** Tools used, standards followed, naming conventions, versioning approach, formatting rules, and known gaps/limitations.
- **Clean Folder Structure:** Consistent naming and hierarchy (e.g., `/reference`, `/guides`, `/examples`, `/schemas`).

---

## Maximum Requirements (for 10 points)

- **Comprehensive DX Documentation System:** Reference docs + conceptual guides + best practices + tutorials + onboarding flows + release notes / changelog + versioning policy.
- **Advanced API Design Topics:**
  - Complex request flows (async job polling)
  - Pagination strategies
  - Rate limits
  - Authentication / authorization deep dive (JWT lifecycle, security warnings)
  - Error taxonomy & recovery steps
  - Idempotency
  - Versioning strategy
- **Detailed Diagrams:** Sequence diagrams, component diagrams, dependency maps, request–response lifecycles.
- **Advanced Tooling & Quality:**
  - API linting / schema validation (`Redocly CLI` / `Spectral` / `openapi-spec-validator`)
  - Contract tests verifying OpenAPI matches actual API behavior
  - Auto-generated examples & runnable `curl`/Postman collection
  - Interactive Swagger UI + static ReDoc HTML bundle

---

## Major Errors & Penalties

| Category | Example | Penalty |
|---|---|---:|
| Completeness | Key endpoints undocumented; missing examples; incomplete data models | -2 |
| Accuracy | Mismatched descriptions/status codes/examples vs actual API behavior | -1 |
| Structure & Navigation | Poor hierarchy, missing TOC, hard-to-find sections | -1 |
| Specification Quality | Invalid/inconsistent OpenAPI schema failing validation | -1 |
| Developer Experience | Missing auth guide, onboarding flow, or integration tutorial | -1 |
| Examples | Missing, trivial, non-runnable, or inconsistent examples | -2 |
| Versioning & Updates | No versioning strategy or missing changelog | -1 |
| Security Documentation | Missing auth/JWT details, unclear token handling, missing security warnings | -2 |
| Error Handling | Undocumented error codes or missing error schema / recovery steps | -1 |
