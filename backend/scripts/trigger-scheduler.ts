/**
 * Standalone CLI script: deterministic scheduler trigger for demo / README.
 *
 * Plan §4 Phase 3 — Architect demo-determinism:
 * "provide trigger-scheduler.ts for deterministic CLI demo".
 *
 * Usage:
 *   pnpm exec ts-node -r tsconfig-paths/register scripts/trigger-scheduler.ts
 *
 * Boots an application context (AppModule), resolves NotificationService,
 * dispatches all due PENDING notifications, logs the count, then exits.
 * No HTTP server is started — this is a fire-and-exit context.
 *
 * NOTE: AppModule does not yet wire NotificationModule (the lead wires it in
 * Wave 5). Once NotificationModule is added to AppModule imports, this script
 * will resolve NotificationService from the context automatically.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { NotificationService } from '../src/notification/notification.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  const notificationService = app.get(NotificationService);
  const dispatched = await notificationService.dispatchPending();

  // eslint-disable-next-line no-console
  console.log(`[trigger-scheduler] dispatched=${dispatched}`);

  await app.close();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`[trigger-scheduler] error: ${message}`);
  process.exit(1);
});
