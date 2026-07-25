/**
 * Worker entrypoint: `pnpm --filter @sycamore/worker dev`
 * Runs the hold-expiry sweeper for every LIVE market (dark markets no-op
 * by construction — their data cannot exist).
 */
import {
  academyService,
  capacityEngine,
  createDb,
  createLogger,
  databaseUrl,
  marketsRegistry,
} from '@sycamore/core';

const log = createLogger('worker');
const db = createDb(databaseUrl());
const registry = marketsRegistry(db);

const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS ?? 5000);

async function sweepAll(): Promise<void> {
  for (const marketId of await registry.listLive()) {
    const swept = await capacityEngine(db, marketId).sweepExpiredHolds();
    if (swept > 0) log.info({ marketId, swept }, 'expired holds swept');
    // Daily study reminders: idempotent per learner per day, so running
    // on the sweep interval costs one indexed query when nothing is due.
    const reminders = await academyService(db, marketId).reminderTick();
    if (reminders.sent > 0) log.info({ marketId, ...reminders }, 'study reminders queued');
  }
}

log.info({ intervalMs: SWEEP_INTERVAL_MS }, 'worker started');
setInterval(() => {
  sweepAll().catch((err: unknown) => log.error({ err }, 'sweep failed'));
}, SWEEP_INTERVAL_MS);
