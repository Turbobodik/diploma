"""End-to-end smoke check against running FactMap Scholar /api/v1 backend.

Usage:
    python scripts/smoke.py
"""

import json
from pathlib import Path
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
ROOT = Path(__file__).resolve().parents[1]


def call(method, path, body=None, token=None, content_type="application/json"):
    data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if data is not None and not path.endswith("/documents"):
        headers["Content-Type"] = content_type
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        payload = json.loads(exc.read().decode() or "{}")
        return exc.code, payload


def multipart(path, filename, content, content_type, token):
    boundary = "----factmap"
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode()
    payload = head + content + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        BASE + path,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        return response.status, json.loads(response.read())


def main():
    status, health = call("GET", "/health")
    assert status == 200 and health["status"] == "ok", health
    print("health ok:", health)

    status, reg = call(
        "POST",
        "/api/v1/auth/register",
        {"email": "ml-smoke@example.com", "password": "secret-pass", "display_name": "ML Smoke"},
    )
    if status == 409:
        status, reg = call(
            "POST",
            "/api/v1/auth/login",
            {"email": "ml-smoke@example.com", "password": "secret-pass"},
        )
    assert status in (200, 201), reg
    token = reg["token"]

    status, proj = call("POST", "/api/v1/projects", {"name": "ML Smoke"}, token)
    if status == 409:
        status, listing = call("GET", "/api/v1/projects", token=token)
        existing_id = next(item["id"] for item in listing["projects"] if item["name"] == "ML Smoke")
        call("DELETE", f"/api/v1/projects/{existing_id}", token=token)
        status, proj = call("POST", "/api/v1/projects", {"name": "ML Smoke"}, token)
    assert status in (200, 201), proj
    project_id = proj["id"]

    paper_a = (ROOT / "scripts" / "sample_a.txt").read_bytes()
    paper_b = (ROOT / "scripts" / "sample_b.txt").read_bytes()
    multipart(f"/api/v1/projects/{project_id}/documents", "a.txt", paper_a, "text/plain", token)
    multipart(f"/api/v1/projects/{project_id}/documents", "b.txt", paper_b, "text/plain", token)

    status, started = call("POST", f"/api/v1/projects/{project_id}/analyze", token=token)
    assert status == 202 and len(started["job_ids"]) == 3, (status, started)

    # Poll background jobs until finished
    target_ids = set(started["job_ids"])
    for _ in range(180):
        status, job_resp = call("GET", f"/api/v1/projects/{project_id}/jobs", token=token)
        assert status == 200
        tracked = [j for j in job_resp["jobs"] if j["id"] in target_ids]
        statuses = {j["status"] for j in tracked}
        if statuses == {"succeeded"}:
            break
        if "failed" in statuses:
            raise AssertionError(f"Pipeline job failed: {tracked}")
        time.sleep(1.0)
    else:
        raise AssertionError("Timed out waiting for background analysis jobs")

    status, claims = call("GET", f"/api/v1/projects/{project_id}/claims", token=token)
    assert status == 200 and claims["claims"], claims
    status, graph = call("GET", f"/api/v1/projects/{project_id}/graph", token=token)
    assert status == 200 and graph["nodes"] and graph["edges"], graph

    print(
        f"smoke ok: {len(claims['claims'])} claims, "
        f"{len(graph['nodes'])} graph nodes, {len(graph['edges'])} graph edges"
    )

    status, _deleted = call("DELETE", f"/api/v1/projects/{project_id}", token=token)
    assert status == 200


if __name__ == "__main__":
    main()
