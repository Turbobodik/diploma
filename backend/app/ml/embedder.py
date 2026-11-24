from __future__ import annotations

import hashlib
import re
import threading
from typing import Protocol

import numpy as np

_TOKEN = re.compile(r"[a-z0-9]+")


class Embedder(Protocol):
    model_name: str
    dimensions: int

    def encode_passages(self, texts: list[str]) -> np.ndarray: ...

    def encode_queries(self, texts: list[str]) -> np.ndarray: ...


class StubEmbedder:
    """Fast deterministic bag-of-words hash embedder for offline unit tests."""

    def __init__(self, dimensions: int = 32, model_name: str = "stub-bow-v1") -> None:
        self.dimensions = dimensions
        self.model_name = model_name

    def _encode_one(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dimensions, dtype=np.float32)
        tokens = _TOKEN.findall(text.lower())
        if not tokens:
            vec[0] = 1.0
            return vec
        for token in tokens:
            bucket = hashlib.md5(token.encode("utf-8")).digest()[0] % self.dimensions
            vec[bucket] += 1.0
        norm = float(np.linalg.norm(vec))
        return vec / norm if norm > 0 else vec

    def encode_passages(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dimensions), dtype=np.float32)
        return np.vstack([self._encode_one(t) for t in texts])

    def encode_queries(self, texts: list[str]) -> np.ndarray:
        return self.encode_passages(texts)


class SentenceTransformersEmbedder:
    """CPU-friendly dense embedder backed by `sentence-transformers`."""

    def __init__(
        self,
        model_name: str = "BAAI/bge-small-en-v1.5",
        *,
        device: str = "cpu",
        batch_size: int = 32,
    ) -> None:
        from sentence_transformers import SentenceTransformer

        self.model_name = model_name
        self.batch_size = batch_size
        self._lock = threading.Lock()
        resolved_device = _resolve_device(device)
        self._model = SentenceTransformer(model_name, device=resolved_device)
        dim = (
            self._model.get_embedding_dimension()
            if hasattr(self._model, "get_embedding_dimension")
            else self._model.get_sentence_embedding_dimension()
        )
        if dim is None:
            probe = self._model.encode(["probe"], normalize_embeddings=True)
            dim = int(probe.shape[-1])
        self.dimensions = int(dim)
        # BGE retrieval models benefit from a short query instruction prefix
        self._query_prefix = (
            "Represent this sentence for searching relevant passages: "
            if "bge-" in model_name.lower()
            else ""
        )

    def encode_passages(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dimensions), dtype=np.float32)
        with self._lock:
            arr = self._model.encode(
                texts,
                batch_size=self.batch_size,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False,
            )
        return np.asarray(arr, dtype=np.float32)

    def encode_queries(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dimensions), dtype=np.float32)
        prefixed = [self._query_prefix + t for t in texts] if self._query_prefix else texts
        return self.encode_passages(prefixed)


def _resolve_device(device: str) -> str:
    if device == "cpu":
        return "cpu"
    try:
        import torch

        if device in ("cuda", "auto") and torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"
