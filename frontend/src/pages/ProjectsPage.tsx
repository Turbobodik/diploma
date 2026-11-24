import { FolderPlus, FolderSearch, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { Select } from '../components/common/Select';
import { Skeleton } from '../components/common/Skeleton';
import { CreateProjectForm } from '../features/projects/CreateProjectForm';
import { ProjectTable } from '../features/projects/ProjectTable';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { ProjectItem } from '../models/api';
import type { ProjectSortField } from '../models/ui';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  clearProjectsError,
  createProject,
  deleteProject,
  fetchProjects,
  selectFilteredSortedProjects,
  setProjectSearch,
  setProjectSort,
} from '../store/projectsSlice';

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Sort by: Created date' },
  { value: 'name', label: 'Sort by: Name' },
  { value: 'document_count', label: 'Sort by: Documents' },
  { value: 'claim_count', label: 'Sort by: Claims' },
];

export default function ProjectsPage() {
  useDocumentTitle('Projects');
  const dispatch = useAppDispatch();
  const projects = useAppSelector(selectFilteredSortedProjects);
  const { status, creating, deletingId, error, searchQuery, sortField, sortDirection, total } =
    useAppSelector((state) => state.projects);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectItem | null>(null);

  useEffect(() => {
    void dispatch(fetchProjects());
  }, [dispatch]);

  const handleCreate = async (name: string): Promise<boolean> => {
    const result = await dispatch(createProject({ name }));
    if (createProject.fulfilled.match(result)) {
      setCreateModalOpen(false);
      return true;
    }
    return false;
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    await dispatch(deleteProject(pendingDelete.id));
    setPendingDelete(null);
  };

  return (
    <div className="stack-lg">
      <header className="page-header">
        <div className="page-header-copy">
          <h1>Research Projects</h1>
          <p className="text-secondary">
            Organize scientific corpora into isolated workspaces ({total} total).
          </p>
        </div>
        <div className="page-header-actions">
          <Button
            variant="secondary"
            onClick={() => void dispatch(fetchProjects())}
            loading={status === 'loading'}
            id="refresh-projects-btn"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              dispatch(clearProjectsError());
              setCreateModalOpen(true);
            }}
            id="open-create-project-btn"
          >
            <Plus size={16} aria-hidden="true" />
            New project
          </Button>
        </div>
      </header>

      <section
        className="surface-card surface-card-compact toolbar-row"
        aria-label="Filter projects"
      >
        <div className="toolbar-search">
          <Input
            id="projects-search-input"
            label="Search projects"
            placeholder="Filter by project name..."
            value={searchQuery}
            onChange={(event) => dispatch(setProjectSearch(event.target.value))}
          />
        </div>
        <Select
          id="projects-sort-select"
          label="Sort order"
          options={SORT_OPTIONS}
          value={sortField}
          onChange={(event) =>
            dispatch(setProjectSort({ field: event.target.value as ProjectSortField }))
          }
        />
      </section>

      {status === 'loading' && projects.length === 0 ? (
        <div className="surface-card stack-md">
          <Skeleton variant="title" />
          <Skeleton variant="line" count={4} />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={searchQuery ? <FolderSearch size={22} /> : <FolderPlus size={22} />}
          title={searchQuery ? 'No matching projects' : 'Create your first research project'}
          description={
            searchQuery
              ? `No project names match "${searchQuery}". Try clearing the search filter.`
              : 'Create a project workspace to upload scientific PDF/TXT papers and verify claims.'
          }
          action={
            searchQuery ? (
              <Button variant="secondary" onClick={() => dispatch(setProjectSearch(''))}>
                Clear search
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
                <Plus size={16} aria-hidden="true" />
                New project
              </Button>
            )
          }
        />
      ) : (
        <ProjectTable
          projects={projects}
          sortField={sortField}
          sortDirection={sortDirection}
          deletingId={deletingId}
          onSort={(field) => dispatch(setProjectSort({ field }))}
          onDeleteRequest={(project) => setPendingDelete(project)}
        />
      )}

      <Modal
        open={createModalOpen}
        title="Create analysis project"
        onClose={() => setCreateModalOpen(false)}
      >
        <CreateProjectForm
          loading={creating}
          serverError={error}
          onSubmit={handleCreate}
          onCancel={() => setCreateModalOpen(false)}
        />
      </Modal>

      <Modal
        open={pendingDelete !== null}
        title="Delete project and cascade data?"
        onClose={() => setPendingDelete(null)}
      >
        <div className="stack-md">
          <p className="text-secondary">
            Deleting <strong>{pendingDelete?.name}</strong> permanently removes all uploaded
            documents, passages, extracted claims, and NLI evidence records. This action cannot be
            undone.
          </p>
          <div className="cluster">
            <Button
              variant="danger"
              loading={deletingId === pendingDelete?.id}
              onClick={() => void handleConfirmDelete()}
              id="confirm-delete-project-btn"
            >
              Delete permanently
            </Button>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
