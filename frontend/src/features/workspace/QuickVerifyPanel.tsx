import { AlertCircle, BookOpen, ChevronDown, ChevronUp, SearchCheck, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import type { AggregateVerdict, VerifyClaimResponse, VerifyEvidenceItem } from '../../models/api';
import { normalizeAxiosError } from '../../services/httpClient';
import { workspaceService } from '../../services/workspaceService';
import { extractKeySentence, tokenizeForHighlight } from '../../utils/evidenceHighlight';
import type { DocumentContextTarget } from './DocumentContextModal';

export interface QuickVerifyPanelProps {
  projectId: string;
  disabled: boolean;
  onOpenContext: (target: DocumentContextTarget) => void;
}

function verdictBadge(verdict: AggregateVerdict): {
  variant: 'entailment' | 'contradiction' | 'warning' | 'neutral';
  label: string;
} {
  if (verdict === 'supported') return { variant: 'entailment', label: 'Supported' };
  if (verdict === 'refuted') return { variant: 'contradiction', label: 'Refuted' };
  if (verdict === 'conflicting') return { variant: 'warning', label: 'Conflicting evidence' };
  return { variant: 'neutral', label: 'No clear verdict' };
}

function humanNliLabel(label: VerifyEvidenceItem['model_label']): string {
  if (label === 'entailment') return 'Supports';
  if (label === 'contradiction') return 'Refutes';
  return 'Context only';
}

function VerifyEvidenceRow({
  item,
  claimText,
  onOpenContext,
}: {
  item: VerifyEvidenceItem;
  claimText: string;
  onOpenContext: (target: DocumentContextTarget) => void;
}) {
  const analysis = extractKeySentence(item.passage_text, claimText, item.model_label);
  const segments = tokenizeForHighlight(analysis.keySentence, analysis.matchedRoots);
  const isNeutral = item.model_label === 'neutral';

  return (
    <article className={`evidence-item evidence-item-${item.model_label}`}>
      <div className="cluster">
        <Badge variant={item.model_label}>{humanNliLabel(item.model_label)}</Badge>
        {!isNeutral ? (
          <span className="mono text-muted" title="NLI model confidence in this verdict">
            confidence: {Math.round(item.model_score * 100)}%
          </span>
        ) : (
          <span className="text-muted">neither supports nor refutes</span>
        )}
        <span className="mono text-muted" title="Passage retrieval similarity">
          · match: {Math.round(item.retrieval_score * 100)}%
        </span>
      </div>

      <p className="evidence-excerpt-text">
        <span className={`evidence-key-sentence is-${item.model_label}`}>
          {segments.map((seg, idx) =>
            seg.highlight ? (
              <mark key={idx} className="evidence-keyword">
                {seg.text}
              </mark>
            ) : (
              <span key={idx}>{seg.text}</span>
            ),
          )}
        </span>
      </p>

      <div className="cluster">
        <span className="text-muted flex-1">
          {item.document_name}
          {item.page_no ? ` · Page ${item.page_no}` : ''}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onOpenContext({
              documentId: item.document_id,
              documentName: item.document_name,
              charStart: item.char_start,
              charEnd: item.char_end,
              pageNo: item.page_no,
              heading: 'Matched Passage Context',
            })
          }
        >
          <BookOpen size={14} aria-hidden="true" />
          Read in document
        </Button>
      </div>
    </article>
  );
}

export function QuickVerifyPanel({ projectId, disabled, onOpenContext }: QuickVerifyPanelProps) {
  const [claimText, setClaimText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyClaimResponse | null>(null);
  const [showNeutral, setShowNeutral] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = claimText.trim();
    if (trimmed.length < 5) {
      setError('Enter at least 5 characters to verify a claim.');
      return;
    }

    setLoading(true);
    setError(null);
    setShowNeutral(false);
    try {
      const response = await workspaceService.verifyClaim(projectId, {
        claim_text: trimmed,
        top_k: 5,
        include_neutral: true,
      });
      setResult(response);
    } catch (err) {
      setError(normalizeAxiosError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const verdictItems = result ? result.evidence.filter((ev) => ev.model_label !== 'neutral') : [];
  const neutralItems = result ? result.evidence.filter((ev) => ev.model_label === 'neutral') : [];
  const summaryBadge = result ? verdictBadge(result.verdict) : null;

  return (
    <section
      className="surface-card surface-card-compact stack-md"
      aria-label="Verify your own claim"
    >
      <div className="cluster">
        <Sparkles size={16} aria-hidden="true" />
        <strong className="flex-1">Check a custom claim against uploaded papers</strong>
        <span className="text-muted">Supports English &amp; Russian text</span>
      </div>

      <form className="quick-verify-form" onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="quick-verify-input" className="sr-only">
          Claim or hypothesis to verify
        </label>
        <input
          id="quick-verify-input"
          className="field-control quick-verify-input"
          type="text"
          placeholder="Type any claim or hypothesis (EN or RU) to check against this corpus..."
          value={claimText}
          disabled={disabled || loading}
          onChange={(event) => setClaimText(event.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={disabled || claimText.trim().length < 5}
          loading={loading}
          id="quick-verify-submit-btn"
        >
          <SearchCheck size={15} aria-hidden="true" />
          Verify claim
        </Button>
      </form>

      {error ? (
        <div className="alert-banner error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {result && summaryBadge ? (
        <div className="stack-sm" aria-live="polite">
          <div className="cluster">
            <Badge variant={summaryBadge.variant}>{summaryBadge.label}</Badge>
            <span className="text-muted">
              Checked {result.checked_passages} relevant passage
              {result.checked_passages === 1 ? '' : 's'}
              {result.checked_passages === 0
                ? ' — no passages passed the similarity threshold.'
                : ` · ${verdictItems.length} supporting/refuting · ${neutralItems.length} context only`}
            </span>
          </div>

          {verdictItems.map((item, idx) => (
            <VerifyEvidenceRow
              key={`${item.document_id}:${item.char_start}:${idx}`}
              item={item}
              claimText={result.claim_text}
              onOpenContext={onOpenContext}
            />
          ))}

          {neutralItems.length > 0 ? (
            <div className="stack-sm">
              <button
                type="button"
                className="evidence-toggle-btn"
                onClick={() => setShowNeutral((prev) => !prev)}
                aria-expanded={showNeutral}
                id="quick-verify-neutral-toggle"
              >
                {showNeutral ? (
                  <>
                    <ChevronUp size={14} aria-hidden="true" />
                    Hide checked context without verdict ({neutralItems.length})
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} aria-hidden="true" />
                    Show checked context without verdict ({neutralItems.length})
                  </>
                )}
              </button>
              {showNeutral
                ? neutralItems.map((item, idx) => (
                    <VerifyEvidenceRow
                      key={`neutral:${item.document_id}:${item.char_start}:${idx}`}
                      item={item}
                      claimText={result.claim_text}
                      onOpenContext={onOpenContext}
                    />
                  ))
                : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
