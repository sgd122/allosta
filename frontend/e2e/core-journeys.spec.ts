import { test, expect, type Page } from '@playwright/test';

/**
 * Core data-driven journeys per role — the browser-level complement to the
 * backend golden-path supertest suite. auth-routing.spec.ts proves the session
 * cookie + middleware guard + role home routing; this spec goes one step further
 * and proves each role's landing surface actually FETCHES and RENDERS real data
 * through the /api/proxy cookie→Authorization bridge (not just the heading).
 *
 * Read-only by design: these journeys assert on rendered seed data and never
 * mutate it, so they are deterministic and safe to re-run against the shared
 * demo DB. The create-booking → record → analytics mutation chain is already
 * covered end-to-end at the API layer by backend/test/golden-path.e2e-spec.ts.
 *
 * Seeded demo accounts (backend prisma/seed.ts), all password `demo1234`:
 *   고객 → CUSTOMER → /book, 상담사 → COUNSELOR → /schedule, 관리자 → ADMIN → /dashboard
 */
type DemoRole = '고객' | '상담사' | '관리자';

async function login(page: Page, role: DemoRole): Promise<void> {
  await page.goto('/login');
  // The quick-fill button's accessible name concatenates two <Text> spans with
  // no separating space ("고객클릭해서 입력"), so match whitespace-tolerantly.
  await page
    .getByRole('button', { name: new RegExp(`${role}\\s*클릭해서 입력`) })
    .click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}

test('customer booking home renders bookable slots from the proxied calendar', async ({
  page,
}) => {
  await login(page, '고객');
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByText('예약 가능한 날짜')).toBeVisible();
  // Proves the availability-calendar query resolved with real seed slots: the
  // month grid marks bookable days with a "예약 가능 N개" count, which only
  // renders when the proxied calendar fetch returns open slots.
  await expect(
    page.getByRole('button', { name: /예약 가능 \d+개/ }).first(),
  ).toBeVisible();
});

test('counselor schedule console renders the schedule surface with its filters', async ({
  page,
}) => {
  await login(page, '상담사');
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('heading', { name: '상담 일정' })).toBeVisible();
  // The date-range filter controls only render once the schedule view mounted
  // with its data, proving the proxied counselor/schedule fetch resolved.
  await expect(page.getByText('오늘', { exact: false }).first()).toBeVisible();
});

test('admin dashboard renders the conversion analytics fetched through the proxy', async ({
  page,
}) => {
  await login(page, '관리자');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole('heading', { name: '상담 전환 대시보드' }),
  ).toBeVisible();
  // The conversion-rate card only appears once GET /admin/analytics resolved
  // through the proxy — the percentage value proves real aggregated data, not
  // just a static shell.
  await expect(page.getByText('전환율').first()).toBeVisible();
  await expect(page.getByText(/\d+(\.\d+)?\s*%/).first()).toBeVisible();
});
