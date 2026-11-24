# Back-End Requirements — Criteria (Stage 3)

Source: EHU Diploma Project Knowledge Base (`04-technical-requirements/04c-backend/backend/`).

---

## Minimum Requirements for a Passing Grade (5 points)

- **Modern Framework:** High-level server-side framework (FastAPI, Django, Spring, ASP.NET Core, Node.js, etc.).
- **Database:** Relational (PostgreSQL/MySQL) or NoSQL (MongoDB) for state persistence.
- **ORM:** Use an ORM (e.g., SQLAlchemy, Django ORM, Entity Framework, Hibernate, Sequelize).
- **Layered Architecture:** Separate into presentation (routers/controllers), business logic (services), and data access (repositories).
- **SOLID Principles:** SRP, OCP, LSP, ISP, DIP.
- **API Description:** OpenAPI / Swagger (or equivalent).
- **Global Error Handling:** Centralized exception handling returning clear JSON errors and proper HTTP status codes.
- **Structured Logging:** Key events and errors logged in structured format.
- **Production Deployment:** Accessible externally (cloud host or containerized deployment), deployable automatically from repo latest version without manual workarounds.
- **Test Coverage:** Unit tests covering business logic with **minimum 70% coverage**, confirmed by a coverage tool (`pytest-cov`).

### Constraints & What NOT to Do
- No paid libraries.
- Check dependencies for critical vulnerabilities (`pip-audit` / `npm audit`).
- Git version control with change history.
- JSON as the primary data exchange format.
- No secrets/passwords/tokens in the repository (use environment variables / secret stores).
- **Do NOT invent custom encryption or custom JWT implementations** — use proven standards (e.g., `PyJWT`, `argon2`/`bcrypt`).
- Do NOT use outdated or educational-only libraries (`xmlrpc`, `http.server`).
- Do NOT return static fake stubs instead of real DB/component interaction.
- Modularity: avoid monolithic single-file code.

---

## Maximum Requirements (10 points)

- **CI/CD Practices:** Automated build, test, Docker image packaging, push to registry (GHCR / Docker Hub), deploy with injected secrets (GitHub Actions / GitLab CI).
- **Microservice Architecture:** Independent services with clearly defined responsibilities (e.g., API service + ML Worker service).
- **Asynchronous Communication:** Message queue (e.g., Redis Queue / RabbitMQ / Kafka) between API and async workers.
- **Caching:** Redis / Memcached for frequent queries or computed results.
- **System Monitoring:** Prometheus metrics (`/metrics`) + Grafana dashboards.
- **Log Management System:** Structured centralized logs (JSON logs ready for Loki / ELK).
- **Request Tracing:** Correlation ID (`X-Request-ID`) propagated across requests/services.
- **Alerting System:** Alertmanager / threshold alerts (Telegram / Slack / Email).
- **Quality Gates in CI/CD:** Automated lint/code quality checks, unit & integration tests, **coverage ≥ 80%** blocking deploy on failure.

---

## Common Mistakes (Point Deductions, -1 each)

- **Security:** MD5/SHA-1 password hashing; plain-text secrets/passwords; missing input validation.
- **Data & Errors:** Unhandled crashes; returning `200 OK` on errors; DB schema mismatch with documentation.
- **Design & Code:** Missing API docs; poor readability/no comments; inefficient DB queries / missing indexes; hardcoded configuration (URLs/keys/paths); monolithic single file; magic strings/numbers instead of constants; code duplication.
- **Testing:** < 70% test coverage.
- **API:** Violating REST conventions (e.g., `GET` to create resources, illogical URLs).
