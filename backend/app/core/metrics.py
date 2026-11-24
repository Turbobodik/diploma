from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

HTTP_REQUESTS_TOTAL = Counter(
    "factmap_http_requests_total",
    "Total HTTP requests handled by FactMap Scholar API",
    ["method", "path", "status"],
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "factmap_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path"],
)

ANALYSIS_JOBS_TOTAL = Counter(
    "factmap_analysis_jobs_total",
    "Analysis pipeline runs grouped by outcome",
    ["status"],
)


def render_prometheus_metrics() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
