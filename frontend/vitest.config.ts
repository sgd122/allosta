import { defineConfig } from 'vitest/config';

// Minimal config: node environment is enough for the pure TS helpers under lib/.
// resolve.tsconfigPaths mirrors the `@/*` alias from tsconfig.json natively
// (Vite 6+ / Vitest 4+), so no extra plugin is needed.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    // Vitest owns the unit suite under src/. Playwright owns e2e/ (its specs
    // import from '@playwright/test', which would crash under Vitest) — scoping
    // the glob here keeps the two runners from colliding on *.spec.ts.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
