from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import enforce_rate_limit, get_current_user_id
from app.db import SessionLocal, get_db
from app.models.schemas import AnalyzeStartedOut, ErrorOut, JobListOut
from app.services.analysis_service import AnalysisService

router = APIRouter(prefix="/api/v1/projects/{project_id}", tags=["analysis"])


@router.post(
    "/analyze",
    status_code=202,
    response_model=AnalyzeStartedOut,
    summary="Trigger asynchronous claim extraction, dense retrieval, and NLI verification",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Project not found"},
        409: {"model": ErrorOut, "description": "No ready documents, extraction still in progress, or analysis already running"},
        429: {"model": ErrorOut, "description": "Rate limit exceeded (60 req/min)"},
    },
)
def start_analysis(
    project_id: UUID,
    sync: bool = Query(
        default=False,
        description="Execute synchronously instead of in background worker (intended for smoke tests/CLI).",
    ),
    user_id: str = Depends(enforce_rate_limit),
    db: Session = Depends(get_db),
) -> AnalyzeStartedOut:
    return AnalysisService(db, session_factory=SessionLocal).start_analysis(user_id, str(project_id), sync=sync)


@router.get(
    "/jobs",
    response_model=JobListOut,
    summary="Poll recent pipeline jobs and progress percentages for a project",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Project not found"},
    },
)
def list_jobs(
    project_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> JobListOut:
    return AnalysisService(db).list_jobs(user_id, str(project_id))
