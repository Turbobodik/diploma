from typing import Literal

from pydantic import BaseModel, EmailStr, Field

NliLabelLiteral = Literal["entailment", "contradiction", "neutral"]


class ErrorOut(BaseModel):
    code: str = Field(description="Machine-readable error code", examples=["not_found"])
    message: str = Field(description="Human-readable error explanation", examples=["Project not found"])
    request_id: str | None = Field(
        default=None,
        description="Correlation ID echoed in X-Request-ID for tracing",
        examples=["f47ac10b-58cc-4372-a567-0e02b2c3d479"],
    )


class HealthOut(BaseModel):
    status: str = Field(description="Service health indicator", examples=["ok"])
    version: str = Field(description="API semantic version", examples=["1.0.0"])
    ml_backend: str = Field(description="Active ML execution backend", examples=["transformers"])
    embedding_model: str = Field(description="Dense retrieval model ID", examples=["BAAI/bge-small-en-v1.5"])
    nli_model: str = Field(description="NLI cross-encoder model ID", examples=["cross-encoder/nli-deberta-v3-xsmall"])


class RegisterIn(BaseModel):
    email: EmailStr = Field(description="Unique lowercase researcher email", examples=["researcher@ehu.lt"])
    password: str = Field(min_length=8, max_length=200, description="Account password (hashed with Argon2id)", examples=["StrongPass123!"])
    display_name: str = Field(min_length=1, max_length=120, description="Name displayed in the workspace UI", examples=["Bahdan Kanoplich"])


class LoginIn(BaseModel):
    email: EmailStr = Field(description="Registered account email", examples=["researcher@ehu.lt"])
    password: str = Field(min_length=1, max_length=200, description="Account password", examples=["StrongPass123!"])


class UserOut(BaseModel):
    id: str = Field(description="UUID of the researcher account", examples=["3fa85f64-5717-4562-b3fc-2c963f66afa6"])
    email: str = Field(description="Normalized lowercase email", examples=["researcher@ehu.lt"])
    display_name: str = Field(description="Display name", examples=["Bahdan Kanoplich"])


class AuthOut(BaseModel):
    token: str = Field(description="RFC 7519 Bearer JWT access token", examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."])
    token_type: str = Field(default="bearer", description="Token scheme", examples=["bearer"])
    expires_in: int = Field(description="Token lifetime in seconds", examples=[86400])
    user: UserOut


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200, description="Unique project name per owner", examples=["Scientific NLI Literature Review"])


class ProjectOut(BaseModel):
    id: str = Field(description="Project UUID", examples=["a3fc0bc4-b7be-46b2-abf3-273bf7c2737a"])
    name: str = Field(description="Project name", examples=["Scientific NLI Literature Review"])
    document_count: int = Field(default=0, description="Number of uploaded documents in the project", examples=[4])
    claim_count: int = Field(default=0, description="Number of extracted claims in the project", examples=[28])
    created_at: str = Field(description="ISO-8601 UTC creation timestamp", examples=["2026-11-23T10:15:00+00:00"])


class ProjectListOut(BaseModel):
    projects: list[ProjectOut]
    total: int = Field(description="Total matching projects owned by the user", examples=[2])
    limit: int = Field(description="Page size applied", examples=[50])
    offset: int = Field(description="Pagination offset applied", examples=[0])


class DeleteOut(BaseModel):
    deleted: str = Field(description="UUID of the deleted project", examples=["a3fc0bc4-b7be-46b2-abf3-273bf7c2737a"])


class DocumentOut(BaseModel):
    id: str = Field(description="Document UUID", examples=["60912035-012f-4d08-8c1e-f7d3b3b42fb2"])
    original_name: str = Field(description="Original filename supplied at upload", examples=["scifact_2020.pdf"])
    media_type: str = Field(description="Validated MIME type", examples=["application/pdf"])
    size_bytes: int = Field(description="File size in bytes (1..20971520)", examples=[482910])
    status: str = Field(description="Pipeline extraction status (queued|processing|ready|failed)", examples=["ready"])
    error_message: str | None = Field(default=None, description="Human-readable error reason when status=failed")
    page_count: int | None = Field(default=None, description="PDF page count (null for plain text)", examples=[11])
    created_at: str = Field(description="ISO-8601 UTC upload timestamp", examples=["2026-11-23T10:16:00+00:00"])


class DocumentListOut(BaseModel):
    documents: list[DocumentOut]
    total: int = Field(description="Total documents in project", examples=[4])
    limit: int = Field(description="Page size applied", examples=[50])
    offset: int = Field(description="Pagination offset applied", examples=[0])


class JobOut(BaseModel):
    id: str = Field(description="Analysis job UUID")
    kind: str = Field(description="Pipeline stage (extract_text|extract_claims|retrieve|nli)", examples=["nli"])
    status: str = Field(description="Execution status (queued|running|succeeded|failed)", examples=["succeeded"])
    progress_pct: int = Field(description="Completion percentage 0..100", examples=[100])
    error_message: str | None = Field(default=None, description="Failure diagnostic when status=failed")
    created_at: str = Field(description="ISO-8601 UTC enqueue timestamp")
    started_at: str | None = Field(default=None, description="ISO-8601 UTC worker start timestamp")
    finished_at: str | None = Field(default=None, description="ISO-8601 UTC worker finish timestamp")


class JobListOut(BaseModel):
    jobs: list[JobOut]


class AnalyzeStartedOut(BaseModel):
    status: str = Field(description="Initial execution status (queued or succeeded when sync=true)", examples=["queued"])
    project_id: str = Field(description="Target project UUID")
    job_ids: list[str] = Field(description="Ordered UUIDs for extract_claims, retrieve, and nli jobs")


class EvidenceOut(BaseModel):
    id: str = Field(description="Evidence edge UUID")
    passage_id: str = Field(description="Source passage UUID")
    document_id: str = Field(description="Document UUID containing the passage")
    document_name: str = Field(description="Filename of the evidence document", examples=["scinli_2022.pdf"])
    page_no: int | None = Field(default=None, description="1-based page number for PDFs", examples=[4])
    char_start: int = Field(description="Start character offset in extracted_text", examples=[1204])
    char_end: int = Field(description="Exclusive end character offset", examples=[1480])
    passage_text: str = Field(description="Verbatim excerpt from the source document")
    model_name: str = Field(description="NLI model identifier", examples=["cross-encoder/nli-deberta-v3-xsmall"])
    model_label: NliLabelLiteral = Field(description="Original model prediction", examples=["contradiction"])
    model_score: float = Field(description="Calibrated confidence score in [0, 1]", examples=[0.812])
    user_label: NliLabelLiteral | None = Field(default=None, description="Optional researcher override (US-09)")
    effective_label: NliLabelLiteral = Field(description="user_label if set, otherwise model_label", examples=["contradiction"])


class ClaimOut(BaseModel):
    id: str = Field(description="Claim UUID")
    source_document_id: str = Field(description="Document UUID from which the claim was extracted")
    source_name: str = Field(description="Filename of the source document", examples=["scifact_2020.pdf"])
    page_no: int | None = Field(default=None, description="1-based PDF page number", examples=[2])
    char_start: int = Field(description="Start offset of exact claim slice", examples=[412])
    char_end: int = Field(description="Exclusive end offset of exact claim slice", examples=[538])
    text: str = Field(description="Verbatim extracted claim sentence")
    confidence: float = Field(description="Claim-worthiness confidence in [0, 1]", examples=[0.845])
    extractor_name: str = Field(description="Claim extractor identifier", examples=["local-hybrid-claim-v1:BAAI/bge-small-en-v1.5"])
    has_evidence: bool = Field(description="True if at least one non-neutral evidence edge exists; False triggers explicit empty-evidence state (US-04b)")
    evidence: list[EvidenceOut]


class ClaimsResponseOut(BaseModel):
    claims: list[ClaimOut]
    total: int = Field(description="Total claims matching the active filters", examples=[12])
    limit: int = Field(description="Page size applied", examples=[50])
    offset: int = Field(description="Pagination offset applied", examples=[0])
    jobs: list[JobOut]


class GraphNodeOut(BaseModel):
    id: str = Field(description="Typed graph node ID (doc:<uuid>, claim:<uuid>, passage:<uuid>)")
    type: Literal["document", "claim", "passage"] = Field(description="Graph node category")
    label: str = Field(description="Display label or snippet")
    document_id: str | None = Field(default=None)
    page_no: int | None = Field(default=None)
    has_evidence: bool | None = Field(default=None)
    confidence: float | None = Field(default=None)


class GraphEdgeOut(BaseModel):
    id: str = Field(description="Graph edge identifier")
    source: str = Field(description="Source node ID")
    target: str = Field(description="Target node ID")
    kind: Literal["extracted_from", "evidence"] = Field(description="Edge semantics")
    label: NliLabelLiteral | None = Field(default=None, description="Effective NLI label for evidence edges")
    model_label: NliLabelLiteral | None = Field(default=None)
    user_label: NliLabelLiteral | None = Field(default=None)
    score: float | None = Field(default=None)


class GraphOut(BaseModel):
    project_id: str
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]


class OverrideIn(BaseModel):
    user_label: NliLabelLiteral | None = Field(
        description="Human override label, or null to restore the model label",
        examples=["contradiction"],
    )


class OverrideOut(BaseModel):
    id: str = Field(description="Evidence edge UUID")
    user_label: NliLabelLiteral | None = Field(description="Updated override label")
