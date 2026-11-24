from __future__ import annotations

import re
import threading
from typing import Protocol

from app.ml.types import NliLabel, NLIResult

_TOKEN = re.compile(r"[a-z0-9]+")
_NEG = {"not", "no", "never", "without", "cannot", "contradicts", "refutes", "neither"}


class NLIClassifier(Protocol):
    model_name: str

    def predict_batch(self, pairs: list[tuple[str, str]]) -> list[NLIResult]:
        """Classify `(premise, hypothesis)` pairs -> `(passage, claim)`."""
        ...


def apply_class_weights(
    raw_probs: dict[NliLabel, float],
    class_weights: tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> tuple[NliLabel, float, dict[NliLabel, float]]:
    """Apply post-hoc prior weights `(w_entailment, w_contradiction, w_neutral)` and renormalize.

    Adjusting class priors calibrated on an in-domain training split corrects MNLI
    over-prediction of `neutral` on hedged scientific prose at zero runtime latency cost.
    """
    w_e, w_c, w_n = class_weights
    weighted: dict[NliLabel, float] = {
        "entailment": max(0.0, raw_probs["entailment"]) * w_e,
        "contradiction": max(0.0, raw_probs["contradiction"]) * w_c,
        "neutral": max(0.0, raw_probs["neutral"]) * w_n,
    }
    total = sum(weighted.values())
    if total <= 0.0:
        adjusted: dict[NliLabel, float] = {"entailment": 1 / 3, "contradiction": 1 / 3, "neutral": 1 / 3}
    else:
        adjusted = {lbl: val / total for lbl, val in weighted.items()}
    best_label: NliLabel = max(adjusted, key=lambda lbl: adjusted[lbl])
    best_score = round(max(0.0, min(1.0, adjusted[best_label])), 3)
    return best_label, best_score, adjusted


class StubNLIClassifier:
    """Fast lexical-overlap stub NLI classifier for offline unit tests."""

    def __init__(self, model_name: str = "stub-overlap-v1") -> None:
        self.model_name = model_name

    def predict_batch(self, pairs: list[tuple[str, str]]) -> list[NLIResult]:
        results: list[NLIResult] = []
        for premise, hypothesis in pairs:
            pt = set(_TOKEN.findall(premise.lower()))
            ht = set(_TOKEN.findall(hypothesis.lower()))
            if not pt or not ht:
                probs: dict[NliLabel, float] = {"entailment": 0.25, "contradiction": 0.25, "neutral": 0.50}
                results.append(NLIResult("neutral", 0.500, self.model_name, probs))
                continue
            overlap = len(pt & ht) / len(ht)
            score = round(max(0.0, min(1.0, overlap)), 3)
            if bool(pt & _NEG) != bool(ht & _NEG) and overlap >= 0.2:
                label: NliLabel = "contradiction"
            elif overlap >= 0.45:
                label = "entailment"
            else:
                label = "neutral"
            rem = round(max(0.0, (1.0 - score) / 2.0), 3)
            probs = {"entailment": rem, "contradiction": rem, "neutral": rem}
            probs[label] = score
            results.append(NLIResult(label=label, score=score, model_name=self.model_name, probabilities=probs))
        return results


def _normalize_label(raw: str) -> NliLabel:
    lower = raw.strip().lower()
    if "entail" in lower or "support" in lower:
        return "entailment"
    if "contra" in lower or "refut" in lower:
        return "contradiction"
    if "neutr" in lower or "not_enough" in lower or "nei" in lower:
        return "neutral"
    raise ValueError(f"Unrecognized NLI label in model config: {raw!r}")


class TransformersNLIClassifier:
    """Batched HuggingFace cross-encoder NLI classifier (Premise = passage, Hypothesis = claim).

    Features:
    - Automatically maps `config.id2label` across different checkpoints into
      `{entailment, contradiction, neutral}`.
    - Length-sorted micro-batching minimizes padding overhead on CPU (important for
      DeBERTa-v3 disentangled relative attention) while preserving output order.
    - Optional post-hoc class prior weights `(w_entailment, w_contradiction, w_neutral)`
      for domain calibration on scientific text.
    """

    def __init__(
        self,
        model_name: str = "cross-encoder/nli-deberta-v3-xsmall",
        *,
        device: str = "cpu",
        batch_size: int = 16,
        max_length: int = 320,
        class_weights: tuple[float, float, float] = (1.0, 1.0, 1.0),
    ) -> None:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self.model_name = model_name
        self.batch_size = batch_size
        self.max_length = max_length
        self.class_weights = class_weights
        self._lock = threading.Lock()
        self._torch = torch

        resolved = "cuda" if device in ("cuda", "auto") and torch.cuda.is_available() else "cpu"
        self._device = torch.device(resolved)
        self._tokenizer = AutoTokenizer.from_pretrained(model_name)
        self._model = AutoModelForSequenceClassification.from_pretrained(model_name)
        self._model.to(self._device)
        self._model.eval()

        id2label = getattr(self._model.config, "id2label", None) or {}
        if len(id2label) != 3:
            raise ValueError(f"Expected 3-class NLI model for {model_name}, got id2label={id2label}")
        self._index_to_label: dict[int, NliLabel] = {
            int(idx): _normalize_label(name) for idx, name in id2label.items()
        }
        if set(self._index_to_label.values()) != {"entailment", "contradiction", "neutral"}:
            raise ValueError(f"Model {model_name} labels do not cover 3-way NLI: {self._index_to_label}")

    def predict_raw_probs(self, pairs: list[tuple[str, str]]) -> list[dict[NliLabel, float]]:
        """Return uncalibrated softmax probabilities in the original input order."""
        if not pairs:
            return []
        torch = self._torch
        # Sort by total length so batches share similar sequence lengths (less wasted padding)
        order = sorted(range(len(pairs)), key=lambda idx: len(pairs[idx][0]) + len(pairs[idx][1]))
        out: list[dict[NliLabel, float] | None] = [None] * len(pairs)

        with self._lock, torch.no_grad():
            for start in range(0, len(order), self.batch_size):
                batch_indices = order[start : start + self.batch_size]
                premises = [pairs[i][0] for i in batch_indices]
                hypotheses = [pairs[i][1] for i in batch_indices]
                encoded = self._tokenizer(
                    premises,
                    hypotheses,
                    padding=True,
                    truncation=True,
                    max_length=self.max_length,
                    return_tensors="pt",
                )
                encoded = {k: v.to(self._device) for k, v in encoded.items()}
                logits = self._model(**encoded).logits
                probs_tensor = torch.softmax(logits, dim=-1).cpu().tolist()
                for orig_idx, row in zip(batch_indices, probs_tensor, strict=True):
                    out[orig_idx] = {
                        self._index_to_label[idx]: float(max(0.0, min(1.0, val)))
                        for idx, val in enumerate(row)
                    }

        return [item for item in out if item is not None]

    def predict_batch(self, pairs: list[tuple[str, str]]) -> list[NLIResult]:
        raw_list = self.predict_raw_probs(pairs)
        results: list[NLIResult] = []
        for raw_probs in raw_list:
            best_label, best_score, adjusted = apply_class_weights(raw_probs, self.class_weights)
            results.append(
                NLIResult(
                    label=best_label,
                    score=best_score,
                    model_name=self.model_name,
                    probabilities=adjusted,
                )
            )
        return results
