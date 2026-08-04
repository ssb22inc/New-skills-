/**
 * Worker entrypoint: `pnpm --filter @sycamore/worker dev`
 * Runs the hold-expiry sweeper for every LIVE market (dark markets no-op
 * by construction — their data cannot exist).
 */
import {
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
  }
}

log.info({ intervalMs: SWEEP_INTERVAL_MS }, 'worker started');
setInterval(() => {
  sweepAll().catch((err: unknown) => log.error({ err }, 'sweep failed'));
}, SWEEP_INTERVAL_MS);
