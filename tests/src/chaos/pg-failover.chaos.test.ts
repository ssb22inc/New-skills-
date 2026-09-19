/**
 * Chaos drill (BUILD §5.6, monthly): Postgres failover mid-booking-storm
 * → capacity invariants hold (§5.2). This is the drill-sized storm; the
 * full 500-attempt kill-storm runs permanently in
 * core/src/capacity/oversell.storm.integration.test.ts.
 * Run alone: `pnpm --filter @sycamore/tests chaos:pg-failover`
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  capacityEngine,
  createDb,
  databaseUrl,
  identityService,
  migrateDownAll,
  migrateToLatest,
  seedMarkets,
} from '@sycamore/core';
import { loadVerticalPack } from '@sycamore/packs';

async function postgresReachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: databaseUrl(), connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const reachable = await postgresReachable();
if (!reachable) console.warn('⚠ pg-failover chaos drill SKIPPED: Postgres unreachable.');

const SEATS = 5;
const ATTEMPTS = 100;

describe.runIf(reachable)('chaos drill — PG failover mid-booking-storm', () => {
  const db = createDb(databaseUrl());
  const tours = loadVerticalPack('tours');

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('kills backends mid-storm; never a single oversold seat', async () => {
    const identity = identityService(db, 'jm');
    const engine = capacityEngine(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765500000',
      displayName: 'Failover Seller',
      role: 'seller',
    });
    const seller = await identity.createSeller({
      userId: owner.id,
      businessName: 'Failover Tours',
    });
    const window = await engine.createWindow(tours, {
      sellerId: seller.id,
      startsAt: new Date('2026-12-01T14:00:00Z'),
      endsAt: new Date('2026-12-01T16:00:00Z'),
      totalUnits: SEATS,
      unitPriceMinor: 100_000,
    });
    const buyerIds = await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, i) =>
        identity
          .findOrCreateUserByPhone({
            phone: `+1876551${String(i).padStart(4, '0')}`,
            displayName: `Chaos Buyer ${i}`,
          })
          .then((u) => u.id),
      ),
    );

    const killer = new pg.Client({ connectionString: databaseUrl() });
    await killer.connect();
    let storming = true;
    const chaos = (async () => {
      while (storming) {
        await killer
          .query(
            `select pg_terminate_backend(pid) from pg_stat_activity
             where pid <> pg_backend_pid() and state = 'active'
             and query ilike '%capacity_windows%' limit 2`,
          )
          .catch(() => {});
        await new Promise((r) => setTimeout(r, 25));
      }
    })();

    const attempts = await Promise.all(
      buyerIds.map((userId) =>
        engine
          .requestHold({ windowId: window.id, userId, units: 1 })
          .then((r) => r.kind)
          .catch(() => 'error' as const),
      ),
    );
    storming = false;
    await chaos;
    await killer.end();

    const held = attempts.filter((k) => k === 'held').length;
    expect(held).toBeLessThanOrEqual(SEATS); // NEVER oversold, even mid-failover
    const availability = await engine.availability(window.id);
    expect(availability.available).toBe(SEATS - held);
  });
});
