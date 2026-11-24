from __future__ import annotations

import re
from typing import TYPE_CHECKING

import numpy as np

from app.extraction import page_number_at
from app.ml.chunker import split_sentences_with_spans
from app.ml.types import ExtractedClaim

if TYPE_CHECKING:
    from app.ml.embedder import Embedder
    from app.ml.nli import NLIClassifier

_WORD_RE = re.compile(r"[A-Za-zА-Яа-яЁё0-9]+")

_REFERENCES_HEADING = re.compile(
    r"(?:^|\n|\f)[ \t]*(?:\d+\.?\s+)?(?:references|bibliography|acknowledg(?:e)?ments?|"
    r"список\s+(?:использованной\s+)?литературы|библиография|литература|благодарности)[ \t]*(?:\n|\f|$)",
    re.IGNORECASE,
)

_CAPTION_PREFIX = re.compile(
    r"^(?:fig(?:ure)?|table|algorithm|listing|рис(?:унок|\.)?|табл(?:ица|\.)?)\s+\d+[:.\-\s]",
    re.IGNORECASE,
)
_CITATION_LINE = re.compile(r"^\[\d+\]\s+|^\d+\.\s+[A-ZА-ЯЁ][a-zа-яё]+,\s+[A-ZА-ЯЁ]\.")
_URL_OR_EMAIL = re.compile(r"(?:https?://|www\.|[\w.+-]+@[\w-]+\.[\w.-]+)", re.IGNORECASE)

_FINDING_VERBS = re.compile(
    r"\b(?:show|shows|showed|shown|demonstrate|demonstrates|demonstrated|find|finds|found|"
    r"indicate|indicates|indicated|suggest|suggests|suggested|confirm|confirms|confirmed|"
    r"contradict|contradicts|contradicted|refute|refutes|refuted|outperform|outperforms|outperformed|"
    r"improve|improves|improved|reduce|reduces|reduced|decrease|decreases|decreased|"
    r"increase|increases|increased|lower|lowers|lowered|suppress|suppresses|suppressed|"
    r"achieve|achieves|achieved|correlate|correlates|correlated|cause|causes|caused|"
    r"lead|leads|led|result|results|resulted|prevent|prevents|inhibit|inhibits|inhibited|"
    r"activate|activates|activation|associated|exceed|exceeds|yield|yields|produce|produces|"
    r"enable|enables|reveal|reveals|revealed|exhibit|exhibits|hallucinate|hallucinates|"
    r"account|accounts|preserve|preserving|eliminate|eliminates|eliminated|fail|fails|failed|"
    r"treat|treats|link|links|tie|ties|stay|stays|remain|remains|require|requires|required|depend|depends|"
    r"показывает|показывают|показал[аои]?|демонстриру(?:ет|ют)|подтвержда(?:ет|ют)|подтвердил[аои]?|"
    r"опроверга(?:ет|ют)|опроверг(?:ла|ли)?|противореч(?:ит|ат)|повыша(?:ет|ют)|повысил[аои]?|"
    r"снижа(?:ет|ют)|снизил[аои]?|увеличива(?:ет|ют)|уменьша(?:ет|ют)|улучша(?:ет|ют)|ухудша(?:ет|ют)|"
    r"привод(?:ит|ят)|вызыва(?:ет|ют)|коррелиру(?:ет|ют)|связан[аоы]?|ускоря(?:ет|ют)|замедля(?:ет|ют)|"
    r"сокраща(?:ет|ют)|способству(?:ет|ют)|препятству(?:ет|ют)|обеспечива(?:ет|ют)|доказыва(?:ет|ют)|"
    r"свидетельству(?:ет|ют)|выявлен[аоы]?|установлен[аоы]?|превосход(?:ит|ят)|растёт|растет|падает)\b",
    re.IGNORECASE,
)

_CONTRAST_OR_NEGATION = re.compile(
    r"\b(?:did not|does not|do not|were not|was not|cannot|no statistically significant|"
    r"however|in contrast|by contrast|conversely|whereas|unlike|"
    r"однако|напротив|в отличие от|вопреки|отсутству(?:ет|ют)|статистически\s+незначим\w*|"
    r"не\s+(?:повыша|снижа|увеличива|уменьша|улучша|ухудша|подтвержда|влия|привод|выявлен|обнаружен|наблюда|достига)\w*)\b",
    re.IGNORECASE,
)

_QUANT_CUES = re.compile(
    r"(?:\b\d+(?:[.,]\d+)?\s*%|\b\d+(?:\.\d+)?x\b|\bв\s+\d+(?:[.,]\d+)?\s+раз\w*|\bp\s*[<≤=]\s*0?[.,]\d+|"
    r"\b(?:f1|accuracy|precision|recall|auc|bleu|rouge|mmhg|latency|throughput)\b|"
    r"\b(?:higher|lower|faster|slower|better|worse|larger|smaller|significant(?:ly)?|statistically|"
    r"выше|ниже|больше|меньше|быстрее|медленнее|значимо|достоверно|статистически|корреляц\w*)\b)",
    re.IGNORECASE,
)

_META_DISCOURSE = re.compile(
    r"(?:\b(?:in this (?:paper|section|work|study|chapter) we (?:organize|structure|present an overview|outline|introduce)|"
    r"the rest of (?:this|the) paper is organized|"
    r"section \d+ (?:discusses|describes|presents|reviews)|"
    r"as shown in (?:fig|figure|table)|"
    r"see appendix|code (?:and weights )?(?:is|are) available at|"
    r"correspondence (?:and reprint requests )?should be addressed|"
    r"в\s+(?:данной|настоящей)\s+(?:статье|работе)\s+(?:рассматрива|анализиру|представлен|описан)\w*|"
    r"целью\s+(?:настоящего\s+)?(?:исследования|работы)\s+является|"
    r"ключевые\s+слова|аннотация)\b|"
    r"\b(?:acknowledg(?:e)?ments?|источник)\s*:|"
    r"\bжурнал\s+[«\"'])",
    re.IGNORECASE,
)

_METHOD_SETUP = re.compile(
    r"\b(?:were recruited|were housed|were collected|were measured|were implemented|"
    r"were exported|were split|were trained on a single|was downloaded|was funded|"
    r"completed a \d+-week|questionnaire|ad libitum|standard laboratory chow|"
    r"выборка\s+составила|анкетирование\s+проводилось|были\s+опрошены|"
    r"обработка\s+данных\s+выполнялась|период\s+исследования\s+охватывал)\b",
    re.IGNORECASE,
)

_POSITIVE_PROTOTYPES = [
    "Experimental results demonstrate that the proposed method significantly improves accuracy over the baseline.",
    "Clinical evidence indicates that inhibiting this pathway reduces tumor growth in patients.",
    "Dense retrieval finds candidate passages before a classifier determines entailment or contradiction.",
    "Our evaluation confirms that domain-specific pretraining outperforms general language models on scientific text.",
]

_NEGATIVE_PROTOTYPES = [
    "The remainder of this paper is organized as follows in Sections 2 through 5.",
    "Acknowledgements: This research was partially supported by a national science grant.",
    "Figure 3 illustrates the overall workflow and system interface.",
    "Correspondence and reprint requests should be addressed to the department email.",
]

_CLAIM_NLI_HYPOTHESIS = "This sentence states a scientific claim, factual assertion, or empirical finding."


def _references_cutoff(text: str) -> int:
    """Return char offset where References/Bibliography starts (only in last 50% of doc)."""
    half = len(text) // 2
    for match in _REFERENCES_HEADING.finditer(text):
        if match.start() >= half:
            return match.start()
    return len(text)


def _is_candidate_sentence(sentence: str) -> bool:
    stripped = sentence.strip()
    if len(stripped) < 28 or len(stripped) > 600:
        return False
    words = _WORD_RE.findall(stripped)
    if len(words) < 5:
        return False
    if stripped.endswith("?"):
        return False
    if _CAPTION_PREFIX.match(stripped) or _CITATION_LINE.match(stripped):
        return False
    # Skip mostly uppercase headings or symbol/number tables
    alpha = [ch for ch in stripped if ch.isalpha()]
    if len(alpha) < 20:
        return False
    upper_ratio = sum(1 for ch in alpha if ch.isupper()) / len(alpha)
    if upper_ratio > 0.45:
        return False
    if _URL_OR_EMAIL.search(stripped) and len(words) < 12:
        return False
    return True


def _linguistic_score(sentence: str) -> float:
    score = 0.25
    if _FINDING_VERBS.search(sentence):
        score += 0.32
    if _CONTRAST_OR_NEGATION.search(sentence):
        score += 0.14
    if _QUANT_CUES.search(sentence):
        score += 0.18
    words = len(_WORD_RE.findall(sentence))
    if 8 <= words <= 45:
        score += 0.10
    elif words > 65:
        score -= 0.10
    if _META_DISCOURSE.search(sentence):
        score -= 0.45
    if _METHOD_SETUP.search(sentence):
        score -= 0.35
    if sentence.rstrip().endswith("."):
        score += 0.05
    return max(0.0, min(1.0, score))


class LocalClaimExtractor:
    """Local scientific claim extractor with exact character-span guarantees.

    Two modes:
    - `hybrid` (default): combines scientific linguistic signals with semantic
      similarity to claim vs. non-claim prototypes using the loaded Embedder
      (zero extra model weights in RAM).
    - `nli`: scores each candidate sentence with the loaded NLIClassifier
      against a claim-worthiness hypothesis.
    """

    def __init__(
        self,
        *,
        mode: str = "hybrid",
        threshold: float = 0.42,
        max_claims_per_doc: int = 40,
        embedder: Embedder | None = None,
        nli_classifier: NLIClassifier | None = None,
    ) -> None:
        self.mode = mode
        self.threshold = threshold
        self.max_claims_per_doc = max_claims_per_doc
        self.embedder = embedder
        self.nli_classifier = nli_classifier
        self._pos_proto: np.ndarray | None = None
        self._neg_proto: np.ndarray | None = None

    @property
    def name(self) -> str:
        if self.mode == "nli" and self.nli_classifier is not None:
            return f"local-nli-claim-v1:{self.nli_classifier.model_name}"[:200]
        if self.embedder is not None:
            return f"local-hybrid-claim-v1:{self.embedder.model_name}"[:200]
        return "local-linguistic-claim-v1"

    def _prototype_margin(self, texts: list[str]) -> list[float]:
        assert self.embedder is not None
        if self._pos_proto is None or self._neg_proto is None:
            pos = self.embedder.encode_passages(_POSITIVE_PROTOTYPES)
            neg = self.embedder.encode_passages(_NEGATIVE_PROTOTYPES)
            self._pos_proto = pos.mean(axis=0)
            self._pos_proto /= np.linalg.norm(self._pos_proto) + 1e-12
            self._neg_proto = neg.mean(axis=0)
            self._neg_proto /= np.linalg.norm(self._neg_proto) + 1e-12

        vecs = self.embedder.encode_passages(texts)
        pos_sim = vecs @ self._pos_proto
        neg_sim = vecs @ self._neg_proto
        # Map similarity margin roughly from [-0.25, +0.25] into [0, 1]
        margins = 0.5 + 2.0 * (pos_sim - neg_sim)
        return [float(max(0.0, min(1.0, m))) for m in margins]

    def extract(self, extracted_text: str, *, is_pdf: bool = False) -> list[ExtractedClaim]:
        cutoff = _references_cutoff(extracted_text)
        all_spans = [
            (s, e)
            for (s, e) in split_sentences_with_spans(extracted_text)
            if e <= cutoff
        ]
        if not all_spans:
            all_spans = split_sentences_with_spans(extracted_text)
        if not all_spans:
            return []

        candidates = [(s, e, extracted_text[s:e]) for (s, e) in all_spans if _is_candidate_sentence(extracted_text[s:e])]
        if not candidates:
            # Guarantee >=1 claim on valid short scientific samples (US-03)
            s, e = max(all_spans, key=lambda pair: pair[1] - pair[0])
            return [
                ExtractedClaim(
                    char_start=s,
                    char_end=e,
                    page_no=page_number_at(extracted_text, s, is_pdf=is_pdf),
                    text=extracted_text[s:e],
                    confidence=0.500,
                    extractor_name=self.name,
                )
            ]

        cand_texts = [t for _, _, t in candidates]
        ling_scores = [_linguistic_score(t) for t in cand_texts]

        if self.mode == "nli" and self.nli_classifier is not None:
            nli_results = self.nli_classifier.predict_batch([(t, _CLAIM_NLI_HYPOTHESIS) for t in cand_texts])
            ml_scores = [res.probabilities["entailment"] for res in nli_results]
            final_scores = [round(0.40 * ls + 0.60 * ms, 3) for ls, ms in zip(ling_scores, ml_scores, strict=True)]
        elif self.embedder is not None:
            proto_scores = self._prototype_margin(cand_texts)
            final_scores = [round(0.60 * ls + 0.40 * ps, 3) for ls, ps in zip(ling_scores, proto_scores, strict=True)]
        else:
            final_scores = [round(ls, 3) for ls in ling_scores]

        scored = [
            (s, e, t, max(0.0, min(1.0, sc)))
            for (s, e, t), sc in zip(candidates, final_scores, strict=True)
        ]

        selected = [item for item in scored if item[3] >= self.threshold]
        if not selected:
            # Always keep the single strongest candidate if document is non-empty
            selected = [max(scored, key=lambda item: item[3])]

        if len(selected) > self.max_claims_per_doc:
            # Keep top-scoring claims, then restore document reading order
            selected = sorted(selected, key=lambda item: item[3], reverse=True)[: self.max_claims_per_doc]
            selected.sort(key=lambda item: item[0])

        return [
            ExtractedClaim(
                char_start=s,
                char_end=e,
                page_no=page_number_at(extracted_text, s, is_pdf=is_pdf),
                text=t,
                confidence=round(sc, 3),
                extractor_name=self.name,
            )
            for s, e, t, sc in selected
        ]
