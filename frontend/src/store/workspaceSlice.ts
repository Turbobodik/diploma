import {
  createAsyncThunk,
  createSelector,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';

import type { ClaimItem, DocumentItem, GraphResponse, JobItem, NliLabel } from '../models/api';
import type { ClaimSortField, SortDirection } from '../models/ui';
import { normalizeAxiosError } from '../services/httpClient';
import { workspaceService } from '../services/workspaceService';
import { pushToast } from './uiSlice';

export interface WorkspaceFilters {
  label: NliLabel | 'all';
  documentId: string;
  search: string;
  includeNeutral: boolean;
  sortField: ClaimSortField;
  sortDirection: SortDirection;
}

export interface WorkspaceState {
  projectId: string | null;
  documents: DocumentItem[];
  jobs: JobItem[];
  claims: ClaimItem[];
  claimsTotal: number;
  graph: GraphResponse | null;
  selectedClaimId: string | null;
  filters: WorkspaceFilters;
  loading: boolean;
  uploading: boolean;
  analyzing: boolean;
  overridingEvidenceId: string | null;
  error: string | null;
}

const initialFilters: WorkspaceFilters = {
  label: 'all',
  documentId: '',
  search: '',
  includeNeutral: true,
  sortField: 'confidence',
  sortDirection: 'desc',
};

const initialState: WorkspaceState = {
  projectId: null,
  documents: [],
  jobs: [],
  claims: [],
  claimsTotal: 0,
  graph: null,
  selectedClaimId: null,
  filters: initialFilters,
  loading: false,
  uploading: false,
  analyzing: false,
  overridingEvidenceId: null,
  error: null,
};

export const loadWorkspace = createAsyncThunk<
  {
    projectId: string;
    documents: DocumentItem[];
    jobs: JobItem[];
    claims: ClaimItem[];
    claimsTotal: number;
    graph: GraphResponse;
  },
  string,
  { rejectValue: string }
>('workspace/load', async (projectId, { rejectWithValue }) => {
  try {
    const [docsRes, claimsRes, graphRes] = await Promise.all([
      workspaceService.listDocuments(projectId, 100, 0),
      workspaceService.listClaims(projectId, { limit: 100, offset: 0 }),
      workspaceService.getGraph(projectId, { include_neutral: true }),
    ]);
    return {
      projectId,
      documents: docsRes.documents,
      jobs: claimsRes.jobs,
      claims: claimsRes.claims,
      claimsTotal: claimsRes.total,
      graph: graphRes,
    };
  } catch (err) {
    return rejectWithValue(normalizeAxiosError(err).message);
  }
});

export const refreshClaimsAndGraph = createAsyncThunk<
  { claims: ClaimItem[]; claimsTotal: number; jobs: JobItem[]; graph: GraphResponse },
  {
    projectId: string;
    label?: NliLabel;
    documentId?: string;
    search?: string;
    includeNeutral: boolean;
  },
  { rejectValue: string }
>('workspace/refreshClaimsAndGraph', async (arg, { rejectWithValue }) => {
  try {
    const [claimsRes, graphRes] = await Promise.all([
      workspaceService.listClaims(arg.projectId, {
        label: arg.label,
        document_id: arg.documentId || undefined,
        search: arg.search?.trim() || undefined,
        limit: 100,
        offset: 0,
      }),
      workspaceService.getGraph(arg.projectId, {
        label: arg.label,
        document_id: arg.documentId || undefined,
        include_neutral: arg.includeNeutral,
      }),
    ]);
    return {
      claims: claimsRes.claims,
      claimsTotal: claimsRes.total,
      jobs: claimsRes.jobs,
      graph: graphRes,
    };
  } catch (err) {
    return rejectWithValue(normalizeAxiosError(err).message);
  }
});

export const uploadDocumentThunk = createAsyncThunk<
  DocumentItem,
  { projectId: string; file: File },
  { rejectValue: string }
>('workspace/uploadDocument', async ({ projectId, file }, { dispatch, rejectWithValue }) => {
  try {
    const uploaded = await workspaceService.uploadDocument(projectId, file);
    dispatch(
      pushToast({
        variant: 'success',
        title: 'Document uploaded',
        description: `${uploaded.original_name} is ready for claim extraction.`,
      }),
    );
    return uploaded;
  } catch (err) {
    const normalized = normalizeAxiosError(err);
    dispatch(
      pushToast({
        variant: 'error',
        title: 'Upload failed',
        description: normalized.message,
      }),
    );
    return rejectWithValue(normalized.message);
  }
});

export const startAnalysisThunk = createAsyncThunk<
  JobItem[],
  { projectId: string },
  { rejectValue: string }
>('workspace/startAnalysis', async ({ projectId }, { dispatch, rejectWithValue }) => {
  try {
    await workspaceService.startAnalysis(projectId, false);
    const jobsRes = await workspaceService.listJobs(projectId);
    dispatch(
      pushToast({
        variant: 'info',
        title: 'Analysis started',
        description: 'Extracting claims, retrieving candidate passages, and scoring NLI pairs.',
      }),
    );
    return jobsRes.jobs;
  } catch (err) {
    const normalized = normalizeAxiosError(err);
    dispatch(
      pushToast({
        variant: 'error',
        title: 'Analysis could not start',
        description: normalized.message,
      }),
    );
    return rejectWithValue(normalized.message);
  }
});

export const pollJobsThunk = createAsyncThunk<JobItem[], string, { rejectValue: string }>(
  'workspace/pollJobs',
  async (projectId, { rejectWithValue }) => {
    try {
      const res = await workspaceService.listJobs(projectId);
      return res.jobs;
    } catch (err) {
      return rejectWithValue(normalizeAxiosError(err).message);
    }
  },
);

export const overrideEvidenceThunk = createAsyncThunk<
  { evidenceId: string; userLabel: NliLabel | null },
  { evidenceId: string; userLabel: NliLabel | null },
  { rejectValue: string }
>(
  'workspace/overrideEvidence',
  async ({ evidenceId, userLabel }, { dispatch, rejectWithValue }) => {
    try {
      const res = await workspaceService.overrideEvidenceLabel(evidenceId, userLabel);
      dispatch(
        pushToast({
          variant: 'success',
          title: userLabel ? `Label overridden to ${userLabel}` : 'Model label restored',
          description: 'Original NLI model prediction remains preserved.',
        }),
      );
      return { evidenceId: res.id, userLabel: res.user_label };
    } catch (err) {
      const normalized = normalizeAxiosError(err);
      dispatch(
        pushToast({
          variant: 'error',
          title: 'Override failed',
          description: normalized.message,
        }),
      );
      return rejectWithValue(normalized.message);
    }
  },
);

export const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    selectClaim(state, action: PayloadAction<string | null>) {
      state.selectedClaimId = action.payload;
    },
    setWorkspaceLabelFilter(state, action: PayloadAction<NliLabel | 'all'>) {
      state.filters.label = action.payload;
    },
    setWorkspaceDocumentFilter(state, action: PayloadAction<string>) {
      state.filters.documentId = action.payload;
    },
    setWorkspaceSearch(state, action: PayloadAction<string>) {
      state.filters.search = action.payload;
    },
    setIncludeNeutral(state, action: PayloadAction<boolean>) {
      state.filters.includeNeutral = action.payload;
    },
    setClaimSort(
      state,
      action: PayloadAction<{ field: ClaimSortField; direction?: SortDirection }>,
    ) {
      if (state.filters.sortField === action.payload.field && !action.payload.direction) {
        state.filters.sortDirection = state.filters.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.filters.sortField = action.payload.field;
        state.filters.sortDirection = action.payload.direction ?? 'desc';
      }
    },
    resetWorkspace(state) {
      Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadWorkspace.pending, (state, action) => {
        state.loading = true;
        state.error = null;
        if (state.projectId !== action.meta.arg) {
          state.projectId = action.meta.arg;
          state.selectedClaimId = null;
          state.filters = initialFilters;
        }
      })
      .addCase(loadWorkspace.fulfilled, (state, action) => {
        state.loading = false;
        state.projectId = action.payload.projectId;
        state.documents = action.payload.documents;
        state.jobs = action.payload.jobs;
        state.claims = action.payload.claims;
        state.claimsTotal = action.payload.claimsTotal;
        state.graph = action.payload.graph;
        if (
          !state.selectedClaimId ||
          !action.payload.claims.some((c) => c.id === state.selectedClaimId)
        ) {
          state.selectedClaimId = action.payload.claims[0]?.id ?? null;
        }
      })
      .addCase(loadWorkspace.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to load project workspace.';
      })
      .addCase(refreshClaimsAndGraph.fulfilled, (state, action) => {
        state.claims = action.payload.claims;
        state.claimsTotal = action.payload.claimsTotal;
        state.jobs = action.payload.jobs;
        state.graph = action.payload.graph;
        if (
          state.selectedClaimId &&
          !action.payload.claims.some((c) => c.id === state.selectedClaimId)
        ) {
          state.selectedClaimId = action.payload.claims[0]?.id ?? null;
        }
      })
      .addCase(uploadDocumentThunk.pending, (state) => {
        state.uploading = true;
      })
      .addCase(uploadDocumentThunk.fulfilled, (state, action) => {
        state.uploading = false;
        state.documents.unshift(action.payload);
      })
      .addCase(uploadDocumentThunk.rejected, (state) => {
        state.uploading = false;
      })
      .addCase(startAnalysisThunk.pending, (state) => {
        state.analyzing = true;
      })
      .addCase(startAnalysisThunk.fulfilled, (state, action) => {
        state.analyzing = false;
        state.jobs = action.payload;
      })
      .addCase(startAnalysisThunk.rejected, (state) => {
        state.analyzing = false;
      })
      .addCase(pollJobsThunk.fulfilled, (state, action) => {
        state.jobs = action.payload;
      })
      .addCase(overrideEvidenceThunk.pending, (state, action) => {
        state.overridingEvidenceId = action.meta.arg.evidenceId;
      })
      .addCase(overrideEvidenceThunk.fulfilled, (state, action) => {
        state.overridingEvidenceId = null;
        const { evidenceId, userLabel } = action.payload;
        for (const claim of state.claims) {
          let hasNonNeutral = false;
          for (const ev of claim.evidence) {
            if (ev.id === evidenceId) {
              ev.user_label = userLabel;
              ev.effective_label = userLabel ?? ev.model_label;
            }
            if (ev.effective_label !== 'neutral') {
              hasNonNeutral = true;
            }
          }
          claim.has_evidence = hasNonNeutral;
        }
        if (state.graph) {
          for (const edge of state.graph.edges) {
            if (edge.id === evidenceId || edge.id === `ev:${evidenceId}`) {
              edge.user_label = userLabel;
              edge.label = userLabel ?? edge.model_label;
            }
          }
        }
      })
      .addCase(overrideEvidenceThunk.rejected, (state) => {
        state.overridingEvidenceId = null;
      });
  },
});

export const {
  selectClaim,
  setWorkspaceLabelFilter,
  setWorkspaceDocumentFilter,
  setWorkspaceSearch,
  setIncludeNeutral,
  setClaimSort,
  resetWorkspace,
} = workspaceSlice.actions;

const selectWorkspaceSlice = (state: { workspace: WorkspaceState }) => state.workspace;

export const selectSortedClaims = createSelector([selectWorkspaceSlice], ({ claims, filters }) => {
  const copy = [...claims];
  copy.sort((a, b) => {
    let comparison: number;
    if (filters.sortField === 'evidence_count') {
      comparison = a.evidence.length - b.evidence.length;
    } else if (filters.sortField === 'source_name') {
      comparison = a.source_name.localeCompare(b.source_name);
    } else {
      comparison = a.confidence - b.confidence;
    }
    return filters.sortDirection === 'asc' ? comparison : -comparison;
  });
  return copy;
});

export const selectSelectedClaim = createSelector([selectWorkspaceSlice], (workspace) => {
  if (!workspace.selectedClaimId) {
    return null;
  }
  return workspace.claims.find((claim) => claim.id === workspace.selectedClaimId) ?? null;
});

export const selectHasActiveJobs = createSelector([selectWorkspaceSlice], ({ jobs }) =>
  jobs.some((job) => job.status === 'queued' || job.status === 'running'),
);

export const selectWorkspaceStats = createSelector([selectWorkspaceSlice], ({ claims }) => {
  let entailment = 0;
  let contradiction = 0;
  let neutral = 0;
  let unverified = 0;
  for (const claim of claims) {
    if (!claim.has_evidence) {
      unverified += 1;
    }
    for (const edge of claim.evidence) {
      if (edge.effective_label === 'entailment') entailment += 1;
      else if (edge.effective_label === 'contradiction') contradiction += 1;
      else neutral += 1;
    }
  }
  return {
    totalClaims: claims.length,
    entailment,
    contradiction,
    neutral,
    unverified,
  };
});

export default workspaceSlice.reducer;
