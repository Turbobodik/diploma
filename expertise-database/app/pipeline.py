import hashlib
import re

EXTRACTOR = "mvp-sentence-v1"
EMBED_MODEL = "mvp-bow-v1"
NLI_MODEL = "mvp-overlap-v1"
DIM = 16
TOP_K = 5
_NEG = {"not", "no", "never", "without"}
_TOKEN = re.compile(r"[a-z0-9]+")


def split_passages(text: str, size: int = 500) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    i = 0
    n = len(text)
    while i < n:
        while i < n and text[i].isspace():
            i += 1
        if i >= n:
            break
        j = min(n, i + size)
        if j < n:
            cut = text.rfind(" ", i + size // 2, j)
            if cut != -1:
                j = cut
        if text[i:j].strip():
            spans.append((i, j))
        i = j
    return spans


def claim_span(text: str, start: int, end: int) -> tuple[int, int]:
    window = text[start:end]
    dot = window.find(". ")
    claim_end = start + dot + 1 if dot != -1 else end
    claim_start = start
    while claim_start < claim_end and text[claim_start].isspace():
        claim_start += 1
    while claim_end > claim_start and text[claim_end - 1].isspace():
        claim_end -= 1
    if claim_end <= claim_start:
        return start, end
    return claim_start, claim_end


def _tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def embed(text: str) -> list[float]:
    vec = [0.0] * DIM
    tokens = _tokens(text)
    if not tokens:
        vec[0] = 1.0
        return vec
    for token in tokens:
        bucket = hashlib.md5(token.encode()).digest()[0] % DIM
        vec[bucket] += 1.0
    norm = sum(v * v for v in vec) ** 0.5
    return [v / norm for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    return max(0.0, min(1.0, sum(x * y for x, y in zip(a, b))))


def nli_label(claim: str, passage: str) -> tuple[str, float]:
    ct = set(_tokens(claim))
    pt = set(_tokens(passage))
    if not ct or not pt:
        return "neutral", 0.5
    overlap = len(ct & pt) / len(ct)
    score = round(max(0.0, min(1.0, overlap)), 3)
    if bool(ct & _NEG) != bool(pt & _NEG) and overlap >= 0.2:
        return "contradiction", score
    if overlap >= 0.45:
        return "entailment", score
    return "neutral", score


def _job(conn, project_id: str, kind: str) -> str:
    row = conn.execute(
        """
        INSERT INTO analysis_job (project_id, kind, status, progress_pct, started_at)
        VALUES (%s, %s, 'running', 10, now())
        RETURNING id
        """,
        (project_id, kind),
    ).fetchone()
    return str(row["id"])


def _finish(conn, job_id: str) -> None:
    conn.execute(
        """
        UPDATE analysis_job
           SET status = 'succeeded', progress_pct = 100, finished_at = now()
         WHERE id = %s
        """,
        (job_id,),
    )


def analyse(conn, project_id: str) -> None:
    conn.execute("DELETE FROM claim WHERE project_id = %s", (project_id,))
    conn.execute(
        """
        DELETE FROM passage
         WHERE document_id IN (SELECT id FROM document WHERE project_id = %s)
        """,
        (project_id,),
    )

    docs = conn.execute(
        """
        SELECT id, extracted_text
          FROM document
         WHERE project_id = %s AND status = 'ready'
         ORDER BY created_at
        """,
        (project_id,),
    ).fetchall()

    claims_job = _job(conn, project_id, "extract_claims")
    passages: list[dict] = []
    for doc in docs:
        text = doc["extracted_text"] or ""
        for ordinal, (start, end) in enumerate(split_passages(text), start=1):
            chunk = text[start:end]
            row = conn.execute(
                """
                INSERT INTO passage (document_id, ordinal, char_start, char_end, text)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (doc["id"], ordinal, start, end, chunk),
            ).fetchone()
            vector = embed(chunk)
            conn.execute(
                """
                INSERT INTO passage_embedding (passage_id, model_name, dimensions, vector)
                VALUES (%s, %s, %s, %s)
                """,
                (row["id"], EMBED_MODEL, DIM, vector),
            )
            c_start, c_end = claim_span(text, start, end)
            claim_text = text[c_start:c_end]
            claim = conn.execute(
                """
                INSERT INTO claim (
                    project_id, source_document_id, char_start, char_end,
                    text, confidence, extractor_name
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (project_id, doc["id"], c_start, c_end, claim_text, 0.600, EXTRACTOR),
            ).fetchone()
            passages.append(
                {
                    "id": str(row["id"]),
                    "document_id": str(doc["id"]),
                    "text": chunk,
                    "vector": vector,
                    "claim_id": str(claim["id"]),
                    "claim_text": claim_text,
                    "start": start,
                    "end": end,
                }
            )
    _finish(conn, claims_job)

    retrieve_job = _job(conn, project_id, "retrieve")
    nli_pairs: list[tuple[str, str, float]] = []
    for source in passages:
        ranked = []
        for other in passages:
            if other["id"] == source["id"]:
                continue
            same_document = other["document_id"] == source["document_id"]
            overlaps = not (other["end"] <= source["start"] or other["start"] >= source["end"])
            if same_document and overlaps:
                continue
            ranked.append((cosine(source["vector"], other["vector"]), other))
        ranked.sort(key=lambda item: item[0], reverse=True)
        for rank, (score, other) in enumerate(ranked[:TOP_K], start=1):
            rounded = round(score, 5)
            conn.execute(
                """
                INSERT INTO retrieval_candidate (claim_id, passage_id, rank, score)
                VALUES (%s, %s, %s, %s)
                """,
                (source["claim_id"], other["id"], rank, rounded),
            )
            nli_pairs.append((source["claim_id"], other["id"], rounded))
    _finish(conn, retrieve_job)

    nli_job = _job(conn, project_id, "nli")
    by_id = {item["id"]: item for item in passages}
    claim_by_id = {item["claim_id"]: item["claim_text"] for item in passages}
    for claim_id, passage_id, _score in nli_pairs:
        label, model_score = nli_label(claim_by_id[claim_id], by_id[passage_id]["text"])
        conn.execute(
            """
            INSERT INTO claim_evidence (claim_id, passage_id, model_name, model_label, model_score)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (claim_id, passage_id, NLI_MODEL, label, model_score),
        )
    _finish(conn, nli_job)
