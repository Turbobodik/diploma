# FactMap Scholar — Backend & ML Pipeline

Main FastAPI backend (`/api/v1`) with local CPU-first ML pipeline (claim extraction, dense retrieval, NLI verification), background job execution, and configurable SciFact benchmark.

`expertise-database/` stays untouched as the frozen database-review package.

## Quick start (Windows PowerShell)

```powershell
cd backend
docker compose up -d
python -m venv .venv
.\.venv\Scripts\pip install --index-url https://download.pytorch.org/whl/cpu torch
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --reload
```

- Swagger / OpenAPI UI: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/health`

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://factmap:local-dev-only@localhost:5433/factmap` | PostgreSQL 16 connection |
| `ML_BACKEND` | `transformers` | `transformers` (real ML) or `stub` (fast offline tests) |
| `EMBEDDING_MODEL` | `BAAI/bge-small-en-v1.5` | Sentence-Transformers retrieval model |
| `NLI_MODEL` | `cross-encoder/nli-deberta-v3-xsmall` | HuggingFace 3-class NLI cross-encoder |
| `NLI_CLASS_WEIGHTS` | `16.0,1.5,1.0` | Post-hoc `(entailment, contradiction, neutral)` prior weights calibrated on SciFact train |
| `NLI_MAX_LENGTH` | `320` | Max combined token length for NLI cross-encoder |
| `CLAIM_MODE` | `hybrid` | `hybrid` (linguistic + embedding prototypes) or `nli` (zero-shot NLI claim scoring) |
| `CLAIM_THRESHOLD` | `0.55` | Claim-worthiness threshold (validated for US-03 / NFR-13) |
| `TOP_K` | `5` | Candidate passages retrieved per claim (1..20) |
| `ML_DEVICE` | `cpu` | `cpu`, `cuda`, or `auto` |

## Running the configurable ML & Claim-Span benchmarks (NFR-02 & NFR-13)

Compare CPU-friendly Retrieval + NLI presets on SciFact dev with post-hoc calibration fitted strictly on SciFact train:

```powershell
.\.venv\Scripts\python scripts\run_benchmark.py --dataset scifact --presets minilm-nli,tasksource-small,recommended,balanced,stub --calibrate --cal-pairs 150 --max-nli-pairs 150 --max-corpus-docs 250 --out-dir benchmark_out
```

Evaluate Claim-Span Extraction IoU (US-03 / NFR-13 gate: ≥ 70% @ IoU ≥ 0.5):

```powershell
# Multi-domain annotated abstracts (45 sentences)
.\.venv\Scripts\python scripts\run_claim_eval.py --dataset-path tests/eval_claim_spans.jsonl --include-nli --out-dir benchmark_out

# Unseen real SciFact biomedical abstracts (224 sentences)
.\.venv\Scripts\python scripts\run_claim_eval.py --scifact-dir benchmark_out/scifact_data --max-abstracts 25 --out-dir benchmark_out
```

Reports are written to `benchmark_out/*.md` and `benchmark_out/*.json`.

## Tests

```powershell
.\.venv\Scripts\pytest -v
.\.venv\Scripts\python scripts\smoke.py
```
