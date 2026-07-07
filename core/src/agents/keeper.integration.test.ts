import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadVerticalPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { identityService } from '../identity/identity.js';
import { capacityEngine } from '../capacity/engine.js';
import { listenerService } from './listener.js';
import { scoutService } from './scout.js';
import { mentorService } from './mentor.js';

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
if (!reachable) console.warn('⚠ P28 gate tests SKIPPED: Postgres unreachable.');

const food = loadVerticalPack('food');

describe.runIf(reachable)('P28 — Listener + Scout + Mentor (gate)', () => {
  const db = createDb(databaseUrl());
  const listener = listenerService(db, 'jm');
  const scout = scoutService(db, 'jm');
  const mentor = mentorService(db, 'jm', food);
  const buyerIds: string[] = [];
  let sellerId: string;
  let windowId: string;

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const engine = capacityEngine(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765200000',
      displayName: 'Mentor Target',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Pearl Pot' })).id;
    windowId = (
      await engine.createWindow(food, {
        sellerId,
        startsAt: new Date('2026-12-12T12:00:00Z'),
        endsAt: new Date('2026-12-12T14:00:00Z'),
        totalUnits: 500,
        unitPriceMinor: 150_000,
      })
    ).id;
    for (let i = 0; i < 8; i++) {
      const u = await identity.findOrCreateUserByPhone({
        phone: `+187652001${String(i).padStart(2, '0')}`,
        displayName: `Keeper Buyer ${i}`,
      });
      buyerIds.push(u.id);
    }
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: the survey→radar loop closes on seeded data', async () => {
    // Monthly one-tap survey, idempotent per month.
    expect((await listener.sendMonthlySurvey(buyerIds[0]!, '2026-07')).sent).toBe(true);
    expect((await listener.sendMonthlySurvey(buyerIds[0]!, '2026-07')).sent).toBe(false);

    // Seeded responses: a payment pain cluster + one delivery gripe + happy taps.
    const gripes = [
      'the payment link took three tries',
      'pay link never worked first time',
      'card payment kept failing',
      'payment page slow bad',
    ];
    for (let i = 0; i < gripes.length; i++) {
      await listener.recordResponse({ userId: buyerIds[i]!, thumbsUp: false, comment: gripes[i] });
    }
    await listener.recordResponse({
      userId: buyerIds[4]!,
      thumbsUp: false,
      comment: 'delivery late one time',
    });
    await listener.recordResponse({ userId: buyerIds[5]!, thumbsUp: true });

    const patterns = await listener.minePatterns();
    expect(patterns[0]).toMatchObject({ lane: 'payment', count: 4 });

    // Scout: assessor grants payment full clearance + revenue estimate;
    // delivery gets no revenue estimate — it must park.
    await scout.fromPatterns(patterns, (p) =>
      p.lane === 'payment'
        ? { marketScore: 70, laneClearance: true, revenueEstimateMinor: 2_000_000 }
        : { marketScore: 60, laneClearance: true },
    );
    const radar = await scout.radar();
    expect(radar).toHaveLength(1);
    expect(radar[0]!.lane).toBe('payment');
    expect(Number(radar[0]!.revenue_estimate_minor)).toBe(2_000_000);

    // The parked item is on record with its numbers, not deleted.
    const parked = await db
      .selectFrom('radar_items')
      .where('status', '=', 'parked')
      .selectAll()
      .execute();
    expect(parked).toHaveLength(1);
    expect(parked[0]!.lane).toBe('delivery');
  });

  it('GATE: Mentor message passes the honesty rules — every line cites a data source', async () => {
    // Seed the seller's own data: catalog (stale photo), completed orders
    // with repeaters, reviews that hit vertical-pack heuristics.
    await db
      .insertInto('catalog_items')
      .values({
        market_id: 'jm',
        seller_id: sellerId,
        name: 'Oxtail plate',
        photo_ref: 'photo-oxtail',
        price_minor: 150_000,
      })
      .execute();
    await db
      .updateTable('catalog_items')
      .set({ updated_at: new Date(Date.now() - 90 * 86_400_000) })
      .where('seller_id', '=', sellerId)
      .execute();

    async function completedOrder(buyerId: string) {
      return db
        .insertInto('orders')
        .values({
          market_id: 'jm',
          seller_id: sellerId,
          buyer_user_id: buyerId,
          window_id: windowId,
          vertical_id: 'food',
          units: 1,
          status: 'completed',
          completion_proof: 'buyer_confirm',
          completed_at: new Date(),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    }
    // 6 buyers, 3 of them repeat → repeat rate 50%.
    const orderIds: string[] = [];
    for (let i = 0; i < 6; i++) orderIds.push((await completedOrder(buyerIds[i]!)).id);
    for (let i = 0; i < 3; i++) orderIds.push((await completedOrder(buyerIds[i]!)).id);

    // Reviews: two cold-food complaints (observable: temperature), two
    // portion raves, and one the Mentor must NOT touch — taste.
    const seed = [
      { order: 0, rating: 2, body: 'food reach cold, had to microwave' },
      { order: 1, rating: 3, body: 'plate was lukewarm when it reach' },
      { order: 2, rating: 5, body: 'big portion, real value' },
      { order: 3, rating: 5, body: 'portion generous every time' },
      { order: 4, rating: 2, body: 'just did not like the taste' },
    ];
    for (const r of seed) {
      await db
        .insertInto('reviews')
        .values({
          market_id: 'jm',
          order_id: orderIds[r.order]!,
          seller_id: sellerId,
          buyer_user_id: buyerIds[r.order]!,
          rating: r.rating,
          body: r.body,
        })
        .execute();
    }

    const weekly = await mentor.weeklyMessage(sellerId);
    expect(weekly).not.toBeNull();

    // Max 2 suggestions + 1 genuine strength.
    expect(weekly!.suggestions.length).toBeLessThanOrEqual(2);
    expect(weekly!.suggestions.length).toBeGreaterThan(0);
    expect(weekly!.strength).not.toBeNull();

    // HONESTY: every line carries its internal data source citation.
    for (const finding of [...weekly!.suggestions, weekly!.strength!]) {
      expect(finding.source.kind).toMatch(/^(reviews|orders|catalog)$/);
      expect(finding.source.evidence.length).toBeGreaterThan(0);
    }
    // Temperature (observable, in the pack) is advised on…
    expect(weekly!.suggestions.map((s) => s.signal)).toContain('temperature');
    // …taste (not observable, not in the pack) never appears.
    for (const finding of [...weekly!.suggestions, weekly!.strength!]) {
      expect(finding.signal).not.toBe('taste');
      expect(finding.text.toLowerCase()).not.toContain('taste');
    }
  });

  it('GATE: skip-when-nothing rule — a seller with no signals gets silence, not filler', async () => {
    const identity = identityService(db, 'jm');
    const quietOwner = await identity.findOrCreateUserByPhone({
      phone: '+18765209999',
      displayName: 'Quiet Seller',
      role: 'seller',
    });
    const quiet = await identity.createSeller({
      userId: quietOwner.id,
      businessName: 'Quiet Kitchen',
    });
    expect(await mentor.weeklyMessage(quiet.id)).toBeNull();
  });
});
