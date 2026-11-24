import { ArrowDown, ArrowUp, ArrowUpDown, FileSearch } from 'lucide-react';

import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import type { ClaimItem } from '../../models/api';
import type { ClaimSortField, SortDirection } from '../../models/ui';

export interface ClaimsTableProps {
  claims: ClaimItem[];
  selectedClaimId: string | null;
  sortField: ClaimSortField;
  sortDirection: SortDirection;
  onSelectClaim: (claimId: string) => void;
  onSort: (field: ClaimSortField) => void;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown size={14} aria-hidden="true" />;
  return direction === 'asc' ? (
    <ArrowUp size={14} aria-hidden="true" />
  ) : (
    <ArrowDown size={14} aria-hidden="true" />
  );
}

function summarizeEvidence(claim: ClaimItem) {
  let entailment = 0;
  let contradiction = 0;
  let neutral = 0;
  for (const edge of claim.evidence) {
    if (edge.effective_label === 'entailment') entailment += 1;
    else if (edge.effective_label === 'contradiction') contradiction += 1;
    else neutral += 1;
  }
  return { entailment, contradiction, neutral };
}

export function ClaimsTable({
  claims,
  selectedClaimId,
  sortField,
  sortDirection,
  onSelectClaim,
  onSort,
}: ClaimsTableProps) {
  if (claims.length === 0) {
    return (
      <EmptyState
        icon={<FileSearch size={22} />}
        title="No matching claims"
        description="Run the analysis pipeline or adjust your search query and NLI label filters."
      />
    );
  }

  return (
    <>
      <div className="table-wrap desktop-table-only">
        <table className="data-table" aria-label="Extracted claims">
          <thead>
            <tr>
              <th>Claim</th>
              <th>
                <button type="button" className="sort-button" onClick={() => onSort('source_name')}>
                  Source
                  <SortIcon active={sortField === 'source_name'} direction={sortDirection} />
                </button>
              </th>
              <th>
                <button type="button" className="sort-button" onClick={() => onSort('confidence')}>
                  Confidence
                  <SortIcon active={sortField === 'confidence'} direction={sortDirection} />
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="sort-button"
                  onClick={() => onSort('evidence_count')}
                >
                  NLI Evidence
                  <SortIcon active={sortField === 'evidence_count'} direction={sortDirection} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => {
              const counts = summarizeEvidence(claim);
              const isSelected = claim.id === selectedClaimId;
              return (
                <tr
                  key={claim.id}
                  className={isSelected ? 'claim-row-selected' : undefined}
                  onClick={() => onSelectClaim(claim.id)}
                >
                  <td>
                    <button
                      type="button"
                      className="sort-button"
                      onClick={() => onSelectClaim(claim.id)}
                      aria-pressed={isSelected}
                    >
                      <span>{claim.text}</span>
                    </button>
                  </td>
                  <td className="text-muted">
                    {claim.source_name}
                    {claim.page_no ? ` · p.${claim.page_no}` : ''}
                  </td>
                  <td className="mono">{Math.round(claim.confidence * 100)}%</td>
                  <td>
                    <div className="cluster">
                      {!claim.has_evidence ? (
                        <Badge variant="warning">No evidence</Badge>
                      ) : (
                        <>
                          {counts.entailment > 0 ? (
                            <Badge variant="entailment">{counts.entailment} support</Badge>
                          ) : null}
                          {counts.contradiction > 0 ? (
                            <Badge variant="contradiction">{counts.contradiction} refute</Badge>
                          ) : null}
                        </>
                      )}
                      {counts.neutral > 0 ? (
                        <Badge variant="neutral">{counts.neutral} neutral</Badge>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list" aria-label="Extracted claims list">
        {claims.map((claim) => {
          const counts = summarizeEvidence(claim);
          const isSelected = claim.id === selectedClaimId;
          return (
            <article
              key={claim.id}
              className={`surface-card surface-card-compact stack-sm ${
                isSelected ? 'claim-row-selected' : ''
              }`}
            >
              <button
                type="button"
                className="sort-button"
                onClick={() => onSelectClaim(claim.id)}
                aria-pressed={isSelected}
              >
                <strong>{claim.text}</strong>
              </button>
              <div className="cluster text-muted">
                <span>{claim.source_name}</span>
                <span className="mono">· {Math.round(claim.confidence * 100)}%</span>
              </div>
              <div className="cluster">
                {!claim.has_evidence ? (
                  <Badge variant="warning">No evidence found</Badge>
                ) : (
                  <>
                    {counts.entailment > 0 ? (
                      <Badge variant="entailment">{counts.entailment} entailment</Badge>
                    ) : null}
                    {counts.contradiction > 0 ? (
                      <Badge variant="contradiction">{counts.contradiction} contradiction</Badge>
                    ) : null}
                  </>
                )}
                {counts.neutral > 0 ? (
                  <Badge variant="neutral">{counts.neutral} neutral</Badge>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
