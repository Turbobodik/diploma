import csv
import io

from sqlalchemy.orm import Session

from app.core.cache import project_cache
from app.core.constants import NliLabel
from app.core.exceptions import NotFoundError
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
    ) -> list[ClaimOut]:
        claim_rows = self._claims.list_claims_with_source(project_id)
        ev_rows = self._claims.list_evidence_with_passage(project_id)

        by_claim: dict[str, list[EvidenceOut]] = {}
        all_ev_doc_ids_by_claim: dict[str, set[str]] = {}

        for ev, passage, doc_name in ev_rows:
            cid = str(ev.claim_id)
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
    ) -> GraphOut:
        if self._projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("Project not found")

        cache_key = f"project:{project_id}:graph:{label}:{document_id}:{include_neutral}"
        cached = project_cache.get(cache_key)
        if cached is not None:
            return cached

        docs = self._docs.list_ready_by_project(project_id)
        claims = self._build_filtered_claims(project_id, label_filter=label, document_id=document_id)

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
    ) -> tuple[list[ClaimOut], str]:
        if self._projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("Project not found")
        claims = self._build_filtered_claims(project_id, label_filter=label, document_id=document_id)

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
