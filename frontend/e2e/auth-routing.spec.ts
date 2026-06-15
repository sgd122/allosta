import { test, expect, type Page } from '@playwright/test';

/**
 * Browser-only contract: the session cookie + middleware route guard + role
 * home routing. Each `test` gets a fresh isolated context (no shared cookies),
 * so logging in as one role never leaks into another.
 *
 * Seeded demo accounts (backend prisma/seed.ts), all password `demo1234`:
 *   고객   → CUSTOMER  → home /book
 *   상담사 → COUNSELOR → home /schedule
 *   관리자 → ADMIN     → home /dashboard
 *
 * The login form fields are controlled Radix inputs; we drive them through the
 * page's own "데모 계정" quick-fill buttons (onClick → React state) so the
 * submitted credentials match exactly what a real user clicking them produces.
 */
type DemoRole = '고객' | '상담사' | '관리자';

async function login(page: Page, role: DemoRole): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: `${role} 클릭해서 입력` }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}

test('unauthenticated visit to a protected route redirects to /login', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('customer login lands on the booking home and sees the calendar', async ({
  page,
}) => {
  await login(page, '고객');
  await expect(page).toHaveURL(/\/book$/);
  // The booking calendar header proves the proxied, authenticated page rendered.
  await expect(page.getByText('예약 가능한 날짜')).toBeVisible();
});

test('counselor login lands on the schedule console', async ({ page }) => {
  await login(page, '상담사');
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(
    page.getByRole('heading', { name: '상담 일정' }),
  ).toBeVisible();
});

test('admin login lands on the conversion dashboard', async ({ page }) => {
  await login(page, '관리자');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole('heading', { name: '상담 전환 대시보드' }),
  ).toBeVisible();
});

test('a customer cannot reach an admin-only route (role guard sends them home)', async ({
  page,
}) => {
  await login(page, '고객');
  await expect(page).toHaveURL(/\/book$/);
  // Middleware redirects a role mismatch back to the customer home, not /dashboard.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/book$/);
});
