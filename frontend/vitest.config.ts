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
  },
});
