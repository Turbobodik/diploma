import {
  createAsyncThunk,
  createSelector,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';

import type { CreateProjectRequest, ProjectItem } from '../models/api';
import type { ProjectSortField, SortDirection } from '../models/ui';
import { normalizeAxiosError } from '../services/httpClient';
import { projectService } from '../services/projectService';
import { pushToast } from './uiSlice';

export interface ProjectsState {
  items: ProjectItem[];
  total: number;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  creating: boolean;
  creatingDemo: boolean;
  renamingId: string | null;
  deletingId: string | null;
  error: string | null;
  searchQuery: string;
  sortField: ProjectSortField;
  sortDirection: SortDirection;
}

const initialState: ProjectsState = {
  items: [],
  total: 0,
  status: 'idle',
  creating: false,
  creatingDemo: false,
  renamingId: null,
  deletingId: null,
  error: null,
  searchQuery: '',
  sortField: 'created_at',
  sortDirection: 'desc',
};

export const fetchProjects = createAsyncThunk<
  { projects: ProjectItem[]; total: number },
  void,
  { rejectValue: string }
>('projects/fetchAll', async (_, { rejectWithValue }) => {
  try {
    const res = await projectService.listProjects(100, 0);
    return { projects: res.projects, total: res.total };
  } catch (err) {
    return rejectWithValue(normalizeAxiosError(err).message);
  }
});

export const createProject = createAsyncThunk<
  ProjectItem,
  CreateProjectRequest,
  { rejectValue: string }
>('projects/create', async (payload, { dispatch, rejectWithValue }) => {
  try {
    const created = await projectService.createProject(payload);
    dispatch(
      pushToast({
        variant: 'success',
        title: 'Project created',
        description: created.name,
      }),
    );
    return created;
  } catch (err) {
    return rejectWithValue(normalizeAxiosError(err).message);
  }
});

export const renameProject = createAsyncThunk<
  ProjectItem,
  { projectId: string; name: string },
  { rejectValue: string }
>('projects/rename', async ({ projectId, name }, { dispatch, rejectWithValue }) => {
  try {
    const updated = await projectService.renameProject(projectId, { name });
    dispatch(
      pushToast({
        variant: 'success',
        title: 'Project renamed',
        description: updated.name,
      }),
    );
    return updated;
  } catch (err) {
    const normalized = normalizeAxiosError(err);
    dispatch(
      pushToast({
        variant: 'error',
        title: 'Could not rename project',
        description: normalized.message,
      }),
    );
    return rejectWithValue(normalized.message);
  }
});

export const createDemoProject = createAsyncThunk<
  ProjectItem,
  string | undefined,
  { rejectValue: string }
>('projects/createDemo', async (preset, { dispatch, rejectWithValue }) => {
  try {
    const created = await projectService.createDemoProject(preset);
    dispatch(
      pushToast({
        variant: 'success',
        title: 'Demo workspace created',
        description: 'Loaded 2 Russian CyberLeninka papers — opening the evidence map.',
      }),
    );
    return created;
  } catch (err) {
    const normalized = normalizeAxiosError(err);
    dispatch(
      pushToast({
        variant: 'error',
        title: 'Could not launch demo',
        description: normalized.message,
      }),
    );
    return rejectWithValue(normalized.message);
  }
});

export const deleteProject = createAsyncThunk<string, string, { rejectValue: string }>(
  'projects/delete',
  async (projectId, { dispatch, rejectWithValue }) => {
    try {
      await projectService.deleteProject(projectId);
      dispatch(
        pushToast({
          variant: 'info',
          title: 'Project deleted',
          description: 'All associated documents, claims, and evidence were removed.',
        }),
      );
      return projectId;
    } catch (err) {
      const normalized = normalizeAxiosError(err);
      dispatch(
        pushToast({
          variant: 'error',
          title: 'Could not delete project',
          description: normalized.message,
        }),
      );
      return rejectWithValue(normalized.message);
    }
  },
);

export const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    setProjectSearch(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    setProjectSort(
      state,
      action: PayloadAction<{ field: ProjectSortField; direction?: SortDirection }>,
    ) {
      if (state.sortField === action.payload.field && !action.payload.direction) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortField = action.payload.field;
        state.sortDirection = action.payload.direction ?? 'desc';
      }
    },
    clearProjectsError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.projects;
        state.total = action.payload.total;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'Failed to load projects.';
      })
      .addCase(createProject.pending, (state) => {
        state.creating = true;
        state.error = null;
      })
      .addCase(createProject.fulfilled, (state, action) => {
        state.creating = false;
        state.items.unshift(action.payload);
        state.total += 1;
      })
      .addCase(createProject.rejected, (state, action) => {
        state.creating = false;
        state.error = action.payload ?? 'Failed to create project.';
      })
      .addCase(renameProject.pending, (state, action) => {
        state.renamingId = action.meta.arg.projectId;
        state.error = null;
      })
      .addCase(renameProject.fulfilled, (state, action) => {
        state.renamingId = null;
        const idx = state.items.findIndex((p) => p.id === action.payload.id);
        if (idx >= 0) {
          state.items[idx] = action.payload;
        } else {
          state.items.unshift(action.payload);
        }
      })
      .addCase(renameProject.rejected, (state, action) => {
        state.renamingId = null;
        state.error = action.payload ?? 'Failed to rename project.';
      })
      .addCase(createDemoProject.pending, (state) => {
        state.creatingDemo = true;
        state.error = null;
      })
      .addCase(createDemoProject.fulfilled, (state, action) => {
        state.creatingDemo = false;
        state.items.unshift(action.payload);
        state.total += 1;
      })
      .addCase(createDemoProject.rejected, (state, action) => {
        state.creatingDemo = false;
        state.error = action.payload ?? 'Failed to launch demo project.';
      })
      .addCase(deleteProject.pending, (state, action) => {
        state.deletingId = action.meta.arg;
      })
      .addCase(deleteProject.fulfilled, (state, action) => {
        state.deletingId = null;
        state.items = state.items.filter((project) => project.id !== action.payload);
        state.total = Math.max(0, state.total - 1);
      })
      .addCase(deleteProject.rejected, (state) => {
        state.deletingId = null;
      });
  },
});

export const { setProjectSearch, setProjectSort, clearProjectsError } = projectsSlice.actions;

const selectProjectsSlice = (state: { projects: ProjectsState }) => state.projects;

export const selectFilteredSortedProjects = createSelector(
  [selectProjectsSlice],
  ({ items, searchQuery, sortField, sortDirection }) => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? items.filter((item) => item.name.toLowerCase().includes(query))
      : [...items];

    filtered.sort((a, b) => {
      let comparison: number;
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'document_count') {
        comparison = a.document_count - b.document_count;
      } else if (sortField === 'claim_count') {
        comparison = a.claim_count - b.claim_count;
      } else {
        comparison = a.created_at.localeCompare(b.created_at);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  },
);

export default projectsSlice.reducer;
