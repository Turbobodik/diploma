import type { NliLabel } from '../models/api';

const STOPWORDS = new Set([
  // English
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'been',
  'into',
  'than',
  'their',
  'they',
  'them',
  'which',
  'when',
  'where',
  'while',
  'also',
  'such',
  'more',
  'most',
  'about',
  'these',
  'those',
  'between',
  'through',
  // Russian
  'что',
  'как',
  'для',
  'при',
  'или',
  'это',
  'этом',
  'этой',
  'этот',
  'также',
  'между',
  'через',
  'после',
  'среди',
  'более',
  'менее',
  'очень',
  'были',
  'была',
  'было',
  'быть',
  'данной',
  'данных',
  'которые',
  'которых',
  'которая',
  'которое',
  'наши',
  'наших',
  'только',
  'счёт',
  'счет',
]);

const NEGATION_CUES = new Set([
  'not',
  'no',
  'never',
  'without',
  'cannot',
  'refutes',
  'contradicts',
  'не',
  'нет',
  'ни',
  'никогда',
  'без',
  'вопреки',
  'опровергает',
  'противоречит',
  'отсутствует',
  'снижает',
  'уменьшает',
]);

const RU_SUFFIXES = [
  'остью',
  'ости',
  'ость',
  'ениями',
  'ением',
  'ения',
  'ение',
  'ений',
  'аниями',
  'анием',
  'ания',
  'ание',
  'аний',
  'иями',
  'иям',
  'иях',
  'ами',
  'ями',
  'ого',
  'его',
  'ому',
  'ему',
  'ыми',
  'ими',
  'ных',
  'ный',
  'ная',
  'ное',
  'ные',
  'ную',
  'ной',
  'ают',
  'яют',
  'уют',
  'ает',
  'яет',
  'ует',
  'ится',
  'ятся',
  'ется',
  'ются',
  'ов',
  'ев',
  'ей',
  'ой',
  'ий',
  'ый',
  'ая',
  'яя',
  'ое',
  'ее',
  'ые',
  'ие',
  'ую',
  'юю',
  'ом',
  'ем',
  'ам',
  'ям',
  'ах',
  'ях',
  'ых',
  'их',
  'ит',
  'ят',
  'ут',
  'ют',
  'а',
  'я',
  'о',
  'е',
  'ы',
  'и',
  'у',
  'ю',
  'ь',
];

function normalizeRoot(raw: string): string {
  const lower = raw.toLowerCase().replace(/ё/g, 'е');
  if (lower.length < 3 || STOPWORDS.has(lower)) return '';
  if (/^[а-я]+$/.test(lower) && lower.length >= 5) {
    for (const suffix of RU_SUFFIXES) {
      if (lower.endsWith(suffix) && lower.length - suffix.length >= 4) {
        return lower.slice(0, -suffix.length);
      }
    }
  }
  return lower;
}

function extractRoots(text: string): Set<string> {
  const tokens = text.match(/[A-Za-zА-Яа-яЁё0-9]+/g) ?? [];
  const roots = new Set<string>();
  for (const tok of tokens) {
    const root = normalizeRoot(tok);
    if (root) roots.add(root);
  }
  return roots;
}

export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  // Split after sentence-ending punctuation followed by whitespace and a sentence start.
  const parts = cleaned
    .split(/(?<=[.!?])(?:["'”’»)\]]*)\s+(?=[A-ZА-ЯЁ0-9(["'“‘«])/u)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [cleaned];
}

export interface KeySentenceResult {
  sentences: string[];
  keyIndex: number;
  keySentence: string;
  hasMore: boolean;
  matchedRoots: Set<string>;
}

export function extractKeySentence(
  passageText: string,
  claimText: string,
  label?: NliLabel | null,
): KeySentenceResult {
  const sentences = splitSentences(passageText);
  if (sentences.length === 0) {
    return {
      sentences: [],
      keyIndex: 0,
      keySentence: passageText.trim(),
      hasMore: false,
      matchedRoots: new Set(),
    };
  }

  const claimRoots = extractRoots(claimText);
  let bestIdx = 0;
  let bestScore = -1;
  let bestMatches = new Set<string>();

  sentences.forEach((sentence, idx) => {
    const sentRoots = extractRoots(sentence);
    const matches = new Set<string>();
    for (const r of sentRoots) {
      if (claimRoots.has(r)) matches.add(r);
    }

    let score = claimRoots.size > 0 ? matches.size / Math.max(1, claimRoots.size) : 0;
    if (label === 'contradiction') {
      const lowerTokens = sentence.toLowerCase().match(/[a-zа-яё]+/g) ?? [];
      if (lowerTokens.some((tok) => NEGATION_CUES.has(tok))) {
        score += 0.12;
      }
    }
    // Slight preference for informative sentences over very short boilerplate headers
    if (sentence.length < 35) {
      score -= 0.15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
      bestMatches = matches;
    }
  });

  const keySentence = sentences[bestIdx];
  const hasMore = sentences.length > 1 || passageText.trim().length > keySentence.length + 12;

  return {
    sentences,
    keyIndex: bestIdx,
    keySentence,
    hasMore,
    matchedRoots: bestMatches,
  };
}

export interface HighlightSegment {
  text: string;
  highlight: boolean;
}

export function tokenizeForHighlight(
  sentence: string,
  matchedRoots: Set<string>,
): HighlightSegment[] {
  if (!sentence || matchedRoots.size === 0) {
    return [{ text: sentence, highlight: false }];
  }

  const segments: HighlightSegment[] = [];
  const wordRegex = /[A-Za-zА-Яа-яЁё0-9]+/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = wordRegex.exec(sentence);

  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: sentence.slice(lastIndex, match.index), highlight: false });
    }
    const word = match[0];
    const root = normalizeRoot(word);
    segments.push({ text: word, highlight: Boolean(root && matchedRoots.has(root)) });
    lastIndex = match.index + word.length;
    match = wordRegex.exec(sentence);
  }

  if (lastIndex < sentence.length) {
    segments.push({ text: sentence.slice(lastIndex), highlight: false });
  }

  return segments;
}

export function wrapSvgLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [''];

  const words = cleaned.split(' ');
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      if (lines.length === maxLines) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] =
          last.length >= maxCharsPerLine ? `${last.slice(0, maxCharsPerLine - 1)}…` : `${last}…`;
        return lines;
      }
      current = word.length > maxCharsPerLine ? `${word.slice(0, maxCharsPerLine - 1)}…` : word;
    } else {
      lines.push(`${word.slice(0, maxCharsPerLine - 1)}…`);
      if (lines.length === maxLines) {
        return lines;
      }
      current = '';
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

const LABEL_PRIORITY: Record<NliLabel, number> = {
  contradiction: 0,
  entailment: 1,
  neutral: 2,
};

export function labelRank(label: NliLabel | null | undefined): number {
  if (!label) return 3;
  return LABEL_PRIORITY[label] ?? 3;
}
