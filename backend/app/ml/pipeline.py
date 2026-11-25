from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import sessionmaker

from app.core.cache import project_cache
from app.core.config import Settings
from app.core.config import settings as default_settings
from app.core.constants import DocumentStatus, JobKind, JobStatus, MediaType
from app.core.metrics import ANALYSIS_JOBS_TOTAL
from app.db import SessionLocal
from app.ml.chunker import split_passages
from app.ml.claim_extractor import LocalClaimExtractor
from app.ml.embedder import Embedder, SentenceTransformersEmbedder, StubEmbedder
from app.ml.nli import NLIClassifier, StubNLIClassifier, TransformersNLIClassifier
from app.models.orm import (
    AnalysisJob,
    Claim,
    ClaimEvidence,
    Document,
    Passage,
    PassageEmbedding,
    RetrievalCandidate,
)

logger = logging.getLogger("factmap.pipeline")


@dataclass
class MLComponents:
    embedder: Embedder
    nli: NLIClassifier
    claim_extractor: LocalClaimExtractor


_cache_lock = threading.Lock()
_cached_key: tuple | None = None
_cached_components: MLComponents | None = None


def build_ml_components(cfg: Settings) -> MLComponents:
    if cfg.ml_backend == "stub":
        embedder: Embedder = StubEmbedder()
        nli: NLIClassifier = StubNLIClassifier()
    elif cfg.ml_backend == "transformers":
        embedder = SentenceTransformersEmbedder(
            cfg.embedding_model,
            device=cfg.ml_device,
            batch_size=cfg.ml_batch_size,
        )
        nli = TransformersNLIClassifier(
            cfg.nli_model,
            device=cfg.ml_device,
            batch_size=cfg.ml_batch_size,
            max_length=cfg.nli_max_length,
            class_weights=cfg.nli_class_weights,
        )
    else:
        raise ValueError(f"Unsupported ML_BACKEND={cfg.ml_backend!r} (expected 'transformers' or 'stub')")

    extractor = LocalClaimExtractor(
        mode=cfg.claim_mode,
        threshold=cfg.claim_threshold,
        max_claims_per_doc=cfg.max_claims_per_doc,
        embedder=embedder,
        nli_classifier=nli if cfg.claim_mode == "nli" else None,
    )
    return MLComponents(embedder=embedder, nli=nli, claim_extractor=extractor)


def get_ml_components(cfg: Settings | None = None) -> MLComponents:
    global _cached_key, _cached_components
    active = cfg or default_settings
    key = (
        active.ml_backend,
        active.embedding_model,
        active.nli_model,
        active.nli_class_weights,
        active.nli_max_length,
        active.claim_mode,
        active.claim_threshold,
        active.max_claims_per_doc,
        active.ml_batch_size,
        active.ml_device,
    )
    with _cache_lock:
        if _cached_components is not None and _cached_key == key:
            return _cached_components
        t0 = time.perf_counter()
        logger.info(
            "Loading ML components backend=%s embed=%s nli=%s claim_mode=%s device=%s",
            active.ml_backend,
            active.embedding_model,
            active.nli_model,
            active.claim_mode,
            active.ml_device,
        )
        _cached_components = build_ml_components(active)
        _cached_key = key
        logger.info("Loaded ML components in %.2fs", time.perf_counter() - t0)
        return _cached_components


def _update_job(
    job_id: str,
    *,
    status: JobStatus | None = None,
    progress_pct: int | None = None,
    error_message: str | None = None,
    mark_started: bool = False,
    mark_finished: bool = False,
    session_factory: sessionmaker = SessionLocal,
) -> None:
    """Persist job state on its own short session so progress survives rollbacks."""
    now = datetime.now(UTC)
    with session_factory() as db:
        job = db.get(AnalysisJob, job_id)
        if job is None:
            return
        if status is not None:
            job.status = status.value
        if progress_pct is not None:
            job.progress_pct = max(0, min(100, int(progress_pct)))
        if error_message is not None:
            job.error_message = error_message[:1000]
        created = job.created_at.replace(tzinfo=UTC) if job.created_at and job.created_at.tzinfo is None else job.created_at
        if mark_started and job.started_at is None:
            job.started_at = max(now, created) if created else now
        if mark_finished:
            if job.started_at is None:
                job.started_at = max(now, created) if created else now
            started = job.started_at.replace(tzinfo=UTC) if job.started_at.tzinfo is None else job.started_at
            job.finished_at = max(now, started)
        db.commit()


def run_project_pipeline(
    project_id: str,
    job_ids: dict[str, str],
    *,
    cfg: Settings | None = None,
    components: MLComponents | None = None,
    session_factory: sessionmaker = SessionLocal,
) -> dict[str, int]:
    """Execute extract_claims -> retrieve -> nli for a project via SQLAlchemy ORM."""
    active_cfg = cfg or default_settings
    t_all = time.perf_counter()
    active_stage = JobKind.EXTRACT_CLAIMS.value

    try:
        ml = components or get_ml_components(active_cfg)

        with session_factory() as db:
            docs = list(
                db.scalars(
                    select(Document)
                    .where(Document.project_id == project_id, Document.status == DocumentStatus.READY.value)
                    .order_by(Document.created_at.asc())
                ).all()
            )
            if not docs:
                raise RuntimeError("No ready documents found in project")

            # --- Stage 1: Passages + Embeddings + Claim Extraction ---
            active_stage = JobKind.EXTRACT_CLAIMS.value
            _update_job(
                job_ids[active_stage],
                status=JobStatus.RUNNING,
                progress_pct=5,
                mark_started=True,
                session_factory=session_factory,
            )

            doc_passages: list[dict] = []
            doc_claims: list[dict] = []

            for idx, doc in enumerate(docs):
                text = doc.extracted_text or ""
                is_pdf = doc.media_type == MediaType.PDF.value
                for p in split_passages(text, is_pdf=is_pdf, target_chars=active_cfg.passage_target_chars):
                    doc_passages.append(
                        {
                            "document_id": str(doc.id),
                            "ordinal": p.ordinal,
                            "page_no": p.page_no,
                            "char_start": p.char_start,
                            "char_end": p.char_end,
                            "text": p.text,
                        }
                    )
                for c in ml.claim_extractor.extract(text, is_pdf=is_pdf):
                    doc_claims.append(
                        {
                            "document_id": str(doc.id),
                            "char_start": c.char_start,
                            "char_end": c.char_end,
                            "page_no": c.page_no,
                            "text": c.text,
                            "confidence": c.confidence,
                            "extractor_name": c.extractor_name,
                        }
                    )
                pct = 10 + int(45 * (idx + 1) / max(1, len(docs)))
                _update_job(job_ids[active_stage], progress_pct=pct, session_factory=session_factory)

            passage_vecs = ml.embedder.encode_passages([p["text"] for p in doc_passages])
            _update_job(job_ids[active_stage], progress_pct=85, session_factory=session_factory)

            # Atomic replace inside single transaction (UC-01 A3)
            doc_ids = [doc.id for doc in docs]
            db.execute(delete(Claim).where(Claim.project_id == project_id))
            if doc_ids:
                db.execute(delete(Passage).where(Passage.document_id.in_(doc_ids)))
            db.flush()

            for i, p in enumerate(doc_passages):
                orm_p = Passage(
                    document_id=p["document_id"],
                    ordinal=p["ordinal"],
                    page_no=p["page_no"],
                    char_start=p["char_start"],
                    char_end=p["char_end"],
                    text=p["text"],
                )
                db.add(orm_p)
                db.flush()
                p["id"] = orm_p.id
                db.add(
                    PassageEmbedding(
                        passage_id=orm_p.id,
                        model_name=ml.embedder.model_name,
                        dimensions=ml.embedder.dimensions,
                        vector=[float(x) for x in passage_vecs[i].tolist()],
                    )
                )

            for c in doc_claims:
                orm_c = Claim(
                    project_id=project_id,
                    source_document_id=c["document_id"],
                    char_start=c["char_start"],
                    char_end=c["char_end"],
                    page_no=c["page_no"],
                    text=c["text"],
                    confidence=Decimal(f"{c['confidence']:.3f}"),
                    extractor_name=c["extractor_name"],
                )
                db.add(orm_c)
                db.flush()
                c["id"] = orm_c.id

            _update_job(
                job_ids[active_stage],
                status=JobStatus.SUCCEEDED,
                progress_pct=100,
                mark_finished=True,
                session_factory=session_factory,
            )

            # --- Stage 2: Dense Retrieval ---
            active_stage = JobKind.RETRIEVE.value
            _update_job(
                job_ids[active_stage],
                status=JobStatus.RUNNING,
                progress_pct=10,
                mark_started=True,
                session_factory=session_factory,
            )

            nli_pairs: list[tuple[str, str, str, str]] = []
            if doc_claims and doc_passages:
                claim_vecs = ml.embedder.encode_queries([c["text"] for c in doc_claims])
                sim_matrix = np.matmul(claim_vecs, passage_vecs.T)
                _update_job(job_ids[active_stage], progress_pct=55, session_factory=session_factory)

                for ci, claim in enumerate(doc_claims):
                    scores_row = sim_matrix[ci]
                    ranked: list[tuple[float, dict]] = []
                    for pi, passage in enumerate(doc_passages):
                        same_doc = passage["document_id"] == claim["document_id"]
                        overlaps = not (
                            passage["char_end"] <= claim["char_start"]
                            or passage["char_start"] >= claim["char_end"]
                        )
                        if same_doc and overlaps:
                            continue
                        clamped = float(max(0.0, min(1.0, float(scores_row[pi]))))
                        if clamped < active_cfg.min_retrieval_score:
                            continue
                        ranked.append((clamped, passage))

                    ranked.sort(key=lambda item: item[0], reverse=True)
                    for rank, (score, passage) in enumerate(ranked[: active_cfg.top_k], start=1):
                        db.add(
                            RetrievalCandidate(
                                claim_id=claim["id"],
                                passage_id=passage["id"],
                                rank=rank,
                                score=Decimal(f"{round(score, 5):.5f}"),
                            )
                        )
                        nli_pairs.append((claim["id"], passage["id"], passage["text"], claim["text"]))

            _update_job(
                job_ids[active_stage],
                status=JobStatus.SUCCEEDED,
                progress_pct=100,
                mark_finished=True,
                session_factory=session_factory,
            )

            # --- Stage 3: NLI Classification ---
            active_stage = JobKind.NLI.value
            _update_job(
                job_ids[active_stage],
                status=JobStatus.RUNNING,
                progress_pct=5,
                mark_started=True,
                session_factory=session_factory,
            )

            total_pairs = len(nli_pairs)
            batch_sz = max(1, active_cfg.ml_batch_size)
            for start in range(0, total_pairs, batch_sz):
                chunk_pairs = nli_pairs[start : start + batch_sz]
                preds = ml.nli.predict_batch([(p_text, c_text) for _, _, p_text, c_text in chunk_pairs])
                for (claim_id, passage_id, _, _), pred in zip(chunk_pairs, preds, strict=True):
                    db.add(
                        ClaimEvidence(
                            claim_id=claim_id,
                            passage_id=passage_id,
                            model_name=pred.model_name,
                            model_label=pred.label,
                            model_score=Decimal(f"{pred.score:.3f}"),
                        )
                    )
                pct = 5 + int(90 * min(total_pairs, start + len(chunk_pairs)) / max(1, total_pairs))
                _update_job(job_ids[active_stage], progress_pct=pct, session_factory=session_factory)

            db.commit()
            _update_job(
                job_ids[active_stage],
                status=JobStatus.SUCCEEDED,
                progress_pct=100,
                mark_finished=True,
                session_factory=session_factory,
            )

        project_cache.invalidate_prefix(f"project:{project_id}:")
        ANALYSIS_JOBS_TOTAL.labels(status=JobStatus.SUCCEEDED.value).inc()
        logger.info(
            "project=%s pipeline_succeeded docs=%d passages=%d claims=%d edges=%d elapsed=%.2fs",
            project_id,
            len(docs),
            len(doc_passages),
            len(doc_claims),
            len(nli_pairs),
            time.perf_counter() - t_all,
        )
        return {
            "documents": len(docs),
            "passages": len(doc_passages),
            "claims": len(doc_claims),
            "evidence_edges": len(nli_pairs),
        }

    except Exception as exc:
        ANALYSIS_JOBS_TOTAL.labels(status=JobStatus.FAILED.value).inc()
        logger.exception("project=%s stage=%s failed: %s", project_id, active_stage, exc)
        msg = f"{active_stage} failed: {exc}"
        stages = [JobKind.EXTRACT_CLAIMS.value, JobKind.RETRIEVE.value, JobKind.NLI.value]
        failed_idx = stages.index(active_stage)
        for idx, stage in enumerate(stages):
            if idx == failed_idx:
                _update_job(
                    job_ids[stage],
                    status=JobStatus.FAILED,
                    progress_pct=100,
                    error_message=msg,
                    mark_started=True,
                    mark_finished=True,
                    session_factory=session_factory,
                )
            elif idx > failed_idx:
                _update_job(
                    job_ids[stage],
                    status=JobStatus.FAILED,
                    progress_pct=0,
                    error_message=f"Aborted because {active_stage} failed",
                    mark_started=True,
                    mark_finished=True,
                    session_factory=session_factory,
                )
        raise
