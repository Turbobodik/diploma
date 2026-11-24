import logging
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import analysis, auth, claims, documents, projects, system
from app.core.config import settings
from app.core.constants import HEADER_REQUEST_ID
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, request_id_ctx
from app.core.metrics import HTTP_REQUEST_DURATION_SECONDS, HTTP_REQUESTS_TOTAL
from app.db import init_db_if_sqlite

configure_logging(settings.log_level)
logger = logging.getLogger("factmap.http")

OPENAPI_TAGS = [
    {"name": "system", "description": "Service health check and Prometheus observability metrics."},
    {"name": "auth", "description": "Researcher registration, Argon2id + RFC 7519 JWT authentication, and profile."},
    {"name": "projects", "description": "Project workspace lifecycle and GDPR cascading erasure (US-01, US-11)."},
    {"name": "documents", "description": "Scientific PDF/TXT upload, SHA-256 deduplication, and text extraction (US-02)."},
    {"name": "analysis", "description": "Asynchronous ML pipeline trigger and per-stage progress polling (US-03, US-04)."},
    {"name": "claims & graph", "description": "Extracted claims, NLI evidence map, human label overrides, and JSON/CSV export (US-05, US-08, US-09)."},
]


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    init_db_if_sqlite()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="FactMap Scholar API",
        version="1.0.0",
        summary="Automatic scientific claim extraction and NLI-based evidence verification service.",
        description=(
            "FactMap Scholar extracts atomic claims with exact character spans from uploaded scientific PDF/TXT "
            "publications, retrieves candidate evidence passages using dense embeddings, classifies claim–passage "
            "pairs via 3-way Natural Language Inference (`entailment`, `contradiction`, `neutral`), and exposes a "
            "queryable evidence graph."
        ),
        contact={"name": "Bahdan Kanoplich", "email": "20230498@student.ehu.lt"},
        license_info={"name": "MIT License", "identifier": "MIT"},
        openapi_tags=OPENAPI_TAGS,
        lifespan=_lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[HEADER_REQUEST_ID, "X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
    )

    @app.middleware("http")
    async def request_tracing_and_metrics(request: Request, call_next):
        req_id = request.headers.get(HEADER_REQUEST_ID) or str(uuid4())
        token = request_id_ctx.set(req_id)
        t0 = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            elapsed = time.perf_counter() - t0
            request_id_ctx.reset(token)

        route = request.scope.get("route")
        path_label = getattr(route, "path", request.url.path)
        HTTP_REQUESTS_TOTAL.labels(request.method, path_label, str(response.status_code)).inc()
        HTTP_REQUEST_DURATION_SECONDS.labels(request.method, path_label).observe(elapsed)
        response.headers[HEADER_REQUEST_ID] = req_id
        logger.info(
            "http_request method=%s path=%s status=%d duration_ms=%.1f",
            request.method,
            request.url.path,
            response.status_code,
            elapsed * 1000.0,
        )
        return response

    register_exception_handlers(app)

    app.include_router(system.router)
    app.include_router(auth.router)
    app.include_router(projects.router)
    app.include_router(documents.router)
    app.include_router(analysis.router)
    app.include_router(claims.router)

    return app


app = create_app()
