# Authentication & Security Guide

FactMap Scholar uses **Argon2id** for one-way password hashing and **RFC 7519 Bearer JSON Web Tokens (JWT)** for stateless API authentication.

---

## 1. Authentication Scheme

- **OpenAPI Security Scheme:** `HTTPBearer` (`type: http`, `scheme: bearer`)
- **HTTP Header:** `Authorization: Bearer <access_token>`
- **Public Endpoints (`security: []`):**
  - `GET /health`
  - `GET /metrics`
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
- **Protected Endpoints:** Every other route under `/api/v1/*` requires a valid Bearer JWT and enforces strict owner isolation (a user can never read, modify, or delete another user's projects, documents, claims, or evidence edges).

---

## 2. Password & Token Lifecycle

### Password Storage
- Passwords must be **8 to 200 characters** on registration (`POST /api/v1/auth/register`).
- Emails are normalized (`trim().lower()`) before lookup and uniqueness checks.
- Passwords are hashed via `argon2-cffi` (**Argon2id**) with per-password cryptographic salt; plaintext passwords are never persisted or logged.

### JWT Structure & Claims
Tokens are signed with `HS256` (configurable via `JWT_ALGORITHM`) using `JWT_SECRET` (env var only):

```json
{
  "sub": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "iss": "factmap-scholar",
  "type": "access",
  "iat": 1795515300,
  "exp": 1795601700
}
```

| Claim | Value / Rule |
|---|---|
| `sub` | Authenticated researcher's UUID (`app_user.id`) |
| `iss` | Must equal `factmap-scholar` |
| `type` | Must equal `access` |
| `iat` | Issued-at UNIX timestamp (UTC) |
| `exp` | Expiration UNIX timestamp (`iat + JWT_TTL_SECONDS`, default `86400` = 24 hours) |

### Token Validation Sequence
On every protected request, `get_current_user_id` (`backend/app/api/deps.py`):
1. Verifies the `Authorization` header starts with `Bearer `.
2. Verifies JWT signature, `iss`, `type`, and `exp`.
3. Confirms the `sub` user still exists in the database.
4. On any failure, responds with `401 Unauthorized` (`code: "unauthorized"`).

---

## 3. Handling `401 Unauthorized`

```json
{
  "code": "unauthorized",
  "message": "Sign in required",
  "request_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

Recommended client recovery:
1. Discard the cached access token immediately.
2. Prompt the user to re-authenticate via `POST /api/v1/auth/login` (or redirect the SPA to `/login`).
3. Verify the restored session on startup via `GET /api/v1/auth/me`.

---

## 4. Security Warnings & Best Practices

> [!CAUTION]
> **Never commit `JWT_SECRET`, database credentials, or live tokens to Git.** Configure `JWT_SECRET` exclusively through environment variables or a secret manager (minimum 32 cryptographically random bytes).

- **Use HTTPS (TLS 1.2+) in production:** Bearer tokens grant full access to the researcher's workspaces until expiration and must never traverse unencrypted public networks.
- **Avoid URL Query Parameters for Tokens:** Always transmit JWTs in the `Authorization` header — never in query strings, where tokens leak into access logs and browser history.
- **Validate CORS Origins:** Restrict `CORS_ORIGINS` in production to your exact frontend origins rather than `*`.
- **Cross-Project Isolation:** Both service-layer ownership checks and PostgreSQL database triggers (`trg_claim_same_project`, `trg_candidate_same_project`, `trg_evidence_same_project`) prevent cross-project data leakage. Accessing another user's project UUID intentionally returns `404 Not Found` rather than `403` to avoid leaking resource existence.
