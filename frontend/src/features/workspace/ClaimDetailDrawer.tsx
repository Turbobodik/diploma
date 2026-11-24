import { BookMarked, ChevronDown, ChevronUp, Info, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { Select } from '../../components/common/Select';
import type { ClaimItem, EvidenceItem, NliLabel } from '../../models/api';
import { extractKeySentence, labelRank, tokenizeForHighlight } from '../../utils/evidenceHighlight';

export interface ClaimDetailDrawerProps {
  claim: ClaimItem | null;
  focusedPassageId?: string | null;
  overridingEvidenceId: string | null;
  onOverrideLabel: (evidenceId: string, userLabel: NliLabel | null) => void;
}

const OVERRIDE_OPTIONS = [
  { value: '', label: 'Use model prediction (no override)' },
  { value: 'entailment', label: 'Override: Entailment' },
  { value: 'contradiction', label: 'Override: Contradiction' },
  { value: 'neutral', label: 'Override: Neutral' },
];

function HighlightedText({ text, roots }: { text: string; roots: Set<string> }) {
  const segments = tokenizeForHighlight(text, roots);
  return (
    <>
      {segments.map((seg, idx) =>
        seg.highlight ? (
          <mark key={idx} className="evidence-keyword">
            {seg.text}
          </mark>
        ) : (
          <span key={idx}>{seg.text}</span>
        ),
      )}
    </>
  );
}

interface EvidenceCardProps {
  edge: EvidenceItem;
  claimText: string;
  claimSourceDocId: string;
  isFocused: boolean;
  overriding: boolean;
  onOverrideLabel: (evidenceId: string, userLabel: NliLabel | null) => void;
}

function EvidenceCard({
  edge,
  claimText,
  claimSourceDocId,
  isFocused,
  overriding,
  onOverrideLabel,
}: EvidenceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);
  const isOverridden = edge.user_label !== null;
  const isCrossDoc = edge.document_id !== claimSourceDocId;

  const analysis = useMemo(
    () => extractKeySentence(edge.passage_text, claimText, edge.effective_label),
    [edge.passage_text, claimText, edge.effective_label],
  );

  const isExpanded = expanded || isFocused;

  useEffect(() => {
    if (
      isFocused &&
      articleRef.current &&
      typeof articleRef.current.scrollIntoView === 'function'
    ) {
      articleRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isFocused]);

  const hiddenSentences = Math.max(0, analysis.sentences.length - 1);

  return (
    <article
      ref={articleRef}
      className={`evidence-item evidence-item-${edge.effective_label}${isFocused ? ' evidence-item-focused' : ''}`}
    >
      <div className="cluster">
        <Badge variant={edge.effective_label}>{edge.effective_label}</Badge>
        <span className="mono text-muted">
          model: {edge.model_label} ({Math.round(edge.model_score * 100)}%)
        </span>
        {isOverridden ? <Badge variant="warning">Overridden</Badge> : null}
        <Badge variant={isCrossDoc ? 'info' : 'neutral'}>
          {isCrossDoc ? 'Другой источник' : 'Тот же документ'}
        </Badge>
      </div>

      <div className="evidence-excerpt">
        {!isExpanded && analysis.hasMore ? (
          <p className="evidence-excerpt-text">
            {analysis.keyIndex > 0 ? <span className="text-muted">… </span> : null}
            <span className={`evidence-key-sentence is-${edge.effective_label}`}>
              <HighlightedText text={analysis.keySentence} roots={analysis.matchedRoots} />
            </span>
            {analysis.keyIndex < analysis.sentences.length - 1 ? (
              <span className="text-muted"> …</span>
            ) : null}
          </p>
        ) : (
          <p className="evidence-excerpt-text">
            {analysis.sentences.map((sentence, idx) => (
              <span key={idx}>
                {idx > 0 ? ' ' : ''}
                {idx === analysis.keyIndex ? (
                  <span className={`evidence-key-sentence is-${edge.effective_label}`}>
                    <HighlightedText text={sentence} roots={analysis.matchedRoots} />
                  </span>
                ) : (
                  <span>{sentence}</span>
                )}
              </span>
            ))}
          </p>
        )}

        {analysis.hasMore ? (
          <button
            type="button"
            className="evidence-toggle-btn"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <>
                <ChevronUp size={14} aria-hidden="true" />
                Свернуть
              </>
            ) : (
              <>
                <ChevronDown size={14} aria-hidden="true" />
                {hiddenSentences > 0
                  ? `Показать полностью (+${hiddenSentences} предл.)`
                  : 'Показать полностью'}
              </>
            )}
          </button>
        ) : null}
      </div>

      <div className="cluster text-muted">
        <span>{edge.document_name}</span>
        {edge.page_no ? <span>· Page {edge.page_no}</span> : null}
        <span className="mono">
          · [{edge.char_start}..{edge.char_end}]
        </span>
      </div>

      <Select
        id={`override-select-${edge.id}`}
        label="Researcher label override (preserves model label)"
        options={OVERRIDE_OPTIONS}
        value={edge.user_label ?? ''}
        disabled={overriding}
        onChange={(event) => {
          const raw = event.target.value;
          const nextLabel: NliLabel | null =
            raw === 'entailment' || raw === 'contradiction' || raw === 'neutral' ? raw : null;
          onOverrideLabel(edge.id, nextLabel);
        }}
      />
    </article>
  );
}

export function ClaimDetailDrawer({
  claim,
  focusedPassageId = null,
  overridingEvidenceId,
  onOverrideLabel,
}: ClaimDetailDrawerProps) {
  const sortedEvidence = useMemo(() => {
    if (!claim) return [];
    return [...claim.evidence].sort((a, b) => {
      const rankDiff = labelRank(a.effective_label) - labelRank(b.effective_label);
      if (rankDiff !== 0) return rankDiff;
      return b.model_score - a.model_score;
    });
  }, [claim]);

  const verdictCounts = useMemo(() => {
    const counts = { contradiction: 0, entailment: 0, neutral: 0 };
    for (const edge of sortedEvidence) {
      counts[edge.effective_label] += 1;
    }
    return counts;
  }, [sortedEvidence]);

  if (!claim) {
    return (
      <aside className="surface-card" aria-label="Claim detail panel">
        <EmptyState
          icon={<BookMarked size={22} />}
          title="Select a claim to inspect"
          description="Click any claim node on the evidence map or row in the claims table to inspect verbatim passages and override NLI labels."
        />
      </aside>
    );
  }

  return (
    <aside className="surface-card stack-md" aria-label="Claim detail inspector">
      <div className="stack-sm">
        <div className="cluster">
          <h2>Claim Inspector</h2>
          <Badge variant="info">Claim score: {Math.round(claim.confidence * 100)}%</Badge>
        </div>
        <blockquote className="claim-quote">{claim.text}</blockquote>
        <div className="cluster text-muted">
          <span>{claim.source_name}</span>
          {claim.page_no ? <span>· Page {claim.page_no}</span> : null}
          <span className="mono">
            · chars [{claim.char_start}..{claim.char_end}]
          </span>
        </div>
        {sortedEvidence.length > 0 ? (
          <div className="cluster" aria-label="Evidence verdict breakdown">
            {verdictCounts.contradiction > 0 ? (
              <Badge variant="contradiction">{verdictCounts.contradiction} contradiction</Badge>
            ) : null}
            {verdictCounts.entailment > 0 ? (
              <Badge variant="entailment">{verdictCounts.entailment} entailment</Badge>
            ) : null}
            {verdictCounts.neutral > 0 ? (
              <Badge variant="neutral">{verdictCounts.neutral} neutral</Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      {!claim.has_evidence ? (
        <div className="alert-banner warning" role="status">
          <ShieldAlert size={18} aria-hidden="true" />
          <span>
            No supporting or contradicting evidence was found for this claim in the uploaded corpus.
          </span>
        </div>
      ) : null}

      <div className="stack-sm">
        <h3>Retrieved Evidence ({sortedEvidence.length})</h3>
        {sortedEvidence.length === 0 ? (
          <div className="alert-banner info">
            <Info size={18} aria-hidden="true" />
            <span>No candidate passages were linked to this claim.</span>
          </div>
        ) : (
          sortedEvidence.map((edge) => (
            <EvidenceCard
              key={edge.id}
              edge={edge}
              claimText={claim.text}
              claimSourceDocId={claim.source_document_id}
              isFocused={focusedPassageId === edge.passage_id}
              overriding={overridingEvidenceId === edge.id}
              onOverrideLabel={onOverrideLabel}
            />
          ))
        )}
      </div>
    </aside>
  );
}
