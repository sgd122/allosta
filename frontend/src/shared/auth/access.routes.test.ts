/**
 * Drift guard: the protected-route policy lives in three places that must stay
 * in sync, and nothing at runtime forces them to:
 *
 *   1. the route-group folders on disk  — src/app/(admin|counselor|customer)/*
 *   2. ROUTE_ROLES                       — src/shared/auth/access.ts
 *   3. config.matcher                    — src/middleware.ts (must be a static
 *                                          literal, so it can't be derived)
 *
 * If a page is added under a protected group but not added to ROUTE_ROLES and
 * the matcher, the middleware never runs for it and it ships unguarded. These
 * tests fail the build the moment any of the three diverge.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ROUTE_ROLES } from './access';

const HERE = dirname(fileURLToPath(import.meta.url)); // src/shared/auth
const APP_DIR = join(HERE, '..', '..', 'app');
const MIDDLEWARE_FILE = join(HERE, '..', '..', 'middleware.ts');
const PROTECTED_GROUPS = ['(admin)', '(counselor)', '(customer)'];

/** Top-level route segments physically present under each protected group. */
function protectedSegmentsOnDisk(): string[] {
  return PROTECTED_GROUPS.flatMap((group) =>
    readdirSync(join(APP_DIR, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `/${entry.name}`),
  );
}

/** Prefixes declared in `config.matcher`, parsed from the middleware source. */
function matcherPrefixes(): string[] {
  const src = readFileSync(MIDDLEWARE_FILE, 'utf8');
  return Array.from(src.matchAll(/'(\/[A-Za-z0-9-]+)\/:path\*'/g), (m) => m[1]);
}

const declaredPrefixes = Object.values(ROUTE_ROLES).flat();

describe('protected-route policy has no drift', () => {
  test('every protected page on disk is owned by a role in ROUTE_ROLES', () => {
    for (const segment of protectedSegmentsOnDisk()) {
      expect(declaredPrefixes).toContain(segment);
    }
  });

  test('every ROUTE_ROLES prefix is covered by the middleware matcher', () => {
    const matched = matcherPrefixes();
    for (const prefix of declaredPrefixes) {
      expect(matched).toContain(prefix);
    }
  });

  test('the middleware matcher has no prefix missing from ROUTE_ROLES', () => {
    for (const prefix of matcherPrefixes()) {
      expect(declaredPrefixes).toContain(prefix);
    }
  });
});
