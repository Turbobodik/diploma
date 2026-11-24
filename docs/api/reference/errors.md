# Error Reference

Domain exceptions, request validation errors, and unhandled `500` exceptions are formatted by [`backend/app/core/exceptions.py`](../../../backend/app/core/exceptions.py) into `ErrorOut` with the `X-Request-ID` response header.

## Error format (`ErrorOut`)

```json
{
  "code": "duplicate_file",
  "message": "This file is already in the project",
  "request_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

| Field | Type | Description |
|---|---|---|
| `code` | `string` | Machine-readable `ErrorCode` value |
| `message` | `string` | Human-readable error message |
| `request_id` | `string \| null` | Matches `X-Request-ID` header and backend JSON logs |

## Error codes

| HTTP Status | `code` | Cause | Client action |
|---:|---|---|---|
| 401 | `unauthorized` | Missing, invalid, or expired Bearer JWT, or deleted user | Clear token and redirect to `/login` |
| 401 | `invalid_login` | Wrong email or password on `/api/v1/auth/login` | Show inline credential error |
| 403 | `forbidden` | Caller lacks permission | Show access-denied notice |
| 404 | `not_found` | Project, document, or evidence ID does not exist or belongs to another user | Refresh list and clear stale selection |
| 409 | `duplicate_email` | Email already registered on `/register` | Prompt user to sign in |
| 409 | `duplicate_name` | Owner already has a project with the same name (case-insensitive) | Ask for a different project name |
| 409 | `duplicate_file` | File with the same SHA-256 already exists in the project | Inform user the file is already uploaded |
| 409 | `not_ready` | `/analyze` called with no `ready` documents or extraction still running | Wait until at least one document is `ready` |
| 409 | `already_running` | `/analyze` called while an analysis run is already active | Poll `/jobs` until completion |
| 413 | `bad_size` | Uploaded file is empty or > 20 MB (`20,971,520` bytes) | Validate file size before upload |
| 415 | `bad_type` | Uploaded file is not `application/pdf` or `text/plain` | Restrict file input to `.pdf` and `.txt` |
| 422 | `empty_name` | Project name is blank whitespace | Trim and validate non-empty name |
| 422 | `extract_failed` | Text extraction failed (corrupt PDF or scanned PDF without text layer) | Ask for a text-selectable PDF or `.txt` file |
| 422 | `validation_error` | Invalid payload or query params (bad UUID, short password, `limit > 200`, invalid label) | Check `message` field and fix the invalid parameter |
| 429 | `rate_limited` | Exceeded `60 req/min` on upload or analyze | Read `Retry-After` header and retry after waiting |
| 500 | `internal_error` | Unexpected server error | Retry and include `request_id` when reporting |
