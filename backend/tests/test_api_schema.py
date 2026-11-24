from pathlib import Path

from app.extraction import PAGE_SEPARATOR, extract_document_text, page_number_at
from app.main import app


def test_openapi_exposes_v1_endpoints():
    schema = app.openapi()
    paths = schema["paths"]
    assert "/health" in paths
    assert "/api/v1/projects" in paths
    assert "/api/v1/projects/demo" in paths
    assert "/api/v1/projects/{project_id}/documents" in paths
    assert "/api/v1/projects/{project_id}/analyze" in paths
    assert "/api/v1/projects/{project_id}/jobs" in paths
    assert "/api/v1/projects/{project_id}/claims" in paths
    assert "/api/v1/projects/{project_id}/graph" in paths
    assert "/api/v1/projects/{project_id}/export" in paths
    assert "/api/v1/evidence/{evidence_id}" in paths


def test_txt_extraction_normalizes_newlines(tmp_path: Path):
    sample = tmp_path / "paper.txt"
    sample.write_bytes(b"Line one.\r\n\r\nLine two.\rLine three.")
    extracted = extract_document_text(sample, "text/plain")
    assert extracted.page_count is None
    assert "\r" not in extracted.text
    assert extracted.text == "Line one.\n\nLine two.\nLine three."


def test_page_number_tracking_with_form_feed():
    text = f"Page one claim.{PAGE_SEPARATOR}Page two claim.{PAGE_SEPARATOR}Page three claim."
    assert page_number_at(text, 0, is_pdf=True) == 1
    p2_idx = text.index("Page two")
    p3_idx = text.index("Page three")
    assert page_number_at(text, p2_idx, is_pdf=True) == 2
    assert page_number_at(text, p3_idx, is_pdf=True) == 3
    assert page_number_at(text, p3_idx, is_pdf=False) is None
