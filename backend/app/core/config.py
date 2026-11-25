import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from app.core.constants import MAX_UPLOAD_BYTES

ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv_file(env_path: Path) -> None:
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def _parse_class_weights(raw: str) -> tuple[float, float, float]:
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if len(parts) != 3:
        raise ValueError(f"NLI_CLASS_WEIGHTS must have 3 comma-separated floats, got {raw!r}")
    w_e, w_c, w_n = (float(parts[0]), float(parts[1]), float(parts[2]))
    if min(w_e, w_c, w_n) <= 0:
        raise ValueError(f"NLI_CLASS_WEIGHTS must all be > 0, got {raw!r}")
    return (w_e, w_c, w_n)


def _parse_csv_list(raw: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in raw.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    database_url: str
    storage_dir: Path
    jwt_secret: str
    jwt_algorithm: str
    jwt_ttl_seconds: int
    cors_origins: tuple[str, ...]
    rate_limit_per_minute: int
    max_upload_bytes: int
    ml_backend: str  # "transformers" | "stub"
    embedding_model: str
    nli_model: str
    nli_class_weights: tuple[float, float, float]
    nli_max_length: int
    claim_mode: str  # "hybrid" | "nli"
    claim_threshold: float
    max_claims_per_doc: int
    passage_target_chars: int
    top_k: int
    min_retrieval_score: float
    ml_batch_size: int
    ml_device: str  # "cpu" | "cuda" | "auto"
    log_level: str


_EPHEMERAL_FALLBACK_SECRET = secrets.token_urlsafe(48)


def load_settings() -> Settings:
    _load_dotenv_file(ROOT / ".env")
    raw_db = os.environ.get(
        "DATABASE_URL",
        "sqlite:///" + str((ROOT / "factmap_dev.db").resolve()).replace("\\", "/"),
    )
    jwt_secret = os.environ.get("JWT_SECRET") or os.environ.get("TOKEN_SECRET") or _EPHEMERAL_FALLBACK_SECRET
    ml_backend = os.environ.get("ML_BACKEND", "transformers").strip().lower()
    default_min_ret = "0.20" if ml_backend == "stub" else "0.35"
    min_retrieval_score = max(0.0, min(1.0, float(os.environ.get("MIN_RETRIEVAL_SCORE", default_min_ret))))
    return Settings(
        database_url=_normalize_database_url(raw_db),
        storage_dir=Path(os.environ.get("STORAGE_DIR", str(ROOT / "storage"))),
        jwt_secret=jwt_secret,
        jwt_algorithm=os.environ.get("JWT_ALGORITHM", "HS256"),
        jwt_ttl_seconds=int(os.environ.get("JWT_TTL_SECONDS", str(24 * 3600))),
        cors_origins=_parse_csv_list(
            os.environ.get(
                "CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
            )
        ),
        rate_limit_per_minute=max(1, int(os.environ.get("RATE_LIMIT_PER_MINUTE", "60"))),
        max_upload_bytes=MAX_UPLOAD_BYTES,
        ml_backend=ml_backend,
        embedding_model=os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5"),
        nli_model=os.environ.get("NLI_MODEL", "cross-encoder/nli-deberta-v3-xsmall"),
        nli_class_weights=_parse_class_weights(os.environ.get("NLI_CLASS_WEIGHTS", "16.0,1.5,1.0")),
        nli_max_length=max(128, int(os.environ.get("NLI_MAX_LENGTH", "320"))),
        claim_mode=os.environ.get("CLAIM_MODE", "hybrid").strip().lower(),
        claim_threshold=float(os.environ.get("CLAIM_THRESHOLD", "0.55")),
        max_claims_per_doc=int(os.environ.get("MAX_CLAIMS_PER_DOC", "40")),
        passage_target_chars=int(os.environ.get("PASSAGE_TARGET_CHARS", "650")),
        top_k=max(1, min(20, int(os.environ.get("TOP_K", "5")))),
        min_retrieval_score=min_retrieval_score,
        ml_batch_size=max(1, int(os.environ.get("ML_BATCH_SIZE", "16"))),
        ml_device=os.environ.get("ML_DEVICE", "cpu").strip().lower(),
        log_level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    )


settings = load_settings()
