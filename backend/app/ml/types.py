from dataclasses import dataclass
from typing import Literal

NliLabel = Literal["entailment", "contradiction", "neutral"]


@dataclass(frozen=True)
class PassageSpan:
    ordinal: int
    char_start: int
    char_end: int
    page_no: int | None
    text: str


@dataclass(frozen=True)
class ExtractedClaim:
    char_start: int
    char_end: int
    page_no: int | None
    text: str
    confidence: float
    extractor_name: str


@dataclass(frozen=True)
class NLIResult:
    label: NliLabel
    score: float
    model_name: str
    probabilities: dict[NliLabel, float]
