from __future__ import annotations

import hashlib
import re
import threading
from typing import Protocol

import numpy as np

_TOKEN = re.compile(r"[a-zа-яё0-9]+")
_CYRILLIC_RE = re.compile(r"^[а-яё]+$")
_RU_STOPWORDS = {
    "в", "во", "и", "к", "с", "со", "о", "об", "у", "а", "но", "по", "на", "из", "за", "от", "до",
    "для", "при", "как", "что", "это", "или", "же", "ли", "бы", "то", "их", "его", "ее", "они",
    "мы", "вы", "все", "так", "также", "между", "через", "после", "среди", "которые", "которых",
    "которая", "которое", "данной", "данных", "результате", "условиях",
}
_RU_SUFFIXES = (
    "остью", "ости", "ость", "ениями", "ением", "ения", "ение", "ений", "аниями", "анием", "ания",
    "ание", "аний", "иями", "иям", "иях", "ами", "ями", "ого", "его", "ому", "ему", "ыми", "ими",
    "ных", "ный", "ная", "ное", "ные", "ную", "ной", "ают", "яют", "уют", "ает", "яет", "ует",
    "ится", "ятся", "ется", "ются", "ись", "ось", "ов", "ев", "ей", "ой", "ий", "ый", "ая", "яя",
    "ое", "ее", "ые", "ие", "ую", "юю", "ом", "ем", "ам", "ям", "ах", "ях", "ых", "их", "ит", "ят",
    "ут", "ют", "а", "я", "о", "е", "ы", "и", "у", "ю", "ь",
)


def normalize_token(token: str) -> str:
    """Normalize Cyrillic inflections while leaving Latin/numeric tokens unchanged."""
    norm = token.replace("ё", "е")
    if not _CYRILLIC_RE.match(norm) or len(norm) < 5:
        return norm
    for suffix in _RU_SUFFIXES:
        if norm.endswith(suffix) and len(norm) - len(suffix) >= 4:
            return norm[: -len(suffix)]
    return norm


def tokenize_multilingual(text: str, *, drop_ru_stopwords: bool = True) -> list[str]:
    tokens = _TOKEN.findall(text.lower().replace("ё", "е"))
    out: list[str] = []
    for tok in tokens:
        if drop_ru_stopwords and tok in _RU_STOPWORDS:
            continue
        out.append(normalize_token(tok))
    return out


class Embedder(Protocol):
    model_name: str
    dimensions: int

    def encode_passages(self, texts: list[str]) -> np.ndarray: ...

    def encode_queries(self, texts: list[str]) -> np.ndarray: ...


class StubEmbedder:
    """Fast deterministic bag-of-words hash embedder for offline unit tests."""

    def __init__(self, dimensions: int = 256, model_name: str = "stub-bow-v1") -> None:
        self.dimensions = dimensions
        self.model_name = model_name

    def _encode_one(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dimensions, dtype=np.float32)
        tokens = tokenize_multilingual(text)
        if not tokens:
            vec[0] = 1.0
            return vec
        for token in tokens:
            digest = hashlib.md5(token.encode("utf-8")).digest()
            bucket = int.from_bytes(digest[:2], "big") % self.dimensions
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
