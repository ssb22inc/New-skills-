/**
 * P36 GATE — the installed-client offline drill (extends the P34 blackout
 * drill).
 *
 * An INSTALLED seller, network fully disabled for 48h of simulated time:
 * they open the client, see the cached day, mark orders done, and go on
 * working. On reconnect the queue replays — twice over, because the phone
 * resent everything — and the money reconciles to the cent with zero
 * duplicate side effects.
 *
 * The client here is a harness, not a browser: the service worker's day
 * cache is a variable, the page's queue is an array, and the replay is
 * P34's `replayOfflineQueue` — the exact code the route calls.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  capacityEngine,
  createDb,
  databaseUrl,
  identityService,
  installOfferService,
  ledgerService,
  migrateDownAll,
  migrateToLatest,
  ordersService,
  replayOfflineQueue,
  seedMarkets,
  sellerInstallRate,
  type OfflineAction,
} from '@sycamore/core';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';
import type { LlmRouter } from '@sycamore/adapters';

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
if (!reachable) console.warn('⚠ P36 installed-client drill SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
const tours = loadVerticalPack('tours');
const ORDERS = 6;
const PRICE = 100_000;
const SPLIT = { sellerBps: 8800, platformBps: 1000, referralBps: 0, processorBps: 200 };
const T0 = new Date('2026-10-10T09:00:00Z');
const T48 = new Date(T0.getTime() + 48 * 3_600_000);

const router: LlmRouter = {
  complete: () =>
    Promise.resolve({ text: 'Put Sycamore pon yuh home screen.', providerId: 'stub', model: 'x' }),
};

/** What the service worker holds, and what the page queues. */
interface CachedDay {
  capturedAt: string;
  openOrders: { id: string; units: number; buyerName: string }[];
  capacity: { windowId: string; available: number }[];
  contacts: { phone: string }[];
  catalog: { id: string; name: string }[];
}

describe.runIf(reachable)('P36 — the installed client survives 48h dark (gate)', () => {
  const db = createDb(databaseUrl());
  const orders = ordersService(db, 'jm');
  const ledger = ledgerService(db, 'jm');
  let sellerId = '';
  let ownerUserId = '';
  let windowId = '';
  const orderIds: string[] = [];

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765600000',
      displayName: 'Installed Seller',
      role: 'seller',
    });
    ownerUserId = owner.id;
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Rio Bueno Boats' }))
      .id;
    windowId = (
      await capacityEngine(db, 'jm').createWindow(tours, {
        sellerId,
        startsAt: new Date('2026-10-12T14:00:00Z'),
        endsAt: new Date('2026-10-12T16:00:00Z'),
        totalUnits: 30,
        unitPriceMinor: PRICE,
      })
    ).id;
    for (let i = 0; i < ORDERS; i++) {
      const buyer = await identity.findOrCreateUserByPhone({
        phone: `+187656001${String(i).padStart(2, '0')}`,
        displayName: `Boat Buyer ${i}`,
      });
      const draft = await orders.createDraft({
        sellerId,
        buyerUserId: buyer.id,
        windowId,
        verticalId: 'tours',
        units: 1,
      });
      await orders.placeHold(draft.id);
      await orders.confirm(draft.id);
      await ledger.capture({
        orderRef: draft.id,
        amountMinor: PRICE,
        currency: 'JMD',
        idempotencyKey: `installed-cap:${draft.id}`,
      });
      orderIds.push(draft.id);
    }
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: cached day readable dark, completions queue, replay is exactly-once, money to the cent', async () => {
    const installs = installOfferService(
      { db, router, pack: jm, appOrigin: 'https://sycamore.app' },
      'jm',
    );
    await installs.recordInstalled(sellerId, T0);
    expect(await installs.stateOf(sellerId)).toBe('installed');
    expect((await sellerInstallRate(db, 'jm')).rate).toBe(1);

    // ── Still online: the worker caches the seller's day. ──────────────
    const engine = capacityEngine(db, 'jm');
    const open = await db
      .selectFrom('orders')
      .innerJoin('users', 'users.id', 'orders.buyer_user_id')
      .where('orders.market_id', '=', 'jm')
      .where('orders.seller_id', '=', sellerId)
      .where('orders.status', '=', 'confirmed')
      .select(['orders.id', 'orders.units', 'users.display_name as buyer_name', 'users.phone'])
      .execute();
    const cachedDay: CachedDay = {
      capturedAt: T0.toISOString(),
      openOrders: open.map((o) => ({ id: o.id, units: o.units, buyerName: o.buyer_name })),
      capacity: [{ windowId, available: (await engine.availability(windowId)).available }],
      contacts: open.map((o) => ({ phone: o.phone })),
      catalog: [],
    };

    // ── 09:00 — the network is gone. Every call throws, for 48h. ──────
    const networkDown = () => Promise.reject(new Error('offline'));
    await expect(networkDown()).rejects.toThrow('offline');

    // The client still opens and the day is still readable — from cache,
    // and honestly labelled as of T0 rather than passed off as live.
    expect(cachedDay.openOrders).toHaveLength(ORDERS);
    expect(cachedDay.capacity[0]!.available).toBe(30 - ORDERS);
    expect(cachedDay.contacts).toHaveLength(ORDERS);
    expect(new Date(cachedDay.capturedAt).getTime()).toBeLessThan(T48.getTime());

    // The seller works anyway: every tour run, every order marked done.
    // Keys are minted ONCE, at the tap, exactly as the page does it.
    const queue: OfflineAction[] = cachedDay.openOrders.map((o) => ({
      idempotencyKey: `complete:${o.id}`,
      kind: 'complete_order',
      payload: { orderId: o.id },
    }));
    expect(queue).toHaveLength(ORDERS);

    // ── T+48h — signal back. The phone crashed mid-sync and resends the
    // whole queue on top of the batch already in flight. ──────────────
    let completions = 0;
    const handlers = {
      complete_order: async (payload: unknown) => {
        const { orderId } = payload as { orderId: string };
        await orders.complete(orderId, 'qr_scan', tours);
        completions++;
      },
    };
    const first = await replayOfflineQueue(db, 'jm', queue, handlers);
    const resend = await replayOfflineQueue(db, 'jm', queue, handlers);

    expect(first.applied).toBe(ORDERS);
    expect(first.duplicates).toBe(0);
    expect(resend.applied).toBe(0); // the resend changed nothing
    expect(resend.duplicates).toBe(ORDERS);
    expect(completions).toBe(ORDERS); // zero duplicate side effects

    const completed = await db
      .selectFrom('orders')
      .where('market_id', '=', 'jm')
      .where('seller_id', '=', sellerId)
      .where('status', '=', 'completed')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .executeTakeFirstOrThrow();
    expect(Number(completed.n)).toBe(ORDERS);

    // Money settles once the island is back, and reconciles to the cent.
    for (const orderId of orderIds) {
      const release = await ledger.release({
        orderRef: orderId,
        currency: 'JMD',
        split: SPLIT,
        idempotencyKey: `installed-rel:${orderId}`,
        sellerId,
      });
      expect(release.posted).toBe(true);
    }
    const balance = await ledger.trialBalance();
    expect(balance.debits).toBe(balance.credits);

    // One order completion produced exactly one completion event.
    const events = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'order.completed')
      .selectAll()
      .execute();
    expect(events).toHaveLength(ORDERS);

    console.info(
      `Installed-client drill: ${ORDERS} completions queued dark for 48h, ` +
        `replayed twice, ${first.applied} applied / ${resend.duplicates} duplicates ignored, ` +
        `ledger balanced at ${balance.debits}`,
    );
  });

  it('an installed seller is never prompted again — the offer path is closed', async () => {
    const installs = installOfferService(
      { db, router, pack: jm, appOrigin: 'https://sycamore.app' },
      'jm',
    );
    expect(await installs.evaluate(sellerId, { duringGenesis: false, now: T48 })).toEqual({
      offer: false,
      reason: 'already_installed',
    });
    await expect(
      installs.offer({ sellerId, userId: ownerUserId, trigger: 'first_payout_settled' }),
    ).rejects.toThrow();
  });
});
