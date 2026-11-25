import { BookMarked, BookOpen, ChevronDown, ChevronUp, Info, ShieldAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { Select } from '../../components/common/Select';
import type { ClaimItem, EvidenceItem, NliLabel } from '../../models/api';
import { extractKeySentence, labelRank, tokenizeForHighlight } from '../../utils/evidenceHighlight';
import type { DocumentContextTarget } from './DocumentContextModal';

export interface ClaimDetailDrawerProps {
  claim: ClaimItem | null;
  focusedPassageId?: string | null;
  overridingEvidenceId: string | null;
  onOverrideLabel: (evidenceId: string, userLabel: NliLabel | null) => void;
  onOpenContext?: (target: DocumentContextTarget) => void;
  onClose?: () => void;
}

const OVERRIDE_OPTIONS = [
  { value: '', label: 'Use model prediction (no override)' },
  { value: 'entailment', label: 'Override: Supports (entailment)' },
  { value: 'contradiction', label: 'Override: Refutes (contradiction)' },
  { value: 'neutral', label: 'Override: Context only (neutral)' },
];

function humanBadgeLabel(label: NliLabel): string {
  if (label === 'entailment') return 'Supports';
  if (label === 'contradiction') return 'Refutes';
  return 'Context only';
}

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
  onOpenContext?: (target: DocumentContextTarget) => void;
}

function EvidenceCard({
  edge,
  claimText,
  claimSourceDocId,
  isFocused,
  overriding,
  onOverrideLabel,
  onOpenContext,
}: EvidenceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);
  const isOverridden = edge.user_label !== null;
  const isCrossDoc = edge.document_id !== claimSourceDocId;
  const isModelNeutral = edge.model_label === 'neutral';

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
        <Badge variant={edge.effective_label}>{humanBadgeLabel(edge.effective_label)}</Badge>
        {isModelNeutral ? (
          <span
            className="mono text-muted"
            title="The model found no supporting or contradicting verdict in this passage"
          >
            model: neutral (no verdict)
          </span>
        ) : (
          <span className="mono text-muted" title="NLI model confidence in this verdict">
            model: {edge.model_label} ({Math.round(edge.model_score * 100)}%)
          </span>
        )}
        {isOverridden ? <Badge variant="warning">Overridden</Badge> : null}
        <Badge variant={isCrossDoc ? 'info' : 'neutral'}>
          {isCrossDoc ? 'Other document' : 'Same document'}
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

        <div className="cluster">
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
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown size={14} aria-hidden="true" />
                  {hiddenSentences > 0
                    ? `Show full passage (+${hiddenSentences} more)`
                    : 'Show full passage'}
                </>
              )}
            </button>
          ) : null}

          {onOpenContext ? (
            <button
              type="button"
              className="evidence-toggle-btn"
              onClick={() =>
                onOpenContext({
                  documentId: edge.document_id,
                  documentName: edge.document_name,
                  charStart: edge.char_start,
                  charEnd: edge.char_end,
                  pageNo: edge.page_no,
                  heading: 'Evidence Context',
                })
              }
            >
              <BookOpen size={13} aria-hidden="true" />
              Read in document
            </button>
          ) : null}
        </div>
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
  onOpenContext,
  onClose,
}: ClaimDetailDrawerProps) {
  const [expandedNeutralClaimId, setExpandedNeutralClaimId] = useState<string | null>(null);

  const sortedEvidence = useMemo(() => {
    if (!claim) return [];
    return [...claim.evidence].sort((a, b) => {
      const rankDiff = labelRank(a.effective_label) - labelRank(b.effective_label);
      if (rankDiff !== 0) return rankDiff;
      const aCross = a.document_id !== claim.source_document_id ? 1 : 0;
      const bCross = b.document_id !== claim.source_document_id ? 1 : 0;
      if (aCross !== bCross) return bCross - aCross;
      return b.model_score - a.model_score;
    });
  }, [claim]);

  const verdictEvidence = useMemo(
    () => sortedEvidence.filter((edge) => edge.effective_label !== 'neutral'),
    [sortedEvidence],
  );
  const neutralEvidence = useMemo(
    () => sortedEvidence.filter((edge) => edge.effective_label === 'neutral'),
    [sortedEvidence],
  );

  const focusIsNeutral = useMemo(
    () =>
      Boolean(
        focusedPassageId && neutralEvidence.some((edge) => edge.passage_id === focusedPassageId),
      ),
    [focusedPassageId, neutralEvidence],
  );

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

  const showNeutralContext = expandedNeutralClaimId === claim.id;
  const neutralOpen = showNeutralContext || focusIsNeutral;

  return (
    <aside
      className="surface-card stack-md inspector-drawer-card"
      aria-label="Claim detail inspector"
    >
      <div className="stack-sm">
        <div className="inspector-drawer-header">
          <div className="cluster">
            <h2>Claim Inspector</h2>
            <Badge variant="info" title="Claim-worthiness confidence from the claim extractor">
              Claim score: {Math.round(claim.confidence * 100)}%
            </Badge>
          </div>
          {onClose ? (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={onClose}
              aria-label="Close Claim Inspector"
              id="close-inspector-btn"
            >
              <X size={16} aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <blockquote className="claim-quote">{claim.text}</blockquote>
        <div className="cluster text-muted">
          <span>{claim.source_name}</span>
          {claim.page_no ? <span>· Page {claim.page_no}</span> : null}
          <span className="mono">
            · chars [{claim.char_start}..{claim.char_end}]
          </span>
          {onOpenContext ? (
            <button
              type="button"
              className="evidence-toggle-btn"
              onClick={() =>
                onOpenContext({
                  documentId: claim.source_document_id,
                  documentName: claim.source_name,
                  charStart: claim.char_start,
                  charEnd: claim.char_end,
                  pageNo: claim.page_no,
                  heading: 'Claim Source Context',
                })
              }
            >
              <BookOpen size={13} aria-hidden="true" />
              Read in document
            </button>
          ) : null}
        </div>
        {sortedEvidence.length > 0 ? (
          <div className="cluster" aria-label="Evidence verdict breakdown">
            {verdictCounts.contradiction > 0 ? (
              <Badge variant="contradiction">{verdictCounts.contradiction} refutes</Badge>
            ) : null}
            {verdictCounts.entailment > 0 ? (
              <Badge variant="entailment">{verdictCounts.entailment} supports</Badge>
            ) : null}
            {verdictCounts.neutral > 0 ? (
              <Badge variant="neutral">{verdictCounts.neutral} context</Badge>
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
        <h3>Supporting &amp; Contradicting Evidence ({verdictEvidence.length})</h3>
        {verdictEvidence.length === 0 ? (
          <div className="alert-banner info">
            <Info size={18} aria-hidden="true" />
            <span>
              {neutralEvidence.length > 0
                ? 'Only neutral context passages were retrieved. Expand checked context below if you want to review or override them.'
                : 'No candidate passages passed the relevance threshold for this claim.'}
            </span>
          </div>
        ) : (
          verdictEvidence.map((edge) => (
            <EvidenceCard
              key={edge.id}
              edge={edge}
              claimText={claim.text}
              claimSourceDocId={claim.source_document_id}
              isFocused={focusedPassageId === edge.passage_id}
              overriding={overridingEvidenceId === edge.id}
              onOverrideLabel={onOverrideLabel}
              onOpenContext={onOpenContext}
            />
          ))
        )}
      </div>

      {neutralEvidence.length > 0 ? (
        <div className="stack-sm neutral-disclosure">
          <button
            type="button"
            className="evidence-toggle-btn"
            onClick={() =>
              setExpandedNeutralClaimId((prev) => (prev === claim.id ? null : claim.id))
            }
            aria-expanded={neutralOpen}
            id="inspector-toggle-neutral-btn"
          >
            {neutralOpen ? (
              <>
                <ChevronUp size={14} aria-hidden="true" />
                Hide checked context without verdict ({neutralEvidence.length})
              </>
            ) : (
              <>
                <ChevronDown size={14} aria-hidden="true" />
                Checked context without verdict ({neutralEvidence.length})
              </>
            )}
          </button>

          {neutralOpen
            ? neutralEvidence.map((edge) => (
                <EvidenceCard
                  key={edge.id}
                  edge={edge}
                  claimText={claim.text}
                  claimSourceDocId={claim.source_document_id}
                  isFocused={focusedPassageId === edge.passage_id}
                  overriding={overridingEvidenceId === edge.id}
                  onOverrideLabel={onOverrideLabel}
                  onOpenContext={onOpenContext}
                />
              ))
            : null}
        </div>
      ) : null}

      <p className="text-muted inspector-disclaimer">
        Automated NLI verdicts assist literature review and do not certify scientific truth — verify
        key claims against the source text.
      </p>
    </aside>
  );
}
