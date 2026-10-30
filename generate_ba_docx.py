"""Convert BA markdown to DOCX (handles tables, lists, base64 PNG diagrams)."""
from __future__ import annotations

import base64
import io
import re
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Cm, Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "BA_Kanoplich_Bahdan.md"
OUT = ROOT / "BA_Kanoplich_Bahdan.docx"


def set_run_font(run, size=11, bold=False, italic=False):
    run.font.name = "Times New Roman"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic


def add_formatted_runs(paragraph, text: str, size=11):
    """Split **bold** and `code` segments."""
    parts = re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text)
    for part in parts:
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            run = paragraph.add_run(part[2:-2])
            set_run_font(run, size=size, bold=True)
        elif part.startswith("`") and part.endswith("`"):
            run = paragraph.add_run(part[1:-1])
            set_run_font(run, size=size, italic=True)
        else:
            run = paragraph.add_run(part)
            set_run_font(run, size=size)


def set_cell_shading(cell, hex_color: str):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_color)
    shd.set(qn("w:val"), "clear")
    tcPr.append(shd)


def add_table(doc: Document, rows: list[list[str]]):
    if not rows:
        return
    cols = max(len(r) for r in rows)
    table = doc.add_table(rows=len(rows), cols=cols)
    table.style = "Table Grid"
    for i, row in enumerate(rows):
        for j in range(cols):
            cell = table.cell(i, j)
            cell.text = ""
            p = cell.paragraphs[0]
            val = row[j] if j < len(row) else ""
            add_formatted_runs(p, val.strip(), size=9)
            if i == 0:
                set_cell_shading(cell, "E8E8E8")
                for run in p.runs:
                    run.bold = True
    doc.add_paragraph()


def parse_table_block(lines: list[str], start: int) -> tuple[list[list[str]], int]:
    rows = []
    i = start
    while i < len(lines) and lines[i].strip().startswith("|"):
        line = lines[i].strip()
        if re.match(r"^\|[\s\-:|]+\|$", line):
            i += 1
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        rows.append(cells)
        i += 1
    return rows, i


def extract_data_uri_image(line: str) -> bytes | None:
    m = re.search(r"!\[.*?\]\(data:image/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)\)", line)
    if not m:
        # bare data uri sometimes without markdown image syntax leftovers
        m = re.search(r"data:image/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)", line)
    if not m:
        return None
    b64 = re.sub(r"\s+", "", m.group(2))
    try:
        return base64.b64decode(b64)
    except Exception:
        return None


def is_heading(line: str) -> tuple[int, str] | None:
    m = re.match(r"^(#{1,6})\s+(.*)$", line)
    if not m:
        return None
    text = m.group(2).strip()
    text = re.sub(r"^\*\*(.*)\*\*$", r"\1", text)
    return len(m.group(1)), text


def convert():
    raw = SRC.read_text(encoding="utf-8")
    lines = raw.splitlines()

    doc = Document()
    section = doc.sections[0]
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2)

    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(11)
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # base64 / markdown image
        if "data:image/" in stripped and "base64," in stripped:
            img = extract_data_uri_image(stripped)
            if img:
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run()
                run.add_picture(io.BytesIO(img), width=Inches(5.8))
            i += 1
            continue

        h = is_heading(stripped)
        if h:
            level, text = h
            # Title page lines use # Introduction etc.; map level to Word styles
            style_name = {
                1: "Heading 1",
                2: "Heading 2",
                3: "Heading 3",
                4: "Heading 4",
            }.get(level, "Heading 4")
            p = doc.add_paragraph(style=style_name)
            add_formatted_runs(p, text, size=14 if level == 1 else 12 if level == 2 else 11)
            for run in p.runs:
                run.font.color.rgb = RGBColor(0, 0, 0)
            i += 1
            continue

        if stripped.startswith("|") and "|" in stripped[1:]:
            rows, i = parse_table_block(lines, i)
            add_table(doc, rows)
            continue

        if re.match(r"^[-*]\s+", stripped):
            text = re.sub(r"^[-*]\s+", "", stripped)
            p = doc.add_paragraph(style="List Bullet")
            add_formatted_runs(p, text)
            i += 1
            continue

        if re.match(r"^\d+\.\s+", stripped):
            text = re.sub(r"^\d+\.\s+", "", stripped)
            p = doc.add_paragraph(style="List Number")
            add_formatted_runs(p, text)
            i += 1
            continue

        # italic caption like *Table ...*
        if stripped.startswith("*") and stripped.endswith("*") and not stripped.startswith("**"):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(stripped.strip("*"))
            set_run_font(run, size=10, italic=True)
            i += 1
            continue

        # Title-page bold-ish plain lines before first heading: keep as centered if short ALLCAPS-ish
        p = doc.add_paragraph()
        if i < 30 and len(stripped) < 120 and not stripped.startswith("http"):
            # early metadata: center
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_formatted_runs(p, stripped)
        i += 1

    doc.save(OUT)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    convert()
