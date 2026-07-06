import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadVerticalPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { identityService } from '../identity/identity.js';
import { capacityEngine } from '../capacity/engine.js';
import { reviewsService, ReviewError, BURST_THRESHOLD } from './reviews.js';

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
if (!reachable) console.warn('⚠ P20 gate tests SKIPPED: Postgres unreachable.');

const tours = loadVerticalPack('tours');

describe.runIf(reachable)('P20 — verified reviews + fraud signals (red-team gate)', () => {
  const db = createDb(databaseUrl());
  const reviews = reviewsService(db, 'jm');
  let sellerId: string;
  let windowId: string;
  const buyers: string[] = [];

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const engine = capacityEngine(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765000000',
      displayName: 'Review Boss',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Review Reef' })).id;
    windowId = (
      await engine.createWindow(tours, {
        sellerId,
        startsAt: new Date('2026-12-10T14:00:00Z'),
        endsAt: new Date('2026-12-10T16:00:00Z'),
        totalUnits: 500,
        unitPriceMinor: 100_000,
      })
    ).id;
    for (let i = 0; i < 12; i++) {
      const u = await identity.findOrCreateUserByPhone({
        phone: `+187650001${String(i).padStart(2, '0')}`,
        displayName: `Review Buyer ${i}`,
      });
      buyers.push(u.id);
    }
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  /** A real completed+paid order for buyer i. */
  async function paidCompletedOrder(buyerUserId: string): Promise<string> {
    const order = await db
      .insertInto('orders')
      .values({
        market_id: 'jm',
        seller_id: sellerId,
        buyer_user_id: buyerUserId,
        window_id: windowId,
        vertical_id: 'tours',
        units: 1,
        status: 'completed',
        completion_proof: 'qr_scan',
        completed_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await reviews.ledger.capture({
      orderRef: order.id,
      amountMinor: 100_000,
      currency: 'JMD',
      idempotencyKey: `cap:${order.id}`,
    });
    return order.id;
  }

  it('RED-TEAM: the no-booking persona is refused outright', async () => {
    // No order at all.
    await expect(
      reviews.submitReview({
        orderId: '00000000-0000-4000-8000-000000000000',
        buyerUserId: buyers[0]!,
        rating: 5,
        body: 'great! (fake)',
      }),
    ).rejects.toThrowError(ReviewError);

    // Someone ELSE's order on a different number.
    const realOrder = await paidCompletedOrder(buyers[0]!);
    await expect(
      reviews.submitReview({
        orderId: realOrder,
        buyerUserId: buyers[1]!, // not their booking
        rating: 5,
        body: 'me too! (fake)',
      }),
    ).rejects.toThrowError(/your own completed booking/);

    // A completed but UNPAID order.
    const unpaid = await db
      .insertInto('orders')
      .values({
        market_id: 'jm',
        seller_id: sellerId,
        buyer_user_id: buyers[2]!,
        window_id: windowId,
        vertical_id: 'tours',
        units: 1,
        status: 'completed',
        completion_proof: 'qr_scan',
        completed_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await expect(
      reviews.submitReview({
        orderId: unpaid.id,
        buyerUserId: buyers[2]!,
        rating: 5,
        body: 'never paid',
      }),
    ).rejects.toThrowError(/paid bookings/);
  });

  it('RED-TEAM: the burst ring is held from the threshold on', async () => {
    const outcomes: string[] = [];
    for (let i = 0; i < BURST_THRESHOLD + 3; i++) {
      const orderId = await paidCompletedOrder(buyers[i]!);
      const { review } = await reviews.submitReview({
        orderId,
        buyerUserId: buyers[i]!,
        rating: 5,
        body: `suspiciously glowing #${i}`,
      });
      outcomes.push(review.status);
    }
    expect(outcomes.slice(0, BURST_THRESHOLD).every((s) => s === 'published')).toBe(true);
    expect(outcomes.slice(BURST_THRESHOLD).every((s) => s === 'held')).toBe(true);
    // Held reviews never render.
    await db
      .updateTable('sellers')
      .set({ completed_orders: 50 })
      .where('id', '=', sellerId)
      .execute();
    const display = await reviews.displayFor(sellerId);
    if (display.mode !== 'reviews') throw new Error('expected reviews mode');
    expect(display.reviews.some((r) => r.body.includes('#5'))).toBe(false);
  });

  it('RED-TEAM: the competitor hit (1★ from a same-vertical seller) is held', async () => {
    const identity = identityService(db, 'jm');
    const engine = capacityEngine(db, 'jm');
    // The competitor runs their own tours business...
    const rivalUser = await identity.findOrCreateUserByPhone({
      phone: '+18765002000',
      displayName: 'Rival Owner',
      role: 'seller',
    });
    const rival = await identity.createSeller({ userId: rivalUser.id, businessName: 'Rival Reef' });
    await engine.createWindow(tours, {
      sellerId: rival.id,
      startsAt: new Date('2026-12-11T14:00:00Z'),
      endsAt: new Date('2026-12-11T16:00:00Z'),
      totalUnits: 10,
      unitPriceMinor: 100_000,
    });
    // ...books the target legitimately, then drops a hit piece.
    const orderId = await paidCompletedOrder(rivalUser.id);
    const { review, holdReason } = await reviews.submitReview({
      orderId,
      buyerUserId: rivalUser.id,
      rating: 1,
      body: 'terrible, go elsewhere',
      now: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // outside the burst window
    });
    expect(review.status).toBe('held');
    expect(holdReason).toContain('competitor');
  });

  it('GATE: a resolved 1★→4★ renders with honest history + Made it right badge', async () => {
    const buyer = buyers[10]!;
    const orderId = await paidCompletedOrder(buyer);
    const { review } = await reviews.submitReview({
      orderId,
      buyerUserId: buyer,
      rating: 1,
      body: 'boat late an nobody tell mi nutten',
      now: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    expect(review.status).toBe('published');

    await reviews.openSecondChance(review.id, sellerId);
    await reviews.updateAfterResolution({
      reviewId: review.id,
      buyerUserId: buyer,
      rating: 4,
      body: 'dem reach out, refund di late fee an carry mi back out — respect',
    });

    const display = await reviews.displayFor(sellerId);
    if (display.mode !== 'reviews') throw new Error('expected reviews mode');
    const resolved = display.reviews.find((r) => r.madeItRight);
    expect(resolved).toBeDefined();
    expect(resolved!.rating).toBe(4);
    expect(resolved!.history).toHaveLength(1); // the original 1★, VISIBLE
    expect(resolved!.history[0]!.rating).toBe(1);
    expect(resolved!.history[0]!.body).toContain('late');

    // Nobody else can update, and no update without an open window.
    await expect(
      reviews.updateAfterResolution({
        reviewId: review.id,
        buyerUserId: buyers[11]!,
        rating: 5,
        body: 'hijack',
      }),
    ).rejects.toThrowError(/only the reviewer/);
  });

  it('Early-Days display holds for the first 10 bookings', async () => {
    const identity = identityService(db, 'jm');
    const newUser = await identity.findOrCreateUserByPhone({
      phone: '+18765003000',
      displayName: 'Newcomer',
      role: 'seller',
    });
    const newcomer = await identity.createSeller({
      userId: newUser.id,
      businessName: 'Fresh Grill',
    });
    const display = await reviews.displayFor(newcomer.id);
    expect(display).toEqual({ mode: 'early_days', completedOrders: 0 });
  });

  it('Make-Good fund: financed from platform fees, pays out, never overdraws', async () => {
    // Give platform_fees a balance to fund from.
    const orderId = await paidCompletedOrder(buyers[11]!);
    await reviews.ledger.release({
      orderRef: orderId,
      currency: 'JMD',
      split: { sellerBps: 8500, platformBps: 1000, referralBps: 300, processorBps: 200 },
      idempotencyKey: `rel:${orderId}`,
      sellerId,
    });

    await reviews.fundMakeGood(5_000, 'JMD', 'mg-fund-1');
    expect(-(await reviews.ledger.accountBalance('make_good_fund'))).toBe(5_000);

    await reviews.payMakeGood(orderId, 3_000, 'JMD', 'mg-pay-1');
    expect(-(await reviews.ledger.accountBalance('make_good_fund'))).toBe(2_000);

    // Overdraw refuses.
    await expect(reviews.payMakeGood(orderId, 9_999, 'JMD', 'mg-pay-2')).rejects.toThrowError(
      /fund is short/,
    );
    const { debits, credits } = await reviews.ledger.trialBalance();
    expect(debits).toBe(credits);
  });
});
