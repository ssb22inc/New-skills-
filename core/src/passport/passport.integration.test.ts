import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { identityService } from '../identity/identity.js';
import { capacityEngine } from '../capacity/engine.js';
import { ordersService } from '../orders/orders.js';
import { ledgerService } from '../ledger/ledger.js';
import {
  canonicalJson,
  generatePassportKeys,
  passportService,
  verifyPassport,
  type CreditPassport,
} from './passport.js';

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
if (!reachable) console.warn('⚠ P33 gate tests SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
const tours = loadVerticalPack('tours');
const N_ORDERS = 6;
const PRICE = 100_000;
const SPLIT = { sellerBps: 8500, platformBps: 1000, referralBps: 300, processorBps: 200 };

describe.runIf(reachable)('P33 — Credit Passport v1 (gate)', () => {
  const db = createDb(databaseUrl());
  const keys = generatePassportKeys();
  const passports = passportService(db, 'jm', jm, keys);
  const ledger = ledgerService(db, 'jm');
  let sellerId: string;

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const engine = capacityEngine(db, 'jm');
    const orders = ordersService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765600000',
      displayName: 'Passport Seller',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Blue Hole Tours' }))
      .id;
    const window = await engine.createWindow(tours, {
      sellerId,
      startsAt: new Date('2026-11-01T14:00:00Z'),
      endsAt: new Date('2026-11-01T16:00:00Z'),
      totalUnits: 20,
      unitPriceMinor: PRICE,
    });
    for (let i = 0; i < N_ORDERS; i++) {
      const buyer = await identity.findOrCreateUserByPhone({
        phone: `+187656001${String(i).padStart(2, '0')}`,
        displayName: `Passport Buyer ${i}`,
      });
      const draft = await orders.createDraft({
        sellerId,
        buyerUserId: buyer.id,
        windowId: window.id,
        verticalId: 'tours',
        units: 1,
      });
      await orders.placeHold(draft.id);
      await orders.confirm(draft.id);
      await ledger.capture({
        orderRef: draft.id,
        amountMinor: PRICE,
        currency: 'JMD',
        idempotencyKey: `pp-cap:${draft.id}`,
      });
      await orders.complete(draft.id, 'qr_scan', tours);
      await ledger.release({
        orderRef: draft.id,
        currency: 'JMD',
        split: SPLIT,
        idempotencyKey: `pp-rel:${draft.id}`,
        sellerId,
      });
      await db
        .insertInto('reviews')
        .values({
          market_id: 'jm',
          order_id: draft.id,
          seller_id: sellerId,
          buyer_user_id: buyer.id,
          rating: i % 2 === 0 ? 5 : 4,
          body: 'great tour, right on time',
        })
        .execute();
    }
    // One payout so the passport shows money actually reaching the seller.
    await ledger.payoutSeller({ sellerId, currency: 'JMD', idempotencyKey: 'pp-payout:1' });
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: the export verifies against the ledger, to the cent', async () => {
    const { passport, pdf } = await passports.exportFor(sellerId);

    // Recompute independently from the ledger itself.
    const balances = await ledger.sellerBalances(sellerId);
    const expectedGross = N_ORDERS * Math.floor((PRICE * SPLIT.sellerBps) / 10000);
    expect(passport.payload.money.grossCapturedMinor).toBe(expectedGross);
    expect(passport.payload.money.paidOutMinor).toBe(expectedGross); // full balance paid out
    expect(passport.payload.money.payableBalanceMinor).toBe(balances.payable);
    expect(passport.payload.money.refundedMinor).toBe(0);

    expect(passport.payload.trust.publishedReviews).toBe(N_ORDERS);
    expect(passport.payload.trust.averageRating).toBe(4.5);
    expect(passport.payload.seller.businessName).toBe('Blue Hole Tours');
    expect(passport.payload.seller.completedOrders).toBe(N_ORDERS);

    // The human copy exists and is a real PDF.
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('GATE: a third party validates the signature with NOTHING but the document', async () => {
    const { passport } = await passports.exportFor(sellerId);

    // Simulate the bank: serialize, ship, parse — no db, no Sycamore.
    const received = JSON.parse(JSON.stringify(passport)) as CreditPassport;
    expect(verifyPassport(received)).toBe(true);

    // One flipped cent and the signature dies.
    const tampered = JSON.parse(JSON.stringify(passport)) as CreditPassport;
    tampered.payload.money.grossCapturedMinor += 1;
    expect(verifyPassport(tampered)).toBe(false);

    // A swapped key dies too — the passport pins its issuer.
    const wrongKey = JSON.parse(JSON.stringify(passport)) as CreditPassport;
    wrongKey.publicKey = generatePassportKeys().publicKeyPem;
    expect(verifyPassport(wrongKey)).toBe(false);
  });

  it('canonical JSON is stable regardless of key insertion order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      canonicalJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }),
    );
  });
});
