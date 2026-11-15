# Data dictionary — FactMap Scholar

PostgreSQL 16. Script: `ddl/001_init.sql`.  
Identifiers are UUID. Timestamps are `timestamptz` (UTC).  
File bytes are not stored in the database. `document.object_key` points at object storage.

Labels used below: **PK** primary key, **FK** foreign key, **UQ** unique, **CK** check.

## app_user

Account of a researcher.

| Column | Type | Null | Keys | Meaning |
|---|---|---|---|---|
| id | uuid | no | PK, default `gen_random_uuid()` | Account id |
| email | varchar(320) | no | UQ | Login. Stored lowercase (`ck_app_user_email_lower`) |
| password_hash | varchar(255) | no | | One-way hash (Argon2id or similar). Never a plaintext password |
| display_name | varchar(120) | no | | Name shown in the UI |
| created_at | timestamptz | no | default `now()` | Registration time |

## project

Named workspace that groups documents and results (US-01). Delete cascades to documents, jobs, claims, passages, candidates, and evidence (US-11).

| Column | Type | Null | Keys | Meaning |
|---|---|---|---|---|
| id | uuid | no | PK | Project id |
| owner_id | uuid | no | FK → app_user.id ON DELETE CASCADE | Owner. Another user cannot delete this row |
| name | varchar(200) | no | UQ with owner via `uq_project_owner_name` on `(owner_id, lower(name))`; CK non-blank | Display name. Empty and case-insensitive duplicates are rejected |
| created_at | timestamptz | no | | Creation time |

## document

One uploaded PDF or TXT file, at most 20 MB (US-02, US-02b).

| Column | Type | Null | Keys | Meaning |
|---|---|---|---|---|
| id | uuid | no | PK | Document id |
| project_id | uuid | no | FK → project.id CASCADE; index `(project_id, status)` | Parent project |
| original_name | varchar(500) | no | | File name as uploaded |
| media_type | varchar(100) | no | CK `application/pdf` or `text/plain` | MIME type |
| size_bytes | integer | no | CK `1 … 20971520` | Size. 20 MB = 20 × 1024 × 1024 |
| sha256 | char(64) | no | UQ `(project_id, sha256)`; CK hex | Content hash. Same file twice in one project is rejected |
| object_key | varchar(500) | no | UQ | Key of the original file in object storage |
| status | varchar(20) | no | CK `queued`, `processing`, `ready`, `failed` | Pipeline state |
| error_message | text | yes | CK required when `status = failed` | Human-readable failure reason |
| page_count | integer | yes | CK `> 0` when set | PDF page count. Null for TXT |
| extracted_text | text | yes | | Plain text after extraction. Null until status is `ready` |
| created_at | timestamptz | no | | Upload time |
| updated_at | timestamptz | no | trigger `trg_document_updated_at` | Last metadata or text update |

## analysis_job

One pipeline step for a project (US-02b, US-03, US-04, US-04b).

| Column | Type | Null | Keys | Meaning |
|---|---|---|---|---|
| id | uuid | no | PK | Job id |
| project_id | uuid | no | FK → project.id CASCADE; index `(project_id, created_at DESC)` | Project being analysed |
| kind | varchar(30) | no | CK `extract_text`, `extract_claims`, `retrieve`, `nli` | Step |
| status | varchar(20) | no | CK `queued`, `running`, `succeeded`, `failed` | Job state |
| progress_pct | smallint | no | CK 0…100 | Progress for the UI |
| error_message | text | yes | CK required when `failed` | Failure reason. A failed job is never stored as success |
| created_at | timestamptz | no | | Enqueued at |
| started_at | timestamptz | yes | CK `≥ created_at` | Worker start |
| finished_at | timestamptz | yes | CK `≥ started_at` | Worker finish |

## passage

Chunk used as a retrieval and NLI unit.

| Column | Type | Null | Keys | Meaning |
|---|---|---|---|---|
| id | uuid | no | PK | Passage id |
| document_id | uuid | no | FK → document.id CASCADE; index | Source document |
| ordinal | integer | no | UQ `(document_id, ordinal)`; CK `> 0` | Order inside the document |
| page_no | integer | yes | CK `> 0` when set | Page, if known |
| char_start | integer | no | CK `≥ 0` and `char_end > char_start` | Start offset in `document.extracted_text` |
| char_end | integer | no | | End offset, exclusive |
| text | text | no | CK non-blank | Excerpt shown in the UI |

## passage_embedding

Dense vector for semantic search (US-04). One row per passage and embedding model.

| Column | Type | Null | Keys | Meaning |
|---|---|---|---|---|
| passage_id | uuid | no | PK part; FK → passage.id CASCADE | Passage |
| model_name | varchar(200) | no | PK part | Embedding model id, e.g. a Sentence Transformers name |
| dimensions | smallint | no | CK `> 0` and equal to `cardinality(vector)` | Vector length |
| vector | real[] | no | | Embedding. No pgvector extension required |
| created_at | timestamptz | no | | Index time |

## claim

Atomic statement tied to a character span in a source document (US-03).

| Column | Type | Null | Keys | Meaning |
|---|---|---|---|---|
| id | uuid | no | PK | Claim id |
| project_id | uuid | no | FK → project.id CASCADE; index | Project |
| source_document_id | uuid | no | FK → document.id CASCADE; index | Document that contains the claim |
| char_start | integer | no | CK span | Start offset in that document’s extracted text |
| char_end | integer | no | | End offset, exclusive |
| page_no | integer | yes | CK `> 0` when set | Page, if known |
| text | text | no | CK non-blank | Claim text. Exact slice of `document.extracted_text` |
| confidence | numeric(4,3) | no | CK 0…1 | Extractor confidence |
| extractor_name | varchar(200) | no | | Id of the extractor that wrote the row. Replacing the MVP heuristic with an LLM does not add a column |
| created_at | timestamptz | no | | Stored at |

Trigger `trg_claim_same_project` rejects a claim whose `project_id` is not the project of `source_document_id`.

A claim with no `entailment` or `contradiction` row in `claim_evidence` is the explicit “no supporting/contradicting evidence” state (US-04b). The claim row stays.

## retrieval_candidate

Candidate passage for a claim before NLI. Product default is k = 5; the table allows rank 1…20 (US-04).

| Column | Type | Null | Keys | Meaning |
|---|---|---|---|---|
| claim_id | uuid | no | PK part; FK → claim.id CASCADE; UQ `(claim_id, rank)` | Claim |
| passage_id | uuid | no | PK part; FK → passage.id CASCADE | Candidate passage (may be another document in the same project) |
| rank | smallint | no | CK 1…20 | 1 = best candidate |
| score | numeric(6,5) | no | CK 0…1 | Retrieval score |

Trigger `trg_candidate_same_project` rejects a candidate whose passage belongs to another project.

## claim_evidence

NLI result. The passage is the premise; the claim is the hypothesis (US-04b, US-09).

| Column | Type | Null | Keys | Meaning |
|---|---|---|---|---|
| id | uuid | no | PK | Edge id |
| claim_id | uuid | no | FK → claim.id CASCADE; UQ `(claim_id, passage_id)`; index | Hypothesis |
| passage_id | uuid | no | FK → passage.id CASCADE; index | Premise |
| model_name | varchar(200) | no | | NLI model id |
| model_label | varchar(20) | no | CK `entailment`, `contradiction`, `neutral`; index | Model label. Not overwritten by the user |
| model_score | numeric(4,3) | no | CK 0…1 | Model confidence |
| user_label | varchar(20) | yes | CK same three labels, or null | Optional human override. Null means no override |
| updated_at | timestamptz | no | trigger | Last change, including an override |

Trigger `trg_evidence_same_project` rejects an edge whose passage belongs to another project.

Map filters (US-05b) read `model_label`, or `user_label` when it is not null. Export (US-08) includes both.

## Relationships

| From | To | Cardinality | On delete |
|---|---|---|---|
| project.owner_id | app_user.id | N : 1 | cascade |
| document.project_id | project.id | N : 1 | cascade |
| analysis_job.project_id | project.id | N : 1 | cascade |
| passage.document_id | document.id | N : 1 | cascade |
| passage_embedding.passage_id | passage.id | N : 1 | cascade |
| claim.project_id | project.id | N : 1 | cascade |
| claim.source_document_id | document.id | N : 1 | cascade |
| retrieval_candidate.claim_id | claim.id | N : 1 | cascade |
| retrieval_candidate.passage_id | passage.id | N : 1 | cascade |
| claim_evidence.claim_id | claim.id | N : 1 | cascade |
| claim_evidence.passage_id | passage.id | N : 1 | cascade |

Deleting a document removes its passages and claims that were extracted from it. Evidence and candidates that only *cite* those passages are removed by the passage foreign key. Claims extracted from other documents remain.

## What is intentionally not a table

- Original file bytes — object storage, referenced by `object_key`.
- Graph database — claim/document/evidence is the evidence map. Edges are `claim_evidence` rows.
- Sessions and API tokens — not in this script. If added later, store a hash of the token, not the token.
- Secrets — no passwords, cloud keys, or connection strings belong in the repository. Local credentials stay in an untracked `.env`.
