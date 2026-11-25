import { ArrowDown, ArrowUp, ArrowUpDown, BookOpen, FileSearch, RotateCcw } from 'lucide-react';

import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import type { ClaimItem } from '../../models/api';
import type { ClaimSortField, SortDirection } from '../../models/ui';
import type { DocumentContextTarget } from './DocumentContextModal';

export interface ClaimsTableProps {
  claims: ClaimItem[];
  selectedClaimId: string | null;
  sortField: ClaimSortField;
  sortDirection: SortDirection;
  hasActiveFilters?: boolean;
  onSelectClaim: (claimId: string) => void;
  onOpenContext?: (target: DocumentContextTarget) => void;
  onResetFilters?: () => void;
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
  hasActiveFilters = false,
  onSelectClaim,
  onOpenContext,
  onResetFilters,
  onSort,
}: ClaimsTableProps) {
  if (claims.length === 0) {
    return (
      <EmptyState
        icon={<FileSearch size={22} />}
        title="No matching claims"
        description={
          hasActiveFilters
            ? 'No claims match your current search, document, or verdict filters.'
            : 'Run the analysis pipeline to extract claims and verify them across your papers.'
        }
        action={
          hasActiveFilters && onResetFilters ? (
            <Button variant="secondary" size="sm" onClick={onResetFilters}>
              <RotateCcw size={14} aria-hidden="true" />
              Reset filters
            </Button>
          ) : undefined
        }
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
                  Verdict
                  <SortIcon active={sortField === 'evidence_count'} direction={sortDirection} />
                </button>
              </th>
              {onOpenContext ? <th>Context</th> : null}
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
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectClaim(claim.id);
                      }}
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
                        <Badge variant="warning">No verdict</Badge>
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
                        <Badge variant="neutral">{counts.neutral} context</Badge>
                      ) : null}
                    </div>
                  </td>
                  {onOpenContext ? (
                    <td>
                      <button
                        type="button"
                        className="evidence-toggle-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenContext({
                            documentId: claim.source_document_id,
                            documentName: claim.source_name,
                            charStart: claim.char_start,
                            charEnd: claim.char_end,
                            pageNo: claim.page_no,
                            heading: 'Claim Source Context',
                          });
                        }}
                      >
                        <BookOpen size={13} aria-hidden="true" />
                        Read
                      </button>
                    </td>
                  ) : null}
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
                {claim.page_no ? <span>· p.{claim.page_no}</span> : null}
                <span className="mono">· {Math.round(claim.confidence * 100)}%</span>
              </div>
              <div className="cluster">
                {!claim.has_evidence ? (
                  <Badge variant="warning">No verdict</Badge>
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
                  <Badge variant="neutral">{counts.neutral} context</Badge>
                ) : null}
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
            </article>
          );
        })}
      </div>
    </>
  );
}
