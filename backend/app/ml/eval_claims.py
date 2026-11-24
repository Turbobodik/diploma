"""Claim-span extraction evaluator for FactMap Scholar (US-03 / NFR-13).

Evaluates character-level span IoU against hand-labelled scientific abstracts:
- Gate (US-03 / NFR-13): >= 70% span detection at IoU >= 0.5 on >= 30 sentences.
- Reports Precision, Recall, F1, Mean IoU, and latency across extractors.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from app.ml.chunker import split_sentences_with_spans
from app.ml.claim_extractor import LocalClaimExtractor
from app.ml.embedder import SentenceTransformersEmbedder, StubEmbedder
from app.ml.nli import TransformersNLIClassifier


@dataclass(frozen=True)
class AnnotatedAbstract:
    doc_id: str
    domain: str
    text: str
    gold_spans: list[tuple[int, int]]
    total_sentences: int


@dataclass
class ClaimEvalRow:
    extractor: str
    abstracts: int
    total_sentences: int
    gold_claims: int
    predicted_claims: int
    matched_iou50: int
    span_detection_rate: float  # Recall @ IoU >= 0.5 (US-03 gate >= 0.70)
    precision_iou50: float
    f1_iou50: float
    mean_matched_iou: float
    us03_pass: bool
    ms_per_abstract: float


def span_iou(a: tuple[int, int], b: tuple[int, int]) -> float:
    inter = max(0, min(a[1], b[1]) - max(a[0], b[0]))
    if inter == 0:
        return 0.0
    union = max(a[1], b[1]) - min(a[0], b[0])
    return inter / union if union > 0 else 0.0


def load_claim_eval_dataset(path: Path) -> list[AnnotatedAbstract]:
    docs: list[AnnotatedAbstract] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            text = row["text"]
            gold_spans: list[tuple[int, int]] = []
            for snippet in row["gold_claims"]:
                idx = text.find(snippet)
                if idx == -1:
                    raise ValueError(f"Gold claim snippet not found verbatim in {row['doc_id']}: {snippet!r}")
                gold_spans.append((idx, idx + len(snippet)))
            total_sents = len(split_sentences_with_spans(text))
            docs.append(
                AnnotatedAbstract(
                    doc_id=row["doc_id"],
                    domain=row.get("domain", ""),
                    text=text,
                    gold_spans=gold_spans,
                    total_sentences=total_sents,
                )
            )
    return docs


def load_scifact_abstracts_eval(scifact_dir: Path, *, max_abstracts: int = 25) -> list[AnnotatedAbstract]:
    """Load real unseen scientific abstracts from SciFact dev with gold rationale sentences as target spans."""
    corpus: dict[str, dict] = {}
    with (scifact_dir / "corpus.jsonl").open("r", encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            corpus[str(row["doc_id"])] = row

    doc_gold_indices: dict[str, set[int]] = {}
    with (scifact_dir / "claims_dev.jsonl").open("r", encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            for doc_id_raw, ev_list in (row.get("evidence") or {}).items():
                doc_id = str(doc_id_raw)
                if doc_id not in corpus:
                    continue
                for ev in ev_list:
                    for idx in ev.get("sentences", []):
                        doc_gold_indices.setdefault(doc_id, set()).add(int(idx))

    docs: list[AnnotatedAbstract] = []
    for doc_id in sorted(doc_gold_indices.keys())[:max_abstracts]:
        sents = [s.strip() for s in corpus[doc_id]["abstract"] if s.strip()]
        if not sents:
            continue
        text = " ".join(sents)
        gold_spans: list[tuple[int, int]] = []
        cursor = 0
        for idx, sent in enumerate(sents):
            start = text.find(sent, cursor)
            if start == -1:
                continue
            end = start + len(sent)
            cursor = end
            if idx in doc_gold_indices[doc_id]:
                gold_spans.append((start, end))
        if gold_spans:
            docs.append(
                AnnotatedAbstract(
                    doc_id=f"scifact-{doc_id}",
                    domain="SciFact (unseen biomedical)",
                    text=text,
                    gold_spans=gold_spans,
                    total_sentences=len(sents),
                )
            )
    return docs


def _db_stub_extract_spans(text: str, size: int = 500) -> list[tuple[int, int]]:
    """Reproduces the original expertise-database stub: 1st sentence of each 500-char chunk."""
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
        window = text[i:j]
        dot = window.find(". ")
        c_end = i + dot + 1 if dot != -1 else j
        c_start = i
        while c_start < c_end and text[c_start].isspace():
            c_start += 1
        while c_end > c_start and text[c_end - 1].isspace():
            c_end -= 1
        if c_end > c_start:
            spans.append((c_start, c_end))
        i = j
    return spans


def evaluate_extractor(
    name: str,
    predict_fn,
    docs: list[AnnotatedAbstract],
    *,
    iou_threshold: float = 0.5,
) -> ClaimEvalRow:
    total_gold = 0
    total_pred = 0
    total_matched = 0
    matched_ious: list[float] = []
    total_sentences = sum(d.total_sentences for d in docs)

    t0 = time.perf_counter()
    for doc in docs:
        pred_spans: list[tuple[int, int]] = predict_fn(doc.text)
        total_gold += len(doc.gold_spans)
        total_pred += len(pred_spans)

        # Greedy one-to-one matching by highest character IoU
        pairs: list[tuple[float, int, int]] = []
        for gi, g in enumerate(doc.gold_spans):
            for pi, p in enumerate(pred_spans):
                score = span_iou(g, p)
                if score >= iou_threshold:
                    pairs.append((score, gi, pi))
        pairs.sort(key=lambda item: item[0], reverse=True)
        used_g: set[int] = set()
        used_p: set[int] = set()
        for score, gi, pi in pairs:
            if gi in used_g or pi in used_p:
                continue
            used_g.add(gi)
            used_p.add(pi)
            total_matched += 1
            matched_ious.append(score)

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    recall = total_matched / max(1, total_gold)
    precision = total_matched / max(1, total_pred)
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    mean_iou = sum(matched_ious) / len(matched_ious) if matched_ious else 0.0

    return ClaimEvalRow(
        extractor=name,
        abstracts=len(docs),
        total_sentences=total_sentences,
        gold_claims=total_gold,
        predicted_claims=total_pred,
        matched_iou50=total_matched,
        span_detection_rate=round(recall, 4),
        precision_iou50=round(precision, 4),
        f1_iou50=round(f1, 4),
        mean_matched_iou=round(mean_iou, 4),
        us03_pass=recall >= 0.70,
        ms_per_abstract=round(elapsed_ms / max(1, len(docs)), 2),
    )


def render_claim_eval_markdown(dataset_path: Path, rows: list[ClaimEvalRow]) -> str:
    first = rows[0]
    lines = [
        f"# FactMap Scholar — Claim-Span Extraction Evaluation ({dataset_path.name})",
        "",
        f"- **Abstracts evaluated:** {first.abstracts}",
        f"- **Total sentences:** {first.total_sentences} (US-03 requirement: ≥ 30)",
        f"- **Gold claim spans:** {first.gold_claims}",
        "- **US-03 / NFR-13 gate:** Span Detection Rate @ IoU ≥ 0.5 **≥ 70%**",
        "",
        "| Extractor | Pred | Matched (IoU≥0.5) | Detection Rate (Recall) | Precision | F1 | Mean IoU | ms/abstract | US-03 Gate |",
        "|---|---:|---:|---:|---:|---:|---:|---:|:---:|",
    ]
    for r in rows:
        lines.append(
            f"| `{r.extractor}` | {r.predicted_claims} | {r.matched_iou50}/{r.gold_claims} | "
            f"**{r.span_detection_rate * 100:.1f}%** | {r.precision_iou50 * 100:.1f}% | "
            f"{r.f1_iou50 * 100:.1f}% | {r.mean_matched_iou:.3f} | {r.ms_per_abstract:.1f} | "
            f"{'PASS' if r.us03_pass else 'FAIL'} |"
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate Claim-Span Extraction IoU (US-03 / NFR-13)")
    parser.add_argument("--dataset-path", type=Path, default=Path("tests/eval_claim_spans.jsonl"))
    parser.add_argument("--scifact-dir", type=Path, default=None, help="Evaluate on unseen SciFact abstracts instead of JSONL")
    parser.add_argument("--max-abstracts", type=int, default=25)
    parser.add_argument("--embed-model", default="BAAI/bge-small-en-v1.5")
    parser.add_argument("--nli-model", default="cross-encoder/nli-deberta-v3-xsmall")
    parser.add_argument("--include-nli", action="store_true", help="Also benchmark zero-shot NLI claim mode")
    parser.add_argument("--stub-only", action="store_true", help="Offline mode without HuggingFace downloads")
    parser.add_argument("--out-dir", type=Path, default=Path("benchmark_out"))
    args = parser.parse_args()

    if args.scifact_dir is not None:
        docs = load_scifact_abstracts_eval(args.scifact_dir, max_abstracts=args.max_abstracts)
        dataset_label = Path("scifact-dev-abstracts")
        suffix = "_scifact"
    else:
        docs = load_claim_eval_dataset(args.dataset_path)
        dataset_label = args.dataset_path
        suffix = ""
    args.out_dir.mkdir(parents=True, exist_ok=True)

    rows: list[ClaimEvalRow] = []

    # 1. Original DB-stage stub baseline
    rows.append(evaluate_extractor("db-stub-500char", _db_stub_extract_spans, docs))

    # 2. Pure linguistic local extractor
    ling = LocalClaimExtractor(mode="hybrid", threshold=0.55, embedder=None)
    rows.append(
        evaluate_extractor(
            "local-linguistic-v1",
            lambda txt: [(c.char_start, c.char_end) for c in ling.extract(txt)],
            docs,
        )
    )

    # 3. Hybrid extractor (linguistic + embedding prototypes)
    embedder = StubEmbedder() if args.stub_only else SentenceTransformersEmbedder(args.embed_model, device="cpu")
    hybrid = LocalClaimExtractor(mode="hybrid", threshold=0.55, embedder=embedder)
    rows.append(
        evaluate_extractor(
            f"local-hybrid ({embedder.model_name})",
            lambda txt: [(c.char_start, c.char_end) for c in hybrid.extract(txt)],
            docs,
        )
    )

    # 4. Optional zero-shot NLI claim-worthiness extractor
    if args.include_nli and not args.stub_only:
        nli = TransformersNLIClassifier(args.nli_model, device="cpu")
        nli_ext = LocalClaimExtractor(mode="nli", threshold=0.55, nli_classifier=nli)
        rows.append(
            evaluate_extractor(
                f"local-nli ({nli.model_name})",
                lambda txt: [(c.char_start, c.char_end) for c in nli_ext.extract(txt)],
                docs,
            )
        )

    for r in rows:
        print(
            f"{r.extractor:48s} | Recall@IoU0.5={r.span_detection_rate*100:5.1f}% "
            f"| Prec={r.precision_iou50*100:5.1f}% | F1={r.f1_iou50*100:5.1f}% "
            f"| MeanIoU={r.mean_matched_iou:.3f} | {'PASS' if r.us03_pass else 'FAIL'}"
        )

    md = render_claim_eval_markdown(dataset_label, rows)
    md_path = args.out_dir / f"claim_eval_results{suffix}.md"
    json_path = args.out_dir / f"claim_eval_results{suffix}.json"
    md_path.write_text(md, encoding="utf-8")
    json_path.write_text(json.dumps([asdict(r) for r in rows], indent=2), encoding="utf-8")
    print(f"\nSaved claim evaluation report to {md_path} and {json_path}")


if __name__ == "__main__":
    main()
