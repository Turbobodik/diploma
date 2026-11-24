from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.constants import DocumentStatus
from app.models.orm import Document


class DocumentRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_by_project(self, project_id: str, *, limit: int, offset: int) -> tuple[list[Document], int]:
        total = int(
            self._db.scalar(select(func.count()).select_from(Document).where(Document.project_id == project_id)) or 0
        )
        stmt = (
            select(Document)
            .where(Document.project_id == project_id)
            .order_by(Document.created_at.asc())
            .limit(limit)
            .offset(offset)
        )
        return list(self._db.scalars(stmt).all()), total

    def list_ready_by_project(self, project_id: str) -> list[Document]:
        stmt = (
            select(Document)
            .where(Document.project_id == project_id, Document.status == DocumentStatus.READY.value)
            .order_by(Document.created_at.asc())
        )
        return list(self._db.scalars(stmt).all())

    def exists_sha256(self, project_id: str, sha256: str) -> bool:
        stmt = select(Document.id).where(Document.project_id == project_id, Document.sha256 == sha256)
        return self._db.scalar(stmt) is not None

    def count_status_summary(self, project_id: str) -> tuple[int, int]:
        ready = int(
            self._db.scalar(
                select(func.count())
                .select_from(Document)
                .where(Document.project_id == project_id, Document.status == DocumentStatus.READY.value)
            )
            or 0
        )
        in_progress = int(
            self._db.scalar(
                select(func.count())
                .select_from(Document)
                .where(
                    Document.project_id == project_id,
                    Document.status.in_([DocumentStatus.QUEUED.value, DocumentStatus.PROCESSING.value]),
                )
            )
            or 0
        )
        return ready, in_progress

    def create(self, document: Document) -> Document:
        self._db.add(document)
        self._db.flush()
        return document
