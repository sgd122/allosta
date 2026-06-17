import { test, expect, type Page } from '@playwright/test';

/**
 * Customer AI Q&A journey (ADR 0018, AC1/AC5/AC7/AC8). Browser-level complement
 * to backend/test/qa-*.e2e-spec.ts: it proves the /results panel mounts, asks a
 * grounded question, rates it, and that an out-of-scope question surfaces the
 * disclaimer + booking CTA into the existing /book flow — while the direct
 * booking flow still works without ever touching the AI (AC8 regression).
 *
 * Mutating but additive: Q&A sessions/messages are harmless extra rows on the
 * demo customer, deterministic to re-run. Requires the backend running (same as
 * core-journeys) plus the demo seed. Falls back to the deterministic template
 * answer when no local Ollama is present — the panel behaves identically.
 *
 * Demo account (backend prisma/seed.ts), password `demo1234`: 고객 → CUSTOMER.
 */
async function loginAsCustomer(page: Page): Promise<void> {
  await page.goto('/login');
  await page
    .getByRole('button', { name: /고객\s*클릭해서 입력/ })
    .click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/book$/);
}

test('customer asks a grounded question, rates it, and is escalated when out of scope', async ({
  page,
}) => {
  await loginAsCustomer(page);

  // AC1: open the Q&A surface on a report card.
  await page.goto('/results');
  const openButton = page.getByTestId('qa-open').first();
  await expect(openButton).toBeVisible();
  await openButton.click();

  const panel = page.getByTestId('qa-panel').first();
  await expect(panel).toBeVisible();

  // AC2/AC3: ask an in-scope question → a grounded assistant answer appears.
  await panel.getByTestId('qa-input').fill('이 수치가 무슨 뜻인가요?');
  await panel.getByTestId('qa-submit').click();
  await expect(panel.getByTestId('qa-turn-assistant').first()).toBeVisible();

  // AC7: the feedback control is present; rate the answer.
  await panel.getByTestId('qa-feedback-yes').first().click();
  await expect(panel.getByTestId('qa-feedback-done').first()).toBeVisible();

  // AC5: an out-of-scope question is declined with the booking CTA.
  await panel.getByTestId('qa-input').fill('이 약 먹어도 되나요?');
  await panel.getByTestId('qa-submit').click();
  const cta = panel.getByTestId('qa-booking-cta').first();
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page).toHaveURL(/\/book$/);
});

test('customer can reach the booking flow directly without the AI (AC8 regression)', async ({
  page,
}) => {
  await loginAsCustomer(page);
  // Direct booking surface renders its calendar with no Q&A involvement.
  await expect(page.getByText('예약 가능한 날짜')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /예약 가능 \d+개/ }).first(),
  ).toBeVisible();
});
