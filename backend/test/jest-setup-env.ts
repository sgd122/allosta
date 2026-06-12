/**
 * Test isolation: redirect every integration/e2e spec to a DEDICATED test
 * database so the demo seed (prisma/seed.ts) that lives in the dev DB can never
 * pollute test state.
 *
 * Why this is needed: GET /counselors/availability-calendar aggregates ALL
 * counselors' open slots and collapses same-time windows across counselors into
 * one representative entry. The demo seed grid (both demo counselors, weekday
 * business hours, 2026-06..09) collides with slots that specs create at the same
 * times, so a spec's slot can be shadowed by a demo slot — a real isolation bug
 * (see booking-redesign.spec.ts). Tests own their data via seedIsolated islands
 * and must run against a DB that contains ONLY those islands.
 *
 * This runs via jest `setupFiles` BEFORE AppModule/ConfigModule boots. Prisma 5
 * reads process.env.DATABASE_URL at client construction, and @nestjs/config does
 * not override an already-set process.env var, so this assignment wins.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://allosta:allosta@localhost:5432/allosta_test';

process.env.DATABASE_URL = TEST_DATABASE_URL;

/**
 * Ollama isolation: the suite must assume NO local LLM (ADR 0014 fail-soft
 * default), so the deterministic FALLBACK summary is always the result on the
 * golden path — regardless of whether a developer happens to have `ollama serve`
 * running on the default port. We point OLLAMA_BASE_URL at a guaranteed-dead
 * loopback port so OllamaSummarizer.available() resolves false and the live
 * OpsScheduler @Interval upgrade sweep is a deterministic no-op. Specs that need
 * the UPGRADED path stub OllamaSummarizer directly via the Nest testing module.
 */
process.env.OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:1'; // unreachable by design
