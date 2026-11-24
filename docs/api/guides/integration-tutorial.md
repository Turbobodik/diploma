# Step-by-Step Integration Tutorial

This tutorial walks through a complete real-world integration with the **FactMap Scholar API**: authenticating, creating a workspace, uploading two scientific papers, running the asynchronous ML verification pipeline, polling job progress, inspecting the evidence map, overriding an NLI label, exporting results, and performing GDPR cascade deletion.

A fully executable bash version of this tutorial is available in [`../examples/walkthrough.sh`](../examples/walkthrough.sh).

---

## Step 1: Authenticate (`POST /api/v1/auth/register` or `/login`)

```bash
BASE_URL="http://127.0.0.1:8000"

AUTH_JSON=$(curl -s -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tutorial@ehu.lt",
    "password": "TutorialPassword123!",
    "display_name": "Tutorial Researcher"
  }')

# If already registered (409), sign in instead:
if echo "$AUTH_JSON" | grep -q "duplicate_email"; then
  AUTH_JSON=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email": "tutorial@ehu.lt", "password": "TutorialPassword123!"}')
fi

TOKEN=$(echo "$AUTH_JSON" | jq -r '.token')
```

---

## Step 2: Create a Project Workspace (`POST /api/v1/projects`)

```bash
PROJECT_ID=$(curl -s -X POST "$BASE_URL/api/v1/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Cardiovascular Aspirin Review"}' | jq -r '.id')

echo "Created project: $PROJECT_ID"
```

---

## Step 3: Upload Two Scientific Publications (`POST /api/v1/projects/{id}/documents`)

Documents must be `application/pdf` or `text/plain` (`<= 20 MB`). Uploading an identical file (by SHA-256 hash) into the same project returns `409 Conflict` (`duplicate_file`).

```bash
curl -s -X POST "$BASE_URL/api/v1/projects/$PROJECT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@backend/scripts/sample_a.txt;type=text/plain" | jq

curl -s -X POST "$BASE_URL/api/v1/projects/$PROJECT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@backend/scripts/sample_b.txt;type=text/plain" | jq
```

Verify both documents reached `"status": "ready"`:

```bash
curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" | jq '.documents[] | {original_name, status, size_bytes}'
```

---

## Step 4: Start Asynchronous Verification & Poll Progress

Trigger the 3-stage pipeline (`extract_claims` → `retrieve` → `nli`):

```bash
curl -s -X POST "$BASE_URL/api/v1/projects/$PROJECT_ID/analyze" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Response (`202 Accepted`):

```json
{
  "status": "queued",
  "project_id": "a3fc0bc4-b7be-46b2-abf3-273bf7c2737a",
  "job_ids": [
    "9f2b1c10-...",
    "4d3e8a21-...",
    "7c91e04b-..."
  ]
}
```

Poll `GET /api/v1/projects/{project_id}/jobs` until no jobs are `queued` or `running`:

```bash
while true; do
  JOBS=$(curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/jobs" \
    -H "Authorization: Bearer $TOKEN")
  echo "$JOBS" | jq -c '.jobs[] | {kind, status, progress_pct}'
  ACTIVE=$(echo "$JOBS" | jq '[.jobs[] | select(.status == "queued" or .status == "running")] | length')
  [ "$ACTIVE" -eq 0 ] && break
  sleep 2
done
```

---

## Step 5: Query Filtered Claims & Evidence Graph

### Filtered Claims List (`GET /api/v1/projects/{id}/claims`)

```bash
CLAIMS_JSON=$(curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/claims?limit=20&offset=0" \
  -H "Authorization: Bearer $TOKEN")

echo "$CLAIMS_JSON" | jq '.claims[] | {id, text, confidence, has_evidence, evidence_count: (.evidence | length)}'
```

You can combine query parameters:
- `label=entailment|contradiction|neutral`
- `document_id=<uuid>`
- `search=<substring>` (case-insensitive across claim text and document title)
- `limit=1..200`, `offset>=0`

### Evidence Graph (`GET /api/v1/projects/{id}/graph`)

```bash
curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/graph?include_neutral=false" \
  -H "Authorization: Bearer $TOKEN" | jq '{node_count: (.nodes | length), edge_count: (.edges | length)}'
```

---

## Step 6: Record a Researcher Override (`PATCH /api/v1/evidence/{evidence_id}`)

Human overrides update `user_label` and `effective_label` while **preserving `model_label` and `model_score`** for scientific auditability.

```bash
EVIDENCE_ID=$(echo "$CLAIMS_JSON" | jq -r '.claims[0].evidence[0].id')

curl -s -X PATCH "$BASE_URL/api/v1/evidence/$EVIDENCE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_label": "contradiction"}' | jq
```

To restore the original model prediction, send `{"user_label": null}`.

---

## Step 7: Export Structured Results (`GET /api/v1/projects/{id}/export`)

```bash
# JSON export
curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/export?format=json" \
  -H "Authorization: Bearer $TOKEN" -o "factmap-export.json"

# CSV export (supports label & document_id filters)
curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/export?format=csv&label=contradiction" \
  -H "Authorization: Bearer $TOKEN" -o "factmap-contradictions.csv"
```

---

## Step 8: Cascade Delete Workspace (`DELETE /api/v1/projects/{id}`)

```bash
curl -s -X DELETE "$BASE_URL/api/v1/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected response (`200 OK`):

```json
{
  "deleted": "a3fc0bc4-b7be-46b2-abf3-273bf7c2737a"
}
```

---

## TypeScript Client Example (Axios)

The production React SPA in [`frontend/src/services/`](../../../frontend/src/services/) implements this exact workflow using typed Axios services:

```ts
import { authService } from '../../../frontend/src/services/authService';
import { projectService } from '../../../frontend/src/services/projectService';
import { workspaceService } from '../../../frontend/src/services/workspaceService';

const { token } = await authService.login({ email: 'tutorial@ehu.lt', password: 'TutorialPassword123!' });
// token is persisted and injected via httpClient request interceptor
const project = await projectService.createProject({ name: 'NLI Study' });
await workspaceService.uploadDocument(project.id, file);
await workspaceService.startAnalysis(project.id);
const graph = await workspaceService.getGraph(project.id, { include_neutral: false });
```
