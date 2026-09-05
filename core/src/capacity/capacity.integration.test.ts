import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadVerticalPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { capacityEngine, CapacityError } from './engine.js';
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
if (!reachable) console.warn('⚠ P8 tests SKIPPED: Postgres unreachable.');

const tours = loadVerticalPack('tours');

describe.runIf(reachable)('P8 — capacity engine (functional)', () => {
  const db = createDb(databaseUrl());
  const engine = capacityEngine(db, 'jm');
  const identity = identityService(db, 'jm');
  let sellerId: string;
  const users: string[] = [];

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18760000100',
      displayName: 'Tour Boss',
      role: 'seller',
    });
    const seller = await identity.createSeller({ userId: owner.id, businessName: 'Reef Tours' });
    sellerId = seller.id;
    for (let i = 0; i < 8; i++) {
      const u = await identity.findOrCreateUserByPhone({
        phone: `+1876000020${i}`,
        displayName: `Buyer ${i}`,
      });
      users.push(u.id);
    }
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  function window2seats() {
    return engine.createWindow(tours, {
      sellerId,
      startsAt: new Date('2026-08-01T14:00:00Z'),
      endsAt: new Date('2026-08-01T16:00:00Z'),
      totalUnits: 2,
      unitPriceMinor: 500_000,
    });
  }

  it('windows are vertical-pack driven: bad granularity is rejected', async () => {
    await expect(
      engine.createWindow(tours, {
        sellerId,
        startsAt: new Date('2026-08-01T14:00:00Z'),
        endsAt: new Date('2026-08-01T14:45:00Z'), // 45min vs 60min granularity
        totalUnits: 10,
        unitPriceMinor: 500_000,
      }),
    ).rejects.toThrowError(CapacityError);
    const win = await window2seats(); // 120min fits
    expect(win.total_units).toBe(2);
  });

  it('hold → confirm; full window waitlists in deterministic order', async () => {
    const win = await window2seats();
    const a = await engine.requestHold({ windowId: win.id, userId: users[0]!, units: 1 });
    const b = await engine.requestHold({ windowId: win.id, userId: users[1]!, units: 1 });
    expect(a.kind).toBe('held');
    expect(b.kind).toBe('held');

    const c = await engine.requestHold({ windowId: win.id, userId: users[2]!, units: 1 });
    const d = await engine.requestHold({ windowId: win.id, userId: users[3]!, units: 1 });
    expect(c).toEqual({ kind: 'waitlisted', position: 1 });
    expect(d).toEqual({ kind: 'waitlisted', position: 2 });

    if (a.kind !== 'held') throw new Error('unreachable');
    await engine.confirmHold(a.holdId);
    // Re-confirming or confirming a non-held hold refuses.
    await expect(engine.confirmHold(a.holdId)).rejects.toThrowError(/not held/);
  });

  it('release frees units and promotes the waitlist head, in order', async () => {
    const win = await window2seats();
    const a = await engine.requestHold({ windowId: win.id, userId: users[0]!, units: 1 });
    await engine.requestHold({ windowId: win.id, userId: users[1]!, units: 1 });
    await engine.requestHold({ windowId: win.id, userId: users[2]!, units: 1 }); // waitlist #1
    await engine.requestHold({ windowId: win.id, userId: users[3]!, units: 1 }); // waitlist #2

    if (a.kind !== 'held') throw new Error('unreachable');
    await engine.releaseHold(a.holdId);
    await engine.releaseHold(a.holdId); // idempotent

    const holds = await engine.holdsFor(win.id);
    const promoted = holds.filter((h) => h.status === 'held');
    // users[1] original + users[2] promoted; users[3] still waiting.
    expect(promoted.map((h) => h.user_id)).toContain(users[2]!);
    const waitlist = await engine.waitlistFor(win.id);
    expect(waitlist.map((w) => w.user_id)).toEqual([users[3]!]);
  });

  it('expired holds are swept and the waitlist is promoted', async () => {
    const win = await window2seats();
    // TTL long enough to still be live for the second request...
    await engine.requestHold({ windowId: win.id, userId: users[0]!, units: 2, ttlMs: 400 });
    const w = await engine.requestHold({ windowId: win.id, userId: users[1]!, units: 2 });
    expect(w.kind).toBe('waitlisted');

    await new Promise((r) => setTimeout(r, 450)); // ...then let it lapse
    const swept = await engine.sweepExpiredHolds();
    expect(swept).toBeGreaterThanOrEqual(1);

    const holds = await engine.holdsFor(win.id);
    expect(holds.find((h) => h.user_id === users[0]!)?.status).toBe('expired');
    expect(holds.find((h) => h.user_id === users[1]!)?.status).toBe('held');
    expect(await engine.waitlistFor(win.id)).toHaveLength(0);
  });

  it('an expired-but-unswept hold does not count against capacity', async () => {
    const win = await window2seats();
    await engine.requestHold({ windowId: win.id, userId: users[0]!, units: 2, ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 10));
    // No sweep has run — but the expired hold must not block this booking.
    const b = await engine.requestHold({ windowId: win.id, userId: users[1]!, units: 2 });
    expect(b.kind).toBe('held');
  });

  it('rejects zero, negative, and fractional units', async () => {
    const win = await window2seats();
    for (const units of [0, -1, 1.5]) {
      await expect(
        engine.requestHold({ windowId: win.id, userId: users[0]!, units }),
      ).rejects.toThrowError(CapacityError);
    }
  });
});
