import { describe, expect, it } from 'vitest';

import projectsReducer, {
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
});
