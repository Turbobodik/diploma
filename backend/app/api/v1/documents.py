from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import enforce_rate_limit, get_current_user_id
from app.core.constants import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT
from app.db import get_db
from app.models.schemas import DeleteOut, DocumentContextOut, DocumentListOut, DocumentOut, ErrorOut
from app.services.document_service import DocumentService

router = APIRouter(prefix="/api/v1/projects/{project_id}/documents", tags=["documents"])


@router.get(
    "",
    response_model=DocumentListOut,
    summary="List documents and extraction statuses in a project",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Project not found"},
    },
)
def list_documents(
    project_id: UUID,
    limit: int = Query(default=DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> DocumentListOut:
    return DocumentService(db).list_documents(user_id, str(project_id), limit=limit, offset=offset)


@router.get(
    "/{document_id}/context",
    response_model=DocumentContextOut,
    summary="Read surrounding document context around a highlighted character span",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Project or document not found"},
    },
)
def get_document_context(
    project_id: UUID,
    document_id: UUID,
    char_start: int = Query(default=0, ge=0, description="Start character offset to highlight"),
    char_end: int = Query(default=0, ge=0, description="Exclusive end character offset to highlight"),
    window: int = Query(default=900, ge=100, le=5000, description="Characters of surrounding context on each side"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> DocumentContextOut:
    return DocumentService(db).get_document_context(
        user_id,
        str(project_id),
        str(document_id),
        char_start=char_start,
        char_end=char_end,
        window=window,
    )


@router.delete(
    "/{document_id}",
    response_model=DeleteOut,
    summary="Delete a single document from a project along with its passages, claims, and stored file",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Project or document not found"},
    },
)
def delete_document(
    project_id: UUID,
    document_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> DeleteOut:
    return DocumentService(db).delete_document(user_id, str(project_id), str(document_id))


@router.post(
    "",
    response_model=DocumentOut,
    status_code=201,
    summary="Upload a scientific PDF or plain text file (<= 20 MB) and extract text",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Project not found"},
        409: {"model": ErrorOut, "description": "Identical file (SHA-256) already exists in project"},
        413: {"model": ErrorOut, "description": "File empty or exceeds 20 MB"},
        415: {"model": ErrorOut, "description": "Unsupported MIME type (only application/pdf and text/plain)"},
        422: {"model": ErrorOut, "description": "Text extraction failed or produced empty text"},
        429: {"model": ErrorOut, "description": "Rate limit exceeded (60 req/min)"},
    },
)
async def upload_document(
    project_id: UUID,
    file: UploadFile = File(..., description="PDF or TXT file (max 20 MB)"),
    user_id: str = Depends(enforce_rate_limit),
    db: Session = Depends(get_db),
) -> DocumentOut:
    payload = await file.read()
    return DocumentService(db).upload_document(
        user_id,
        str(project_id),
        filename=file.filename or "upload",
        media_type=file.content_type or "",
        payload=payload,
    )
