# Data Models

Pydantic schemas live in [`backend/app/models/schemas.py`](../../../backend/app/models/schemas.py) and TypeScript client types in [`frontend/src/models/api.ts`](../../../frontend/src/models/api.ts).

## Enums

| Enum | Values | Description |
|---|---|---|
| `NliLabel` | `entailment`, `contradiction`, `neutral` | NLI relation between evidence passage (premise) and claim (hypothesis) |
| `DocumentStatus` | `queued`, `processing`, `ready`, `failed` | Text extraction status |
| `JobKind` | `extract_text`, `extract_claims`, `retrieve`, `nli` | Pipeline stage |
| `JobStatus` | `queued`, `running`, `succeeded`, `failed` | Job execution state |
| `GraphNodeType` | `document`, `claim`, `passage` | Graph node type |
| `GraphEdgeKind` | `extracted_from`, `evidence` | Graph edge type |

## Resource schemas

### `AuthOut` and `UserOut`

| Field | Type | Notes |
|---|---|---|
| `token` | `string` | Bearer JWT access token |
| `token_type` | `string` | `"bearer"` |
| `expires_in` | `integer` | Lifetime in seconds (default `86400`) |
| `user.id` | `string (uuid)` | User ID |
| `user.email` | `string (email)` | Lowercased email |
| `user.display_name` | `string` | 1-120 chars |

### `ProjectOut` and `ProjectListOut`

| Field | Type | Notes |
|---|---|---|
| `id` | `string (uuid)` | Project ID |
| `name` | `string` | 1-200 chars, unique per owner (case-insensitive) |
| `document_count` | `integer` | Document count |
| `claim_count` | `integer` | Extracted claim count |
| `created_at` | `string (date-time)` | ISO-8601 UTC |
| `total`, `limit`, `offset` | `integer` | Pagination fields on `ProjectListOut` |

### `DocumentOut`

| Field | Type | Notes |
|---|---|---|
| `id` | `string (uuid)` | Document ID |
| `original_name` | `string` | Uploaded filename |
| `media_type` | `string` | `application/pdf` or `text/plain` |
| `size_bytes` | `integer` | `1..20971520` |
| `status` | `DocumentStatus` | `queued \| processing \| ready \| failed` |
| `error_message` | `string \| null` | Present when `status == "failed"` |
| `page_count` | `integer \| null` | PDF page count (`null` for plain text) |
| `created_at` | `string (date-time)` | ISO-8601 UTC |

### `JobOut`

| Field | Type | Notes |
|---|---|---|
| `id` | `string (uuid)` | Job ID |
| `kind` | `JobKind` | `extract_text \| extract_claims \| retrieve \| nli` |
| `status` | `JobStatus` | `queued \| running \| succeeded \| failed` |
| `progress_pct` | `integer` | `0..100` |
| `error_message` | `string \| null` | Present when `status == "failed"` |
| `created_at`, `started_at`, `finished_at` | `string \| null` | ISO-8601 UTC |

### `ClaimOut` and `EvidenceOut`

| Field | Type | Notes |
|---|---|---|
| `ClaimOut.id` | `string (uuid)` | Claim ID |
| `ClaimOut.source_document_id` | `string (uuid)` | Source document ID |
| `ClaimOut.source_name` | `string` | Source document filename |
| `ClaimOut.page_no` | `integer \| null` | 1-based PDF page number |
| `ClaimOut.char_start`, `char_end` | `integer` | `[start, end)` offsets in extracted text |
| `ClaimOut.text` | `string` | Extracted claim sentence |
| `ClaimOut.confidence` | `number` | Claim-worthiness score in `[0.0, 1.0]` |
| `ClaimOut.extractor_name` | `string` | Extractor identifier |
| `ClaimOut.has_evidence` | `boolean` | `true` if at least one non-neutral edge exists |
| `EvidenceOut.id` | `string (uuid)` | Evidence edge ID |
| `EvidenceOut.passage_text` | `string` | Verbatim passage excerpt |
| `EvidenceOut.model_label` | `NliLabel` | Original model prediction (preserved on override) |
| `EvidenceOut.model_score` | `number` | Calibrated score in `[0.0, 1.0]` |
| `EvidenceOut.user_label` | `NliLabel \| null` | Optional user override |
| `EvidenceOut.effective_label` | `NliLabel` | `user_label` if set, otherwise `model_label` |

### `GraphOut` (`GraphNodeOut` and `GraphEdgeOut`)

| Field | Type | Notes |
|---|---|---|
| `nodes[].id` | `string` | Prefixed ID: `doc:<uuid>`, `claim:<uuid>`, `passage:<uuid>` |
| `nodes[].type` | `GraphNodeType` | `document \| claim \| passage` |
| `edges[].source`, `target` | `string` | Connected node IDs |
| `edges[].kind` | `GraphEdgeKind` | `extracted_from` or `evidence` |
| `edges[].label` | `NliLabel \| null` | Effective NLI label on `evidence` edges |
| `edges[].model_label`, `user_label` | `NliLabel \| null` | Model label and optional override |
| `edges[].score` | `number \| null` | Calibrated NLI score |
