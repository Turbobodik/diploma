# Error Taxonomy & Recovery Guide

Every error returned by FactMap Scholar (domain exceptions, Pydantic request validation failures, and unexpected `500` server errors) is normalized by [`backend/app/core/exceptions.py`](../../../backend/app/core/exceptions.py) into a single predictable JSON structure (`ErrorOut`) and echoes the `X-Request-ID` header.

---

## Standard Error Envelope (`ErrorOut`)

```json
{
  "code": "duplicate_file",
  "message": "An identical file already exists in this project",
  "request_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

| Field | Type | Description |
|---|---|---|
| `code` | `string` | Stable machine-readable `ErrorCode` identifier for programmatic handling |
| `message` | `string` | Human-readable diagnostic suitable for UI toast/alert display |
| `request_id` | `string \| null` | Correlation UUID matching the `X-Request-ID` HTTP response header and server JSON logs |

---

## Complete `ErrorCode` Catalog

| HTTP Status | `code` | Trigger Condition | Recommended Client Recovery |
|---:|---|---|---|
| `401` | `unauthorized` | Missing, malformed, or expired Bearer JWT, or user no longer exists | Clear cached JWT and redirect user to `/login` to re-authenticate |
| `401` | `invalid_login` | Incorrect email or password on `POST /api/v1/auth/login` | Display inline credential error; do not reveal whether the email exists |
| `403` | `forbidden` | Authenticated caller lacks permission for the requested operation | Show access-denied notice and verify account role/ownership |
| `404` | `not_found` | Project, document, or evidence UUID does not exist or belongs to another owner | Refresh project/workspace list and remove stale references |
| `409` | `duplicate_email` | Email already registered on `POST /api/v1/auth/register` | Prompt user to sign in via `/api/v1/auth/login` instead |
| `409` | `duplicate_name` | Owner already has a project with the same case-insensitive name | Prompt user to choose a distinct project name |
| `409` | `duplicate_file` | Uploaded file's SHA-256 hash matches an existing document in the same project | Notify user that the paper is already present in the corpus |
| `409` | `not_ready` | `POST /analyze` called with zero `ready` documents or extraction still in progress | Wait until at least one document has `status: "ready"` before starting analysis |
| `409` | `already_running` | `POST /analyze` called while another analysis run is `queued` or `running` | Poll `GET /jobs` until the active run completes |
| `413` | `bad_size` | Uploaded file is `0` bytes or exceeds `20 MB` (`20,971,520` bytes) | Validate file size client-side (`1..20 MB`) before uploading |
| `415` | `bad_type` | Uploaded file MIME type / extension is neither `application/pdf` nor `text/plain` | Restrict file picker to `.pdf` and `.txt` files |
| `422` | `empty_name` | Project name contains only whitespace | Trim and validate non-empty string before submitting |
| `422` | `extract_failed` | Text extraction failed (corrupt PDF or image-only scanned PDF without text layer) | Inform user to upload a text-selectable PDF or `.txt` export |
| `422` | `validation_error` | Schema/query validation failed (invalid UUID, bad email, password < 8 chars, `limit > 200`, invalid NLI label) | Inspect `message` (e.g., `body.password: String should have at least 8 characters`) and fix input |
| `429` | `rate_limited` | Client exceeded `60 req/min` sliding window on upload/analyze endpoints | Read `Retry-After` response header (seconds) and retry after waiting |
| `500` | `internal_error` | Unhandled server exception | Display friendly retry banner with `request_id` for backend log lookup |
