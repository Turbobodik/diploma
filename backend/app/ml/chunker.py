import re

from app.extraction import PAGE_SEPARATOR, page_number_at
from app.ml.types import PassageSpan

_ABBREV = {
    "al",
    "approx",
    "cf",
    "dr",
    "ed",
    "eds",
    "eg",
    "eq",
    "eqs",
    "etc",
    "fig",
    "figs",
    "ie",
    "inc",
    "jr",
    "mr",
    "mrs",
    "ms",
    "no",
    "nos",
    "prof",
    "ref",
    "refs",
    "sec",
    "secs",
    "sr",
    "st",
    "tab",
    "vol",
    "vs",
}

_SENT_BOUNDARY = re.compile(r"([.!?])(?:[\"'”’\)\]]*)(\s+)(?=[A-Z0-9(\[\"'“‘])")


def _is_abbreviation(text: str, dot_index: int) -> bool:
    if dot_index <= 0 or text[dot_index] != ".":
        return False
    # Check decimal or version numbers like 0.85 or v1.2
    if dot_index + 1 < len(text) and text[dot_index + 1].isdigit():
        return True
    # Walk backwards over word chars before the dot
    j = dot_index - 1
    while j >= 0 and text[j].isalpha():
        j -= 1
    word = text[j + 1 : dot_index].lower()
    if not word:
        return False
    if len(word) == 1:
        # Single-letter initial like "J. Smith" or "e.g."
        return True
    if word in _ABBREV:
        return True
    # Check dotted two-part abbreviations like e.g. / i.e.
    if j >= 2 and text[j] == "." and text[j - 1].isalpha():
        prev = text[j - 1 : dot_index].replace(".", "").lower()
        if prev in _ABBREV:
            return True
    return False


def split_sentences_with_spans(text: str) -> list[tuple[int, int]]:
    """Split text into sentence spans `(char_start, char_end)` without altering offsets.

    Never crosses page separators (`\\f`) or double newlines (paragraph breaks).
    Guarantees every returned span has non-whitespace text and exact slice semantics.
    """
    spans: list[tuple[int, int]] = []
    # Split into blocks separated by form-feed or blank lines
    block_pattern = re.compile(r"(?:\f|\n[ \t]*\n)+")
    cursor = 0
    for sep in block_pattern.finditer(text):
        _split_block(text, cursor, sep.start(), spans)
        cursor = sep.end()
    _split_block(text, cursor, len(text), spans)
    return spans


def _trim_span(text: str, start: int, end: int) -> tuple[int, int] | None:
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    if end <= start:
        return None
    return start, end


def _split_block(text: str, block_start: int, block_end: int, out: list[tuple[int, int]]) -> None:
    block = text[block_start:block_end]
    if not block.strip():
        return
    sent_start = block_start
    for match in _SENT_BOUNDARY.finditer(block):
        punct_pos = block_start + match.start(1)
        if _is_abbreviation(text, punct_pos):
            continue
        sent_end = block_start + match.start(2)
        trimmed = _trim_span(text, sent_start, sent_end)
        if trimmed is not None:
            out.append(trimmed)
        sent_start = block_start + match.end(2)
    tail = _trim_span(text, sent_start, block_end)
    if tail is not None:
        out.append(tail)


def split_passages(
    text: str,
    *,
    is_pdf: bool = False,
    target_chars: int = 650,
    max_chars: int = 1000,
) -> list[PassageSpan]:
    """Build sentence-aware passages while preserving exact offsets in `text`.

    Never crosses a page break (`\\f`) so every passage maps to a single page.
    """
    sentence_spans = split_sentences_with_spans(text)
    if not sentence_spans:
        return []

    passages: list[PassageSpan] = []
    group_start: int | None = None
    group_end: int | None = None
    group_page: int | None = None

    def flush() -> None:
        nonlocal group_start, group_end, group_page
        if group_start is None or group_end is None:
            return
        trimmed = _trim_span(text, group_start, group_end)
        if trimmed is not None:
            s, e = trimmed
            passages.append(
                PassageSpan(
                    ordinal=len(passages) + 1,
                    char_start=s,
                    char_end=e,
                    page_no=group_page,
                    text=text[s:e],
                )
            )
        group_start = None
        group_end = None
        group_page = None

    for s_start, s_end in sentence_spans:
        s_page = page_number_at(text, s_start, is_pdf=is_pdf)

        # If a single sentence is huge, flush current and split it cleanly by word boundaries
        if s_end - s_start > max_chars:
            flush()
            pos = s_start
            while pos < s_end:
                while pos < s_end and text[pos].isspace():
                    pos += 1
                if pos >= s_end:
                    break
                cut = min(s_end, pos + target_chars)
                if cut < s_end:
                    ws = text.rfind(" ", pos + target_chars // 2, cut)
                    if ws != -1:
                        cut = ws
                trimmed = _trim_span(text, pos, cut)
                if trimmed is not None:
                    ts, te = trimmed
                    passages.append(
                        PassageSpan(
                            ordinal=len(passages) + 1,
                            char_start=ts,
                            char_end=te,
                            page_no=page_number_at(text, ts, is_pdf=is_pdf),
                            text=text[ts:te],
                        )
                    )
                pos = cut
            continue

        if group_start is None:
            group_start, group_end, group_page = s_start, s_end, s_page
            continue

        crosses_page = PAGE_SEPARATOR in text[group_end:s_start]
        crosses_paragraph = "\n\n" in text[group_end:s_start]
        proposed_len = s_end - group_start

        if crosses_page or (crosses_paragraph and (group_end - group_start) >= target_chars // 2) or proposed_len > target_chars:
            flush()
            group_start, group_end, group_page = s_start, s_end, s_page
        else:
            group_end = s_end

    flush()
    return passages
