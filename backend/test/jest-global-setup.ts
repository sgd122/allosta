import { execSync } from 'child_process';

/**
 * Jest globalSetup: bring the dedicated test database to a PRISTINE migrated
 * state before the suite runs — drops all data and re-applies every migration.
 * This guarantees determinism: each `jest` invocation starts from an empty,
 * fully-migrated schema, so data can never accumulate across runs and specs
 * never inherit residue from a previous (or interrupted) run. Targets the test
 * DB only (NOT the dev DB that holds demo seed data).
 *
 * `--skip-seed` keeps prisma/seed.ts (the demo data) out of the test DB — specs
 * own their data via seedIsolated islands. The test DB must already exist —
 * create it once with `npm run test:db:setup`.
 */
export default function globalSetup(): void {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://allosta:allosta@localhost:5432/allosta_test';

  execSync('npx prisma migrate reset --force --skip-seed', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
