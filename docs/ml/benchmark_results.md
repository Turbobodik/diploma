# FactMap Scholar — ML Pipeline Benchmark (scifact-dev)

- **NLI dev pairs evaluated:** 150
- **Calibration split (SciFact train):** 150 pairs (zero overlap with dev)
- **Retrieval corpus size:** 283 passages/abstracts
- **Retrieval queries:** 188
- **NFR-13 quality gate:** Macro-F1 ≥ 0.55
- **NFR-02 latency budget:** ≤ 300 s for 10 papers (~120 passages, ~80 claims, 400 NLI pairs on CPU)

| Preset | Embedder | NLI Model | Raw F1 | Cal. Macro-F1 | Weights (E,C,N) | F1 (E / C / N) | Recall@5 | MRR@5 | NLI ms/pair | Est. 10p | NFR-13 | NFR-02 |
|---|---|---|---:|---:|---|---|---:|---:|---:|---:|:---:|:---:|
| `minilm-nli` | `BAAI/bge-small-en-v1.5` | `cross-encoder/nli-MiniLM2-L6-H768` | 0.515 | **0.534** | `16,3,1` | 0.48 / 0.60 / 0.52 | 0.989 | 0.963 | 167.8 | 135.4s | FAIL | PASS |
| `tasksource-small` | `BAAI/bge-small-en-v1.5` | `sileod/deberta-v3-small-tasksource-nli` | 0.613 | **0.595** | `3,1.5,1` | 0.61 / 0.65 / 0.52 | 0.989 | 0.963 | 200.9 | 148.6s | PASS | PASS |
| `recommended` | `BAAI/bge-small-en-v1.5` | `cross-encoder/nli-deberta-v3-xsmall` | 0.605 | **0.612** | `16,1.5,1` | 0.56 / 0.70 / 0.58 | 0.989 | 0.963 | 127.8 | 119.4s | PASS | PASS |
| `balanced` | `BAAI/bge-small-en-v1.5` | `cross-encoder/nli-deberta-v3-small` | 0.588 | **0.588** | `16,4.5,1` | 0.47 / 0.67 / 0.62 | 0.989 | 0.963 | 222.6 | 157.3s | PASS | PASS |
| `stub` | `stub-bow-v1` | `stub-overlap-v1` | 0.253 | **0.253** | `1,1,1` | 0.46 / 0.07 / 0.23 | 0.277 | 0.179 | 0.1 | 0.4s | FAIL | PASS |

## Per-model classification reports (after calibration if enabled)

### `minilm-nli`
```
precision    recall  f1-score   support

   entailment      0.606     0.400     0.482        50
contradiction      0.703     0.520     0.598        50
      neutral      0.425     0.680     0.523        50

     accuracy                          0.533       150
    macro avg      0.578     0.533     0.534       150
 weighted avg      0.578     0.533     0.534       150
```

### `tasksource-small`
```
precision    recall  f1-score   support

   entailment      0.582     0.640     0.610        50
contradiction      0.714     0.600     0.652        50
      neutral      0.509     0.540     0.524        50

     accuracy                          0.593       150
    macro avg      0.602     0.593     0.595       150
 weighted avg      0.602     0.593     0.595       150
```

### `recommended`
```
precision    recall  f1-score   support

   entailment      0.759     0.440     0.557        50
contradiction      0.700     0.700     0.700        50
      neutral      0.493     0.700     0.579        50

     accuracy                          0.613       150
    macro avg      0.651     0.613     0.612       150
 weighted avg      0.651     0.613     0.612       150
```

### `balanced`
```
precision    recall  f1-score   support

   entailment      0.773     0.340     0.472        50
contradiction      0.738     0.620     0.674        50
      neutral      0.488     0.840     0.618        50

     accuracy                          0.600       150
    macro avg      0.666     0.600     0.588       150
 weighted avg      0.666     0.600     0.588       150
```

### `stub`
```
precision    recall  f1-score   support

   entailment      0.323     0.800     0.460        50
contradiction      0.400     0.040     0.073        50
      neutral      0.381     0.160     0.225        50

     accuracy                          0.333       150
    macro avg      0.368     0.333     0.253       150
 weighted avg      0.368     0.333     0.253       150
```
