import { expect, test, type Page } from '@playwright/test';

const USER = {
  id: 'u-adaptive',
  email: 'researcher@ehu.lt',
  display_name: 'Bahdan Kanoplich',
};

const PROJECTS = [
  {
    id: 'p-1',
    name: 'Biomedical NLI Literature Review',
    document_count: 3,
    claim_count: 12,
    created_at: '2026-11-23T10:00:00+00:00',
  },
  {
    id: 'p-2',
    name: 'SciFact Clinical Trials Audit',
    document_count: 2,
    claim_count: 8,
    created_at: '2026-11-24T09:00:00+00:00',
  },
];

async function mockAuthenticatedApi(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('factmap_access_token', 'adaptive-e2e-token');
  });

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
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/v1/auth/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(USER),
      });
      return;
    }
    if (path === '/api/v1/projects') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: PROJECTS, total: PROJECTS.length, limit: 100, offset: 0 }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

const VIEWPORTS = [
  { name: 'foldable-narrow', width: 320, height: 658, expectMobileNav: true },
  { name: 'mobile-portrait', width: 375, height: 812, expectMobileNav: true },
  { name: 'mobile-landscape', width: 812, height: 375, expectMobileNav: true },
  { name: 'tablet-portrait', width: 768, height: 1024, expectMobileNav: true },
  { name: 'desktop-standard', width: 1440, height: 900, expectMobileNav: false },
  { name: 'ultrawide-4k', width: 2560, height: 1080, expectMobileNav: false },
];

test('responsive layout has zero horizontal overflow and keeps main navigation visible across 6 viewports', async ({
  page,
}) => {
  await mockAuthenticatedApi(page);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Research Projects' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `Horizontal overflow on ${vp.name}`).toBeLessThanOrEqual(1);

    if (vp.expectMobileNav) {
      await expect(page.getByLabel('Mobile navigation')).toBeVisible();
    } else {
      await expect(page.getByLabel('Primary navigation')).toBeVisible();
    }
  }
});

test('mobile touch targets meet >= 44px minimum and 125% display scale causes no overflow', async ({
  page,
}) => {
  await mockAuthenticatedApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/settings');
  await page.selectOption('#settings-scale-select', '1.25');
  await expect(page.locator('html')).toHaveAttribute('data-scale', '1.25');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const navHeights = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.mobile-nav-link, .btn'))
      .filter((el) => el.offsetParent !== null)
      .map((el) => Math.round(el.getBoundingClientRect().height)),
  );
  expect(navHeights.length).toBeGreaterThan(0);
  for (const height of navHeights) {
    expect(height).toBeGreaterThanOrEqual(44);
  }
});
