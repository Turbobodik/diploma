from fastapi import APIRouter, Response

from app.core.config import settings
from app.core.metrics import render_prometheus_metrics
from app.models.schemas import HealthOut

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthOut, summary="Service health and active ML configuration")
def health() -> HealthOut:
    return HealthOut(
        status="ok",
        version="1.0.0",
        ml_backend=settings.ml_backend,
        embedding_model=settings.embedding_model,
        nli_model=settings.nli_model,
    )


@router.get("/metrics", summary="Prometheus instrumentation metrics")
def metrics() -> Response:
    payload, content_type = render_prometheus_metrics()
    return Response(content=payload, media_type=content_type)
