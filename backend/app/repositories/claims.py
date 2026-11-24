from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.orm import AnalysisJob, Claim, ClaimEvidence, Document, Passage, Project


class ClaimRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_jobs(self, project_id: str, *, limit: int = 30) -> list[AnalysisJob]:
        stmt = (
            select(AnalysisJob)
            .where(AnalysisJob.project_id == project_id)
            .order_by(AnalysisJob.created_at.desc())
            .limit(limit)
        )
        return list(self._db.scalars(stmt).all())

    def list_claims_with_source(self, project_id: str) -> list[tuple[Claim, str]]:
        stmt = (
            select(Claim, Document.original_name)
            .join(Document, Document.id == Claim.source_document_id)
            .where(Claim.project_id == project_id)
            .order_by(Document.created_at.asc(), Claim.char_start.asc())
        )
        return [(claim, str(name)) for claim, name in self._db.execute(stmt).all()]

    def list_evidence_with_passage(self, project_id: str) -> list[tuple[ClaimEvidence, Passage, str]]:
        stmt = (
            select(ClaimEvidence, Passage, Document.original_name)
            .join(Claim, Claim.id == ClaimEvidence.claim_id)
            .join(Passage, Passage.id == ClaimEvidence.passage_id)
            .join(Document, Document.id == Passage.document_id)
            .where(Claim.project_id == project_id)
            .order_by(ClaimEvidence.model_score.desc())
        )
        return [(ev, passage, str(name)) for ev, passage, name in self._db.execute(stmt).all()]

    def get_owned_evidence(self, evidence_id: str, owner_id: str) -> ClaimEvidence | None:
        stmt = (
            select(ClaimEvidence)
            .join(Claim, Claim.id == ClaimEvidence.claim_id)
            .join(Project, Project.id == Claim.project_id)
            .where(ClaimEvidence.id == evidence_id, Project.owner_id == owner_id)
        )
        return self._db.scalar(stmt)

    def update_user_label(self, evidence: ClaimEvidence, user_label: str | None) -> ClaimEvidence:
        evidence.user_label = user_label
        self._db.commit()
        self._db.refresh(evidence)
        return evidence
