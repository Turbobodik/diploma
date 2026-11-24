import { BookMarked, Info, ShieldAlert } from 'lucide-react';

import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { Select } from '../../components/common/Select';
import type { ClaimItem, NliLabel } from '../../models/api';

export interface ClaimDetailDrawerProps {
  claim: ClaimItem | null;
  overridingEvidenceId: string | null;
  onOverrideLabel: (evidenceId: string, userLabel: NliLabel | null) => void;
}

const OVERRIDE_OPTIONS = [
  { value: '', label: 'Use model prediction (no override)' },
  { value: 'entailment', label: 'Override: Entailment' },
  { value: 'contradiction', label: 'Override: Contradiction' },
  { value: 'neutral', label: 'Override: Neutral' },
];

export function ClaimDetailDrawer({
  claim,
  overridingEvidenceId,
  onOverrideLabel,
}: ClaimDetailDrawerProps) {
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
          <Badge variant="info">{Math.round(claim.confidence * 100)}% confidence</Badge>
        </div>
        <blockquote className="claim-quote">{claim.text}</blockquote>
        <div className="cluster text-muted">
          <span>{claim.source_name}</span>
          {claim.page_no ? <span>· Page {claim.page_no}</span> : null}
          <span className="mono">
            · chars [{claim.char_start}..{claim.char_end}]
          </span>
        </div>
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
        <h3>Retrieved Evidence ({claim.evidence.length})</h3>
        {claim.evidence.length === 0 ? (
          <div className="alert-banner info">
            <Info size={18} aria-hidden="true" />
            <span>No candidate passages were linked to this claim.</span>
          </div>
        ) : (
          claim.evidence.map((edge) => {
            const isOverridden = edge.user_label !== null;
            return (
              <article key={edge.id} className="evidence-item">
                <div className="cluster">
                  <Badge variant={edge.effective_label}>{edge.effective_label}</Badge>
                  <span className="mono text-muted">
                    model: {edge.model_label} ({Math.round(edge.model_score * 100)}%)
                  </span>
                  {isOverridden ? <Badge variant="warning">Overridden</Badge> : null}
                </div>

                <p className="evidence-excerpt">&ldquo;{edge.passage_text}&rdquo;</p>

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
                  disabled={overridingEvidenceId === edge.id}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const nextLabel: NliLabel | null =
                      raw === 'entailment' || raw === 'contradiction' || raw === 'neutral'
                        ? raw
                        : null;
                    onOverrideLabel(edge.id, nextLabel);
                  }}
                />
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}
