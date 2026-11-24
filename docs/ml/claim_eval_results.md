# FactMap Scholar — Claim-Span Extraction Evaluation (eval_claim_spans.jsonl)

- **Abstracts evaluated:** 8
- **Total sentences:** 45 (US-03 requirement: ≥ 30)
- **Gold claim spans:** 15
- **US-03 / NFR-13 gate:** Span Detection Rate @ IoU ≥ 0.5 **≥ 70%**

| Extractor | Pred | Matched (IoU≥0.5) | Detection Rate (Recall) | Precision | F1 | Mean IoU | ms/abstract | US-03 Gate |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| `db-stub-500char` | 14 | 0/15 | **0.0%** | 0.0% | 0.0% | 0.000 | 0.0 | FAIL |
| `local-linguistic-v1` | 16 | 15/15 | **100.0%** | 93.8% | 96.8% | 1.000 | 0.8 | PASS |
| `local-hybrid (BAAI/bge-small-en-v1.5)` | 16 | 15/15 | **100.0%** | 93.8% | 96.8% | 1.000 | 96.8 | PASS |
| `local-nli (cross-encoder/nli-deberta-v3-xsmall)` | 23 | 13/15 | **86.7%** | 56.5% | 68.4% | 1.000 | 194.2 | PASS |
