import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { identityService } from '../identity/identity.js';
import { capacityEngine } from '../capacity/engine.js';
import { settlementService } from './settlement.js';

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
if (!reachable) console.warn('⚠ P17 gate tests SKIPPED: Postgres unreachable.');

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

const jm = loadContextPack('jm');

describe.runIf(reachable)('P17 — splits, release, payouts (gate)', () => {
  const db = createDb(databaseUrl());
  const settlement = settlementService(db, 'jm', jm);
  const ledger = settlement.ledger;

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it(
    'GATE: 1,000-order simulation incl. overflow referrals balances to the cent',
    { timeout: 600_000 },
    async () => {
      const rand = mulberry32(1717);
      const identity = identityService(db, 'jm');
      const engine = capacityEngine(db, 'jm');

      // 10 sellers; buyers; one shared window per seller for order rows.
      const sellers: string[] = [];
      for (let s = 0; s < 10; s++) {
        const u = await identity.findOrCreateUserByPhone({
          phone: `+18768${String(s).padStart(6, '0')}`,
          displayName: `Settle Seller ${s}`,
          role: 'seller',
        });
        sellers.push((await identity.createSeller({ userId: u.id, businessName: `S${s} Ltd` })).id);
      }
      const buyer = await identity.findOrCreateUserByPhone({
        phone: '+18769999999',
        displayName: 'Settle Buyer',
      });
      const windows = new Map<string, string>();
      for (const [i, sellerId] of sellers.entries()) {
        const w = await engine.createWindow(loadVerticalPack('tours'), {
          sellerId,
          startsAt: new Date(`2026-11-0${(i % 7) + 1}T14:00:00Z`),
          endsAt: new Date(`2026-11-0${(i % 7) + 1}T16:00:00Z`),
          totalUnits: 2000,
          unitPriceMinor: 100_000,
        });
        windows.set(sellerId, w.id);
      }

      // Expected shares, accumulated locally with the SAME integer math.
      const expectedPayable = new Map<string, number>();
      const expectedReferral = new Map<string, number>();
      let expectedPlatform = 0;
      let expectedProcessor = 0;
      let refundedTotal = 0;
      let capturedTotal = 0;

      for (let i = 0; i < 1000; i++) {
        const sellerId = sellers[Math.floor(rand() * sellers.length)]!;
        const referred = rand() < 0.2; // ~20% arrive via overflow referral
        const referrer = referred
          ? sellers.filter((s) => s !== sellerId)[Math.floor(rand() * (sellers.length - 1))]!
          : null;

        const order = await db
          .insertInto('orders')
          .values({
            market_id: 'jm',
            seller_id: sellerId,
            buyer_user_id: buyer.id,
            window_id: windows.get(sellerId)!,
            vertical_id: 'tours',
            units: 1,
            status: 'confirmed',
            referred_by_seller_id: referrer,
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        const amount = 1_000 + Math.floor(rand() * 400_000);
        capturedTotal += amount;
        await ledger.capture({
          orderRef: order.id,
          amountMinor: amount,
          currency: 'JMD',
          idempotencyKey: `cap:${order.id}`,
        });

        // ~10% partially refund before completion.
        let net = amount;
        if (rand() < 0.1) {
          const refund = 1 + Math.floor(rand() * (amount - 1));
          refundedTotal += refund;
          net -= refund;
          await ledger.refund({
            orderRef: order.id,
            amountMinor: refund,
            currency: 'JMD',
            idempotencyKey: `ref:${order.id}`,
          });
        }

        const result = await settlement.releaseForOrder(order.id);
        const a = result.amounts!;
        // Splits ALWAYS sum to exactly 100.00% of the released amount.
        expect(a.seller + a.platform + a.referral + a.processor).toBe(net);
        expectedPayable.set(sellerId, (expectedPayable.get(sellerId) ?? 0) + a.seller);
        if (referrer) {
          expectedReferral.set(referrer, (expectedReferral.get(referrer) ?? 0) + a.referral);
        } else {
          expect(a.referral).toBe(0); // standard table has no referral share
        }
        expectedPlatform += a.platform;
        expectedProcessor += a.processor;
      }

      // Per-seller ledger balances match local expectation to the cent.
      for (const sellerId of sellers) {
        const balances = await ledger.sellerBalances(sellerId);
        expect(balances.payable, `payable ${sellerId}`).toBe(expectedPayable.get(sellerId) ?? 0);
        expect(balances.referral, `referral ${sellerId}`).toBe(expectedReferral.get(sellerId) ?? 0);
      }

      // Payout batch: everything owed leaves in one txn per seller,
      // referral credits settled INSIDE the batch — no inter-seller invoices.
      const payouts = await settlement.runPayoutBatch('2026-11-30');
      const paidTotal = payouts.reduce((s, p) => s + p.amountMinor, 0);
      const expectedPaid =
        [...expectedPayable.values()].reduce((s, v) => s + v, 0) +
        [...expectedReferral.values()].reduce((s, v) => s + v, 0);
      expect(paidTotal).toBe(expectedPaid);
      for (const p of payouts) {
        expect(p.message).toMatch(/^J\$[\d,]+\.\d{2} is on the way to you today\.$/);
      }

      // Replaying the same batch key moves nothing (idempotent).
      const replay = await settlement.runPayoutBatch('2026-11-30');
      expect(replay).toHaveLength(0);

      // After payouts: seller accounts empty; platform+processor retained;
      // the WHOLE ledger still balances to the cent.
      for (const sellerId of sellers) {
        const balances = await ledger.sellerBalances(sellerId);
        expect(balances.payable).toBe(0);
        expect(balances.referral).toBe(0);
      }
      const { debits, credits } = await ledger.trialBalance();
      expect(debits).toBe(credits);
      const platform = await ledger.accountBalance('platform_fees');
      const processor = await ledger.accountBalance('processor_fees');
      expect(-platform).toBe(expectedPlatform); // credit-normal, debit-positive convention
      expect(-processor).toBe(expectedProcessor);
      console.log(
        `settlement sim: captured ${capturedTotal}, refunded ${refundedTotal}, ` +
          `paid ${paidTotal}, platform ${expectedPlatform}, processor ${expectedProcessor}`,
      );
    },
  );
});
