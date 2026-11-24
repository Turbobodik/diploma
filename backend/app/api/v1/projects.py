from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.core.constants import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT
from app.db import get_db
from app.models.schemas import DeleteOut, ErrorOut, ProjectIn, ProjectListOut, ProjectOut
from app.services.project_service import ProjectService

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


@router.get(
    "",
    response_model=ProjectListOut,
    summary="List projects owned by the authenticated user",
    responses={401: {"model": ErrorOut, "description": "Unauthorized"}},
)
def list_projects(
    limit: int = Query(default=DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> ProjectListOut:
    return ProjectService(db).list_projects(user_id, limit=limit, offset=offset)


@router.post(
    "",
    response_model=ProjectOut,
    status_code=201,
    summary="Create a new analysis project workspace",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        409: {"model": ErrorOut, "description": "Duplicate project name for this owner"},
        422: {"model": ErrorOut, "description": "Empty or invalid project name"},
    },
)
def create_project(
    body: ProjectIn,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> ProjectOut:
    return ProjectService(db).create_project(user_id, body)


@router.delete(
    "/{project_id}",
    response_model=DeleteOut,
    summary="Delete a project and cascade all documents, claims, evidence, and stored files (GDPR US-11)",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Project not found or owned by another user"},
    },
)
def delete_project(
    project_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> DeleteOut:
    return ProjectService(db).delete_project(user_id, str(project_id))
