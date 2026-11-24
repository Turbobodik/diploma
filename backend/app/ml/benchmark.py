"""Configurable Retrieval + NLI benchmark & train-split calibrator (NFR-02 & NFR-13).

Examples:
    # Compare CPU-friendly models on SciFact dev with post-hoc calibration fitted on SciFact train:
    python scripts/run_benchmark.py --dataset scifact --presets stub,recommended,minilm-nli,tasksource-small,balanced --calibrate --max-nli-pairs 150

    # Run on a local hand-labelled JSONL file (offline):
    python scripts/run_benchmark.py --dataset-path tests/eval_scientific_sample.jsonl --presets stub,recommended
"""

from __future__ import annotations

import argparse
import io
import json
import random
import tarfile
import time
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from sklearn.metrics import accuracy_score, classification_report, f1_score

from app.ml.embedder import Embedder, SentenceTransformersEmbedder, StubEmbedder
from app.ml.nli import (
    NLIClassifier,
    StubNLIClassifier,
    TransformersNLIClassifier,
    apply_class_weights,
)
from app.ml.types import NliLabel

SCIFACT_URL = "https://scifact.s3-us-west-2.amazonaws.com/release/latest/data.tar.gz"

PRESETS: dict[str, tuple[str, str]] = {
    "stub": ("stub-bow-v1", "stub-overlap-v1"),
    "fast": ("sentence-transformers/all-MiniLM-L6-v2", "cross-encoder/nli-deberta-v3-xsmall"),
    "recommended": ("BAAI/bge-small-en-v1.5", "cross-encoder/nli-deberta-v3-xsmall"),
    "minilm-nli": ("BAAI/bge-small-en-v1.5", "cross-encoder/nli-MiniLM2-L6-H768"),
    "tasksource-small": ("BAAI/bge-small-en-v1.5", "sileod/deberta-v3-small-tasksource-nli"),
    "balanced": ("BAAI/bge-small-en-v1.5", "cross-encoder/nli-deberta-v3-small"),
    "accurate": ("BAAI/bge-small-en-v1.5", "MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli"),
    "scifact-citint": ("BAAI/bge-small-en-v1.5", "jedick/DeBERTa-v3-base-mnli-fever-anli-scifact-citint"),
}

LABELS: list[NliLabel] = ["entailment", "contradiction", "neutral"]
_WEIGHT_GRID = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.5, 6.0, 9.0, 12.0, 16.0]


@dataclass
class NLIPair:
    premise: str
    hypothesis: str
    label: NliLabel


@dataclass
class RetrievalQuery:
    claim: str
    gold_doc_ids: set[str]


@dataclass
class EvalDataset:
    name: str
    nli_pairs: list[NLIPair]
    cal_pairs: list[NLIPair]
    corpus_ids: list[str]
    corpus_texts: list[str]
    retrieval_queries: list[RetrievalQuery]


@dataclass
class BenchmarkRow:
    preset: str
    embed_model: str
    nli_model: str
    nli_pairs: int
    raw_macro_f1: float
    macro_f1: float
    accuracy: float
    f1_entailment: float
    f1_contradiction: float
    f1_neutral: float
    class_weights: str
    nfr13_pass: bool
    retrieval_queries: int
    recall_at_1: float
    recall_at_5: float
    mrr_at_5: float
    embed_passages_per_sec: float
    nli_ms_per_pair: float
    est_10_papers_sec: float
    nfr02_pass: bool
    load_sec: float


def _download_scifact(cache_dir: Path) -> Path:
    data_dir = cache_dir / "scifact_data"
    corpus_file = data_dir / "corpus.jsonl"
    dev_file = data_dir / "claims_dev.jsonl"
    train_file = data_dir / "claims_train.jsonl"
    if corpus_file.exists() and dev_file.exists() and train_file.exists():
        return data_dir

    data_dir.mkdir(parents=True, exist_ok=True)
    print(f"Downloading official SciFact dataset from {SCIFACT_URL} ...")
    raw = urllib.request.urlopen(SCIFACT_URL, timeout=120).read()
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tf:
        for member in tf.getmembers():
            base = Path(member.name).name
            if base in ("corpus.jsonl", "claims_dev.jsonl", "claims_train.jsonl"):
                src = tf.extractfile(member)
                if src is not None:
                    (data_dir / base).write_bytes(src.read())
    if not corpus_file.exists() or not dev_file.exists():
        raise RuntimeError("SciFact archive did not contain expected corpus.jsonl / claims_dev.jsonl")
    return data_dir


def _extract_scifact_pairs(
    claims_file: Path,
    corpus: dict[str, dict],
    *,
    max_pairs: int,
    seed: int,
) -> tuple[list[NLIPair], list[RetrievalQuery], set[str]]:
    rng = random.Random(seed)
    support_pairs: list[NLIPair] = []
    contradict_pairs: list[NLIPair] = []
    neutral_pairs: list[NLIPair] = []
    retrieval_queries: list[RetrievalQuery] = []
    cited_doc_ids: set[str] = set()

    with claims_file.open("r", encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            claim_text = row["claim"].strip()
            evidence = row.get("evidence") or {}
            cited = [str(d) for d in row.get("cited_doc_ids", []) if str(d) in corpus]
            cited_doc_ids.update(cited)

            gold_docs: set[str] = set()
            for doc_id_raw, ev_list in evidence.items():
                doc_id = str(doc_id_raw)
                if doc_id not in corpus:
                    continue
                gold_docs.add(doc_id)
                cited_doc_ids.add(doc_id)
                abstract_sents = corpus[doc_id]["abstract"]
                used_indices: set[int] = set()
                for ev in ev_list:
                    lbl_raw = ev["label"].upper()
                    sent_idxs = [i for i in ev["sentences"] if 0 <= i < len(abstract_sents)]
                    if not sent_idxs:
                        continue
                    used_indices.update(sent_idxs)
                    rationale = " ".join(abstract_sents[i].strip() for i in sent_idxs)
                    if lbl_raw == "SUPPORT":
                        support_pairs.append(NLIPair(premise=rationale, hypothesis=claim_text, label="entailment"))
                    elif lbl_raw == "CONTRADICT":
                        contradict_pairs.append(NLIPair(premise=rationale, hypothesis=claim_text, label="contradiction"))
                non_ev = [i for i in range(len(abstract_sents)) if i not in used_indices]
                if non_ev:
                    premise = " ".join(abstract_sents[i].strip() for i in non_ev[:2])
                    neutral_pairs.append(NLIPair(premise=premise, hypothesis=claim_text, label="neutral"))

            if gold_docs:
                retrieval_queries.append(RetrievalQuery(claim=claim_text, gold_doc_ids=gold_docs))
            elif cited:
                doc = corpus[cited[0]]
                premise = " ".join(doc["abstract"][:3]).strip()
                if premise:
                    neutral_pairs.append(NLIPair(premise=premise, hypothesis=claim_text, label="neutral"))

    rng.shuffle(support_pairs)
    rng.shuffle(contradict_pairs)
    rng.shuffle(neutral_pairs)

    per_class = max(1, max_pairs // 3)
    sup = support_pairs[:per_class]
    con = contradict_pairs[:per_class]
    neu = neutral_pairs[: max_pairs - len(sup) - len(con)]
    selected = sup + con + neu
    rng.shuffle(selected)
    return selected, retrieval_queries, cited_doc_ids


def load_scifact_dataset(
    cache_dir: Path,
    *,
    max_nli_pairs: int = 150,
    cal_pairs: int = 150,
    max_corpus_docs: int = 400,
    seed: int = 42,
) -> EvalDataset:
    data_dir = _download_scifact(cache_dir)
    rng = random.Random(seed)

    corpus: dict[str, dict] = {}
    with (data_dir / "corpus.jsonl").open("r", encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            corpus[str(row["doc_id"])] = row

    dev_pairs, retrieval_queries, cited_doc_ids = _extract_scifact_pairs(
        data_dir / "claims_dev.jsonl",
        corpus,
        max_pairs=max_nli_pairs,
        seed=seed,
    )

    train_file = data_dir / "claims_train.jsonl"
    train_cal_pairs: list[NLIPair] = []
    if train_file.exists() and cal_pairs > 0:
        train_cal_pairs, _, _ = _extract_scifact_pairs(
            train_file,
            corpus,
            max_pairs=cal_pairs,
            seed=seed + 100,
        )

    all_ids = list(corpus.keys())
    rng.shuffle(all_ids)
    chosen_ids = list(cited_doc_ids)
    for did in all_ids:
        if len(chosen_ids) >= max_corpus_docs:
            break
        if did not in cited_doc_ids:
            chosen_ids.append(did)

    corpus_texts = [
        (corpus[did].get("title", "") + ". " + " ".join(corpus[did]["abstract"])).strip()
        for did in chosen_ids
    ]

    return EvalDataset(
        name="scifact-dev",
        nli_pairs=dev_pairs,
        cal_pairs=train_cal_pairs,
        corpus_ids=chosen_ids,
        corpus_texts=corpus_texts,
        retrieval_queries=retrieval_queries,
    )


def load_jsonl_dataset(path: Path) -> EvalDataset:
    """Load local JSONL with rows `{"premise": ..., "hypothesis": ..., "label": ...}`."""
    nli_pairs: list[NLIPair] = []
    corpus_ids: list[str] = []
    corpus_texts: list[str] = []
    retrieval_queries: list[RetrievalQuery] = []
    seen_premises: dict[str, str] = {}

    with path.open("r", encoding="utf-8") as fh:
        for idx, line in enumerate(fh):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            premise = row["premise"].strip()
            hypothesis = row["hypothesis"].strip()
            label = row["label"].strip().lower()
            if label not in LABELS:
                raise ValueError(f"Line {idx + 1}: invalid label {label!r}")
            nli_pairs.append(NLIPair(premise=premise, hypothesis=hypothesis, label=label))  # type: ignore[arg-type]

            pid = seen_premises.get(premise)
            if pid is None:
                pid = f"p{len(corpus_ids) + 1}"
                seen_premises[premise] = pid
                corpus_ids.append(pid)
                corpus_texts.append(premise)
            if label in ("entailment", "contradiction"):
                retrieval_queries.append(RetrievalQuery(claim=hypothesis, gold_doc_ids={pid}))

    return EvalDataset(
        name=path.stem,
        nli_pairs=nli_pairs,
        cal_pairs=[],
        corpus_ids=corpus_ids,
        corpus_texts=corpus_texts,
        retrieval_queries=retrieval_queries,
    )


def fit_class_weights(
    raw_probs: list[dict[NliLabel, float]],
    y_true: list[NliLabel],
) -> tuple[float, float, float]:
    """Grid-search `(w_entail, w_contra, 1.0)` maximizing Macro-F1 on a calibration split."""
    if not raw_probs:
        return (1.0, 1.0, 1.0)
    best_weights = (1.0, 1.0, 1.0)
    best_f1 = -1.0
    for w_e in _WEIGHT_GRID:
        for w_c in _WEIGHT_GRID:
            weights = (w_e, w_c, 1.0)
            y_pred = [apply_class_weights(p, weights)[0] for p in raw_probs]
            score = float(f1_score(y_true, y_pred, labels=LABELS, average="macro", zero_division=0))
            if score > best_f1 + 1e-6:
                best_f1 = score
                best_weights = weights
    return best_weights


def _build_embedder(embed_model: str, *, device: str, batch_size: int) -> Embedder:
    if embed_model.startswith("stub"):
        return StubEmbedder(model_name=embed_model)
    return SentenceTransformersEmbedder(embed_model, device=device, batch_size=batch_size)


def _build_nli(nli_model: str, *, device: str, batch_size: int, max_length: int) -> NLIClassifier:
    if nli_model.startswith("stub"):
        return StubNLIClassifier(model_name=nli_model)
    return TransformersNLIClassifier(nli_model, device=device, batch_size=batch_size, max_length=max_length)


def _predict_raw_probs(nli: NLIClassifier, pairs: list[tuple[str, str]]) -> list[dict[NliLabel, float]]:
    if isinstance(nli, TransformersNLIClassifier):
        return nli.predict_raw_probs(pairs)
    return [res.probabilities for res in nli.predict_batch(pairs)]


def evaluate_model_pair(
    preset: str,
    embed_model: str,
    nli_model: str,
    dataset: EvalDataset,
    *,
    device: str = "cpu",
    batch_size: int = 16,
    max_length: int = 320,
    calibrate: bool = False,
    retrieval_cache: dict[str, tuple[float, float, float, float, float]] | None = None,
) -> tuple[BenchmarkRow, str]:
    t_load = time.perf_counter()
    if retrieval_cache is not None and embed_model in retrieval_cache:
        recall_at_1, recall_at_5, mrr_at_5, embed_pps, emb_load = retrieval_cache[embed_model]
        nli = _build_nli(nli_model, device=device, batch_size=batch_size, max_length=max_length)
        load_sec = emb_load + (time.perf_counter() - t_load)
    else:
        t_emb_load = time.perf_counter()
        embedder = _build_embedder(embed_model, device=device, batch_size=batch_size)
        emb_load = time.perf_counter() - t_emb_load

        t_emb = time.perf_counter()
        corpus_vecs = embedder.encode_passages(dataset.corpus_texts)
        emb_elapsed = max(1e-6, time.perf_counter() - t_emb)
        embed_pps = len(dataset.corpus_texts) / emb_elapsed

        recall1_hits = 0
        recall5_hits = 0
        rr5_sum = 0.0
        if dataset.retrieval_queries:
            query_vecs = embedder.encode_queries([q.claim for q in dataset.retrieval_queries])
            sims = np.matmul(query_vecs, corpus_vecs.T)
            for qi, query in enumerate(dataset.retrieval_queries):
                top_indices = np.argsort(-sims[qi])[:5]
                top_ids = [dataset.corpus_ids[int(i)] for i in top_indices]
                if top_ids and top_ids[0] in query.gold_doc_ids:
                    recall1_hits += 1
                hit_rank = next((rank for rank, did in enumerate(top_ids, start=1) if did in query.gold_doc_ids), None)
                if hit_rank is not None:
                    recall5_hits += 1
                    rr5_sum += 1.0 / hit_rank
            nq = len(dataset.retrieval_queries)
            recall_at_1 = recall1_hits / nq
            recall_at_5 = recall5_hits / nq
            mrr_at_5 = rr5_sum / nq
        else:
            recall_at_1 = recall_at_5 = mrr_at_5 = 0.0

        if retrieval_cache is not None:
            retrieval_cache[embed_model] = (recall_at_1, recall_at_5, mrr_at_5, embed_pps, emb_load)

        t_nli_load = time.perf_counter()
        nli = _build_nli(nli_model, device=device, batch_size=batch_size, max_length=max_length)
        load_sec = emb_load + (time.perf_counter() - t_nli_load)

    # Optional train-split post-hoc calibration (strictly on cal_pairs, zero dev leakage)
    weights: tuple[float, float, float] = (1.0, 1.0, 1.0)
    if calibrate and dataset.cal_pairs and not nli_model.startswith("stub"):
        cal_probs = _predict_raw_probs(nli, [(p.premise, p.hypothesis) for p in dataset.cal_pairs])
        weights = fit_class_weights(cal_probs, [p.label for p in dataset.cal_pairs])

    # Evaluate strictly on held-out dev pairs
    t_nli = time.perf_counter()
    dev_probs = _predict_raw_probs(nli, [(p.premise, p.hypothesis) for p in dataset.nli_pairs])
    nli_elapsed = max(1e-6, time.perf_counter() - t_nli)
    ms_per_pair = (nli_elapsed / max(1, len(dataset.nli_pairs))) * 1000.0

    y_true = [p.label for p in dataset.nli_pairs]
    y_raw = [apply_class_weights(p, (1.0, 1.0, 1.0))[0] for p in dev_probs]
    y_pred = [apply_class_weights(p, weights)[0] for p in dev_probs]

    raw_macro_f1 = float(f1_score(y_true, y_raw, labels=LABELS, average="macro", zero_division=0))
    macro_f1 = float(f1_score(y_true, y_pred, labels=LABELS, average="macro", zero_division=0))
    per_class = f1_score(y_true, y_pred, labels=LABELS, average=None, zero_division=0)
    acc = float(accuracy_score(y_true, y_pred))
    report = classification_report(y_true, y_pred, labels=LABELS, digits=3, zero_division=0)

    # Estimate wall-clock for 10 short papers (NFR-02 budget <= 300s):
    # ~120 passages + ~80 claims encoded + 80*5 = 400 NLI pairs
    est_embed = 200.0 / max(1.0, embed_pps)
    est_nli = (400.0 * ms_per_pair) / 1000.0
    est_10_papers = est_embed + est_nli

    weights_str = f"{weights[0]:g},{weights[1]:g},{weights[2]:g}"
    row = BenchmarkRow(
        preset=preset,
        embed_model=embed_model,
        nli_model=nli_model,
        nli_pairs=len(dataset.nli_pairs),
        raw_macro_f1=round(raw_macro_f1, 4),
        macro_f1=round(macro_f1, 4),
        accuracy=round(acc, 4),
        f1_entailment=round(float(per_class[0]), 4),
        f1_contradiction=round(float(per_class[1]), 4),
        f1_neutral=round(float(per_class[2]), 4),
        class_weights=weights_str,
        nfr13_pass=macro_f1 >= 0.55,
        retrieval_queries=len(dataset.retrieval_queries),
        recall_at_1=round(recall_at_1, 4),
        recall_at_5=round(recall_at_5, 4),
        mrr_at_5=round(mrr_at_5, 4),
        embed_passages_per_sec=round(embed_pps, 2),
        nli_ms_per_pair=round(ms_per_pair, 2),
        est_10_papers_sec=round(est_10_papers, 1),
        nfr02_pass=est_10_papers <= 300.0,
        load_sec=round(load_sec, 2),
    )
    return row, report


def render_markdown(dataset: EvalDataset, rows: list[BenchmarkRow], reports: dict[str, str], *, calibrated: bool) -> str:
    lines = [
        f"# FactMap Scholar — ML Pipeline Benchmark ({dataset.name})",
        "",
        f"- **NLI dev pairs evaluated:** {len(dataset.nli_pairs)}",
        f"- **Calibration split (SciFact train):** {len(dataset.cal_pairs) if calibrated else 0} pairs (zero overlap with dev)",
        f"- **Retrieval corpus size:** {len(dataset.corpus_ids)} passages/abstracts",
        f"- **Retrieval queries:** {len(dataset.retrieval_queries)}",
        "- **NFR-13 quality gate:** Macro-F1 ≥ 0.55",
        "- **NFR-02 latency budget:** ≤ 300 s for 10 papers (~120 passages, ~80 claims, 400 NLI pairs on CPU)",
        "",
        "| Preset | Embedder | NLI Model | Raw F1 | Cal. Macro-F1 | Weights (E,C,N) | F1 (E / C / N) | Recall@5 | MRR@5 | NLI ms/pair | Est. 10p | NFR-13 | NFR-02 |",
        "|---|---|---|---:|---:|---|---|---:|---:|---:|---:|:---:|:---:|",
    ]
    for r in rows:
        lines.append(
            f"| `{r.preset}` | `{r.embed_model}` | `{r.nli_model}` | "
            f"{r.raw_macro_f1:.3f} | **{r.macro_f1:.3f}** | `{r.class_weights}` | "
            f"{r.f1_entailment:.2f} / {r.f1_contradiction:.2f} / {r.f1_neutral:.2f} | "
            f"{r.recall_at_5:.3f} | {r.mrr_at_5:.3f} | {r.nli_ms_per_pair:.1f} | "
            f"{r.est_10_papers_sec:.1f}s | {'PASS' if r.nfr13_pass else 'FAIL'} | "
            f"{'PASS' if r.nfr02_pass else 'FAIL'} |"
        )
    lines.append("")
    lines.append("## Per-model classification reports (after calibration if enabled)")
    for preset, rep in reports.items():
        lines.append(f"\n### `{preset}`\n```\n{rep.strip()}\n```")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Retrieval + NLI model pairs for FactMap Scholar")
    parser.add_argument("--dataset", choices=["scifact"], default="scifact")
    parser.add_argument("--dataset-path", type=Path, default=None, help="Optional local JSONL dataset (overrides --dataset)")
    parser.add_argument("--presets", default="stub,recommended,minilm-nli,tasksource-small,balanced", help="Comma-separated presets")
    parser.add_argument("--pair", action="append", default=[], help="Custom pair as EMBED_MODEL::NLI_MODEL")
    parser.add_argument("--max-nli-pairs", type=int, default=150)
    parser.add_argument("--cal-pairs", type=int, default=150, help="SciFact train pairs for post-hoc calibration")
    parser.add_argument("--calibrate", action="store_true", help="Fit class prior weights on SciFact train split")
    parser.add_argument("--max-corpus-docs", type=int, default=400)
    parser.add_argument("--max-length", type=int, default=320)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--out-dir", type=Path, default=Path("benchmark_out"))
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    if args.dataset_path is not None:
        dataset = load_jsonl_dataset(args.dataset_path)
    else:
        dataset = load_scifact_dataset(
            args.out_dir,
            max_nli_pairs=args.max_nli_pairs,
            cal_pairs=args.cal_pairs if args.calibrate else 0,
            max_corpus_docs=args.max_corpus_docs,
        )

    targets: list[tuple[str, str, str]] = []
    for name in [p.strip() for p in args.presets.split(",") if p.strip()]:
        if name not in PRESETS:
            raise ValueError(f"Unknown preset {name!r}; available: {list(PRESETS)}")
        emb, nli = PRESETS[name]
        targets.append((name, emb, nli))

    for idx, spec in enumerate(args.pair, start=1):
        if "::" not in spec:
            raise ValueError(f"--pair must be EMBED_MODEL::NLI_MODEL, got {spec!r}")
        emb, nli = spec.split("::", 1)
        targets.append((f"custom-{idx}", emb.strip(), nli.strip()))

    rows: list[BenchmarkRow] = []
    reports: dict[str, str] = {}
    retrieval_cache: dict[str, tuple[float, float, float, float, float]] = {}

    for preset, emb, nli in targets:
        print(f"\n=== Evaluating [{preset}] embed={emb} | nli={nli} ===")
        row, report = evaluate_model_pair(
            preset,
            emb,
            nli,
            dataset,
            device=args.device,
            batch_size=args.batch_size,
            max_length=args.max_length,
            calibrate=args.calibrate,
            retrieval_cache=retrieval_cache,
        )
        rows.append(row)
        reports[preset] = report
        print(
            f"Raw F1={row.raw_macro_f1:.3f} -> Cal F1={row.macro_f1:.3f} (weights={row.class_weights}, "
            f"NFR-13: {'PASS' if row.nfr13_pass else 'FAIL'}) | "
            f"Recall@5={row.recall_at_5:.3f} | NLI={row.nli_ms_per_pair:.1f} ms/pair | "
            f"Est 10p={row.est_10_papers_sec:.1f}s (NFR-02: {'PASS' if row.nfr02_pass else 'FAIL'})"
        )

    md = render_markdown(dataset, rows, reports, calibrated=args.calibrate)
    md_path = args.out_dir / "benchmark_results.md"
    json_path = args.out_dir / "benchmark_results.json"
    md_path.write_text(md, encoding="utf-8")
    json_path.write_text(json.dumps([asdict(r) for r in rows], indent=2), encoding="utf-8")
    print(f"\nSaved benchmark report to {md_path} and {json_path}")


if __name__ == "__main__":
    main()
