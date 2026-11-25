import csv
import io
from typing import Literal

import numpy as np
from sqlalchemy.orm import Session

from app.core.cache import project_cache
from app.core.config import settings
from app.core.constants import ErrorCode, MediaType, NliLabel
from app.core.exceptions import ConflictError, NotFoundError
from app.ml.chunker import split_passages
from app.ml.pipeline import get_ml_components
from app.models.schemas import (
    ClaimOut,
    ClaimsResponseOut,
    EvidenceOut,
    GraphEdgeOut,
    GraphNodeOut,
    GraphOut,
    NliLabelLiteral,
    OverrideIn,
    OverrideOut,
    VerifyClaimIn,
    VerifyClaimOut,
    VerifyEvidenceOut,
)
from app.repositories.claims import ClaimRepository
from app.repositories.documents import DocumentRepository
from app.repositories.projects import ProjectRepository
from app.services.analysis_service import _to_job_out


class GraphService:
    def __init__(self, db: Session) -> None:
        self._projects = ProjectRepository(db)
        self._docs = DocumentRepository(db)
        self._claims = ClaimRepository(db)

    def _build_filtered_claims(
        self,
        project_id: str,
        *,
        label_filter: NliLabelLiteral | None = None,
        document_id: str | None = None,
        search: str | None = None,
        cross_document_only: bool = False,
    ) -> list[ClaimOut]:
        claim_rows = self._claims.list_claims_with_source(project_id)
        ev_rows = self._claims.list_evidence_with_passage(project_id)

        source_doc_by_claim: dict[str, str] = {str(claim.id): str(claim.source_document_id) for claim, _ in claim_rows}
        by_claim: dict[str, list[EvidenceOut]] = {}
        all_ev_doc_ids_by_claim: dict[str, set[str]] = {}

        for ev, passage, doc_name in ev_rows:
            cid = str(ev.claim_id)
            if cross_document_only and str(passage.document_id) == source_doc_by_claim.get(cid):
                continue
            all_ev_doc_ids_by_claim.setdefault(cid, set()).add(str(passage.document_id))
            effective: NliLabelLiteral = (ev.user_label or ev.model_label)  # type: ignore[assignment]
            if label_filter and effective != label_filter:
                continue
            by_claim.setdefault(cid, []).append(
                EvidenceOut(
                    id=ev.id,
                    passage_id=ev.passage_id,
                    document_id=passage.document_id,
                    document_name=doc_name,
                    page_no=passage.page_no,
                    char_start=passage.char_start,
                    char_end=passage.char_end,
                    passage_text=passage.text,
                    model_name=ev.model_name,
                    model_label=ev.model_label,  # type: ignore[arg-type]
                    model_score=float(ev.model_score),
                    user_label=ev.user_label,  # type: ignore[arg-type]
                    effective_label=effective,
                )
            )

        needle = search.strip().lower() if search else ""
        result: list[ClaimOut] = []
        for claim, source_name in claim_rows:
            if document_id and claim.source_document_id != document_id and document_id not in all_ev_doc_ids_by_claim.get(claim.id, set()):
                continue
            if needle and needle not in claim.text.lower() and needle not in source_name.lower():
                continue
            edges = by_claim.get(claim.id, [])
            if label_filter and not edges:
                continue
            has_ev = any(e.effective_label != NliLabel.NEUTRAL.value for e in edges)
            result.append(
                ClaimOut(
                    id=claim.id,
                    source_document_id=claim.source_document_id,
                    source_name=source_name,
                    page_no=claim.page_no,
                    char_start=claim.char_start,
                    char_end=claim.char_end,
                    text=claim.text,
                    confidence=float(claim.confidence),
                    extractor_name=claim.extractor_name,
                    has_evidence=has_ev,
                    evidence=edges,
                )
            )
        return result

    def list_claims(
        self,
        user_id: str,
        project_id: str,
        *,
        label: NliLabelLiteral | None,
        document_id: str | None,
        search: str | None,
        cross_document_only: bool = False,
        limit: int,
        offset: int,
    ) -> ClaimsResponseOut:
        if self._projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("Project not found")
        filtered = self._build_filtered_claims(
            project_id,
            label_filter=label,
            document_id=document_id,
            search=search,
            cross_document_only=cross_document_only,
        )
        total = len(filtered)
        page = filtered[offset : offset + limit]
        jobs = self._claims.list_jobs(project_id, limit=20)
        return ClaimsResponseOut(
            claims=page,
            total=total,
            limit=limit,
            offset=offset,
            jobs=[_to_job_out(j) for j in jobs],
        )

    def get_graph(
        self,
        user_id: str,
        project_id: str,
        *,
        label: NliLabelLiteral | None,
        document_id: str | None,
        include_neutral: bool,
        cross_document_only: bool = False,
    ) -> GraphOut:
        if self._projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("Project not found")

        cache_key = f"project:{project_id}:graph:{label}:{document_id}:{include_neutral}:{cross_document_only}"
        cached = project_cache.get(cache_key)
        if cached is not None:
            return cached

        docs = self._docs.list_ready_by_project(project_id)
        claims = self._build_filtered_claims(
            project_id,
            label_filter=label,
            document_id=document_id,
            cross_document_only=cross_document_only,
        )

        nodes_map: dict[str, GraphNodeOut] = {}
        edges: list[GraphEdgeOut] = []

        for d in docs:
            if document_id and d.id != document_id:
                continue
            nodes_map[f"doc:{d.id}"] = GraphNodeOut(
                id=f"doc:{d.id}",
                type="document",
                label=d.original_name,
                document_id=d.id,
            )

        for c in claims:
            doc_node_id = f"doc:{c.source_document_id}"
            if doc_node_id not in nodes_map:
                nodes_map[doc_node_id] = GraphNodeOut(
                    id=doc_node_id,
                    type="document",
                    label=c.source_name,
                    document_id=c.source_document_id,
                )
            claim_node_id = f"claim:{c.id}"
            nodes_map[claim_node_id] = GraphNodeOut(
                id=claim_node_id,
                type="claim",
                label=c.text,
                document_id=c.source_document_id,
                page_no=c.page_no,
                has_evidence=c.has_evidence,
                confidence=c.confidence,
            )
            edges.append(
                GraphEdgeOut(
                    id=f"src:{c.id}",
                    source=doc_node_id,
                    target=claim_node_id,
                    kind="extracted_from",
                )
            )
            for ev in c.evidence:
                if not include_neutral and ev.effective_label == NliLabel.NEUTRAL.value:
                    continue
                ev_doc_id = f"doc:{ev.document_id}"
                if ev_doc_id not in nodes_map:
                    nodes_map[ev_doc_id] = GraphNodeOut(
                        id=ev_doc_id,
                        type="document",
                        label=ev.document_name,
                        document_id=ev.document_id,
                    )
                p_node_id = f"passage:{ev.passage_id}"
                if p_node_id not in nodes_map:
                    nodes_map[p_node_id] = GraphNodeOut(
                        id=p_node_id,
                        type="passage",
                        label=ev.passage_text[:180],
                        document_id=ev.document_id,
                        page_no=ev.page_no,
                    )
                edges.append(
                    GraphEdgeOut(
                        id=f"ev:{ev.id}",
                        source=p_node_id,
                        target=claim_node_id,
                        kind="evidence",
                        label=ev.effective_label,
                        model_label=ev.model_label,
                        user_label=ev.user_label,
                        score=ev.model_score,
                    )
                )

        graph = GraphOut(project_id=project_id, nodes=list(nodes_map.values()), edges=edges)
        project_cache.set(cache_key, graph)
        return graph

    def export_data(
        self,
        user_id: str,
        project_id: str,
        *,
        label: NliLabelLiteral | None,
        document_id: str | None,
        cross_document_only: bool = False,
    ) -> tuple[list[ClaimOut], str]:
        if self._projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("Project not found")
        claims = self._build_filtered_claims(
            project_id,
            label_filter=label,
            document_id=document_id,
            cross_document_only=cross_document_only,
        )

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "claim_id",
                "claim_text",
                "source_document",
                "claim_page",
                "claim_confidence",
                "evidence_document",
                "evidence_page",
                "model_label",
                "user_label",
                "effective_label",
                "model_score",
                "passage_excerpt",
            ]
        )
        for c in claims:
            if not c.evidence:
                writer.writerow([c.id, c.text, c.source_name, c.page_no or "", c.confidence, "", "", "", "", "no_evidence", "", ""])
                continue
            for ev in c.evidence:
                writer.writerow(
                    [
                        c.id,
                        c.text,
                        c.source_name,
                        c.page_no or "",
                        c.confidence,
                        ev.document_name,
                        ev.page_no or "",
                        ev.model_label,
                        ev.user_label or "",
                        ev.effective_label,
                        ev.model_score,
                        ev.passage_text,
                    ]
                )
        return claims, buf.getvalue()

    def override_evidence_label(self, user_id: str, evidence_id: str, body: OverrideIn) -> OverrideOut:
        ev = self._claims.get_owned_evidence(evidence_id, user_id)
        if ev is None:
            raise NotFoundError("Evidence edge not found")
        project_id = str(ev.claim.project_id)
        updated = self._claims.update_user_label(ev, body.user_label)
        project_cache.invalidate_prefix(f"project:{project_id}:")
        return OverrideOut(id=updated.id, user_label=updated.user_label)  # type: ignore[arg-type]

    def verify_custom_claim(self, user_id: str, project_id: str, body: VerifyClaimIn) -> VerifyClaimOut:
        if self._projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("Project not found")

        claim_text = body.claim_text.strip()
        ml = get_ml_components(settings)

        # Prefer already-indexed passages & cached embeddings from the latest analysis run.
        indexed = self._claims.list_passages_with_embeddings(project_id, model_name=ml.embedder.model_name)
        passages_meta: list[dict] = []
        cached_vecs: list[list[float]] = []
        all_have_vecs = len(indexed) > 0

        for passage, doc_name, vec in indexed:
            passages_meta.append(
                {
                    "passage_id": str(passage.id),
                    "document_id": str(passage.document_id),
                    "document_name": doc_name,
                    "page_no": passage.page_no,
                    "char_start": passage.char_start,
                    "char_end": passage.char_end,
                    "text": passage.text,
                }
            )
            if vec is None or len(vec) != ml.embedder.dimensions:
                all_have_vecs = False
            else:
                cached_vecs.append(vec)

        if not passages_meta:
            ready_docs = self._docs.list_ready_by_project(project_id)
            if not ready_docs:
                raise ConflictError(ErrorCode.NOT_READY, "Upload at least one ready document before verifying a claim")
            for doc in ready_docs:
                is_pdf = doc.media_type == MediaType.PDF.value
                for p in split_passages(doc.extracted_text or "", is_pdf=is_pdf, target_chars=settings.passage_target_chars):
                    passages_meta.append(
                        {
                            "passage_id": None,
                            "document_id": str(doc.id),
                            "document_name": doc.original_name,
                            "page_no": p.page_no,
                            "char_start": p.char_start,
                            "char_end": p.char_end,
                            "text": p.text,
                        }
                    )
            all_have_vecs = False

        if not passages_meta:
            return VerifyClaimOut(
                claim_text=claim_text,
                verdict="no_evidence",
                ml_backend=settings.ml_backend,
                checked_passages=0,
                evidence=[],
            )

        if all_have_vecs:
            passage_vecs = np.asarray(cached_vecs, dtype=np.float32)
        else:
            passage_vecs = ml.embedder.encode_passages([p["text"] for p in passages_meta])

        query_vec = ml.embedder.encode_queries([claim_text])[0]
        sims = passage_vecs @ query_vec

        ranked: list[tuple[float, dict]] = []
        for idx, meta in enumerate(passages_meta):
            score = float(max(0.0, min(1.0, float(sims[idx]))))
            if score < settings.min_retrieval_score:
                continue
            ranked.append((score, meta))

        ranked.sort(key=lambda item: item[0], reverse=True)
        top_candidates = ranked[: body.top_k]

        if not top_candidates:
            return VerifyClaimOut(
                claim_text=claim_text,
                verdict="no_evidence",
                ml_backend=settings.ml_backend,
                checked_passages=0,
                evidence=[],
            )

        preds = ml.nli.predict_batch([(meta["text"], claim_text) for _, meta in top_candidates])
        supports = 0
        refutes = 0
        items: list[VerifyEvidenceOut] = []

        for (ret_score, meta), pred in zip(top_candidates, preds, strict=True):
            if pred.label == NliLabel.ENTAILMENT.value:
                supports += 1
            elif pred.label == NliLabel.CONTRADICTION.value:
                refutes += 1
            if not body.include_neutral and pred.label == NliLabel.NEUTRAL.value:
                continue
            items.append(
                VerifyEvidenceOut(
                    passage_id=meta["passage_id"],
                    document_id=meta["document_id"],
                    document_name=meta["document_name"],
                    page_no=meta["page_no"],
                    char_start=meta["char_start"],
                    char_end=meta["char_end"],
                    passage_text=meta["text"],
                    retrieval_score=round(ret_score, 4),
                    model_name=pred.model_name,
                    model_label=pred.label,
                    model_score=float(pred.score),
                )
            )

        label_rank = {"contradiction": 0, "entailment": 1, "neutral": 2}
        items.sort(key=lambda it: (label_rank[it.model_label], -it.model_score))

        verdict: Literal["supported", "refuted", "conflicting", "no_evidence"] = "no_evidence"
        if supports > 0 and refutes > 0:
            verdict = "conflicting"
        elif refutes > 0:
            verdict = "refuted"
        elif supports > 0:
            verdict = "supported"

        return VerifyClaimOut(
            claim_text=claim_text,
            verdict=verdict,
            ml_backend=settings.ml_backend,
            checked_passages=len(top_candidates),
            evidence=items,
        )

