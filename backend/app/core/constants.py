from enum import StrEnum


class DocumentStatus(StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class JobKind(StrEnum):
    EXTRACT_TEXT = "extract_text"
    EXTRACT_CLAIMS = "extract_claims"
    RETRIEVE = "retrieve"
    NLI = "nli"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class NliLabel(StrEnum):
    ENTAILMENT = "entailment"
    CONTRADICTION = "contradiction"
    NEUTRAL = "neutral"


class MediaType(StrEnum):
    PDF = "application/pdf"
    TEXT = "text/plain"


class ErrorCode(StrEnum):
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    NOT_FOUND = "not_found"
    DUPLICATE_EMAIL = "duplicate_email"
    DUPLICATE_NAME = "duplicate_name"
    DUPLICATE_FILE = "duplicate_file"
    INVALID_LOGIN = "invalid_login"
    EMPTY_NAME = "empty_name"
    BAD_TYPE = "bad_type"
    BAD_SIZE = "bad_size"
    EXTRACT_FAILED = "extract_failed"
    NOT_READY = "not_ready"
    ALREADY_RUNNING = "already_running"
    RATE_LIMITED = "rate_limited"
    VALIDATION_ERROR = "validation_error"
    INTERNAL_ERROR = "internal_error"


ALLOWED_MEDIA_EXTENSIONS: dict[str, str] = {
    MediaType.PDF.value: ".pdf",
    MediaType.TEXT.value: ".txt",
}

PIPELINE_STAGES: tuple[JobKind, ...] = (
    JobKind.EXTRACT_CLAIMS,
    JobKind.RETRIEVE,
    JobKind.NLI,
)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
DEFAULT_PAGE_LIMIT = 50
MAX_PAGE_LIMIT = 200
HEADER_REQUEST_ID = "X-Request-ID"
JWT_ISSUER = "factmap-scholar"
JWT_TOKEN_TYPE = "access"
CACHE_TTL_SECONDS = 30.0
