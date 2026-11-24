from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

PAGE_SEPARATOR = "\f"


@dataclass(frozen=True)
class ExtractedDocument:
    text: str
    page_count: int | None


def extract_document_text(path: Path, media_type: str) -> ExtractedDocument:
    """Extract UTF-8 text from TXT or PDF.

    For PDFs, pages are joined with form-feed (`\\f`) so downstream chunking and
    claim extraction can compute exact `page_no` from `char_start` without extra
    schema columns, while keeping `text[char_start:char_end]` exact.
    """
    if media_type == "text/plain":
        raw = path.read_text(encoding="utf-8", errors="replace")
        cleaned = raw.replace("\r\n", "\n").replace("\r", "\n").replace(PAGE_SEPARATOR, "\n")
        return ExtractedDocument(text=cleaned, page_count=None)

    reader = PdfReader(str(path))
    pages = [
        (page.extract_text() or "").replace("\r\n", "\n").replace("\r", "\n").replace(PAGE_SEPARATOR, "\n")
        for page in reader.pages
    ]
    page_count = len(pages) if pages else None
    return ExtractedDocument(text=PAGE_SEPARATOR.join(pages), page_count=page_count)


def page_number_at(extracted_text: str, char_start: int, is_pdf: bool) -> int | None:
    if not is_pdf:
        return None
    return extracted_text.count(PAGE_SEPARATOR, 0, char_start) + 1
