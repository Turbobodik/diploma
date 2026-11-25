import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import type { ProjectItem } from '../../models/api';
import type { ProjectSortField, SortDirection } from '../../models/ui';

export interface ProjectTableProps {
  projects: ProjectItem[];
  sortField: ProjectSortField;
  sortDirection: SortDirection;
  deletingId: string | null;
  onSort: (field: ProjectSortField) => void;
  onRenameRequest?: (project: ProjectItem) => void;
  onDeleteRequest: (project: ProjectItem) => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown size={14} aria-hidden="true" />;
  return direction === 'asc' ? (
    <ArrowUp size={14} aria-hidden="true" />
  ) : (
    <ArrowDown size={14} aria-hidden="true" />
  );
}

export function ProjectTable({
  projects,
  sortField,
  sortDirection,
  deletingId,
  onSort,
  onRenameRequest,
  onDeleteRequest,
}: ProjectTableProps) {
  return (
    <>
      <div className="table-wrap desktop-table-only">
        <table className="data-table" aria-label="Research projects">
          <thead>
            <tr>
              <th>
                <button type="button" className="sort-button" onClick={() => onSort('name')}>
                  Project
                  <SortIcon active={sortField === 'name'} direction={sortDirection} />
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="sort-button"
                  onClick={() => onSort('document_count')}
                >
                  Documents
                  <SortIcon active={sortField === 'document_count'} direction={sortDirection} />
                </button>
              </th>
              <th>
                <button type="button" className="sort-button" onClick={() => onSort('claim_count')}>
                  Claims
                  <SortIcon active={sortField === 'claim_count'} direction={sortDirection} />
                </button>
              </th>
              <th>
                <button type="button" className="sort-button" onClick={() => onSort('created_at')}>
                  Created
                  <SortIcon active={sortField === 'created_at'} direction={sortDirection} />
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>
                  <Link to={`/projects/${project.id}`}>
                    <strong>{project.name}</strong>
                  </Link>
                </td>
                <td>
                  <Badge variant="info">{project.document_count} docs</Badge>
                </td>
                <td>
                  <Badge variant={project.claim_count > 0 ? 'success' : 'neutral'}>
                    {project.claim_count} claims
                  </Badge>
                </td>
                <td className="text-muted">{formatDate(project.created_at)}</td>
                <td>
                  <div className="cluster">
                    <Link
                      to={`/projects/${project.id}`}
                      className="btn btn-secondary btn-sm"
                      aria-label={`Open ${project.name}`}
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                      Open
                    </Link>
                    {onRenameRequest ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Rename ${project.name}`}
                        onClick={() => onRenameRequest(project)}
                      >
                        <Pencil size={14} aria-hidden="true" />
                        Rename
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={deletingId === project.id}
                      aria-label={`Delete ${project.name}`}
                      onClick={() => onDeleteRequest(project)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list" aria-label="Research projects list">
        {projects.map((project) => (
          <article key={project.id} className="surface-card surface-card-compact stack-sm">
            <div className="cluster">
              <h3 className="flex-1">{project.name}</h3>
              <span className="text-muted">{formatDate(project.created_at)}</span>
            </div>
            <div className="cluster">
              <Badge variant="info">{project.document_count} docs</Badge>
              <Badge variant={project.claim_count > 0 ? 'success' : 'neutral'}>
                {project.claim_count} claims
              </Badge>
            </div>
            <div className="cluster">
              <Link to={`/projects/${project.id}`} className="btn btn-primary btn-sm flex-1">
                <ExternalLink size={14} aria-hidden="true" />
                Open workspace
              </Link>
              {onRenameRequest ? (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Rename ${project.name}`}
                  onClick={() => onRenameRequest(project)}
                >
                  <Pencil size={14} aria-hidden="true" />
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                loading={deletingId === project.id}
                aria-label={`Delete ${project.name}`}
                onClick={() => onDeleteRequest(project)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </Button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
