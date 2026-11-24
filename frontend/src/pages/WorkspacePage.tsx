import { AlertCircle, ArrowLeft, Download, FileText, Play, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Skeleton } from '../components/common/Skeleton';
import { AnalysisProgress } from '../features/workspace/AnalysisProgress';
import { ClaimDetailDrawer } from '../features/workspace/ClaimDetailDrawer';
import { ClaimsTable } from '../features/workspace/ClaimsTable';
import { DocumentUploader } from '../features/workspace/DocumentUploader';
import { EvidenceMap } from '../features/workspace/EvidenceMap';
import { useDebounce } from '../hooks/useDebounce';
import { useDeviceProfile } from '../hooks/useDeviceProfile';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { ExportFormat, NliLabel } from '../models/api';
import { normalizeAxiosError } from '../services/httpClient';
import { workspaceService } from '../services/workspaceService';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { pushToast } from '../store/uiSlice';
import {
  loadWorkspace,
  overrideEvidenceThunk,
  pollJobsThunk,
  refreshClaimsAndGraph,
  selectClaim,
  selectHasActiveJobs,
  selectSelectedClaim,
  selectSortedClaims,
  selectWorkspaceStats,
  setClaimSort,
  setIncludeNeutral,
  setWorkspaceDocumentFilter,
  setWorkspaceLabelFilter,
  setWorkspaceSearch,
  startAnalysisThunk,
  uploadDocumentThunk,
} from '../store/workspaceSlice';

const LABEL_FILTER_OPTIONS = [
  { value: 'all', label: 'All NLI labels' },
  { value: 'entailment', label: 'Entailment (supports)' },
  { value: 'contradiction', label: 'Contradiction (refutes)' },
  { value: 'neutral', label: 'Neutral' },
];

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const dispatch = useAppDispatch();
  const device = useDeviceProfile();

  const project = useAppSelector((state) =>
    state.projects.items.find((item) => item.id === projectId),
  );
  const {
    projectId: loadedProjectId,
    documents,
    jobs,
    graph,
    filters,
    loading,
    uploading,
    analyzing,
    overridingEvidenceId,
    error,
    selectedClaimId,
  } = useAppSelector((state) => state.workspace);
  const sortedClaims = useAppSelector(selectSortedClaims);
  const selectedClaim = useAppSelector(selectSelectedClaim);
  const hasActiveJobs = useAppSelector(selectHasActiveJobs);
  const stats = useAppSelector(selectWorkspaceStats);

  const [viewMode, setViewMode] = useState<'map' | 'table'>(() =>
    device.breakpoint === 'mobile' ? 'table' : 'map',
  );
  const [selectedPassageId, setSelectedPassageId] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const debouncedSearch = useDebounce(filters.search, 250);
  const isWorkspaceLoading = loading || loadedProjectId !== projectId;

  useDocumentTitle(project ? project.name : 'Workspace');

  useEffect(() => {
    if (!projectId) return;
    void dispatch(loadWorkspace(projectId));
  }, [dispatch, projectId]);

  useEffect(() => {
    if (!projectId || isWorkspaceLoading) return;
    void dispatch(
      refreshClaimsAndGraph({
        projectId,
        label: filters.label === 'all' ? undefined : filters.label,
        documentId: filters.documentId || undefined,
        search: debouncedSearch,
        includeNeutral: filters.includeNeutral,
      }),
    );
  }, [
    dispatch,
    projectId,
    isWorkspaceLoading,
    filters.label,
    filters.documentId,
    filters.includeNeutral,
    debouncedSearch,
  ]);

  useEffect(() => {
    if (!projectId || !hasActiveJobs) return;
    const timer = window.setInterval(async () => {
      const result = await dispatch(pollJobsThunk(projectId));
      if (pollJobsThunk.fulfilled.match(result)) {
        const stillRunning = result.payload.some(
          (job) => job.status === 'queued' || job.status === 'running',
        );
        if (!stillRunning) {
          void dispatch(
            refreshClaimsAndGraph({
              projectId,
              label: filters.label === 'all' ? undefined : filters.label,
              documentId: filters.documentId || undefined,
              search: debouncedSearch,
              includeNeutral: filters.includeNeutral,
            }),
          );
        }
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [
    dispatch,
    projectId,
    hasActiveJobs,
    filters.label,
    filters.documentId,
    filters.includeNeutral,
    debouncedSearch,
  ]);

  const handleExport = async (format: ExportFormat) => {
    if (!projectId) return;
    setExportingFormat(format);
    try {
      const blob = await workspaceService.exportProject(projectId, format, {
        label: filters.label === 'all' ? undefined : filters.label,
        document_id: filters.documentId || undefined,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `factmap-${projectId}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      dispatch(
        pushToast({
          variant: 'success',
          title: `Exported ${format.toUpperCase()}`,
          description: 'Filtered claims and NLI evidence edges downloaded.',
        }),
      );
    } catch (err) {
      dispatch(
        pushToast({
          variant: 'error',
          title: 'Export failed',
          description: normalizeAxiosError(err).message,
        }),
      );
    } finally {
      setExportingFormat(null);
    }
  };

  if (!projectId) {
    return (
      <div className="alert-banner error" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <span>Missing project identifier.</span>
      </div>
    );
  }

  const readyDocsCount = documents.filter((doc) => doc.status === 'ready').length;
  const documentFilterOptions = [
    { value: '', label: 'All documents' },
    ...documents.map((doc) => ({ value: doc.id, label: doc.original_name })),
  ];

  return (
    <div className="stack-lg">
      <header className="page-header">
        <div className="page-header-copy">
          <Link to="/projects" className="cluster text-muted">
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Back to projects</span>
          </Link>
          <h1>{project?.name ?? 'Project Workspace'}</h1>
          <p className="text-secondary">
            {documents.length} documents · {stats.totalClaims} claims · {stats.entailment}{' '}
            entailment · {stats.contradiction} contradiction
          </p>
        </div>

        <div className="page-header-actions">
          <Button
            variant="primary"
            disabled={readyDocsCount === 0 || hasActiveJobs}
            loading={analyzing || hasActiveJobs}
            onClick={() => void dispatch(startAnalysisThunk({ projectId }))}
            id="run-analysis-btn"
          >
            <Play size={16} aria-hidden="true" />
            {hasActiveJobs ? 'Analyzing…' : 'Run analysis'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={exportingFormat === 'json'}
            disabled={stats.totalClaims === 0}
            onClick={() => void handleExport('json')}
            id="export-json-btn"
          >
            <Download size={15} aria-hidden="true" />
            JSON
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={exportingFormat === 'csv'}
            disabled={stats.totalClaims === 0}
            onClick={() => void handleExport('csv')}
            id="export-csv-btn"
          >
            <Download size={15} aria-hidden="true" />
            CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void dispatch(loadWorkspace(projectId))}
            aria-label="Reload workspace"
          >
            <RefreshCw size={15} aria-hidden="true" />
          </Button>
        </div>
      </header>

      {error ? (
        <div className="alert-banner error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {isWorkspaceLoading ? (
        <div className="surface-card stack-md">
          <Skeleton variant="title" />
          <Skeleton variant="block" count={2} />
        </div>
      ) : (
        <>
          <section className="metric-grid" aria-label="Verification summary">
            <div className="metric-box">
              <span className="metric-label">Claims</span>
              <span className="metric-value">{stats.totalClaims}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Entailment</span>
              <span className="metric-value">{stats.entailment}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Contradiction</span>
              <span className="metric-value">{stats.contradiction}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Unverified</span>
              <span className="metric-value">{stats.unverified}</span>
            </div>
          </section>

          <section className="surface-card stack-md" aria-label="Corpus documents">
            <div className="cluster">
              <h2 className="flex-1">Documents ({documents.length})</h2>
              <span className="text-muted">{readyDocsCount} ready for NLI</span>
            </div>

            <DocumentUploader
              uploading={uploading}
              onUpload={async (file) => {
                await dispatch(uploadDocumentThunk({ projectId, file }));
              }}
            />

            {documents.length > 0 ? (
              <div className="cluster" aria-label="Uploaded document list">
                {documents.map((doc) => (
                  <div key={doc.id} className="badge badge-neutral">
                    <FileText size={13} aria-hidden="true" />
                    <span>{doc.original_name}</span>
                    <Badge
                      variant={
                        doc.status === 'ready'
                          ? 'success'
                          : doc.status === 'failed'
                            ? 'error'
                            : 'info'
                      }
                    >
                      {doc.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <AnalysisProgress jobs={jobs} />

          <section
            className="surface-card surface-card-compact stack-md"
            aria-label="Filter evidence"
          >
            <div className="toolbar-row">
              <div className="toolbar-search">
                <Input
                  id="claims-search-input"
                  label="Search claims"
                  placeholder="Search claim text or source filename..."
                  value={filters.search}
                  onChange={(event) => dispatch(setWorkspaceSearch(event.target.value))}
                />
              </div>
              <Select
                id="claims-label-filter"
                label="NLI label"
                options={LABEL_FILTER_OPTIONS}
                value={filters.label}
                onChange={(event) =>
                  dispatch(setWorkspaceLabelFilter(event.target.value as NliLabel | 'all'))
                }
              />
              <Select
                id="claims-doc-filter"
                label="Source document"
                options={documentFilterOptions}
                value={filters.documentId}
                onChange={(event) => dispatch(setWorkspaceDocumentFilter(event.target.value))}
              />
            </div>

            <div className="cluster">
              <div className="tab-list" role="tablist" aria-label="Evidence explorer mode">
                <button
                  type="button"
                  role="tab"
                  className="tab-btn"
                  aria-selected={viewMode === 'map'}
                  onClick={() => setViewMode('map')}
                  id="workspace-tab-map"
                >
                  Interactive Map
                </button>
                <button
                  type="button"
                  role="tab"
                  className="tab-btn"
                  aria-selected={viewMode === 'table'}
                  onClick={() => setViewMode('table')}
                  id="workspace-tab-table"
                >
                  Claims Table
                </button>
              </div>

              <label className="cluster text-secondary">
                <input
                  type="checkbox"
                  checked={filters.includeNeutral}
                  onChange={(event) => dispatch(setIncludeNeutral(event.target.checked))}
                />
                <span>Show neutral edges</span>
              </label>
            </div>
          </section>

          <div className="workspace-split">
            <div className="stack-md">
              {viewMode === 'map' ? (
                <EvidenceMap
                  graph={graph}
                  selectedClaimId={selectedClaimId}
                  selectedPassageId={selectedPassageId}
                  onSelectClaim={(claimId) => {
                    setSelectedPassageId(null);
                    dispatch(selectClaim(claimId));
                  }}
                  onSelectPassage={(passageId) => setSelectedPassageId(passageId)}
                />
              ) : (
                <ClaimsTable
                  claims={sortedClaims}
                  selectedClaimId={selectedClaimId}
                  sortField={filters.sortField}
                  sortDirection={filters.sortDirection}
                  onSelectClaim={(claimId) => {
                    setSelectedPassageId(null);
                    dispatch(selectClaim(claimId));
                  }}
                  onSort={(field) => dispatch(setClaimSort({ field }))}
                />
              )}
            </div>

            <ClaimDetailDrawer
              claim={selectedClaim}
              focusedPassageId={selectedPassageId}
              overridingEvidenceId={overridingEvidenceId}
              onOverrideLabel={(evidenceId, userLabel) =>
                void dispatch(overrideEvidenceThunk({ evidenceId, userLabel }))
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
