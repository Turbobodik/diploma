import hashlib
import shutil
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, File, Header, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from pypdf import PdfReader

from app.auth import hash_password, issue_token, user_id_for, verify_password
from app.db import STORAGE, connect
from app.pipeline import analyse

MAX_BYTES = 20 * 1024 * 1024
ALLOWED = {"application/pdf": ".pdf", "text/plain": ".txt"}

app = FastAPI(title="FactMap Scholar MVP")
STATIC = Path(__file__).resolve().parent / "static"


def fail(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"code": code, "message": message})


def current_user(authorization: str | None = Header(default=None)) -> str:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    user_id = user_id_for(token)
    if user_id is None:
        raise AuthError()
    return user_id


class AuthError(Exception):
    pass


@app.exception_handler(AuthError)
def _auth_error(_request, _exc):
    return fail(401, "unauthorized", "Sign in required")


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(min_length=1, max_length=120)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class OverrideIn(BaseModel):
    user_label: str | None


def _owns(conn, user_id: str, project_id: str):
    return conn.execute(
        "SELECT id, name, created_at FROM project WHERE id = %s AND owner_id = %s",
        (project_id, user_id),
    ).fetchone()


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.post("/api/register")
def register(body: RegisterIn):
    email = body.email.lower()
    with connect() as conn:
        exists = conn.execute("SELECT 1 FROM app_user WHERE email = %s", (email,)).fetchone()
        if exists:
            return fail(409, "duplicate_email", "An account with this email already exists")
        row = conn.execute(
            """
            INSERT INTO app_user (email, password_hash, display_name)
            VALUES (%s, %s, %s)
            RETURNING id, email, display_name
            """,
            (email, hash_password(body.password), body.display_name.strip()),
        ).fetchone()
        conn.commit()
    return {"token": issue_token(str(row["id"])), "user": _user(row)}


@app.post("/api/login")
def login(body: LoginIn):
    with connect() as conn:
        row = conn.execute(
            "SELECT id, email, display_name, password_hash FROM app_user WHERE email = %s",
            (body.email.lower(),),
        ).fetchone()
    if row is None or not verify_password(body.password, row["password_hash"]):
        return fail(401, "invalid_login", "Email or password is wrong")
    return {"token": issue_token(str(row["id"])), "user": _user(row)}


def _user(row) -> dict:
    return {"id": str(row["id"]), "email": row["email"], "display_name": row["display_name"]}


@app.get("/api/projects")
def list_projects(user_id: str = Depends(current_user)):
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, name, created_at FROM project
             WHERE owner_id = %s ORDER BY created_at DESC
            """,
            (user_id,),
        ).fetchall()
    return {"projects": [_project(r) for r in rows]}


@app.post("/api/projects")
def create_project(body: ProjectIn, user_id: str = Depends(current_user)):
    name = body.name.strip()
    if not name:
        return fail(422, "empty_name", "Project name is empty")
    with connect() as conn:
        taken = conn.execute(
            "SELECT 1 FROM project WHERE owner_id = %s AND lower(name) = lower(%s)",
            (user_id, name),
        ).fetchone()
        if taken:
            return fail(409, "duplicate_name", "You already have a project with this name")
        row = conn.execute(
            """
            INSERT INTO project (owner_id, name) VALUES (%s, %s)
            RETURNING id, name, created_at
            """,
            (user_id, name),
        ).fetchone()
        conn.commit()
    return _project(row)


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: UUID, user_id: str = Depends(current_user)):
    pid = str(project_id)
    with connect() as conn:
        if _owns(conn, user_id, pid) is None:
            return fail(404, "not_found", "Project not found")
        conn.execute("DELETE FROM project WHERE id = %s", (pid,))
        conn.commit()
    folder = STORAGE / pid
    if folder.exists():
        shutil.rmtree(folder)
    return {"deleted": pid}


@app.get("/api/projects/{project_id}/documents")
def list_documents(project_id: UUID, user_id: str = Depends(current_user)):
    pid = str(project_id)
    with connect() as conn:
        if _owns(conn, user_id, pid) is None:
            return fail(404, "not_found", "Project not found")
        rows = conn.execute(
            """
            SELECT id, original_name, media_type, size_bytes, status, error_message, created_at
              FROM document WHERE project_id = %s ORDER BY created_at
            """,
            (pid,),
        ).fetchall()
    return {"documents": [_doc(r) for r in rows]}


@app.post("/api/projects/{project_id}/documents")
async def upload_document(
    project_id: UUID,
    file: UploadFile = File(...),
    user_id: str = Depends(current_user),
):
    pid = str(project_id)
    media = file.content_type or ""
    if media not in ALLOWED:
        return fail(415, "bad_type", "Only PDF and plain text files are accepted")
    payload = await file.read()
    if not payload or len(payload) > MAX_BYTES:
        return fail(413, "bad_size", "File must be between 1 byte and 20 MB")
    digest = hashlib.sha256(payload).hexdigest()
    doc_id = str(uuid4())
    object_key = f"{pid}/{doc_id}{ALLOWED[media]}"
    with connect() as conn:
        if _owns(conn, user_id, pid) is None:
            return fail(404, "not_found", "Project not found")
        duplicate = conn.execute(
            "SELECT 1 FROM document WHERE project_id = %s AND sha256 = %s",
            (pid, digest),
        ).fetchone()
        if duplicate:
            return fail(409, "duplicate_file", "This file is already in the project")
        job = conn.execute(
            """
            INSERT INTO analysis_job (project_id, kind, status, progress_pct, started_at)
            VALUES (%s, 'extract_text', 'running', 10, now())
            RETURNING id
            """,
            (pid,),
        ).fetchone()
        conn.execute(
            """
            INSERT INTO document (
                id, project_id, original_name, media_type, size_bytes, sha256, object_key, status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'processing')
            """,
            (doc_id, pid, Path(file.filename or "upload").name[:500], media, len(payload), digest, object_key),
        )
        target = STORAGE / object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        try:
            text = _extract(target, media)
        except Exception as exc:
            conn.execute(
                """
                UPDATE document
                   SET status = 'failed', error_message = %s
                 WHERE id = %s
                """,
                (str(exc)[:500], doc_id),
            )
            conn.execute(
                """
                UPDATE analysis_job
                   SET status = 'failed', progress_pct = 100, error_message = %s, finished_at = now()
                 WHERE id = %s
                """,
                (str(exc)[:500], job["id"]),
            )
            conn.commit()
            return fail(422, "extract_failed", str(exc)[:500])
        if not text.strip():
            message = "No text could be extracted from this file"
            conn.execute(
                "UPDATE document SET status = 'failed', error_message = %s WHERE id = %s",
                (message, doc_id),
            )
            conn.execute(
                """
                UPDATE analysis_job
                   SET status = 'failed', progress_pct = 100, error_message = %s, finished_at = now()
                 WHERE id = %s
                """,
                (message, job["id"]),
            )
            conn.commit()
            return fail(422, "extract_failed", message)
        conn.execute(
            "UPDATE document SET status = 'ready', extracted_text = %s WHERE id = %s",
            (text, doc_id),
        )
        conn.execute(
            """
            UPDATE analysis_job
               SET status = 'succeeded', progress_pct = 100, finished_at = now()
             WHERE id = %s
            """,
            (job["id"],),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT id, original_name, media_type, size_bytes, status, error_message, created_at
              FROM document WHERE id = %s
            """,
            (doc_id,),
        ).fetchone()
    return _doc(row)


def _extract(path: Path, media: str) -> str:
    if media == "text/plain":
        return path.read_text(encoding="utf-8")
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


@app.post("/api/projects/{project_id}/analyze")
def run_analysis(project_id: UUID, user_id: str = Depends(current_user)):
    pid = str(project_id)
    with connect() as conn:
        if _owns(conn, user_id, pid) is None:
            return fail(404, "not_found", "Project not found")
        counts = conn.execute(
            """
            SELECT
              count(*) FILTER (WHERE status = 'ready') AS ready,
              count(*) FILTER (WHERE status <> 'ready') AS blocked
            FROM document WHERE project_id = %s
            """,
            (pid,),
        ).fetchone()
        if counts["ready"] < 1 or counts["blocked"] > 0:
            return fail(409, "not_ready", "Analysis starts only when every document is ready")
        analyse(conn, pid)
        conn.commit()
    return {"status": "succeeded"}


@app.get("/api/projects/{project_id}/claims")
def list_claims(project_id: UUID, user_id: str = Depends(current_user)):
    pid = str(project_id)
    with connect() as conn:
        if _owns(conn, user_id, pid) is None:
            return fail(404, "not_found", "Project not found")
        claims = conn.execute(
            """
            SELECT c.id, c.text, c.confidence, c.extractor_name, c.char_start, c.char_end,
                   d.original_name AS source_name
              FROM claim c
              JOIN document d ON d.id = c.source_document_id
             WHERE c.project_id = %s
             ORDER BY d.created_at, c.char_start
            """,
            (pid,),
        ).fetchall()
        evidence = conn.execute(
            """
            SELECT e.id, e.claim_id, e.model_label, e.model_score, e.user_label, e.model_name,
                   p.text AS passage_text, d.original_name
              FROM claim_evidence e
              JOIN claim c ON c.id = e.claim_id
              JOIN passage p ON p.id = e.passage_id
              JOIN document d ON d.id = p.document_id
             WHERE c.project_id = %s
             ORDER BY e.model_label
            """,
            (pid,),
        ).fetchall()
        jobs = conn.execute(
            """
            SELECT id, kind, status, progress_pct, error_message, created_at
              FROM analysis_job WHERE project_id = %s ORDER BY created_at
            """,
            (pid,),
        ).fetchall()
    by_claim: dict[str, list] = {}
    for row in evidence:
        by_claim.setdefault(str(row["claim_id"]), []).append(
            {
                "id": str(row["id"]),
                "model_label": row["model_label"],
                "model_score": float(row["model_score"]),
                "user_label": row["user_label"],
                "model_name": row["model_name"],
                "passage_text": row["passage_text"],
                "document_name": row["original_name"],
            }
        )
    return {
        "claims": [
            {
                "id": str(row["id"]),
                "text": row["text"],
                "confidence": float(row["confidence"]),
                "extractor_name": row["extractor_name"],
                "char_start": row["char_start"],
                "char_end": row["char_end"],
                "source_name": row["source_name"],
                "evidence": by_claim.get(str(row["id"]), []),
            }
            for row in claims
        ],
        "jobs": [
            {
                "id": str(row["id"]),
                "kind": row["kind"],
                "status": row["status"],
                "progress_pct": row["progress_pct"],
                "error_message": row["error_message"],
            }
            for row in jobs
        ],
    }


@app.patch("/api/evidence/{evidence_id}")
def override_label(evidence_id: UUID, body: OverrideIn, user_id: str = Depends(current_user)):
    allowed = {None, "entailment", "contradiction", "neutral"}
    if body.user_label not in allowed:
        return fail(422, "bad_label", "Label must be entailment, contradiction, neutral, or null")
    eid = str(evidence_id)
    with connect() as conn:
        row = conn.execute(
            """
            SELECT e.id
              FROM claim_evidence e
              JOIN claim c ON c.id = e.claim_id
              JOIN project p ON p.id = c.project_id
             WHERE e.id = %s AND p.owner_id = %s
            """,
            (eid, user_id),
        ).fetchone()
        if row is None:
            return fail(404, "not_found", "Evidence edge not found")
        conn.execute(
            "UPDATE claim_evidence SET user_label = %s WHERE id = %s",
            (body.user_label, eid),
        )
        conn.commit()
    return {"id": eid, "user_label": body.user_label}


def _project(row) -> dict:
    return {"id": str(row["id"]), "name": row["name"], "created_at": row["created_at"].isoformat()}


def _doc(row) -> dict:
    return {
        "id": str(row["id"]),
        "original_name": row["original_name"],
        "media_type": row["media_type"],
        "size_bytes": row["size_bytes"],
        "status": row["status"],
        "error_message": row["error_message"],
        "created_at": row["created_at"].isoformat(),
    }


app.mount("/static", StaticFiles(directory=STATIC), name="static")
