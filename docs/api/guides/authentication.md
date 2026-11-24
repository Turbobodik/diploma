# Authentication and Security

Passwords are hashed with Argon2id (`argon2-cffi`). Requests to protected endpoints use RFC 7519 Bearer JWTs (`PyJWT`).

## 1. Scheme and route access

- OpenAPI security scheme: `HTTPBearer` (`type: http`, `scheme: bearer`)
- Header format: `Authorization: Bearer <access_token>`
- Public routes (`security: []`): `GET /health`, `GET /metrics`, `POST /api/v1/auth/register`, `POST /api/v1/auth/login`
- Protected routes: all remaining endpoints under `/api/v1/*`. Every query scopes data to the authenticated `owner_id`.

## 2. Password hashing and JWT claims

- Registration requires passwords of 8-200 characters. Emails are trimmed and lowercased before storage and lookup.
- Passwords are stored as Argon2id hashes with per-password salt. Plaintext passwords are never stored or logged.
- Tokens are signed with `HS256` (`JWT_ALGORITHM`) using `JWT_SECRET` from environment variables:

```json
{
  "sub": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "iss": "factmap-scholar",
  "type": "access",
  "iat": 1795515300,
  "exp": 1795601700
}
```

| Claim | Rule |
|---|---|
| `sub` | Authenticated `app_user.id` (UUID) |
| `iss` | Must equal `factmap-scholar` |
| `type` | Must equal `access` |
| `iat` | Issued-at UNIX timestamp (UTC) |
| `exp` | Expiration UNIX timestamp (`iat + JWT_TTL_SECONDS`, default `86400`) |

On each protected request, `get_current_user_id` (`backend/app/api/deps.py`) verifies the `Bearer` prefix, validates signature, `iss`, `type`, and `exp`, and checks that the user still exists. Any failure returns `401 Unauthorized` (`code: "unauthorized"`).

## 3. Handling 401 responses

```json
{
  "code": "unauthorized",
  "message": "Sign in required",
  "request_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

Clients should clear the cached token on `401` and prompt for sign-in via `POST /api/v1/auth/login`. To check a persisted token on startup, call `GET /api/v1/auth/me`.

## 4. Security notes

- Never commit `JWT_SECRET`, database credentials, or live tokens to Git. Set `JWT_SECRET` to at least 32 random bytes via environment variables.
- Always serve production traffic over HTTPS so Bearer tokens are encrypted in transit.
- Do not pass JWTs in URL query parameters; use the `Authorization` header only.
- Set `CORS_ORIGINS` in production to explicit allowed frontend origins.
- Accessing another user's project or evidence UUID returns `404 Not Found` rather than `403` to avoid leaking resource existence. PostgreSQL triggers (`trg_claim_same_project`, `trg_candidate_same_project`, `trg_evidence_same_project`) also enforce project isolation at the DB level.
