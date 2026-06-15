import { defineConfig, devices } from '@playwright/test';

/**
 * Browser E2E config.
 *
 * Scope: the cross-cutting concerns that the backend supertest suite and the
 * Vitest unit suite cannot exercise — the Next.js middleware route guard, the
 * /api/proxy cookie→Authorization bridge, and the httpOnly session cookie set
 * by /api/auth/login. These only exist in the running browser stack.
 *
 * Prerequisites (the spec talks to the real backend + seeded DB):
 *   1. docker compose up -d           # postgres
 *   2. backend: pnpm prisma:migrate && pnpm seed && pnpm start:dev   # :3000
 * The frontend dev server on :5173 is started automatically (webServer below).
 */
export default defineConfig({
  testDir: './e2e',
  // Serial, single worker: the dev server compiles each route lazily on first
  // hit (Next.js dev). Parallel workers racing cold-compiles of /book, /schedule
  // and /dashboard at once made the first hit per route exceed the timeout.
  // Running one-at-a-time lets each route warm up without contention.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Generous timeouts absorb the one-time lazy compile of each route.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:5173',
    navigationTimeout: 20_000,
    actionTimeout: 15_000,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
