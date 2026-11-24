import { expect, test, type Page } from '@playwright/test';

const TEST_USER = {
  id: 'u-1',
  email: 'researcher@ehu.lt',
  display_name: 'Bahdan Kanoplich',
};

interface MockApiState {
  projects: Array<{
    id: string;
    name: string;
    document_count: number;
    claim_count: number;
    created_at: string;
  }>;
  documents: Array<{
    id: string;
    original_name: string;
    media_type: string;
    size_bytes: number;
    status: string;
    error_message: string | null;
    page_count: number | null;
    created_at: string;
  }>;
  analyzed: boolean;
  userOverride: string | null;
  forceProjectsStatus?: number;
}

async function setupMockApi(page: Page, state: MockApiState) {
  await page.route('https://fonts.**', (route) => route.abort());
  await page.route('**/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        version: '1.0.0',
        ml_backend: 'transformers',
        embedding_model: 'BAAI/bge-small-en-v1.5',
        nli_model: 'cross-encoder/nli-deberta-v3-xsmall',
      }),
    });
  });

  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (path === '/api/v1/auth/login' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'e2e-jwt-token',
          token_type: 'bearer',
          expires_in: 86400,
          user: TEST_USER,
        }),
      });
      return;
    }

    if (path === '/api/v1/auth/me' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_USER),
      });
      return;
    }

    if (path === '/api/v1/projects' && method === 'GET') {
      if (state.forceProjectsStatus === 500) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'internal_error',
            message: 'Simulated backend outage for E2E verification.',
            request_id: 'req-e2e-500',
          }),
        });
        return;
      }
      if (state.forceProjectsStatus === 401) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'unauthorized',
            message: 'Token expired',
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projects: state.projects,
          total: state.projects.length,
          limit: 100,
          offset: 0,
        }),
      });
      return;
    }

    if (path === '/api/v1/projects' && method === 'POST') {
      const body = req.postDataJSON() as { name: string };
      const created = {
        id: `proj-${state.projects.length + 1}`,
        name: body.name,
        document_count: 0,
        claim_count: 0,
        created_at: '2026-11-24T10:00:00+00:00',
      };
      state.projects.unshift(created);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }

    if (path.endsWith('/documents') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: state.documents,
          total: state.documents.length,
          limit: 100,
          offset: 0,
        }),
      });
      return;
    }

    if (path.endsWith('/documents') && method === 'POST') {
      const uploaded = {
        id: 'doc-1',
        original_name: 'scifact_sample.txt',
        media_type: 'text/plain',
        size_bytes: 256,
        status: 'ready',
        error_message: null,
        page_count: null,
        created_at: '2026-11-24T10:05:00+00:00',
      };
      state.documents.unshift(uploaded);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(uploaded),
      });
      return;
    }

    if (path.endsWith('/analyze') && method === 'POST') {
      state.analyzed = true;
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'succeeded',
          project_id: 'proj-1',
          job_ids: ['j-1', 'j-2', 'j-3'],
        }),
      });
      return;
    }

    if (path.endsWith('/jobs') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: state.analyzed
            ? [
                {
                  id: 'j-3',
                  kind: 'nli',
                  status: 'succeeded',
                  progress_pct: 100,
                  error_message: null,
                  created_at: '2026-11-24T10:06:00+00:00',
                  started_at: '2026-11-24T10:06:00+00:00',
                  finished_at: '2026-11-24T10:06:02+00:00',
                },
              ]
            : [],
        }),
      });
      return;
    }

    if (path.endsWith('/claims') && method === 'GET') {
      const effectiveLabel = state.userOverride ?? 'entailment';
      const claims = state.analyzed
        ? [
            {
              id: 'claim-1',
              source_document_id: 'doc-1',
              source_name: 'scifact_sample.txt',
              page_no: 1,
              char_start: 0,
              char_end: 64,
              text: 'Dense retrieval improves scientific claim verification accuracy.',
              confidence: 0.92,
              extractor_name: 'local-hybrid-claim-v1',
              has_evidence: effectiveLabel !== 'neutral',
              evidence: [
                {
                  id: 'ev-1',
                  passage_id: 'p-1',
                  document_id: 'doc-1',
                  document_name: 'scifact_sample.txt',
                  page_no: 1,
                  char_start: 65,
                  char_end: 145,
                  passage_text:
                    'Experiments across SciFact show higher macro-F1 with dense passage retrieval.',
                  model_name: 'cross-encoder/nli-deberta-v3-xsmall',
                  model_label: 'entailment',
                  model_score: 0.88,
                  user_label: state.userOverride,
                  effective_label: effectiveLabel,
                },
              ],
            },
          ]
        : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          claims,
          total: claims.length,
          limit: 100,
          offset: 0,
          jobs: [],
        }),
      });
      return;
    }

    if (path.endsWith('/graph') && method === 'GET') {
      const effectiveLabel = state.userOverride ?? 'entailment';
      const nodes = state.analyzed
        ? [
            {
              id: 'doc:doc-1',
              type: 'document',
              label: 'scifact_sample.txt',
              document_id: 'doc-1',
              page_no: null,
              has_evidence: null,
              confidence: null,
            },
            {
              id: 'claim:claim-1',
              type: 'claim',
              label: 'Dense retrieval improves scientific claim verification accuracy.',
              document_id: 'doc-1',
              page_no: 1,
              has_evidence: true,
              confidence: 0.92,
            },
            {
              id: 'passage:p-1',
              type: 'passage',
              label:
                'Experiments across SciFact show higher macro-F1 with dense passage retrieval.',
              document_id: 'doc-1',
              page_no: 1,
              has_evidence: null,
              confidence: null,
            },
          ]
        : [];
      const edges = state.analyzed
        ? [
            {
              id: 'src:claim-1',
              source: 'doc:doc-1',
              target: 'claim:claim-1',
              kind: 'extracted_from',
              label: null,
              model_label: null,
              user_label: null,
              score: null,
            },
            {
              id: 'ev-1',
              source: 'claim:claim-1',
              target: 'passage:p-1',
              kind: 'evidence',
              label: effectiveLabel,
              model_label: 'entailment',
              user_label: state.userOverride,
              score: 0.88,
            },
          ]
        : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ project_id: 'proj-1', nodes, edges }),
      });
      return;
    }

    if (path.startsWith('/api/v1/evidence/') && method === 'PATCH') {
      const body = req.postDataJSON() as { user_label: string | null };
      state.userOverride = body.user_label;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'ev-1', user_label: body.user_label }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      body: JSON.stringify({ code: 'not_found', message: 'Not found' }),
    });
  });
}

test('full researcher flow: login validation, project creation, upload, analysis, and NLI override', async ({
  page,
}) => {
  const state: MockApiState = {
    projects: [],
    documents: [],
    analyzed: false,
    userOverride: null,
  };
  await setupMockApi(page, state);

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  // Verify client-side form validation first
  await page.click('#auth-submit-btn');
  await expect(page.getByText('Email address is required.')).toBeVisible();

  // Sign in with valid credentials
  await page.fill('#auth-email', 'researcher@ehu.lt');
  await page.fill('#auth-password', 'StrongPass123!');
  await page.click('#auth-submit-btn');
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: 'Research Projects' })).toBeVisible();

  // Create a new project via validated modal form
  await page.click('#open-create-project-btn');
  await page.fill('#project-name-input', 'SciFact Evidence Study');
  await page.click('#create-project-submit-btn');
  await expect(
    page.getByRole('link', { name: 'SciFact Evidence Study', exact: true }),
  ).toBeVisible();

  // Open project workspace, upload file, and run analysis
  await page.getByRole('link', { name: 'SciFact Evidence Study', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/proj-1$/);

  await page.setInputFiles('#document-file-input', {
    name: 'scifact_sample.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Dense retrieval improves scientific claim verification accuracy. Experiments confirm higher macro-F1.',
    ),
  });
  await expect(
    page.getByRole('region', { name: 'Corpus documents' }).getByText('scifact_sample.txt'),
  ).toBeVisible();

  await page.click('#run-analysis-btn');
  // Reload workspace to display completed analysis results
  await page.getByLabel('Reload workspace').click();

  // Inspect Evidence Map and zoom
  await expect(page.getByRole('region', { name: 'Interactive evidence map' })).toBeVisible();
  await page.click('#graph-zoom-in');
  await expect(page.getByText('120%')).toBeVisible();

  // Override NLI label while preserving original model prediction
  await page.selectOption('#override-select-ev-1', 'contradiction');
  await expect(page.getByText('Overridden', { exact: true })).toBeVisible();
  await expect(page.getByText(/model: entailment \(88%\)/i)).toBeVisible();
});

test('global error handling (500 & 401), theme persistence, and mobile navigation', async ({
  page,
}) => {
  const state: MockApiState = {
    projects: [
      {
        id: 'proj-1',
        name: 'Mobile Study',
        document_count: 1,
        claim_count: 2,
        created_at: '2026-11-24T10:00:00+00:00',
      },
    ],
    documents: [],
    analyzed: false,
    userOverride: null,
    forceProjectsStatus: 500,
  };
  await setupMockApi(page, state);

  // Sign in first
  await page.goto('/login');
  await page.fill('#auth-email', 'researcher@ehu.lt');
  await page.fill('#auth-password', 'StrongPass123!');
  await page.click('#auth-submit-btn');

  // Verify HTTP 500 triggers global error banner & toast
  await expect(page.getByRole('alert')).toContainText(
    'Simulated backend outage for E2E verification.',
  );

  // Recover and navigate to Settings to persist dark theme & scale
  state.forceProjectsStatus = undefined;
  await page.goto('/settings');
  await page.click('#settings-theme-dark');
  await page.selectOption('#settings-scale-select', '1.25');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-scale', '1.25');

  // Verify mobile viewport shows bottom navigation bar
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByLabel('Mobile navigation')).toBeVisible();

  // Trigger HTTP 401 -> automatic session clear and redirect to /login
  state.forceProjectsStatus = 401;
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
});
