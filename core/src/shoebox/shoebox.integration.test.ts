import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { identityService } from '../identity/identity.js';
import { capacityEngine } from '../capacity/engine.js';
import { settlementService } from '../settlement/settlement.js';
import { shoeboxService, TAX_DISCLAIMER } from './shoebox.js';

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
if (!reachable) console.warn('⚠ P19 gate tests SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');

describe.runIf(reachable)('P19 — The Shoebox (gate)', () => {
  const db = createDb(databaseUrl());
  const settlement = settlementService(db, 'jm', jm);
  const shoebox = shoeboxService(db, 'jm', jm);
  let sellerId: string;

  // The seeded month, accumulated locally with the same integer math.
  let seededSales = 0;
  let seededRefunds = 0;
  let seededFees = 0;
  let seededPayout = 0;

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const engine = capacityEngine(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18766000000',
      displayName: 'Shoebox Boss',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Shoebox Grill' }))
      .id;
    const buyer = await identity.findOrCreateUserByPhone({
      phone: '+18766000001',
      displayName: 'Shoebox Buyer',
    });
    const win = await engine.createWindow(loadVerticalPack('food'), {
      sellerId,
      startsAt: new Date('2026-12-05T14:00:00Z'),
      endsAt: new Date('2026-12-05T15:00:00Z'),
      totalUnits: 1000,
      unitPriceMinor: 150_000,
    });

    // A seeded month: 30 orders, some refunds, all released, one payout.
    for (let i = 0; i < 30; i++) {
      const order = await db
        .insertInto('orders')
        .values({
          market_id: 'jm',
          seller_id: sellerId,
          buyer_user_id: buyer.id,
          window_id: win.id,
          vertical_id: 'food',
          units: 1,
          status: 'confirmed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const amount = 100_000 + i * 1_000;
      seededSales += amount;
      await settlement.ledger.capture({
        orderRef: order.id,
        amountMinor: amount,
        currency: 'JMD',
        idempotencyKey: `cap:${order.id}`,
      });
      let net = amount;
      if (i % 10 === 3) {
        const refund = 20_000;
        seededRefunds += refund;
        net -= refund;
        await settlement.ledger.refund({
          orderRef: order.id,
          amountMinor: refund,
          currency: 'JMD',
          idempotencyKey: `ref:${order.id}`,
        });
      }
      const released = await settlement.releaseForOrder(order.id);
      seededFees += released.amounts!.platform + released.amounts!.processor;
    }
    const payouts = await settlement.runPayoutBatch('shoebox-month');
    seededPayout = payouts[0]?.amountMinor ?? 0;
  }, 120_000);

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: record pack totals match the ledger to the cent for the seeded month', async () => {
    const now = new Date();
    const pack = await shoebox.monthlyPack(sellerId, now.getUTCFullYear(), now.getUTCMonth() + 1);
    expect(pack.totals.salesMinor).toBe(seededSales);
    expect(pack.totals.refundsMinor).toBe(seededRefunds);
    expect(pack.totals.feesMinor).toBe(seededFees);
    expect(pack.totals.payoutsMinor).toBe(seededPayout);

    // CSV reconciles: capture credits into escrow sum to sales.
    const captureLines = pack.csv
      .split('\n')
      .filter((l) => l.includes(',capture,') && l.includes('buyer_escrow,credit'));
    const csvSales = captureLines.reduce((s, l) => s + Number(l.split(',')[5]), 0);
    expect(csvSales).toBe(seededSales);

    // The PDF is a real PDF carrying the totals.
    expect(pack.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pack.pdf.toString('latin1')).toContain('Sales:');
  });

  it('GATE: the message passes the pack language rules', async () => {
    const now = new Date();
    const pack = await shoebox.monthlyPack(sellerId, now.getUTCFullYear(), now.getUTCMonth() + 1);
    // Plain numbers in the pack's currency symbol — never bare numbers.
    expect(pack.message).toContain(`You sold J$`);
    expect(pack.message).toMatch(/J\$[\d,]+\.\d{2} was paid out to you\./);
    // The mandatory records-not-tax-advice line, always.
    expect(pack.message).toContain(TAX_DISCLAIMER);
    // Below threshold: say so plainly.
    expect(pack.thresholdStatus).toBe('nothing_to_do');
    expect(pack.message).toContain('GCT: nothing to do this month.');
    // Short sentences, no jargon (pack directive: no charts, no percent-speak).
    for (const line of pack.message.split('\n')) {
      expect(line.length).toBeLessThan(200);
      expect(line).not.toMatch(/%|bps|basis points/);
    }
  });

  it('threshold watch warns as rolling sales approach the GCT threshold', async () => {
    // Seed a giant capture+release to push rolling sales past 80% of J$10M.
    const identity = identityService(db, 'jm');
    const bigOwner = await identity.findOrCreateUserByPhone({
      phone: '+18766000002',
      displayName: 'Big Boss',
      role: 'seller',
    });
    const bigSeller = await identity.createSeller({
      userId: bigOwner.id,
      businessName: 'Big Grill',
    });
    const buyer = await identity.findOrCreateUserByPhone({
      phone: '+18766000003',
      displayName: 'Big Buyer',
    });
    const engine = capacityEngine(db, 'jm');
    const win = await engine.createWindow(loadVerticalPack('food'), {
      sellerId: bigSeller.id,
      startsAt: new Date('2026-12-06T14:00:00Z'),
      endsAt: new Date('2026-12-06T15:00:00Z'),
      totalUnits: 10,
      unitPriceMinor: 150_000,
    });
    const order = await db
      .insertInto('orders')
      .values({
        market_id: 'jm',
        seller_id: bigSeller.id,
        buyer_user_id: buyer.id,
        window_id: win.id,
        vertical_id: 'food',
        units: 1,
        status: 'confirmed',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    // 85% of the J$10M threshold.
    await settlement.ledger.capture({
      orderRef: order.id,
      amountMinor: 850_000_000,
      currency: 'JMD',
      idempotencyKey: `cap:${order.id}`,
    });
    const now = new Date();
    const pack = await shoebox.monthlyPack(
      bigSeller.id,
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );
    expect(pack.thresholdStatus).toBe('approaching');
    expect(pack.message).toContain('getting close to the GCT registration threshold');
  });
});
