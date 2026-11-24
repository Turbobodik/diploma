# FactMap Scholar — Claim-Span Extraction Evaluation (scifact-dev-abstracts)

- **Abstracts evaluated:** 25
- **Total sentences:** 224 (US-03 requirement: ≥ 30)
- **Gold claim spans:** 48
- **US-03 / NFR-13 gate:** Span Detection Rate @ IoU ≥ 0.5 **≥ 70%**

| Extractor | Pred | Matched (IoU≥0.5) | Detection Rate (Recall) | Precision | F1 | Mean IoU | ms/abstract | US-03 Gate |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| `db-stub-500char` | 95 | 13/48 | **27.1%** | 13.7% | 18.2% | 0.728 | 0.0 | FAIL |
| `local-linguistic-v1` | 112 | 38/48 | **79.2%** | 33.9% | 47.5% | 1.000 | 3.7 | PASS |
| `local-hybrid (BAAI/bge-small-en-v1.5)` | 111 | 39/48 | **81.2%** | 35.1% | 49.1% | 1.000 | 1440.0 | PASS |
