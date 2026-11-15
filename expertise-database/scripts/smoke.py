"""End-to-end check against a running MVP. Usage: python scripts/smoke.py"""

import json
import urllib.error
import urllib.request
from pathlib import Path

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
    page = urllib.request.urlopen(BASE + "/")
    assert page.status == 200 and b"FactMap Scholar" in page.read()

    status, reg = call(
        "POST",
        "/api/register",
        {"email": "mvp@example.com", "password": "secret-pass", "display_name": "MVP"},
    )
    if status == 409:
        status, reg = call("POST", "/api/login", {"email": "mvp@example.com", "password": "secret-pass"})
    assert status == 200, reg
    token = reg["token"]

    status, dup = call("POST", "/api/projects", {"name": "Smoke"}, token)
    if status == 409:
        status, listing = call("GET", "/api/projects", token=token)
        project_id = next(item["id"] for item in listing["projects"] if item["name"] == "Smoke")
        call("DELETE", f"/api/projects/{project_id}", token=token)
        status, dup = call("POST", "/api/projects", {"name": "Smoke"}, token)
    assert status == 200, dup
    project_id = dup["id"]
    status, again = call("POST", "/api/projects", {"name": "smoke"}, token)
    assert status == 409 and again["code"] == "duplicate_name"

    paper_a = (ROOT / "scripts" / "sample_a.txt").read_bytes()
    paper_b = (ROOT / "scripts" / "sample_b.txt").read_bytes()
    multipart(f"/api/projects/{project_id}/documents", "a.txt", paper_a, "text/plain", token)
    multipart(f"/api/projects/{project_id}/documents", "b.txt", paper_b, "text/plain", token)

    status, analysis = call("POST", f"/api/projects/{project_id}/analyze", token=token)
    assert status == 200, analysis
    status, claims = call("GET", f"/api/projects/{project_id}/claims", token=token)
    assert claims["claims"], "expected at least one claim"
    kinds = {job["kind"] for job in claims["jobs"]}
    assert {"extract_text", "extract_claims", "retrieve", "nli"} <= kinds
    edge = next(item for claim in claims["claims"] for item in claim["evidence"])
    status, patched = call(
        "PATCH",
        f"/api/evidence/{edge['id']}",
        {"user_label": "contradiction"},
        token,
    )
    assert status == 200 and patched["user_label"] == "contradiction"
    status, claims = call("GET", f"/api/projects/{project_id}/claims", token=token)
    seen = next(item for claim in claims["claims"] for item in claim["evidence"] if item["id"] == edge["id"])
    assert seen["model_label"] and seen["user_label"] == "contradiction"

    status, _gone = call("DELETE", f"/api/projects/{project_id}", token=token)
    assert status == 200
    status, missing = call("GET", f"/api/projects/{project_id}/claims", token=token)
    assert status == 404 and missing["code"] == "not_found"
    print("smoke ok", len(claims["claims"]), "claims before delete")


if __name__ == "__main__":
    main()
