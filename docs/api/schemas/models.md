# Data Models & Schemas Reference

All request and response payloads are strictly validated by Pydantic v2 ([`backend/app/models/schemas.py`](../../../backend/app/models/schemas.py)) and mirrored 1:1 in the Front-End TypeScript models ([`frontend/src/models/api.ts`](../../../frontend/src/models/api.ts)).

---

## Enumerations

| Enum | Allowed Values | Meaning |
|---|---|---|
| `NliLabel` | `entailment`, `contradiction`, `neutral` | 3-way Natural Language Inference relation between evidence passage (premise) and claim (hypothesis) |
| `DocumentStatus` | `queued`, `processing`, `ready`, `failed` | Document text extraction lifecycle state |
| `JobKind` | `extract_text`, `extract_claims`, `retrieve`, `nli` | Ordered ML pipeline stage identifier |
| `JobStatus` | `queued`, `running`, `succeeded`, `failed` | Asynchronous worker execution status |
| `GraphNodeType` | `document`, `claim`, `passage` | Node category in `/graph` responses |
| `GraphEdgeKind` | `extracted_from`, `evidence` | Directed edge type in `/graph` responses |

---

## Core Resource Schemas

### `UserOut` & `AuthOut`
| Field | Type | Constraints / Notes |
|---|---|---|
| `token` | `string` | RFC 7519 Bearer JWT access token |
| `token_type` | `string` | Always `"bearer"` |
| `expires_in` | `integer` | Token lifetime in seconds (default `86400`) |
| `user.id` | `string (uuid)` | Unique researcher account ID |
| `user.email` | `string (email)` | Normalized lowercase email |
| `user.display_name` | `string` | `1..120` chars |

### `ProjectOut` & `ProjectListOut`
| Field | Type | Constraints / Notes |
|---|---|---|
| `id` | `string (uuid)` | Project workspace ID |
| `name` | `string` | `1..200` chars, unique per owner (case-insensitive) |
| `document_count` | `integer` | Number of documents in project |
| `claim_count` | `integer` | Number of extracted claims in project |
| `created_at` | `string (date-time)` | ISO-8601 UTC timestamp |
| `total`, `limit`, `offset` | `integer` | Pagination metadata on `ProjectListOut` |

### `DocumentOut`
| Field | Type | Constraints / Notes |
|---|---|---|
| `id` | `string (uuid)` | Document ID |
| `original_name` | `string` | Original uploaded filename |
| `media_type` | `string` | `application/pdf` or `text/plain` |
| `size_bytes` | `integer` | `1..20971520` (<= 20 MB) |
| `status` | `DocumentStatus` | `queued \| processing \| ready \| failed` |
| `error_message` | `string \| null` | Diagnostic reason when `status == "failed"` |
| `page_count` | `integer \| null` | PDF page count (`null` for plain text) |
| `created_at` | `string (date-time)` | ISO-8601 UTC timestamp |

### `JobOut`
| Field | Type | Constraints / Notes |
|---|---|---|
| `id` | `string (uuid)` | Job UUID |
| `kind` | `JobKind` | `extract_text \| extract_claims \| retrieve \| nli` |
| `status` | `JobStatus` | `queued \| running \| succeeded \| failed` |
| `progress_pct` | `integer` | `0..100` |
| `error_message` | `string \| null` | Failure details if `status == "failed"` |
| `created_at`, `started_at`, `finished_at` | `string \| null` | ISO-8601 UTC lifecycle timestamps |

### `ClaimOut` & `EvidenceOut`
| Field | Type | Constraints / Notes |
|---|---|---|
| `ClaimOut.id` | `string (uuid)` | Claim UUID |
| `ClaimOut.source_document_id` | `string (uuid)` | Document from which the claim was extracted |
| `ClaimOut.source_name` | `string` | Source document filename |
| `ClaimOut.page_no` | `integer \| null` | 1-based PDF page number |
| `ClaimOut.char_start`, `char_end` | `integer` | Exact `[start, end)` character offsets in extracted text |
| `ClaimOut.text` | `string` | Verbatim extracted claim sentence |
| `ClaimOut.confidence` | `number` | Claim-worthiness score in `[0.0, 1.0]` |
| `ClaimOut.extractor_name` | `string` | Model/extractor version string |
| `ClaimOut.has_evidence` | `boolean` | `true` if >= 1 non-neutral edge exists; `false` triggers explicit empty-evidence UX state (US-04b) |
| `EvidenceOut.id` | `string (uuid)` | Evidence edge UUID (used in `PATCH /api/v1/evidence/{id}`) |
| `EvidenceOut.passage_text` | `string` | Verbatim evidence excerpt from source document |
| `EvidenceOut.model_label` | `NliLabel` | Original immutable NLI model prediction |
| `EvidenceOut.model_score` | `number` | Calibrated confidence in `[0.0, 1.0]` |
| `EvidenceOut.user_label` | `NliLabel \| null` | Optional researcher override (US-09) |
| `EvidenceOut.effective_label` | `NliLabel` | `user_label` if set, otherwise `model_label` |

### `GraphOut` (`GraphNodeOut` & `GraphEdgeOut`)
| Field | Type | Notes |
|---|---|---|
| `nodes[].id` | `string` | Typed prefix: `doc:<uuid>`, `claim:<uuid>`, `passage:<uuid>` |
| `nodes[].type` | `GraphNodeType` | `document \| claim \| passage` |
| `edges[].source`, `target` | `string` | Node IDs connected by this edge |
| `edges[].kind` | `GraphEdgeKind` | `extracted_from` (doc→claim) or `evidence` (claim→passage) |
| `edges[].label` | `NliLabel \| null` | Effective NLI label for `evidence` edges |
| `edges[].model_label`, `user_label` | `NliLabel \| null` | Preserved model prediction and optional override |
| `edges[].score` | `number \| null` | Calibrated NLI score |
