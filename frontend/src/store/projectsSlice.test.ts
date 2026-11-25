import { describe, expect, it } from 'vitest';

import projectsReducer, {
  createDemoProject,
  renameProject,
  selectFilteredSortedProjects,
  setProjectSearch,
  setProjectSort,
  type ProjectsState,
} from './projectsSlice';

const BASE_STATE: ProjectsState = {
  items: [
    {
      id: '1',
      name: 'Climate Models',
      document_count: 2,
      claim_count: 10,
      created_at: '2026-11-20T10:00:00+00:00',
    },
    {
      id: '2',
      name: 'Biomedical SciFact',
      document_count: 5,
      claim_count: 42,
      created_at: '2026-11-23T10:00:00+00:00',
    },
    {
      id: '3',
      name: 'Quantum Benchmarks',
      document_count: 1,
      claim_count: 4,
      created_at: '2026-11-21T10:00:00+00:00',
    },
  ],
  total: 3,
  status: 'succeeded',
  creating: false,
  creatingDemo: false,
  renamingId: null,
  deletingId: null,
  error: null,
  searchQuery: '',
  sortField: 'created_at',
  sortDirection: 'desc',
};

describe('projectsSlice', () => {
  it('filters projects case-insensitively by search query', () => {
    const next = projectsReducer(BASE_STATE, setProjectSearch('scifact'));
    const result = selectFilteredSortedProjects({ projects: next });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Biomedical SciFact');
  });

  it('sorts projects by claim count and toggles sort direction', () => {
    const descState = projectsReducer(BASE_STATE, setProjectSort({ field: 'claim_count' }));
    const descResult = selectFilteredSortedProjects({ projects: descState });
    expect(descResult.map((p) => p.claim_count)).toEqual([42, 10, 4]);

    const ascState = projectsReducer(descState, setProjectSort({ field: 'claim_count' }));
    const ascResult = selectFilteredSortedProjects({ projects: ascState });
    expect(ascResult.map((p) => p.claim_count)).toEqual([4, 10, 42]);
  });

  it('tracks creatingDemo state and prepends created demo project', () => {
    const pendingState = projectsReducer(BASE_STATE, createDemoProject.pending('req-1', undefined));
    expect(pendingState.creatingDemo).toBe(true);

    const demoProject = {
      id: 'demo-1',
      name: 'Пример (КиберЛенинка): Удалённая работа и продуктивность',
      document_count: 2,
      claim_count: 12,
      created_at: '2026-11-24T12:00:00+00:00',
    };
    const fulfilledState = projectsReducer(
      pendingState,
      createDemoProject.fulfilled(demoProject, 'req-1', undefined),
    );
    expect(fulfilledState.creatingDemo).toBe(false);
    expect(fulfilledState.total).toBe(4);
    expect(fulfilledState.items[0].id).toBe('demo-1');
  });

  it('updates project name in place on renameProject.fulfilled', () => {
    const renamed = { ...BASE_STATE.items[0], name: 'Climate Models v2' };
    const next = projectsReducer(
      BASE_STATE,
      renameProject.fulfilled(renamed, 'req-2', { projectId: '1', name: 'Climate Models v2' }),
    );
    expect(next.renamingId).toBeNull();
    expect(next.items.find((p) => p.id === '1')?.name).toBe('Climate Models v2');
  });
});
