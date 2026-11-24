from fastapi import APIRouter, Response

from app.core.config import settings
from app.core.metrics import render_prometheus_metrics
from app.models.schemas import ErrorOut, HealthOut

router = APIRouter(tags=["system"])


@router.get(
    "/health",
    response_model=HealthOut,
    summary="Service health and active ML configuration",
    openapi_extra={"security": []},
    responses={
        400: {"model": ErrorOut, "description": "Malformed request"},
        500: {"model": ErrorOut, "description": "Internal service error"},
    },
)
def health() -> HealthOut:
    return HealthOut(
        status="ok",
        version="1.0.0",
        ml_backend=settings.ml_backend,
        embedding_model=settings.embedding_model,
        nli_model=settings.nli_model,
    )


@router.get(
    "/metrics",
    summary="Prometheus instrumentation metrics",
    openapi_extra={"security": []},
    responses={
        200: {
            "description": "Prometheus text exposition format metrics",
            "content": {"text/plain": {"example": "# HELP factmap_http_requests_total Total HTTP requests\n"}},
        },
        400: {"model": ErrorOut, "description": "Malformed request"},
    },
)
def metrics() -> Response:
    payload, content_type = render_prometheus_metrics()
    return Response(content=payload, media_type=content_type)
