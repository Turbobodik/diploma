from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from openapi_spec_validator import validate
from sqlalchemy.orm import sessionmaker

from app.core import config as config_mod
from app.core.cache import project_cache
from app.core.rate_limit import rate_limiter
from app.db import Base, build_engine, get_db
from app.main import create_app
from app.ml import pipeline as pipeline_mod
from app.services import analysis_service as analysis_mod


@pytest.fixture()
def api_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    engine = build_engine("sqlite:///:memory:")
    import app.models.orm  # noqa: F401

    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

    # Point storage and ML backend to isolated test paths/stub
    test_settings = config_mod.Settings(
        database_url="sqlite:///:memory:",
        storage_dir=tmp_path / "storage",
        jwt_secret="test-secret-key-at-least-32-characters-long",
        jwt_algorithm="HS256",
        jwt_ttl_seconds=3600,
        cors_origins=("http://localhost:5173",),
        rate_limit_per_minute=60,
        max_upload_bytes=20 * 1024 * 1024,
        ml_backend="stub",
        embedding_model="stub-bow-v1",
        nli_model="stub-overlap-v1",
        nli_class_weights=(1.0, 1.0, 1.0),
        nli_max_length=320,
        claim_mode="hybrid",
        claim_threshold=0.35,
        max_claims_per_doc=20,
        passage_target_chars=500,
        top_k=5,
        ml_batch_size=8,
        ml_device="cpu",
        log_level="WARNING",
    )

    monkeypatch.setattr(config_mod, "settings", test_settings)
    monkeypatch.setattr("app.core.security.settings", test_settings)
    monkeypatch.setattr("app.services.auth_service.settings", test_settings)
    monkeypatch.setattr("app.services.project_service.settings", test_settings)
    monkeypatch.setattr("app.services.document_service.settings", test_settings)
    monkeypatch.setattr("app.core.rate_limit.settings", test_settings)
    monkeypatch.setattr(pipeline_mod, "default_settings", test_settings)
    monkeypatch.setattr(pipeline_mod, "_cached_components", None)
    monkeypatch.setattr(pipeline_mod, "_cached_key", None)
    monkeypatch.setattr("app.api.v1.analysis.SessionLocal", TestingSession)
    monkeypatch.setattr(analysis_mod, "SessionLocal", TestingSession)

    project_cache.clear()
    rate_limiter.reset()

    app = create_app()

    def _override_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as client:
        yield client


def _register(client: TestClient, email: str, password: str = "StrongPass123!", name: str = "Researcher") -> dict:
    resp = client.post("/api/v1/auth/register", json={"email": email, "password": password, "display_name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_openapi_spec_is_valid_openapi3(api_client: TestClient):
    spec = api_client.get("/openapi.json").json()
    validate(spec)
    assert "HTTPBearer" in spec["components"]["securitySchemes"]


def test_health_metrics_and_request_id_header(api_client: TestClient):
    res = api_client.get("/health", headers={"X-Request-ID": "trace-123"})
    assert res.status_code == 200
    assert res.headers["X-Request-ID"] == "trace-123"
    assert res.json()["status"] == "ok"

    m = api_client.get("/metrics")
    assert m.status_code == 200
    assert "factmap_http_requests_total" in m.text


def test_auth_lifecycle_and_errors(api_client: TestClient):
    auth = _register(api_client, "alice@ehu.lt", name="Alice")
    headers = {"Authorization": f"Bearer {auth['token']}"}

    # Duplicate email -> 409
    dup = api_client.post(
        "/api/v1/auth/register",
        json={"email": "ALICE@ehu.lt", "password": "StrongPass123!", "display_name": "Alice 2"},
    )
    assert dup.status_code == 409 and dup.json()["code"] == "duplicate_email"

    # Bad password -> 401
    bad = api_client.post("/api/v1/auth/login", json={"email": "alice@ehu.lt", "password": "wrong"})
    assert bad.status_code == 401 and bad.json()["code"] == "invalid_login"

    # Valid login + /me
    ok = api_client.post("/api/v1/auth/login", json={"email": "alice@ehu.lt", "password": "StrongPass123!"})
    assert ok.status_code == 200 and ok.json()["token_type"] == "bearer"

    me = api_client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200 and me.json()["email"] == "alice@ehu.lt"

    # Missing / invalid token -> 401
    assert api_client.get("/api/v1/auth/me").status_code == 401
    assert api_client.get("/api/v1/auth/me", headers={"Authorization": "Bearer broken.token"}).status_code == 401


def test_full_research_workflow_projects_docs_analyze_graph_override_export_delete(api_client: TestClient):
    alice = _register(api_client, "alice@ehu.lt", name="Alice")
    bob = _register(api_client, "bob@ehu.lt", name="Bob")
    h_alice = {"Authorization": f"Bearer {alice['token']}"}
    h_bob = {"Authorization": f"Bearer {bob['token']}"}

    # Create project + duplicate check + blank check
    assert api_client.post("/api/v1/projects", json={"name": "   "}, headers=h_alice).status_code == 422
    proj = api_client.post("/api/v1/projects", json={"name": "SciFact Review"}, headers=h_alice)
    assert proj.status_code == 201
    pid = proj.json()["id"]

    assert api_client.post("/api/v1/projects", json={"name": "scifact review"}, headers=h_alice).status_code == 409

    # Cross-user isolation (Bob cannot access or delete Alice's project)
    assert api_client.get(f"/api/v1/projects/{pid}/documents", headers=h_bob).status_code == 404
    assert api_client.delete(f"/api/v1/projects/{pid}", headers=h_bob).status_code == 404

    # Analyze with 0 ready documents -> 409
    assert api_client.post(f"/api/v1/projects/{pid}/analyze?sync=true", headers=h_alice).status_code == 409

    # Upload validation: unsupported type -> 415, empty -> 413, whitespace -> 422 (failed doc!)
    assert (
        api_client.post(
            f"/api/v1/projects/{pid}/documents",
            files={"file": ("img.png", b"1234", "image/png")},
            headers=h_alice,
        ).status_code
        == 415
    )
    assert (
        api_client.post(
            f"/api/v1/projects/{pid}/documents",
            files={"file": ("empty.txt", b"", "text/plain")},
            headers=h_alice,
        ).status_code
        == 413
    )
    failed_doc = api_client.post(
        f"/api/v1/projects/{pid}/documents",
        files={"file": ("blank.txt", b"   \n\t  ", "text/plain")},
        headers=h_alice,
    )
    assert failed_doc.status_code == 422 and failed_doc.json()["code"] == "extract_failed"

    # Upload two real scientific plain-text documents
    paper_a = (
        b"Experimental results demonstrate that dense retrieval significantly improves verification recall by 18%. "
        b"Our evaluation confirms that domain pretraining outperforms general BERT on scientific text."
    )
    paper_b = (
        b"In contrast, our clinical ablation shows that dense retrieval does not improve verification recall on noisy scans. "
        b"Independent experiments confirm that domain pretraining outperforms general BERT on biomedical benchmarks."
    )
    d1 = api_client.post(
        f"/api/v1/projects/{pid}/documents",
        files={"file": ("paper_a.txt", paper_a, "text/plain")},
        headers=h_alice,
    )
    assert d1.status_code == 201 and d1.json()["status"] == "ready"
    d1_id = d1.json()["id"]

    # Duplicate SHA-256 -> 409
    assert (
        api_client.post(
            f"/api/v1/projects/{pid}/documents",
            files={"file": ("paper_a_copy.txt", paper_a, "text/plain")},
            headers=h_alice,
        ).status_code
        == 409
    )

    d2 = api_client.post(
        f"/api/v1/projects/{pid}/documents",
        files={"file": ("paper_b.txt", paper_b, "text/plain")},
        headers=h_alice,
    )
    assert d2.status_code == 201

    # List documents paginated
    docs_res = api_client.get(f"/api/v1/projects/{pid}/documents?limit=10&offset=0", headers=h_alice)
    assert docs_res.status_code == 200 and docs_res.json()["total"] == 3  # 2 ready + 1 failed

    # UC-01 A1: failed document does NOT block analysis of ready documents!
    run = api_client.post(f"/api/v1/projects/{pid}/analyze?sync=true", headers=h_alice)
    assert run.status_code == 202 and len(run.json()["job_ids"]) == 3

    jobs = api_client.get(f"/api/v1/projects/{pid}/jobs", headers=h_alice)
    assert jobs.status_code == 200
    assert {"extract_claims", "retrieve", "nli"} <= {j["kind"] for j in jobs.json()["jobs"]}

    # Claims + filters + search + pagination
    claims_res = api_client.get(f"/api/v1/projects/{pid}/claims", headers=h_alice)
    assert claims_res.status_code == 200
    claims_data = claims_res.json()
    assert claims_data["total"] >= 2
    assert len(claims_data["claims"]) >= 2

    search_res = api_client.get(f"/api/v1/projects/{pid}/claims?search=pretraining&document_id={d1_id}", headers=h_alice)
    assert search_res.status_code == 200 and search_res.json()["total"] >= 1

    # Graph endpoint (also exercises TTL cache on 2nd call)
    g1 = api_client.get(f"/api/v1/projects/{pid}/graph", headers=h_alice)
    assert g1.status_code == 200 and len(g1.json()["nodes"]) >= 3 and len(g1.json()["edges"]) >= 2
    g2 = api_client.get(f"/api/v1/projects/{pid}/graph", headers=h_alice)
    assert g2.json() == g1.json()

    # Override NLI label (US-09)
    first_edge = next(ev for c in claims_data["claims"] for ev in c["evidence"])
    assert api_client.patch(f"/api/v1/evidence/{first_edge['id']}", json={"user_label": "contradiction"}, headers=h_bob).status_code == 404
    ov = api_client.patch(
        f"/api/v1/evidence/{first_edge['id']}",
        json={"user_label": "contradiction"},
        headers=h_alice,
    )
    assert ov.status_code == 200 and ov.json()["user_label"] == "contradiction"

    # Export JSON & CSV (US-08)
    exp_json = api_client.get(f"/api/v1/projects/{pid}/export?format=json", headers=h_alice)
    assert exp_json.status_code == 200 and exp_json.json()["project_id"] == pid
    exp_csv = api_client.get(f"/api/v1/projects/{pid}/export?format=csv", headers=h_alice)
    assert exp_csv.status_code == 200 and "effective_label" in exp_csv.text

    # List projects shows doc_count and claim_count
    plist = api_client.get("/api/v1/projects", headers=h_alice)
    assert plist.status_code == 200 and plist.json()["projects"][0]["claim_count"] >= 2

    # GDPR cascading delete (US-11)
    deleted = api_client.delete(f"/api/v1/projects/{pid}", headers=h_alice)
    assert deleted.status_code == 200 and deleted.json()["deleted"] == pid
    assert api_client.get(f"/api/v1/projects/{pid}/claims", headers=h_alice).status_code == 404


def test_rate_limiter_enforces_429(api_client: TestClient, monkeypatch: pytest.MonkeyPatch):
    user = _register(api_client, "rate@ehu.lt")
    headers = {"Authorization": f"Bearer {user['token']}"}
    pid = api_client.post("/api/v1/projects", json={"name": "Rate Test"}, headers=headers).json()["id"]

    monkeypatch.setattr(rate_limiter, "_max_requests", 2)
    rate_limiter.reset()
    # 2 allowed requests (even though 409 not_ready), 3rd blocked with 429
    assert api_client.post(f"/api/v1/projects/{pid}/analyze?sync=true", headers=headers).status_code == 409
    assert api_client.post(f"/api/v1/projects/{pid}/analyze?sync=true", headers=headers).status_code == 409
    blocked = api_client.post(f"/api/v1/projects/{pid}/analyze?sync=true", headers=headers)
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "rate_limited"
    assert "Retry-After" in blocked.headers
