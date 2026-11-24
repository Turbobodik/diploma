#!/usr/bin/env bash
# End-to-end runnable cURL walkthrough for the FactMap Scholar REST API (/api/v1).
# Usage:
#   1. Start the backend:  cd backend && ML_BACKEND=stub uvicorn app.main:app
#   2. Run from repo root: bash docs/api/examples/walkthrough.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
EMAIL="${DEMO_EMAIL:-walkthrough@ehu.lt}"
PASSWORD="${DEMO_PASSWORD:-WalkthroughPass123!}"

echo "==> 1. Health check"
curl -sf "$BASE_URL/health" | jq .

echo "==> 2. Register or sign in"
AUTH_JSON=$(curl -s -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"display_name\":\"API Walkthrough\"}")

if echo "$AUTH_JSON" | jq -e '.code == "duplicate_email"' >/dev/null 2>&1; then
  AUTH_JSON=$(curl -sf -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
fi

TOKEN=$(echo "$AUTH_JSON" | jq -r '.token')
echo "Authenticated as: $(echo "$AUTH_JSON" | jq -r '.user.email')"

echo "==> 3. Verify /auth/me"
curl -sf "$BASE_URL/api/v1/auth/me" -H "Authorization: Bearer $TOKEN" | jq .

echo "==> 4. Create project workspace"
PROJECT_NAME="API Walkthrough $(date +%s)"
PROJECT_ID=$(curl -sf -X POST "$BASE_URL/api/v1/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PROJECT_NAME\"}" | jq -r '.id')
echo "Project ID: $PROJECT_ID"

echo "==> 5. Upload sample scientific documents"
curl -sf -X POST "$BASE_URL/api/v1/projects/$PROJECT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@backend/scripts/sample_a.txt;type=text/plain" | jq '{id, original_name, status}'

curl -sf -X POST "$BASE_URL/api/v1/projects/$PROJECT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@backend/scripts/sample_b.txt;type=text/plain" | jq '{id, original_name, status}'

echo "==> 6. Trigger analysis (sync=true for deterministic walkthrough)"
curl -sf -X POST "$BASE_URL/api/v1/projects/$PROJECT_ID/analyze?sync=true" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo "==> 7. Check job statuses"
curl -sf "$BASE_URL/api/v1/projects/$PROJECT_ID/jobs" \
  -H "Authorization: Bearer $TOKEN" | jq '.jobs[] | {kind, status, progress_pct}'

echo "==> 8. Query extracted claims and evidence graph"
CLAIMS=$(curl -sf "$BASE_URL/api/v1/projects/$PROJECT_ID/claims?limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN")
echo "$CLAIMS" | jq '{total, sample_claim: .claims[0].text}'

curl -sf "$BASE_URL/api/v1/projects/$PROJECT_ID/graph?include_neutral=true" \
  -H "Authorization: Bearer $TOKEN" | jq '{nodes: (.nodes | length), edges: (.edges | length)}'

EVIDENCE_ID=$(echo "$CLAIMS" | jq -r '.claims[0].evidence[0].id // empty')
if [ -n "$EVIDENCE_ID" ]; then
  echo "==> 9. Override NLI label (preserving model_label)"
  curl -sf -X PATCH "$BASE_URL/api/v1/evidence/$EVIDENCE_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"user_label":"contradiction"}' | jq .
fi

echo "==> 10. Export CSV preview"
curl -sf "$BASE_URL/api/v1/projects/$PROJECT_ID/export?format=csv" \
  -H "Authorization: Bearer $TOKEN" | head -n 5

echo "==> 11. Cascade delete project (GDPR cleanup)"
curl -sf -X DELETE "$BASE_URL/api/v1/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo "Walkthrough completed successfully!"
