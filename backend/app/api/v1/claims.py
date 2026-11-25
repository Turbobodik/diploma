from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import enforce_rate_limit, get_current_user_id
from app.core.constants import DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT
from app.db import get_db
from app.models.schemas import (
    ClaimsResponseOut,
    ErrorOut,
    GraphOut,
    NliLabelLiteral,
    OverrideIn,
    OverrideOut,
    VerifyClaimIn,
    VerifyClaimOut,
)
from app.services.graph_service import GraphService

router = APIRouter(prefix="/api/v1", tags=["claims & graph"])


@router.get(
    "/projects/{project_id}/claims",
    response_model=ClaimsResponseOut,
    summary="List extracted claims with NLI evidence, filters, search, and pagination",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Project not found"},
    },
)
def list_claims(
    project_id: UUID,
    label: NliLabelLiteral | None = Query(default=None, description="Filter by effective NLI label"),
    document_id: UUID | None = Query(default=None, description="Filter claims/evidence involving a specific document"),
    search: str | None = Query(default=None, description="Case-insensitive substring search across claim text and document title"),
    cross_document_only: bool = Query(
        default=False,
        description="Only include evidence passages from a different document than the claim source",
    ),
    limit: int = Query(default=DEFAULT_PAGE_LIMIT, ge=1, le=MAX_PAGE_LIMIT),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> ClaimsResponseOut:
    return GraphService(db).list_claims(
        user_id,
        str(project_id),
        label=label,
        document_id=str(document_id) if document_id else None,
        search=search,
        cross_document_only=cross_document_only,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/projects/{project_id}/graph",
    response_model=GraphOut,
    summary="Retrieve the interactive evidence map (document, claim, and passage nodes + NLI edges)",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Project not found"},
    },
)
def get_evidence_graph(
    project_id: UUID,
    label: NliLabelLiteral | None = Query(default=None),
    document_id: UUID | None = Query(default=None),
    include_neutral: bool = Query(default=True, description="Include neutral NLI edges in the graph"),
    cross_document_only: bool = Query(
        default=False,
        description="Only include evidence edges linking passages from a different document than the claim source",
    ),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> GraphOut:
    return GraphService(db).get_graph(
        user_id,
        str(project_id),
        label=label,
        document_id=str(document_id) if document_id else None,
        include_neutral=include_neutral,
        cross_document_only=cross_document_only,
    )


@router.get(
    "/projects/{project_id}/export",
    summary="Export filtered claims and evidence edges as JSON or CSV (US-08)",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Project not found"},
    },
)
def export_project(
    project_id: UUID,
    format: str = Query(default="json", pattern="^(json|csv)$", description="Export format: json or csv"),
    label: NliLabelLiteral | None = Query(default=None),
    document_id: UUID | None = Query(default=None),
    cross_document_only: bool = Query(default=False),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    pid = str(project_id)
    claims, csv_body = GraphService(db).export_data(
        user_id,
        pid,
        label=label,
        document_id=str(document_id) if document_id else None,
        cross_document_only=cross_document_only,
    )
    if format == "json":
        return {"project_id": pid, "claims": [c.model_dump() for c in claims]}
    return StreamingResponse(
        iter([csv_body]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="factmap-{pid}.csv"'},
    )


@router.post(
    "/projects/{project_id}/verify",
    response_model=VerifyClaimOut,
    summary="Verify a custom user-supplied claim or hypothesis against uploaded project papers",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Project not found"},
        409: {"model": ErrorOut, "description": "Project has no ready documents to verify against"},
        422: {"model": ErrorOut, "description": "Invalid claim text"},
        429: {"model": ErrorOut, "description": "Rate limit exceeded (60 req/min)"},
    },
)
def verify_custom_claim(
    project_id: UUID,
    body: VerifyClaimIn,
    user_id: str = Depends(enforce_rate_limit),
    db: Session = Depends(get_db),
) -> VerifyClaimOut:
    return GraphService(db).verify_custom_claim(user_id, str(project_id), body)


@router.patch(
    "/evidence/{evidence_id}",
    response_model=OverrideOut,
    summary="Override an NLI edge label while preserving the original model prediction (US-09)",
    responses={
        401: {"model": ErrorOut, "description": "Unauthorized"},
        404: {"model": ErrorOut, "description": "Evidence edge not found or owned by another user"},
        422: {"model": ErrorOut, "description": "Invalid label value"},
    },
)
def override_label(
    evidence_id: UUID,
    body: OverrideIn,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> OverrideOut:
    return GraphService(db).override_evidence_label(user_id, str(evidence_id), body)
