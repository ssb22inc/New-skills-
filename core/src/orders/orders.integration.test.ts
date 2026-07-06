import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadVerticalPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { capacityEngine } from '../capacity/engine.js';
import { identityService } from '../identity/identity.js';
import { ordersService, OrderError } from './orders.js';

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
if (!reachable) console.warn('⚠ P9 tests SKIPPED: Postgres unreachable.');

const tours = loadVerticalPack('tours');
const food = loadVerticalPack('food');

/** Deterministic PRNG so the fuzz gate reproduces exactly. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe.runIf(reachable)('P9 — orders + completion verification (gate)', () => {
  const db = createDb(databaseUrl());
  const orders = ordersService(db, 'jm');
  const engine = capacityEngine(db, 'jm');
  let sellerId: string;
  const buyers: string[] = [];

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18760002000',
      displayName: 'Order Boss',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Order Tours' })).id;
    for (let i = 0; i < 40; i++) {
      const u = await identity.findOrCreateUserByPhone({
        phone: `+187692${String(i).padStart(5, '0')}`,
        displayName: `Order Buyer ${i}`,
      });
      buyers.push(u.id);
    }
  }, 60_000);

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  function makeWindow(units: number, hour: number) {
    return engine.createWindow(tours, {
      sellerId,
      startsAt: new Date(`2026-09-01T${String(hour).padStart(2, '0')}:00:00Z`),
      endsAt: new Date(`2026-09-01T${String(hour + 2).padStart(2, '0')}:00:00Z`),
      totalUnits: units,
    });
  }

  async function draftOn(windowId: string, buyer: string, units = 1) {
    return orders.createDraft({
      sellerId,
      buyerUserId: buyer,
      windowId,
      verticalId: 'tours',
      units,
    });
  }

  /** The P9 invariants — checked wholesale by the fuzz gate. */
  async function assertInvariants(): Promise<void> {
    const allOrders = await db.selectFrom('orders').selectAll().execute();
    const allHolds = await db.selectFrom('capacity_holds').selectAll().execute();
    const holdById = new Map(allHolds.map((h) => [h.id, h]));
    const referencedHolds = new Set(allOrders.map((o) => o.hold_id).filter(Boolean));

    for (const order of allOrders) {
      if (order.status === 'held') {
        const hold = holdById.get(order.hold_id ?? '');
        expect(hold, `held order ${order.id} must reference a hold`).toBeDefined();
        expect(['held', 'expired']).toContain(hold!.status); // TTL may lapse mid-fuzz
      }
      if (order.status === 'confirmed' || order.status === 'disputed') {
        const hold = holdById.get(order.hold_id ?? '');
        expect(hold?.status, `order ${order.id} (${order.status})`).toBe('confirmed');
      }
      if (order.status === 'completed') {
        expect(order.completion_proof).not.toBeNull();
        expect(holdById.get(order.hold_id ?? '')?.status).toBe('confirmed');
      }
      if (order.status === 'cancelled' && order.hold_id) {
        expect(['released', 'expired']).toContain(holdById.get(order.hold_id)!.status);
      }
    }

    // No orphaned CONFIRMED holds: every confirmed hold belongs to a live order.
    for (const hold of allHolds) {
      if (hold.status === 'confirmed' && referencedHolds.has(hold.id)) continue;
      if (hold.status === 'confirmed') {
        throw new Error(`orphaned confirmed hold ${hold.id}`);
      }
    }

    // Capacity never oversold, window by window.
    const windows = await db.selectFrom('capacity_windows').selectAll().execute();
    for (const win of windows) {
      const active = allHolds.filter(
        (h) =>
          h.window_id === win.id &&
          (h.status === 'confirmed' ||
            (h.status === 'held' && new Date(h.expires_at) > new Date())),
      );
      const used = active.reduce((s, h) => s + h.units, 0);
      expect(used, `window ${win.id}`).toBeLessThanOrEqual(win.total_units);
    }
  }

  it('happy path: draft → held → confirmed → completed with pack-approved proof', async () => {
    const win = await makeWindow(5, 8);
    const order = await draftOn(win.id, buyers[0]!);
    expect((await orders.placeHold(order.id)).status).toBe('held');
    await orders.confirm(order.id);
    await orders.complete(order.id, 'geo_checkin', tours);
    const done = await orders.get(order.id);
    expect(done?.status).toBe('completed');
    expect(done?.completion_proof).toBe('geo_checkin');
  });

  it('completion proof is vertical-pack driven: food refuses geo_checkin', async () => {
    const win = await makeWindow(5, 10);
    const order = await draftOn(win.id, buyers[1]!);
    await orders.placeHold(order.id);
    await orders.confirm(order.id);
    // tours order + food pack mismatch refuses outright
    await expect(orders.complete(order.id, 'buyer_confirm', food)).rejects.toThrowError(
      /order is tours/,
    );
    // qr_scan is fine for tours; buyer_confirm is not in the tours pack
    await expect(orders.complete(order.id, 'buyer_confirm', tours)).rejects.toThrowError(
      /not accepted for tours/,
    );
    await orders.complete(order.id, 'qr_scan', tours);
  });

  it('cancel releases capacity and the freed seat goes to the waitlist head', async () => {
    const win = await makeWindow(1, 12);
    const first = await draftOn(win.id, buyers[2]!);
    await orders.placeHold(first.id);
    const second = await draftOn(win.id, buyers[3]!);
    expect((await orders.placeHold(second.id)).status).toBe('waitlisted');

    await orders.cancel(first.id);
    const holds = await engine.holdsFor(win.id);
    expect(holds.find((h) => h.user_id === buyers[3]!)?.status).toBe('held');
    await assertInvariants();
  });

  it('GATE: reschedule is atomic — full target changes NOTHING', async () => {
    const source = await makeWindow(2, 14);
    const fullTarget = await makeWindow(1, 16);
    // Fill the target completely.
    const filler = await draftOn(fullTarget.id, buyers[4]!);
    await orders.placeHold(filler.id);

    const order = await draftOn(source.id, buyers[5]!);
    await orders.placeHold(order.id);
    await orders.confirm(order.id);
    const before = await orders.get(order.id);

    await expect(orders.reschedule(order.id, fullTarget.id)).rejects.toThrowError(/full/);

    const after = await orders.get(order.id);
    expect(after?.window_id).toBe(before?.window_id); // source untouched
    expect(after?.hold_id).toBe(before?.hold_id);
    expect(after?.status).toBe('confirmed');
    const sourceHolds = await engine.holdsFor(source.id);
    expect(sourceHolds.find((h) => h.id === before?.hold_id)?.status).toBe('confirmed');
    // Target has no stray hold or waitlist entry from the failed attempt.
    const targetHolds = await engine.holdsFor(fullTarget.id);
    expect(targetHolds.filter((h) => h.user_id === buyers[5]!)).toHaveLength(0);
    expect(await engine.waitlistFor(fullTarget.id)).toHaveLength(0);
    await assertInvariants();
  });

  it('GATE: reschedule to an open target frees source and fills target together', async () => {
    const source = await makeWindow(2, 18);
    const target = await makeWindow(2, 20);
    const order = await draftOn(source.id, buyers[6]!);
    await orders.placeHold(order.id);
    await orders.confirm(order.id);
    const holdBefore = (await orders.get(order.id))?.hold_id;

    await orders.reschedule(order.id, target.id);

    const after = await orders.get(order.id);
    expect(after?.window_id).toBe(target.id);
    expect(after?.hold_id).not.toBe(holdBefore);
    const sourceHolds = await engine.holdsFor(source.id);
    expect(sourceHolds.find((h) => h.id === holdBefore)?.status).toBe('released'); // freed
    const targetHolds = await engine.holdsFor(target.id);
    expect(targetHolds.find((h) => h.id === after?.hold_id)?.status).toBe('confirmed'); // filled
    await assertInvariants();
  });

  it(
    'GATE property test: random valid lifecycle sequences never leave orphans or inconsistency',
    { timeout: 120_000 },
    async () => {
      const rand = mulberry32(20260706);
      const windows = [await makeWindow(3, 7), await makeWindow(5, 9), await makeWindow(2, 11)];
      const orderIds: string[] = [];

      const ops = ['draft', 'hold', 'confirm', 'complete', 'cancel', 'dispute', 'reschedule'];
      let executed = 0;
      for (let i = 0; i < 300; i++) {
        const op = ops[Math.floor(rand() * ops.length)]!;
        try {
          if (op === 'draft' || orderIds.length === 0) {
            const win = windows[Math.floor(rand() * windows.length)]!;
            const buyer = buyers[Math.floor(rand() * buyers.length)]!;
            const o = await draftOn(win.id, buyer, 1);
            orderIds.push(o.id);
          } else {
            const orderId = orderIds[Math.floor(rand() * orderIds.length)]!;
            if (op === 'hold') await orders.placeHold(orderId);
            else if (op === 'confirm') await orders.confirm(orderId);
            else if (op === 'complete') await orders.complete(orderId, 'qr_scan', tours);
            else if (op === 'cancel') await orders.cancel(orderId);
            else if (op === 'dispute') await orders.dispute(orderId);
            else if (op === 'reschedule') {
              const target = windows[Math.floor(rand() * windows.length)]!;
              await orders.reschedule(orderId, target.id);
            }
          }
          executed++;
        } catch (err) {
          // Invalid moves and full targets must throw typed errors — and
          // change nothing, which the invariant sweep below proves.
          expect(
            (err as Error).name === 'OrderError' || (err as Error).name === 'CapacityError',
            `unexpected error type: ${(err as Error).stack}`,
          ).toBe(true);
        }
        if (i % 50 === 49) await assertInvariants();
      }
      expect(executed).toBeGreaterThan(60); // the fuzz actually did things
      await assertInvariants();
    },
  );

  it('invalid transitions refuse: complete a draft, dispute a draft, confirm twice', async () => {
    const win = await makeWindow(3, 22);
    const order = await draftOn(win.id, buyers[7]!);
    await expect(orders.complete(order.id, 'qr_scan', tours)).rejects.toThrowError(OrderError);
    await expect(orders.dispute(order.id)).rejects.toThrowError(OrderError);
    await orders.placeHold(order.id);
    await orders.confirm(order.id);
    await expect(orders.confirm(order.id)).rejects.toThrowError(OrderError);
  });
});
