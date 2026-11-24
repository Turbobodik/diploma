from pathlib import Path

from app.extraction import PAGE_SEPARATOR
from app.ml.benchmark import evaluate_model_pair, fit_class_weights, load_jsonl_dataset
from app.ml.chunker import split_passages, split_sentences_with_spans
from app.ml.claim_extractor import LocalClaimExtractor
from app.ml.embedder import StubEmbedder
from app.ml.eval_claims import evaluate_extractor, load_claim_eval_dataset, span_iou
from app.ml.nli import _normalize_label, apply_class_weights


def test_sentence_splitter_handles_scientific_abbreviations_and_exact_spans():
    text = (
        "SciBERT (e.g. Beltagy et al. 2019) achieves 0.85 F1 on scientific tasks. "
        "See Fig. 2 for details.\n\n"
        "In contrast, baseline BERT does not reach 0.80 F1."
    )
    spans = split_sentences_with_spans(text)
    assert len(spans) == 3
    for start, end in spans:
        assert text[start:end] == text[start:end].strip()
        assert end > start
    assert "e.g. Beltagy et al. 2019" in text[spans[0][0] : spans[0][1]]
    assert "Fig. 2" in text[spans[1][0] : spans[1][1]]


def test_passage_splitter_respects_pdf_pages_and_exact_slices():
    page1 = "First study demonstrates a 15% improvement on SciFact. Retrieval recall improves accuracy."
    page2 = "Second page confirms contradiction detection works on CPU. Latency remains below 5 minutes."
    combined = page1 + PAGE_SEPARATOR + page2

    passages = split_passages(combined, is_pdf=True, target_chars=500)
    assert len(passages) == 2
    assert passages[0].page_no == 1
    assert passages[1].page_no == 2
    for p in passages:
        assert combined[p.char_start : p.char_end] == p.text
        assert PAGE_SEPARATOR not in p.text


def test_claim_extractor_filters_references_and_preserves_exact_spans():
    text = (
        "INTRODUCTION\n\n"
        "The rest of this paper is organized as follows in Sections 2 through 4. "
        "Our experiments demonstrate that dense retrieval significantly improves verification recall by 18%. "
        "Figure 1: System architecture overview.\n\n"
        "What happens when evidence is missing? "
        "In addition, NLI classification confirms that domain pretraining reduces contradiction errors.\n\n"
        "References\n"
        "[1] Wadden et al. Fact or Fiction: Verifying Scientific Claims. EMNLP 2020."
    )
    extractor = LocalClaimExtractor(mode="hybrid", embedder=StubEmbedder())
    claims = extractor.extract(text, is_pdf=False)
    assert len(claims) >= 2
    for c in claims:
        assert text[c.char_start : c.char_end] == c.text
        assert 0.0 <= c.confidence <= 1.0
        assert "Wadden et al." not in c.text
        assert not c.text.endswith("?")
        assert not c.text.startswith("Figure 1:")


def test_nli_label_normalization_covers_common_hf_models():
    assert _normalize_label("ENTAILMENT") == "entailment"
    assert _normalize_label("SUPPORTS") == "entailment"
    assert _normalize_label("contradiction") == "contradiction"
    assert _normalize_label("REFUTES") == "contradiction"
    assert _normalize_label("NEUTRAL") == "neutral"
    assert _normalize_label("NOT_ENOUGH_INFO") == "neutral"


def test_benchmark_runs_cleanly_on_bundled_sample_with_stub():
    sample_path = Path(__file__).resolve().parent / "eval_scientific_sample.jsonl"
    dataset = load_jsonl_dataset(sample_path)
    assert len(dataset.nli_pairs) == 30
    row, report = evaluate_model_pair("stub", "stub-bow-v1", "stub-overlap-v1", dataset)
    assert 0.0 <= row.macro_f1 <= 1.0
    assert 0.0 <= row.recall_at_5 <= 1.0
    assert "entailment" in report


def test_class_weight_calibration_promotes_underpredicted_entailment():
    raw = {"entailment": 0.32, "contradiction": 0.08, "neutral": 0.60}
    lbl_raw, _, _ = apply_class_weights(raw, (1.0, 1.0, 1.0))
    assert lbl_raw == "neutral"

    lbl_cal, score_cal, probs_cal = apply_class_weights(raw, (3.0, 1.0, 1.0))
    assert lbl_cal == "entailment"
    assert abs(sum(probs_cal.values()) - 1.0) < 1e-6
    assert 0.0 <= score_cal <= 1.0

    fitted = fit_class_weights(
        [
            {"entailment": 0.30, "contradiction": 0.05, "neutral": 0.65},
            {"entailment": 0.05, "contradiction": 0.80, "neutral": 0.15},
            {"entailment": 0.05, "contradiction": 0.05, "neutral": 0.90},
        ],
        ["entailment", "contradiction", "neutral"],
    )
    assert fitted[0] > 1.0


def test_claim_span_eval_meets_us03_gate_offline():
    assert span_iou((0, 10), (5, 15)) == 5 / 15
    assert span_iou((0, 10), (0, 10)) == 1.0
    assert span_iou((0, 10), (20, 30)) == 0.0

    eval_path = Path(__file__).resolve().parent / "eval_claim_spans.jsonl"
    docs = load_claim_eval_dataset(eval_path)
    assert sum(d.total_sentences for d in docs) >= 30

    extractor = LocalClaimExtractor(mode="hybrid", threshold=0.55, embedder=None)
    row = evaluate_extractor("local-linguistic", lambda t: [(c.char_start, c.char_end) for c in extractor.extract(t)], docs)
    assert row.us03_pass is True
    assert row.span_detection_rate >= 0.70
    assert row.mean_matched_iou >= 0.90


def test_russian_pipeline_extracts_claims_and_detects_entailment_and_contradiction():
    from app.ml.nli import StubNLIClassifier

    ru_text = (
        "Аннотация. В данной статье рассматривается удалённая работа.\n"
        "Источник: адаптация научных публикаций (КиберЛенинка), 2024.\n\n"
        "Результаты исследования показывают, что удалённая работа повышает продуктивность разработчиков на 16%. "
        "Гибридный формат занятости повышает удержание персонала в IT-компаниях на 27%.\n\n"
        "Список литературы\n"
        "[1] Соколов И. А. Эффективность дистанционной занятости. 2024."
    )
    spans = split_sentences_with_spans(ru_text)
    assert len(spans) >= 4

    extractor = LocalClaimExtractor(mode="hybrid", threshold=0.55, embedder=StubEmbedder())
    claims = extractor.extract(ru_text, is_pdf=False)
    assert len(claims) >= 2
    for c in claims:
        assert ru_text[c.char_start : c.char_end] == c.text
        assert "Источник:" not in c.text
        assert "Соколов" not in c.text

    nli = StubNLIClassifier()
    preds = nli.predict_batch(
        [
            (
                "Наши расчёты подтверждают, что гибридный формат занятости повышает удержание персонала в IT-компаниях на 25%.",
                "Гибридный формат занятости повышает удержание персонала в IT-компаниях на 27%.",
            ),
            (
                "Удалённая работа не повышает продуктивность разработчиков в кросс-функциональных командах.",
                "Удалённая работа повышает продуктивность разработчиков на 16%.",
            ),
        ]
    )
    assert preds[0].label == "entailment"
    assert preds[1].label == "contradiction"

