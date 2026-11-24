import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FRONTEND_DIR, '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'adaptive-ui');
const SHOTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'factmap-adaptive-'));
const PDF_PATH = path.join(OUT_DIR, 'Adaptive_UI_Specification_Kanoplich_Bahdan.pdf');

const PORT = 4179;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const MOCK_USER = {
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  email: 'researcher@ehu.lt',
  display_name: 'Bahdan Kanoplich',
};

const MOCK_PROJECTS = [
  {
    id: 'p-scifact',
    name: 'SciFact Biomedical Claims Audit',
    document_count: 3,
    claim_count: 3,
    created_at: '2026-11-23T10:15:00+00:00',
  },
  {
    id: 'p-climate',
    name: 'Climate Attribution Meta-Analysis',
    document_count: 4,
    claim_count: 14,
    created_at: '2026-11-21T14:30:00+00:00',
  },
  {
    id: 'p-nlp',
    name: 'Dense Retrieval vs BM25 Benchmarks',
    document_count: 2,
    claim_count: 9,
    created_at: '2026-11-19T08:45:00+00:00',
  },
];

const MOCK_DOCS = [
  {
    id: 'd-1',
    original_name: 'wadden_scifact_2020.pdf',
    media_type: 'application/pdf',
    size_bytes: 482910,
    status: 'ready',
    error_message: null,
    page_count: 11,
    created_at: '2026-11-23T10:16:00+00:00',
  },
  {
    id: 'd-2',
    original_name: 'clinical_trial_2022.pdf',
    media_type: 'application/pdf',
    size_bytes: 318420,
    status: 'ready',
    error_message: null,
    page_count: 8,
    created_at: '2026-11-23T10:17:00+00:00',
  },
];

const MOCK_JOBS = [
  {
    id: 'j-1',
    kind: 'extract_claims',
    status: 'succeeded',
    progress_pct: 100,
    error_message: null,
    created_at: '2026-11-23T10:18:00+00:00',
    started_at: '2026-11-23T10:18:00+00:00',
    finished_at: '2026-11-23T10:18:02+00:00',
  },
  {
    id: 'j-2',
    kind: 'retrieve',
    status: 'succeeded',
    progress_pct: 100,
    error_message: null,
    created_at: '2026-11-23T10:18:02+00:00',
    started_at: '2026-11-23T10:18:02+00:00',
    finished_at: '2026-11-23T10:18:04+00:00',
  },
  {
    id: 'j-3',
    kind: 'nli',
    status: 'succeeded',
    progress_pct: 100,
    error_message: null,
    created_at: '2026-11-23T10:18:04+00:00',
    started_at: '2026-11-23T10:18:04+00:00',
    finished_at: '2026-11-23T10:18:07+00:00',
  },
];

const MOCK_CLAIMS = [
  {
    id: 'c-1',
    source_document_id: 'd-1',
    source_name: 'wadden_scifact_2020.pdf',
    page_no: 2,
    char_start: 412,
    char_end: 538,
    text: 'Dense passage retrieval improves recall over lexical baselines on scientific abstracts.',
    confidence: 0.92,
    extractor_name: 'local-hybrid-claim-v1',
    has_evidence: true,
    evidence: [
      {
        id: 'ev-1',
        passage_id: 'p-1',
        document_id: 'd-2',
        document_name: 'clinical_trial_2022.pdf',
        page_no: 4,
        char_start: 1204,
        char_end: 1380,
        passage_text:
          'Evaluations on 250 unseen biomedical abstracts confirm +14.2% recall@5 using BGE-small dense vectors.',
        model_name: 'cross-encoder/nli-deberta-v3-xsmall',
        model_label: 'entailment',
        model_score: 0.89,
        user_label: null,
        effective_label: 'entailment',
      },
      {
        id: 'ev-2',
        passage_id: 'p-2',
        document_id: 'd-2',
        document_name: 'clinical_trial_2022.pdf',
        page_no: 6,
        char_start: 2410,
        char_end: 2560,
        passage_text:
          'When domain terminology shifts abruptly, uncalibrated dense models underperform exact BM25 matching.',
        model_name: 'cross-encoder/nli-deberta-v3-xsmall',
        model_label: 'contradiction',
        model_score: 0.78,
        user_label: null,
        effective_label: 'contradiction',
      },
    ],
  },
  {
    id: 'c-2',
    source_document_id: 'd-2',
    source_name: 'clinical_trial_2022.pdf',
    page_no: 3,
    char_start: 820,
    char_end: 915,
    text: 'Low-dose aspirin reduces major cardiovascular events in high-risk adult cohorts.',
    confidence: 0.87,
    extractor_name: 'local-hybrid-claim-v1',
    has_evidence: true,
    evidence: [
      {
        id: 'ev-3',
        passage_id: 'p-3',
        document_id: 'd-1',
        document_name: 'wadden_scifact_2020.pdf',
        page_no: 5,
        char_start: 1620,
        char_end: 1745,
        passage_text:
          'Randomized trials demonstrated statistically significant reduction in vascular mortality with daily aspirin.',
        model_name: 'cross-encoder/nli-deberta-v3-xsmall',
        model_label: 'entailment',
        model_score: 0.85,
        user_label: null,
        effective_label: 'entailment',
      },
    ],
  },
];

const MOCK_GRAPH = {
  project_id: 'p-scifact',
  nodes: [
    { id: 'doc:d-1', type: 'document', label: 'wadden_scifact_2020.pdf', document_id: 'd-1', page_no: null, has_evidence: null, confidence: null },
    { id: 'doc:d-2', type: 'document', label: 'clinical_trial_2022.pdf', document_id: 'd-2', page_no: null, has_evidence: null, confidence: null },
    { id: 'claim:c-1', type: 'claim', label: 'Dense passage retrieval improves recall over lexical baselines...', document_id: 'd-1', page_no: 2, has_evidence: true, confidence: 0.92 },
    { id: 'claim:c-2', type: 'claim', label: 'Low-dose aspirin reduces major cardiovascular events...', document_id: 'd-2', page_no: 3, has_evidence: true, confidence: 0.87 },
    { id: 'passage:p-1', type: 'passage', label: 'Evaluations confirm +14.2% recall@5 using BGE-small...', document_id: 'd-2', page_no: 4, has_evidence: null, confidence: null },
    { id: 'passage:p-2', type: 'passage', label: 'Uncalibrated dense models underperform exact BM25...', document_id: 'd-2', page_no: 6, has_evidence: null, confidence: null },
    { id: 'passage:p-3', type: 'passage', label: 'Randomized trials demonstrated vascular mortality reduction...', document_id: 'd-1', page_no: 5, has_evidence: null, confidence: null },
  ],
  edges: [
    { id: 'src:c-1', source: 'doc:d-1', target: 'claim:c-1', kind: 'extracted_from', label: null, model_label: null, user_label: null, score: null },
    { id: 'src:c-2', source: 'doc:d-2', target: 'claim:c-2', kind: 'extracted_from', label: null, model_label: null, user_label: null, score: null },
    { id: 'ev-1', source: 'claim:c-1', target: 'passage:p-1', kind: 'evidence', label: 'entailment', model_label: 'entailment', user_label: null, score: 0.89 },
    { id: 'ev-2', source: 'claim:c-1', target: 'passage:p-2', kind: 'evidence', label: 'contradiction', model_label: 'contradiction', user_label: null, score: 0.78 },
    { id: 'ev-3', source: 'claim:c-2', target: 'passage:p-3', kind: 'evidence', label: 'entailment', model_label: 'entailment', user_label: null, score: 0.85 },
  ],
};

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for preview server at ${url}`);
}

async function attachApiMocks(page) {
  await page.route('**/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        version: '1.0.0',
        ml_backend: 'transformers',
        embedding_model: 'BAAI/bge-small-en-v1.5',
        nli_model: 'cross-encoder/nli-deberta-v3-xsmall',
      }),
    }),
  );

  await page.route('**/api/v1/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/auth/me') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) });
    }
    if (pathname === '/api/v1/projects') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: MOCK_PROJECTS, total: MOCK_PROJECTS.length, limit: 100, offset: 0 }),
      });
    }
    if (pathname.endsWith('/documents')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documents: MOCK_DOCS, total: MOCK_DOCS.length, limit: 100, offset: 0 }),
      });
    }
    if (pathname.endsWith('/jobs')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs: MOCK_JOBS }) });
    }
    if (pathname.endsWith('/claims')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ claims: MOCK_CLAIMS, total: MOCK_CLAIMS.length, limit: 100, offset: 0, jobs: MOCK_JOBS }),
      });
    }
    if (pathname.endsWith('/graph')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_GRAPH) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

function toDataUri(filePath) {
  const buf = fs.readFileSync(filePath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function main() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: FRONTEND_DIR,
    stdio: 'ignore',
  });

  try {
    await waitForServer(BASE_URL);
    const browser = await chromium.launch();

    const capture = async ({
      name,
      route,
      width,
      height,
      auth = true,
      theme = 'light',
      scrollSelector = null,
    }) => {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await attachApiMocks(page);
      await page.addInitScript(
        ({ authFlag, themeVal }) => {
          if (authFlag) window.localStorage.setItem('factmap_access_token', 'spec-token');
          else window.localStorage.removeItem('factmap_access_token');
          window.localStorage.setItem('factmap_theme', themeVal);
          window.localStorage.setItem('factmap_display_scale', '1');
        },
        { authFlag: auth, themeVal: theme },
      );
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      if (scrollSelector) {
        await page.locator(scrollSelector).first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
      }
      const outFile = path.join(SHOTS_DIR, `${name}.png`);
      await page.screenshot({ path: outFile, fullPage: false });
      await context.close();
      return outFile;
    };

    const shots = {
      loginDesktop: await capture({ name: 'login-desktop', route: '/login', width: 1440, height: 900, auth: false }),
      loginTablet: await capture({ name: 'login-tablet', route: '/login', width: 768, height: 1024, auth: false }),
      loginMobile: await capture({ name: 'login-mobile', route: '/login', width: 375, height: 812, auth: false }),

      projectsDesktop: await capture({ name: 'projects-desktop', route: '/projects', width: 1440, height: 900 }),
      projectsTablet: await capture({ name: 'projects-tablet', route: '/projects', width: 768, height: 1024 }),
      projectsMobile: await capture({ name: 'projects-mobile', route: '/projects', width: 375, height: 812 }),

      workspaceDesktop: await capture({
        name: 'workspace-desktop',
        route: '/projects/p-scifact',
        width: 1440,
        height: 900,
        scrollSelector: '.workspace-split',
      }),
      workspaceTablet: await capture({
        name: 'workspace-tablet',
        route: '/projects/p-scifact',
        width: 768,
        height: 1024,
        scrollSelector: '.workspace-split',
      }),
      workspaceMobile: await capture({
        name: 'workspace-mobile',
        route: '/projects/p-scifact',
        width: 375,
        height: 812,
        scrollSelector: '.workspace-split',
      }),
      workspaceDark: await capture({
        name: 'workspace-desktop-dark',
        route: '/projects/p-scifact',
        width: 1440,
        height: 900,
        theme: 'dark',
        scrollSelector: '.workspace-split',
      }),

      designDesktop: await capture({ name: 'design-system-desktop', route: '/design-system', width: 1440, height: 980 }),
      settingsDesktop: await capture({ name: 'settings-desktop', route: '/settings', width: 1440, height: 900 }),
      settingsMobile: await capture({ name: 'settings-mobile', route: '/settings', width: 375, height: 812, theme: 'dark' }),
    };

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>FactMap Scholar — Adaptive UI Specification</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #18181b;
    background: #ffffff;
    font-size: 11px;
    line-height: 1.45;
  }
  .page {
    page-break-after: always;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 184mm;
  }
  .page:last-child { page-break-after: auto; }
  .cover {
    justify-content: space-between;
    background: #f7f6f2;
    border: 1px solid #e2dfd5;
    border-radius: 12px;
    padding: 28px 34px;
  }
  .eyebrow {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 700;
    color: #0f625c;
  }
  h1 {
    margin: 6px 0 10px;
    font-family: Georgia, serif;
    font-size: 32px;
    line-height: 1.15;
    color: #18181b;
  }
  h2 {
    margin: 0;
    font-family: Georgia, serif;
    font-size: 18px;
    color: #18181b;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 12px;
    color: #0f625c;
  }
  .page-bar {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 2px solid #0f625c;
    padding-bottom: 5px;
  }
  .page-tag {
    font-size: 10px;
    font-weight: 700;
    color: #5c5c66;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .box {
    background: #ffffff;
    border: 1px solid #e2dfd5;
    border-radius: 8px;
    padding: 10px 12px;
  }
  .box-label { font-size: 9px; text-transform: uppercase; color: #5c5c66; font-weight: 700; }
  .box-val { font-size: 12px; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 1px solid #e2dfd5; padding: 5px 7px; text-align: left; }
  th { background: #efede6; font-weight: 700; color: #18181b; }
  .device-row {
    display: grid;
    grid-template-columns: 1.85fr 0.95fr 0.6fr;
    gap: 12px;
    align-items: start;
    flex: 1;
  }
  .device-row-2 {
    display: grid;
    grid-template-columns: 1.35fr 1fr;
    gap: 12px;
    align-items: start;
    flex: 1;
  }
  .frame {
    border: 1px solid #d4d0c5;
    border-radius: 8px;
    background: #faf9f6;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .frame-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    font-weight: 700;
    color: #0f625c;
  }
  .frame-dim {
    font-family: monospace;
    font-size: 9px;
    color: #5c5c66;
    background: #efede6;
    padding: 1px 6px;
    border-radius: 99px;
  }
  .frame img {
    width: 100%;
    height: auto;
    max-height: 125mm;
    object-fit: contain;
    object-position: top;
    border: 1px solid #e2dfd5;
    border-radius: 5px;
    background: #ffffff;
  }
  .notes {
    background: #f7f6f2;
    border-left: 3px solid #0f625c;
    padding: 7px 10px;
    font-size: 10px;
    color: #3f3f46;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  .swatch {
    border: 1px solid #e2dfd5;
    border-radius: 6px;
    padding: 6px;
    background: #fff;
  }
  .swatch-color { height: 22px; border-radius: 4px; margin-bottom: 5px; border: 1px solid rgba(0,0,0,0.08); }
  .mono { font-family: monospace; font-size: 9px; color: #52525b; }
  .state-strip {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
  }
  .st-btn {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 600;
    border: 1px solid transparent;
  }
</style>
</head>
<body>

<!-- PAGE 1: COVER -->
<section class="page cover">
  <div>
    <div class="eyebrow">European Humanities University · Stage 3 Diploma Expertise · Adaptive UI (Web/Mobile)</div>
    <h1>FactMap Scholar — Adaptive UI Design Specification &amp; Component Library</h1>
    <p style="font-size:13px; max-width: 780px; color:#3f3f46;">
      Responsive web &amp; mobile interface specification for automatic scientific claim extraction and NLI-based evidence verification.
      Includes 3 device variants (Mobile 375px, Tablet 768px, Desktop 1440px), foldable/4K scaling rules, WCAG 2.1 Level AA color contrast tokens,
      and a reusable component library with all interactive states.
    </p>
  </div>

  <div class="meta-grid">
    <div class="box"><div class="box-label">Student</div><div class="box-val">Bahdan Kanoplich</div></div>
    <div class="box"><div class="box-label">Supervisor</div><div class="box-val">Maksym Lipchanskyi</div></div>
    <div class="box"><div class="box-label">Live SPA Route</div><div class="box-val">frontend/ · /design-system</div></div>
    <div class="box"><div class="box-label">Accessibility Target</div><div class="box-val">WCAG 2.1 AA (&ge;4.5:1) · 44px Touch</div></div>
  </div>

  <div class="box">
    <h3>Contents</h3>
    <table>
      <thead><tr><th>Page</th><th>Section</th><th>Verified Criteria</th></tr></thead>
      <tbody>
        <tr><td>02</td><td>Design System Foundations — Palette, WCAG Contrast, Typography &amp; Responsive Grid</td><td>Consistent tokens, relative units (rem/clamp), 6 breakpoint tiers (320px–2560px)</td></tr>
        <tr><td>03</td><td>Reusable Component Library &amp; Interactive States</td><td>Buttons, Inputs, Selects, NLI Badges, Skeletons, Modals: Default / Hover / Focus / Active / Loading / Disabled / Error</td></tr>
        <tr><td>04</td><td>Screen 01: Authentication (/login) — 3 Device Variants</td><td>Desktop 1440px · Tablet 768px · Mobile 375px with form validation states</td></tr>
        <tr><td>05</td><td>Screen 02: Research Projects (/projects) — 3 Device Variants</td><td>Desktop sortable data table → Mobile card stack + one-hand bottom tab bar</td></tr>
        <tr><td>06</td><td>Screen 03: Evidence Map Workspace (/projects/:id) — 3 Device Variants</td><td>Desktop split SVG pan/zoom graph + inspector · Mobile card fallback</td></tr>
        <tr><td>07</td><td>Dark Theme, Display Scale &amp; Automatic Device Detection (/settings)</td><td>Light/Dark polarity, 90%–125% scale, live DPR/orientation/aspect ratio hook</td></tr>
      </tbody>
    </table>
  </div>
</section>

<!-- PAGE 2: FOUNDATIONS -->
<section class="page">
  <div class="page-bar">
    <h2>02 · Design System Foundations — Tokens, WCAG 2.1 AA Contrast &amp; Responsive Grid</h2>
    <span class="page-tag">Tokens · frontend/src/styles/tokens.css</span>
  </div>

  <div>
    <h3>Semantic Color Palette (Light &amp; Dark Themes — All Text Pairs &ge; 4.5:1)</h3>
    <div class="swatches">
      <div class="swatch"><div class="swatch-color" style="background:#0f625c"></div><strong>Primary Accent</strong><div class="mono">Light #0F625C (7.1:1)<br/>Dark #2DD4BF (11.2:1)</div></div>
      <div class="swatch"><div class="swatch-color" style="background:#116944"></div><strong>NLI Entailment</strong><div class="mono">Light #116944 (6.5:1)<br/>Dark #4ADE80 (10.6:1)</div></div>
      <div class="swatch"><div class="swatch-color" style="background:#b42318"></div><strong>NLI Contradiction</strong><div class="mono">Light #B42318 (6.1:1)<br/>Dark #F87171 (6.9:1)</div></div>
      <div class="swatch"><div class="swatch-color" style="background:#475467"></div><strong>NLI Neutral</strong><div class="mono">Light #475467 (7.5:1)<br/>Dark #CBD5E1 (12.1:1)</div></div>
      <div class="swatch"><div class="swatch-color" style="background:#f7f6f2"></div><strong>Surface / Canvas</strong><div class="mono">Light #F7F6F2 / #FFF<br/>Dark #121417 / #1A1D21</div></div>
      <div class="swatch"><div class="swatch-color" style="background:#18181b"></div><strong>Primary Ink</strong><div class="mono">Light #18181B (16.4:1)<br/>Dark #F2F4F7 (16.9:1)</div></div>
    </div>
  </div>

  <div class="device-row-2">
    <div class="box">
      <h3>Responsive Breakpoints &amp; Structural Layout Adaptation</h3>
      <table>
        <thead><tr><th>Tier</th><th>Viewport Width</th><th>Navigation Pattern</th><th>Content Grid</th></tr></thead>
        <tbody>
          <tr><td><strong>Foldable / Ultra-narrow</strong></td><td class="mono">&le; 359px (320px tested)</td><td>Compact Bottom Tab Bar (44px)</td><td>1-col fluid cards, tight padding</td></tr>
          <tr><td><strong>Mobile Portrait</strong></td><td class="mono">360px – 767px (375px)</td><td>One-hand Fixed Bottom Tab Bar</td><td>1-col cards, mobile claims fallback</td></tr>
          <tr><td><strong>Mobile Landscape / KB</strong></td><td class="mono">height &le; 500px</td><td>Static unpinned bottom nav</td><td>Keyboard-safe scroll (never covers inputs)</td></tr>
          <tr><td><strong>Tablet</strong></td><td class="mono">768px – 1023px (768px)</td><td>Topbar + Bottom Tab Bar</td><td>2-col grids, stacked workspace split</td></tr>
          <tr><td><strong>Desktop</strong></td><td class="mono">1024px – 1919px (1440px)</td><td>Persistent 15.5rem Left Sidebar</td><td>2-col Split: Evidence Map + Inspector</td></tr>
          <tr><td><strong>Ultrawide / 4K</strong></td><td class="mono">&ge; 1920px (2560px)</td><td>Persistent Sidebar + 104rem container</td><td>Centered max-width avoids long lines</td></tr>
        </tbody>
      </table>
    </div>
    <div class="box">
      <h3>Typography &amp; Sizing Rules (Relative Units Only)</h3>
      <table>
        <thead><tr><th>Role</th><th>Font Family</th><th>Fluid Size</th></tr></thead>
        <tbody>
          <tr><td>Page Title (H1)</td><td>Newsreader (Serif)</td><td class="mono">clamp(1.65rem, 2.5vw, 2.25rem)</td></tr>
          <tr><td>Section Heading (H2)</td><td>Plus Jakarta Sans</td><td class="mono">clamp(1.15rem, 1.5vw, 1.35rem)</td></tr>
          <tr><td>Body &amp; Controls</td><td>Plus Jakarta Sans</td><td class="mono">1rem (scales 90%–125%)</td></tr>
          <tr><td>Offsets, Scores, IDs</td><td>JetBrains Mono</td><td class="mono">0.84rem – 0.92rem</td></tr>
          <tr><td>Touch Target Min</td><td>All buttons, inputs, tabs</td><td class="mono">2.75rem (&ge; 44px)</td></tr>
          <tr><td>Icons</td><td>Lucide SVG (vector)</td><td class="mono">Crisp at 1x / 2x / 3x DPR</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>

<!-- PAGE 3: COMPONENT LIBRARY & STATES -->
<section class="page">
  <div class="page-bar">
    <h2>03 · Reusable Component Library &amp; Interactive States</h2>
    <span class="page-tag">Live Route: /design-system · frontend/src/components/common/</span>
  </div>

  <div class="device-row-2">
    <div class="frame">
      <div class="frame-header"><span>Component Showcase — Live Rendered UI Kit</span><span class="frame-dim">1440 × 980 · Light Theme</span></div>
      <img src="${toDataUri(shots.designDesktop)}" alt="Design System Component Showcase" />
    </div>
    <div class="box" style="display:flex; flex-direction:column; gap:10px;">
      <div>
        <h3>Interactive State Specification (Required by Rubric)</h3>
        <div class="state-strip">
          <span class="st-btn" style="background:#0f625c;color:#fff;">Default</span>
          <span class="st-btn" style="background:#0b4e49;color:#fff;">Hover</span>
          <span class="st-btn" style="background:#0f625c;color:#fff;outline:2px solid #0f625c;outline-offset:2px;">Focus</span>
          <span class="st-btn" style="background:#083d39;color:#fff;transform:translateY(1px);">Active</span>
          <span class="st-btn" style="background:#0f625c;color:#fff;opacity:0.55;">Disabled</span>
          <span class="st-btn" style="background:#b42318;color:#fff;">Error</span>
        </div>
      </div>
      <table>
        <thead><tr><th>Component</th><th>Documented States</th></tr></thead>
        <tbody>
          <tr><td><strong>Button</strong></td><td>Default, Hover, Focus-Visible (2px ring), Active (1px press), Loading (spinner + aria-busy), Disabled</td></tr>
          <tr><td><strong>Input / Select</strong></td><td>Default, Hover, Focus (3px soft halo), Filled, Error (red border + role="alert"), Disabled</td></tr>
          <tr><td><strong>Badge</strong></td><td>entailment, contradiction, neutral, success, info, warning, error</td></tr>
          <tr><td><strong>Skeleton</strong></td><td>Animated shimmer placeholders (title, line, block) for all async fetches</td></tr>
          <tr><td><strong>Toast / Modal</strong></td><td>ARIA polite notification queue (info/success/warning/error) &amp; Escape-dismissible dialog</td></tr>
        </tbody>
      </table>
      <div class="notes">
        <strong>Automated Verification:</strong> Playwright suite <code>e2e/adaptive.spec.ts</code> asserts every mobile button and nav control renders at <strong>&ge; 44px</strong> height and produces <strong>0px</strong> horizontal overflow even at 125% text scale.
      </div>
    </div>
  </div>
</section>

<!-- PAGE 4: LOGIN 3 VARIANTS -->
<section class="page">
  <div class="page-bar">
    <h2>04 · Screen 01 — Authentication (/login) · 3 Device Variants</h2>
    <span class="page-tag">Components: AuthForm, Input, Button, Tabs, AlertBanner</span>
  </div>
  <div class="device-row">
    <div class="frame">
      <div class="frame-header"><span>Desktop Variant — Split Editorial Layout</span><span class="frame-dim">1440 × 900</span></div>
      <img src="${toDataUri(shots.loginDesktop)}" alt="Login Desktop" />
    </div>
    <div class="frame">
      <div class="frame-header"><span>Tablet Variant — Stacked Vertical Flow</span><span class="frame-dim">768 × 1024</span></div>
      <img src="${toDataUri(shots.loginTablet)}" alt="Login Tablet" />
    </div>
    <div class="frame">
      <div class="frame-header"><span>Mobile Variant — Single Column</span><span class="frame-dim">375 × 812</span></div>
      <img src="${toDataUri(shots.loginMobile)}" alt="Login Mobile" />
    </div>
  </div>
  <div class="notes">
    <strong>Adaptation Notes:</strong> Two-column split grid on Desktop (&ge;1024px) collapses smoothly to a single-column vertical flow on Tablet and Mobile. All form controls enforce 44px height and accessible inline validation messages.
  </div>
</section>

<!-- PAGE 5: PROJECTS 3 VARIANTS -->
<section class="page">
  <div class="page-bar">
    <h2>05 · Screen 02 — Research Projects (/projects) · 3 Device Variants</h2>
    <span class="page-tag">Components: AppShell, ProjectTable, CreateProjectForm, Modal, MobileBottomNav</span>
  </div>
  <div class="device-row">
    <div class="frame">
      <div class="frame-header"><span>Desktop — Sidebar + Sortable Data Table</span><span class="frame-dim">1440 × 900</span></div>
      <img src="${toDataUri(shots.projectsDesktop)}" alt="Projects Desktop" />
    </div>
    <div class="frame">
      <div class="frame-header"><span>Tablet — Compact Topbar + Bottom Nav</span><span class="frame-dim">768 × 1024</span></div>
      <img src="${toDataUri(shots.projectsTablet)}" alt="Projects Tablet" />
    </div>
    <div class="frame">
      <div class="frame-header"><span>Mobile — Card Stack + Bottom Nav</span><span class="frame-dim">375 × 812</span></div>
      <img src="${toDataUri(shots.projectsMobile)}" alt="Projects Mobile" />
    </div>
  </div>
  <div class="notes">
    <strong>Structural Adaptation:</strong> Desktop displays a persistent left sidebar and multi-column sortable table. Below 768px, the table automatically transforms into touch-friendly cards paired with a one-hand bottom tab bar.
  </div>
</section>

<!-- PAGE 6: WORKSPACE 3 VARIANTS -->
<section class="page">
  <div class="page-bar">
    <h2>06 · Screen 03 — Evidence Map Workspace (/projects/:id) · 3 Device Variants</h2>
    <span class="page-tag">Components: DocumentUploader, AnalysisProgress, EvidenceMap, ClaimsTable, ClaimDetailDrawer</span>
  </div>
  <div class="device-row">
    <div class="frame">
      <div class="frame-header"><span>Desktop — Interactive SVG Graph + Claim Inspector</span><span class="frame-dim">1440 × 900</span></div>
      <img src="${toDataUri(shots.workspaceDesktop)}" alt="Workspace Desktop" />
    </div>
    <div class="frame">
      <div class="frame-header"><span>Tablet — Stacked Graph &amp; Filters</span><span class="frame-dim">768 × 1024</span></div>
      <img src="${toDataUri(shots.workspaceTablet)}" alt="Workspace Tablet" />
    </div>
    <div class="frame">
      <div class="frame-header"><span>Mobile — Card-First Claims View</span><span class="frame-dim">375 × 812</span></div>
      <img src="${toDataUri(shots.workspaceMobile)}" alt="Workspace Mobile" />
    </div>
  </div>
  <div class="notes">
    <strong>Domain Adaptation:</strong> On Desktop, the Evidence Map sits side-by-side with the Claim Detail Inspector. On Mobile (&lt;768px), the workspace defaults to the scannable Claims Card list while allowing instant switching to the interactive pan/zoom graph.
  </div>
</section>

<!-- PAGE 7: DARK THEME & DEVICE DETECTION -->
<section class="page">
  <div class="page-bar">
    <h2>07 · Dark Theme, Display Scale &amp; Automatic Device Detection (/settings)</h2>
    <span class="page-tag">Hook: useDeviceProfile() · Theme Tokens · Text Scale 90%–125%</span>
  </div>
  <div class="device-row">
    <div class="frame">
      <div class="frame-header"><span>Desktop Dark Theme — High-Contrast NLI Palette</span><span class="frame-dim">1440 × 900 · Dark</span></div>
      <img src="${toDataUri(shots.workspaceDark)}" alt="Workspace Dark Theme" />
    </div>
    <div class="frame">
      <div class="frame-header"><span>Settings — Live Device Profile &amp; Health</span><span class="frame-dim">1440 × 900 · Light</span></div>
      <img src="${toDataUri(shots.settingsDesktop)}" alt="Settings Desktop" />
    </div>
    <div class="frame">
      <div class="frame-header"><span>Mobile Dark Settings</span><span class="frame-dim">375 × 812 · Dark</span></div>
      <img src="${toDataUri(shots.settingsMobile)}" alt="Settings Mobile Dark" />
    </div>
  </div>
  <div class="notes">
    <strong>Maximum Criteria Highlights:</strong> Automatic <code>useDeviceProfile()</code> hook detects viewport tier, DPR, orientation, and aspect ratio in real time. Users customize light/dark theme and typography scale (90%–125%) with persisted preferences.
  </div>
</section>

</body>
</html>`;

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const pdfPage = await browser.newPage();
    await pdfPage.setContent(html, { waitUntil: 'load' });
    await pdfPage.pdf({
      path: PDF_PATH,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });

    await browser.close();
    console.log(`Generated Adaptive UI PDF specification: ${PDF_PATH}`);
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
