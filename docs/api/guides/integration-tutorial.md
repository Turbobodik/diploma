# Integration Tutorial

This walkthrough covers a full client integration: authenticate, create a project, upload two text papers, trigger analysis, poll job status, query claims and the evidence graph, override an NLI label, export JSON/CSV, and delete the project.

An executable version of these commands is in [`../examples/walkthrough.sh`](../examples/walkthrough.sh).

## Step 1: Authenticate

```bash
BASE_URL="http://127.0.0.1:8000"

AUTH_JSON=$(curl -s -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tutorial@ehu.lt",
    "password": "TutorialPassword123!",
    "display_name": "Tutorial Researcher"
  }')

if echo "$AUTH_JSON" | grep -q "duplicate_email"; then
  AUTH_JSON=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email": "tutorial@ehu.lt", "password": "TutorialPassword123!"}')
fi

TOKEN=$(echo "$AUTH_JSON" | jq -r '.token')
```

## Step 2: Create a project

```bash
PROJECT_ID=$(curl -s -X POST "$BASE_URL/api/v1/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Cardiovascular Aspirin Review"}' | jq -r '.id')

echo "Created project: $PROJECT_ID"
```

## Step 3: Upload two documents

Accepted types are `application/pdf` and `text/plain` up to 20 MB. Re-uploading an identical file (by SHA-256) in the same project returns `409 Conflict` (`duplicate_file`).

```bash
curl -s -X POST "$BASE_URL/api/v1/projects/$PROJECT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@backend/scripts/sample_a.txt;type=text/plain" | jq

curl -s -X POST "$BASE_URL/api/v1/projects/$PROJECT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@backend/scripts/sample_b.txt;type=text/plain" | jq
```

Check extraction status:

```bash
curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" | jq '.documents[] | {original_name, status, size_bytes}'
```

## Step 4: Trigger analysis and poll jobs

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

Poll `/jobs` until no job is `queued` or `running`:

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

## Step 5: Query claims and the evidence graph

```bash
CLAIMS_JSON=$(curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/claims?limit=20&offset=0" \
  -H "Authorization: Bearer $TOKEN")

echo "$CLAIMS_JSON" | jq '.claims[] | {id, text, confidence, has_evidence, evidence_count: (.evidence | length)}'
```

Supported query parameters on `/claims`: `label` (`entailment|contradiction|neutral`), `document_id`, `search` (case-insensitive substring), `limit` (`1..200`), `offset` (`>= 0`).

Fetch the graph (`include_neutral=false` hides neutral edges):

```bash
curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/graph?include_neutral=false" \
  -H "Authorization: Bearer $TOKEN" | jq '{node_count: (.nodes | length), edge_count: (.edges | length)}'
```

## Step 6: Override an NLI label

`PATCH /api/v1/evidence/{evidence_id}` updates `user_label` and `effective_label` without modifying `model_label` or `model_score`.

```bash
EVIDENCE_ID=$(echo "$CLAIMS_JSON" | jq -r '.claims[0].evidence[0].id')

curl -s -X PATCH "$BASE_URL/api/v1/evidence/$EVIDENCE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_label": "contradiction"}' | jq
```

Send `{"user_label": null}` to clear the override and revert to `model_label`.

## Step 7: Export JSON or CSV

```bash
curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/export?format=json" \
  -H "Authorization: Bearer $TOKEN" -o "factmap-export.json"

curl -s "$BASE_URL/api/v1/projects/$PROJECT_ID/export?format=csv&label=contradiction" \
  -H "Authorization: Bearer $TOKEN" -o "factmap-contradictions.csv"
```

## Step 8: Delete the project

```bash
curl -s -X DELETE "$BASE_URL/api/v1/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Response (`200 OK`):

```json
{
  "deleted": "a3fc0bc4-b7be-46b2-abf3-273bf7c2737a"
}
```

## TypeScript client snippet

The frontend services in [`frontend/src/services/`](../../../frontend/src/services/) wrap the same endpoints via Axios:

```ts
import { authService } from '../../../frontend/src/services/authService';
import { projectService } from '../../../frontend/src/services/projectService';
import { workspaceService } from '../../../frontend/src/services/workspaceService';

await authService.login({ email: 'tutorial@ehu.lt', password: 'TutorialPassword123!' });
const project = await projectService.createProject({ name: 'NLI Study' });
await workspaceService.uploadDocument(project.id, file);
await workspaceService.startAnalysis(project.id);
const graph = await workspaceService.getGraph(project.id, { include_neutral: false });
```
