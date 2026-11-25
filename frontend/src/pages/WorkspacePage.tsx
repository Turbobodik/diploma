import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ChevronUp,
  Cpu,
  Download,
  FileText,
  Info,
  PanelRightOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { Select } from '../components/common/Select';
import { Skeleton } from '../components/common/Skeleton';
import { AnalysisProgress } from '../features/workspace/AnalysisProgress';
import { ClaimDetailDrawer } from '../features/workspace/ClaimDetailDrawer';
import { ClaimsTable } from '../features/workspace/ClaimsTable';
import {
  DocumentContextModal,
  type DocumentContextTarget,
} from '../features/workspace/DocumentContextModal';
import { DocumentUploader } from '../features/workspace/DocumentUploader';
import { EvidenceMap } from '../features/workspace/EvidenceMap';
import { QuickVerifyPanel } from '../features/workspace/QuickVerifyPanel';
import { useDebounce } from '../hooks/useDebounce';
import { useDeviceProfile } from '../hooks/useDeviceProfile';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { DocumentItem, ExportFormat, HealthResponse, NliLabel } from '../models/api';
import { normalizeAxiosError } from '../services/httpClient';
import { workspaceService } from '../services/workspaceService';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { renameProject } from '../store/projectsSlice';
import { pushToast } from '../store/uiSlice';
import {
  deleteDocumentThunk,
  loadWorkspace,
  overrideEvidenceThunk,
  pollJobsThunk,
  refreshClaimsAndGraph,
  resetWorkspaceFilters,
  selectClaim,
  selectHasActiveJobs,
  selectSelectedClaim,
  selectSortedClaims,
  selectWorkspaceStats,
  setClaimSort,
  setCrossDocumentOnly,
  setIncludeNeutral,
  setWorkspaceDocumentFilter,
  setWorkspaceLabelFilter,
  setWorkspaceSearch,
  startAnalysisThunk,
  uploadDocumentThunk,
} from '../store/workspaceSlice';

const VERDICT_PILLS: Array<{
  value: NliLabel | 'all';
  label: string;
  tone: 'all' | 'contradiction' | 'entailment' | 'neutral';
}> = [
  { value: 'all', label: 'All', tone: 'all' },
  { value: 'contradiction', label: 'Refutes', tone: 'contradiction' },
  { value: 'entailment', label: 'Supports', tone: 'entailment' },
  { value: 'neutral', label: 'Context only', tone: 'neutral' },
];

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const dispatch = useAppDispatch();
  const device = useDeviceProfile();

  const project = useAppSelector((state) =>
    state.projects.items.find((item) => item.id === projectId),
  );
  const renamingProjectId = useAppSelector((state) => state.projects.renamingId);
  const {
    projectId: loadedProjectId,
    projectName: workspaceProjectName,
    documents,
    jobs,
    graph,
    verdictCounts,
    filters,
    loading,
    uploading,
    deletingDocumentId,
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
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [contextTarget, setContextTarget] = useState<DocumentContextTarget | null>(null);
  const [uploaderOpenOverride, setUploaderOpenOverride] = useState<boolean | null>(null);
  const [corpusDirty, setCorpusDirty] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<DocumentItem | null>(null);

  const debouncedSearch = useDebounce(filters.search, 250);
  const isWorkspaceLoading = loading || loadedProjectId !== projectId;
  const projectTitle = project?.name ?? workspaceProjectName ?? 'Project Workspace';

  useDocumentTitle(projectTitle);

  useEffect(() => {
    let cancelled = false;
    workspaceService
      .getHealth()
      .then((res) => {
        if (!cancelled) setHealth(res);
      })
      .catch(() => {
        // Ignore non-critical health banner fetch errors
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        contextTarget === null &&
        !renameOpen &&
        pendingDeleteDoc === null
      ) {
        setInspectorOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contextTarget, renameOpen, pendingDeleteDoc]);

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
        crossDocumentOnly: filters.crossDocumentOnly,
      }),
    );
  }, [
    dispatch,
    projectId,
    isWorkspaceLoading,
    filters.label,
    filters.documentId,
    filters.includeNeutral,
    filters.crossDocumentOnly,
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
          setCorpusDirty(false);
          void dispatch(
            refreshClaimsAndGraph({
              projectId,
              label: filters.label === 'all' ? undefined : filters.label,
              documentId: filters.documentId || undefined,
              search: debouncedSearch,
              includeNeutral: filters.includeNeutral,
              crossDocumentOnly: filters.crossDocumentOnly,
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
    filters.crossDocumentOnly,
    debouncedSearch,
  ]);

  const readyDocs = useMemo(() => documents.filter((doc) => doc.status === 'ready'), [documents]);
  const failedDocs = useMemo(() => documents.filter((doc) => doc.status === 'failed'), [documents]);
  const readyDocsCount = readyDocs.length;

  // Detect when documents were added after the last completed NLI run
  const analysisIsStale = useMemo(() => {
    if (hasActiveJobs || readyDocsCount === 0) return false;
    if (corpusDirty) return true;
    const lastNli = jobs.find((j) => j.kind === 'nli' && j.status === 'succeeded' && j.finished_at);
    if (!lastNli || !lastNli.finished_at) {
      return stats.totalClaims === 0 && readyDocsCount > 0;
    }
    const lastNliMs = Date.parse(lastNli.finished_at);
    if (Number.isNaN(lastNliMs)) return false;
    return readyDocs.some((doc) => {
      const docMs = Date.parse(doc.created_at);
      return !Number.isNaN(docMs) && docMs > lastNliMs + 1000;
    });
  }, [hasActiveJobs, readyDocsCount, corpusDirty, jobs, stats.totalClaims, readyDocs]);

  const hasFailedJob = useMemo(() => jobs.some((j) => j.status === 'failed'), [jobs]);
  const showPipelineProgress =
    hasActiveJobs || hasFailedJob || (jobs.length > 0 && stats.totalClaims === 0);

  const hasActiveFilters = Boolean(
    filters.label !== 'all' ||
    filters.documentId ||
    filters.search.trim() ||
    filters.crossDocumentOnly,
  );

  // Collapse document dropzone once analysis is ready so Evidence Map appears above the fold
  const uploaderExpanded =
    uploaderOpenOverride ?? (stats.totalClaims === 0 || readyDocsCount === 0);

  const handleExport = async (format: ExportFormat) => {
    if (!projectId) return;
    setExportingFormat(format);
    try {
      const blob = await workspaceService.exportProject(projectId, format, {
        label: filters.label === 'all' ? undefined : filters.label,
        document_id: filters.documentId || undefined,
        cross_document_only: filters.crossDocumentOnly || undefined,
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

  const handleStartAnalysis = async () => {
    if (!projectId) return;
    const result = await dispatch(startAnalysisThunk({ projectId }));
    if (startAnalysisThunk.fulfilled.match(result)) {
      setCorpusDirty(false);
    }
  };

  const handleOpenRename = () => {
    setRenameValue(projectTitle);
    setRenameError(null);
    setRenameOpen(true);
  };

  const handleConfirmRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('Project name is required.');
      return;
    }
    const result = await dispatch(renameProject({ projectId, name: trimmed }));
    if (renameProject.fulfilled.match(result)) {
      setRenameOpen(false);
      setRenameError(null);
    } else if (renameProject.rejected.match(result)) {
      setRenameError(result.payload ?? 'Could not rename project.');
    }
  };

  const handleConfirmDeleteDocument = async () => {
    if (!projectId || !pendingDeleteDoc) return;
    const doc = pendingDeleteDoc;
    const result = await dispatch(
      deleteDocumentThunk({
        projectId,
        documentId: doc.id,
        documentName: doc.original_name,
      }),
    );
    setPendingDeleteDoc(null);
    if (deleteDocumentThunk.fulfilled.match(result)) {
      setCorpusDirty(true);
      void dispatch(
        refreshClaimsAndGraph({
          projectId,
          label: filters.label === 'all' ? undefined : filters.label,
          documentId: filters.documentId === doc.id ? undefined : filters.documentId || undefined,
          search: debouncedSearch,
          includeNeutral: filters.includeNeutral,
          crossDocumentOnly: filters.crossDocumentOnly,
        }),
      );
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

  const documentFilterOptions = [
    { value: '', label: 'All documents' },
    ...documents.map((doc) => ({ value: doc.id, label: doc.original_name })),
  ];

  const isStubBackend = health?.ml_backend === 'stub';

  return (
    <div className="stack-md">
      <header className="page-header">
        <div className="page-header-copy">
          <Link to="/projects" className="cluster text-muted">
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Back to projects</span>
          </Link>
          <div className="cluster">
            <h1>{projectTitle}</h1>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={handleOpenRename}
              aria-label="Rename project"
              id="workspace-rename-btn"
            >
              <Pencil size={15} aria-hidden="true" />
            </Button>
          </div>
          <p className="text-secondary">
            {documents.length} documents · {stats.totalClaims} claims · {stats.entailment} supports
            · {stats.contradiction} refutes
          </p>
        </div>

        <div className="page-header-actions">
          <Button
            variant="primary"
            disabled={readyDocsCount === 0 || hasActiveJobs}
            loading={analyzing || hasActiveJobs}
            onClick={() => void handleStartAnalysis()}
            id="run-analysis-btn"
          >
            <Play size={16} aria-hidden="true" />
            {hasActiveJobs ? 'Analyzing…' : analysisIsStale ? 'Re-run analysis' : 'Run analysis'}
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

      {health ? (
        isStubBackend ? (
          <div
            className="alert-banner warning ml-status-banner"
            role="status"
            id="ml-status-banner"
          >
            <Info size={17} aria-hidden="true" />
            <span>
              <strong>Demo heuristic mode (stub):</strong> Lightweight lexical matching is active
              for low-memory hosting instead of neural transformers. Links may rely on shared
              keywords — use <em>Researcher label override</em> or run with{' '}
              <code>ML_BACKEND=transformers</code> for neural NLI.
            </span>
          </div>
        ) : (
          <div className="ml-engine-pill text-muted" id="ml-status-banner">
            <Cpu size={14} aria-hidden="true" />
            <span>
              Neural NLI active: <strong>{health.nli_model}</strong> · Embeddings:{' '}
              <strong>{health.embedding_model}</strong>
            </span>
          </div>
        )
      ) : null}

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
          {analysisIsStale && stats.totalClaims > 0 ? (
            <div className="alert-banner warning" role="status" id="stale-analysis-banner">
              <AlertTriangle size={17} aria-hidden="true" />
              <span className="flex-1">
                Documents changed since the last analysis — re-run analysis to update claims and
                evidence links.
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleStartAnalysis()}
                disabled={readyDocsCount === 0 || hasActiveJobs}
              >
                <Play size={14} aria-hidden="true" />
                Re-run now
              </Button>
            </div>
          ) : null}

          <section
            className="surface-card surface-card-compact stack-sm"
            aria-label="Corpus documents"
          >
            <div className="cluster">
              <strong className="flex-1">
                Documents ({documents.length}) ·{' '}
                <span className="text-muted">{readyDocsCount} ready</span>
              </strong>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setUploaderOpenOverride(!uploaderExpanded)}
                aria-expanded={uploaderExpanded}
                id="toggle-uploader-btn"
              >
                {uploaderExpanded ? (
                  <>
                    <ChevronUp size={14} aria-hidden="true" />
                    Hide uploader
                  </>
                ) : (
                  <>
                    <Plus size={14} aria-hidden="true" />
                    Add papers
                  </>
                )}
              </Button>
            </div>

            {documents.length > 0 ? (
              <div className="cluster" aria-label="Uploaded document list">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="badge badge-neutral doc-chip"
                    title={doc.error_message ?? doc.original_name}
                  >
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
                    <button
                      type="button"
                      className="doc-chip-remove"
                      onClick={() => setPendingDeleteDoc(doc)}
                      disabled={deletingDocumentId === doc.id}
                      aria-label={`Remove ${doc.original_name}`}
                      title={`Remove ${doc.original_name}`}
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {failedDocs.length > 0 ? (
              <div className="stack-sm">
                {failedDocs.map((doc) => (
                  <div key={`err-${doc.id}`} className="alert-banner error" role="status">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>
                      <strong>{doc.original_name}:</strong>{' '}
                      {doc.error_message ?? 'Text extraction failed for this file.'}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {uploaderExpanded ? (
              <DocumentUploader
                uploading={uploading}
                onUpload={async (file) => {
                  const res = await dispatch(uploadDocumentThunk({ projectId, file }));
                  if (uploadDocumentThunk.fulfilled.match(res) && stats.totalClaims > 0) {
                    setCorpusDirty(true);
                  }
                }}
              />
            ) : null}
          </section>

          {showPipelineProgress ? <AnalysisProgress jobs={jobs} /> : null}

          <section
            className="surface-card surface-card-compact stack-sm"
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
                id="claims-doc-filter"
                label="Source document"
                options={documentFilterOptions}
                value={filters.documentId}
                onChange={(event) => dispatch(setWorkspaceDocumentFilter(event.target.value))}
              />
            </div>

            <div
              className="verdict-filter-pills"
              role="group"
              aria-label="Filter claims by verdict"
              id="claims-label-filter"
            >
              {VERDICT_PILLS.map((pill) => {
                const isActive = filters.label === pill.value;
                const count = verdictCounts[pill.value];
                return (
                  <button
                    key={pill.value}
                    type="button"
                    id={`verdict-pill-${pill.value}`}
                    className={`verdict-pill-btn tone-${pill.tone}${isActive ? ' is-active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => {
                      const next = isActive && pill.value !== 'all' ? 'all' : pill.value;
                      dispatch(setWorkspaceLabelFilter(next));
                      if (next === 'neutral' && !filters.includeNeutral) {
                        dispatch(setIncludeNeutral(true));
                      }
                    }}
                  >
                    {pill.tone !== 'all' ? (
                      <span className={`verdict-pill-dot tone-${pill.tone}`} aria-hidden="true" />
                    ) : null}
                    <span>{pill.label}</span>
                    <span className="verdict-pill-count">{count}</span>
                  </button>
                );
              })}
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
                  Claims Table ({sortedClaims.length})
                </button>
              </div>

              <label
                className={`cluster text-secondary filter-checkbox${
                  readyDocsCount < 2 && !filters.crossDocumentOnly ? ' is-disabled' : ''
                }`}
                title={
                  readyDocsCount < 2
                    ? 'Upload at least 2 ready documents to filter for cross-document evidence'
                    : 'Only show evidence passages from other uploaded documents'
                }
              >
                <input
                  type="checkbox"
                  id="filter-cross-doc-checkbox"
                  disabled={readyDocsCount < 2 && !filters.crossDocumentOnly}
                  checked={filters.crossDocumentOnly}
                  onChange={(event) => dispatch(setCrossDocumentOnly(event.target.checked))}
                />
                <span>Cross-document only</span>
              </label>

              <label
                className="cluster text-secondary filter-checkbox"
                title="Include passages that neither support nor refute the claim (hidden by default to reduce clutter)"
              >
                <input
                  type="checkbox"
                  id="filter-neutral-checkbox"
                  checked={filters.includeNeutral}
                  onChange={(event) => dispatch(setIncludeNeutral(event.target.checked))}
                />
                <span>Show neutral context edges</span>
              </label>

              {hasActiveFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch(resetWorkspaceFilters())}
                  id="toolbar-reset-filters-btn"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Reset filters
                </Button>
              ) : null}
            </div>
          </section>

          <div className="workspace-stage">
            <div className="workspace-stage-main stack-md">
              {viewMode === 'map' ? (
                <EvidenceMap
                  graph={graph}
                  selectedClaimId={selectedClaimId}
                  selectedPassageId={selectedPassageId}
                  hasActiveFilters={hasActiveFilters}
                  onSelectClaim={(claimId) => {
                    setSelectedPassageId(null);
                    setInspectorOpen(true);
                    dispatch(selectClaim(claimId));
                  }}
                  onSelectPassage={(passageId) => {
                    setSelectedPassageId(passageId);
                    setInspectorOpen(true);
                  }}
                  onResetFilters={() => dispatch(resetWorkspaceFilters())}
                  onShowNeutral={() => dispatch(setIncludeNeutral(true))}
                />
              ) : (
                <ClaimsTable
                  claims={sortedClaims}
                  selectedClaimId={selectedClaimId}
                  sortField={filters.sortField}
                  sortDirection={filters.sortDirection}
                  hasActiveFilters={hasActiveFilters}
                  onSelectClaim={(claimId) => {
                    setSelectedPassageId(null);
                    setInspectorOpen(true);
                    dispatch(selectClaim(claimId));
                  }}
                  onOpenContext={(target) => setContextTarget(target)}
                  onResetFilters={() => dispatch(resetWorkspaceFilters())}
                  onSort={(field) => dispatch(setClaimSort({ field }))}
                />
              )}
            </div>

            {selectedClaim && !inspectorOpen ? (
              <Button
                variant="primary"
                size="sm"
                className="inspector-reopen-btn"
                onClick={() => setInspectorOpen(true)}
                id="open-inspector-btn"
              >
                <PanelRightOpen size={15} aria-hidden="true" />
                Claim Inspector
              </Button>
            ) : null}

            {selectedClaim && inspectorOpen ? (
              <div className="inspector-overlay" role="region" aria-label="Claim Inspector overlay">
                <ClaimDetailDrawer
                  claim={selectedClaim}
                  focusedPassageId={selectedPassageId}
                  overridingEvidenceId={overridingEvidenceId}
                  onOverrideLabel={(evidenceId, userLabel) =>
                    void dispatch(overrideEvidenceThunk({ evidenceId, userLabel }))
                  }
                  onOpenContext={(target) => setContextTarget(target)}
                  onClose={() => setInspectorOpen(false)}
                />
              </div>
            ) : null}
          </div>

          <QuickVerifyPanel
            projectId={projectId}
            disabled={readyDocsCount === 0}
            onOpenContext={(target) => setContextTarget(target)}
          />

          <section className="metric-grid" aria-label="Verification summary">
            <div className="metric-box">
              <span className="metric-label">Claims</span>
              <span className="metric-value">{stats.totalClaims}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Supports</span>
              <span className="metric-value">{stats.entailment}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Refutes</span>
              <span className="metric-value">{stats.contradiction}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Unverified</span>
              <span className="metric-value">{stats.unverified}</span>
            </div>
          </section>

          <DocumentContextModal
            projectId={projectId}
            target={contextTarget}
            onClose={() => setContextTarget(null)}
          />

          <Modal open={renameOpen} title="Rename project" onClose={() => setRenameOpen(false)}>
            <form className="stack-md" onSubmit={(event) => void handleConfirmRename(event)}>
              <Input
                id="workspace-rename-input"
                label="Project name"
                value={renameValue}
                onChange={(event) => {
                  setRenameValue(event.target.value);
                  if (renameError) setRenameError(null);
                }}
                error={renameError ?? undefined}
                required
              />
              <div className="cluster">
                <Button
                  type="submit"
                  variant="primary"
                  loading={renamingProjectId === projectId}
                  id="workspace-rename-save-btn"
                >
                  Save name
                </Button>
                <Button type="button" variant="secondary" onClick={() => setRenameOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Modal>

          <Modal
            open={pendingDeleteDoc !== null}
            title="Remove document from project?"
            onClose={() => setPendingDeleteDoc(null)}
          >
            <div className="stack-md">
              <p className="text-secondary">
                Removing <strong>{pendingDeleteDoc?.original_name}</strong> deletes the stored file
                and any claims or passages extracted from it. You can re-run analysis afterwards to
                refresh the evidence map.
              </p>
              <div className="cluster">
                <Button
                  variant="danger"
                  loading={deletingDocumentId === pendingDeleteDoc?.id}
                  onClick={() => void handleConfirmDeleteDocument()}
                  id="confirm-delete-doc-btn"
                >
                  Remove document
                </Button>
                <Button variant="secondary" onClick={() => setPendingDeleteDoc(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
