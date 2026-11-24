import hashlib
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.cache import project_cache
from app.core.config import settings
from app.core.constants import ALLOWED_MEDIA_EXTENSIONS, DocumentStatus, ErrorCode, JobKind, JobStatus
from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    PayloadTooLargeError,
    UnprocessableError,
    UnsupportedMediaError,
)
from app.extraction import extract_document_text
from app.models.orm import AnalysisJob, Document
from app.models.schemas import DocumentListOut, DocumentOut
from app.repositories.documents import DocumentRepository
from app.repositories.projects import ProjectRepository


def _to_doc_out(doc: Document) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        original_name=doc.original_name,
        media_type=doc.media_type,
        size_bytes=doc.size_bytes,
        status=doc.status,
        error_message=doc.error_message,
        page_count=doc.page_count,
        created_at=doc.created_at.isoformat(),
    )


class DocumentService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._projects = ProjectRepository(db)
        self._docs = DocumentRepository(db)

    def list_documents(self, user_id: str, project_id: str, *, limit: int, offset: int) -> DocumentListOut:
        if self._projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("Project not found")
        docs, total = self._docs.list_by_project(project_id, limit=limit, offset=offset)
        return DocumentListOut(documents=[_to_doc_out(d) for d in docs], total=total, limit=limit, offset=offset)

    def upload_document(
        self,
        user_id: str,
        project_id: str,
        *,
        filename: str,
        media_type: str,
        payload: bytes,
    ) -> DocumentOut:
        if media_type not in ALLOWED_MEDIA_EXTENSIONS:
            raise UnsupportedMediaError()
        if not payload or len(payload) > settings.max_upload_bytes:
            raise PayloadTooLargeError()
        if self._projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("Project not found")

        digest = hashlib.sha256(payload).hexdigest()
        if self._docs.exists_sha256(project_id, digest):
            raise ConflictError(ErrorCode.DUPLICATE_FILE, "This file is already in the project")

        doc_id = str(uuid4())
        object_key = f"{project_id}/{doc_id}{ALLOWED_MEDIA_EXTENSIONS[media_type]}"
        now = datetime.now(UTC)

        job = AnalysisJob(
            project_id=project_id,
            kind=JobKind.EXTRACT_TEXT.value,
            status=JobStatus.RUNNING.value,
            progress_pct=10,
            created_at=now,
            started_at=now,
        )
        self._db.add(job)

        doc = Document(
            id=doc_id,
            project_id=project_id,
            original_name=Path(filename or "upload").name[:500],
            media_type=media_type,
            size_bytes=len(payload),
            sha256=digest,
            object_key=object_key,
            status=DocumentStatus.PROCESSING.value,
        )
        self._docs.create(doc)

        target = settings.storage_dir / object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)

        try:
            extracted = extract_document_text(target, media_type)
        except Exception as exc:
            msg = str(exc)[:500]
            doc.status = DocumentStatus.FAILED.value
            doc.error_message = msg
            job.status = JobStatus.FAILED.value
            job.progress_pct = 100
            job.error_message = msg
            job.finished_at = datetime.now(UTC)
            self._db.commit()
            raise UnprocessableError(ErrorCode.EXTRACT_FAILED, msg) from exc

        if not extracted.text.strip():
            msg = "No text could be extracted from this file"
            doc.status = DocumentStatus.FAILED.value
            doc.error_message = msg
            job.status = JobStatus.FAILED.value
            job.progress_pct = 100
            job.error_message = msg
            job.finished_at = datetime.now(UTC)
            self._db.commit()
            raise UnprocessableError(ErrorCode.EXTRACT_FAILED, msg)

        doc.status = DocumentStatus.READY.value
        doc.extracted_text = extracted.text
        doc.page_count = extracted.page_count
        job.status = JobStatus.SUCCEEDED.value
        job.progress_pct = 100
        job.finished_at = datetime.now(UTC)
        self._db.commit()
        self._db.refresh(doc)
        project_cache.invalidate_prefix(f"project:{project_id}:")
        return _to_doc_out(doc)
