import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadVerticalPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { capacityEngine } from './engine.js';
import { identityService } from '../identity/identity.js';

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
if (!reachable) console.warn('⚠ P8 STORM GATE SKIPPED: Postgres unreachable.');

const STORM = 500;
const SEATS = 12;

/**
 * THE oversell storm (BUILD §5.2) — part of CI forever.
 */
describe.runIf(reachable)('P8 — oversell storm (gate)', () => {
  const db = createDb(databaseUrl());
  const engine = capacityEngine(db, 'jm');
  let sellerId: string;
  let userIds: string[] = [];

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18760001000',
      displayName: 'Storm Boss',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Storm Tours' })).id;
    // 500 buyers, batch-inserted.
    const values = Array.from({ length: STORM }, (_, i) => ({
      market_id: 'jm',
      phone: `+187691${String(i).padStart(5, '0')}`,
      display_name: `Storm Buyer ${i}`,
    }));
    const inserted = await db.insertInto('users').values(values).returning('id').execute();
    userIds = inserted.map((r) => r.id);
  }, 60_000);

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  async function makeWindow() {
    return engine.createWindow(loadVerticalPack('tours'), {
      sellerId,
      startsAt: new Date('2026-08-15T14:00:00Z'),
      endsAt: new Date('2026-08-15T16:00:00Z'),
      totalUnits: SEATS,
    });
  }

  it(
    'GATE: 500 concurrent attempts on 12 seats → exactly 12 held, deterministic waitlist, zero double-holds',
    { timeout: 120_000 },
    async () => {
      const win = await makeWindow();
      const outcomes = await Promise.all(
        userIds.map((userId) => engine.requestHold({ windowId: win.id, userId, units: 1 })),
      );

      const held = outcomes.filter((o) => o.kind === 'held');
      const waitlisted = outcomes.filter((o) => o.kind === 'waitlisted');
      expect(held).toHaveLength(SEATS); // exactly 12 — never 13, never 11
      expect(waitlisted).toHaveLength(STORM - SEATS);

      // Zero double-holds: the database agrees with the outcomes.
      const holds = await engine.holdsFor(win.id);
      const active = holds.filter((h) => h.status === 'held');
      expect(active).toHaveLength(SEATS);
      expect(active.reduce((s, h) => s + h.units, 0)).toBe(SEATS);
      const distinctUsers = new Set(active.map((h) => h.user_id));
      expect(distinctUsers.size).toBe(SEATS); // no user double-held

      // Deterministic waitlist order: promotions follow insertion order.
      const waitlistBefore = await engine.waitlistFor(win.id);
      expect(waitlistBefore).toHaveLength(STORM - SEATS);
      const ids = waitlistBefore.map((w) => Number(w.id));
      expect([...ids].sort((a, b) => a - b)).toEqual(ids);

      const firstThreeWaiting = waitlistBefore.slice(0, 3).map((w) => w.user_id);
      for (const hold of active.slice(0, 3)) {
        await engine.releaseHold(hold.id);
      }
      const afterRelease = await engine.holdsFor(win.id);
      const promotedUsers = afterRelease
        .filter((h) => h.status === 'held' && firstThreeWaiting.includes(h.user_id))
        .map((h) => h.user_id);
      expect(new Set(promotedUsers)).toEqual(new Set(firstThreeWaiting));
    },
  );

  it(
    'GATE: the same storm with connections killed mid-flight never oversells',
    { timeout: 120_000 },
    async () => {
      const win = await makeWindow();
      const killer = new pg.Client({ connectionString: databaseUrl() });
      await killer.connect();

      const storm = Promise.allSettled(
        userIds.map((userId) => engine.requestHold({ windowId: win.id, userId, units: 1 })),
      );
      // While the storm runs, repeatedly kill random active backends.
      const assassin = (async () => {
        for (let round = 0; round < 5; round++) {
          await new Promise((r) => setTimeout(r, 40));
          await killer
            .query(
              `select pg_terminate_backend(pid) from pg_stat_activity
               where pid <> pg_backend_pid() and state = 'active'
                 and query ilike '%capacity%' limit 2`,
            )
            .catch(() => {});
        }
      })();

      const [outcomes] = await Promise.all([storm, assassin]);
      await killer.end();

      const held = outcomes.filter((o) => o.status === 'fulfilled' && o.value.kind === 'held');
      const failed = outcomes.filter((o) => o.status === 'rejected');
      // Some attempts died with their connections — that is the point.
      // The INVARIANT: whatever survived, the window never oversold.
      const holds = await engine.holdsFor(win.id);
      const active = holds.filter((h) => h.status === 'held');
      expect(active.length).toBeLessThanOrEqual(SEATS);
      expect(active.reduce((s, h) => s + h.units, 0)).toBeLessThanOrEqual(SEATS);
      expect(held.length).toBe(active.length);
      expect(new Set(active.map((h) => h.user_id)).size).toBe(active.length);
      console.log(
        `kill-storm: ${held.length} held, ${failed.length} killed, ` +
          `${outcomes.length - held.length - failed.length} waitlisted — zero oversell`,
      );
    },
  );
});
