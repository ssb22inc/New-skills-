import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { identityService } from '../identity/identity.js';
import { capacityEngine } from '../capacity/engine.js';
import { ordersService } from '../orders/orders.js';
import { disputeService, DISPUTE_WINDOW_MS } from './disputes.js';

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
if (!reachable) console.warn('⚠ P18 gate tests SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
const tours = loadVerticalPack('tours');

describe.runIf(reachable)('P18 — refunds, disputes, evidence (gate)', () => {
  const db = createDb(databaseUrl());
  const disputes = disputeService(db, 'jm', jm);
  const orders = ordersService(db, 'jm');
  let sellerIds: string[] = [];
  let buyerId: string;
  let windowBySeller = new Map<string, string>();

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const engine = capacityEngine(db, 'jm');
    sellerIds = [];
    for (let s = 0; s < 5; s++) {
      const u = await identity.findOrCreateUserByPhone({
        phone: `+18767${String(s).padStart(6, '0')}`,
        displayName: `Dispute Seller ${s}`,
        role: 'seller',
      });
      const seller = await identity.createSeller({ userId: u.id, businessName: `D${s} Tours` });
      sellerIds.push(seller.id);
      const w = await engine.createWindow(tours, {
        sellerId: seller.id,
        startsAt: new Date(`2026-12-0${s + 1}T14:00:00Z`),
        endsAt: new Date(`2026-12-0${s + 1}T16:00:00Z`),
        totalUnits: 100,
        unitPriceMinor: 200_000,
      });
      windowBySeller.set(seller.id, w.id);
    }
    buyerId = (
      await identity.findOrCreateUserByPhone({
        phone: '+18767777777',
        displayName: 'Dispute Buyer',
      })
    ).id;
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  async function paidOrder(sellerIdx: number, opts: { complete?: boolean } = {}) {
    const sellerId = sellerIds[sellerIdx]!;
    const order = await orders.createDraft({
      sellerId,
      buyerUserId: buyerId,
      windowId: windowBySeller.get(sellerId)!,
      verticalId: 'tours',
      units: 1,
    });
    await orders.placeHold(order.id);
    await orders.confirm(order.id);
    await disputes.ledger.capture({
      orderRef: order.id,
      amountMinor: 200_000,
      currency: 'JMD',
      idempotencyKey: `cap:${order.id}`,
    });
    if (opts.complete) await orders.complete(order.id, 'qr_scan', tours);
    return order.id;
  }

  it('§5.3-3: cancel inside window → refund lands → plain-number message', async () => {
    const orderId = await paidOrder(0);
    await orders.cancel(orderId);
    const refund = await disputes.refundOnCancel(orderId);
    expect(refund.amountMinor).toBe(200_000);
    expect(refund.message).toBe('J$2,000.00 is on its way back to you.');
    const sums = await disputes.ledger.orderSummary(orderId);
    expect(sums.refunded).toBe(200_000);
    // Idempotent: the same cancel-refund key cannot double-pay.
    const again = await disputes.refundOnCancel(orderId);
    expect(again.amountMinor).toBe(0);
  });

  it('§5.3-4 GATE: dispute with NO completion proof → auto-refund, immediately', async () => {
    const orderId = await paidOrder(0); // confirmed, never completed — no proof
    const started = Date.now();
    const outcome = await disputes.openDispute({
      orderId,
      openedByUserId: buyerId,
      reason: 'boat never came',
    });
    expect(outcome.decision).toBe('auto_refunded');
    if (outcome.decision === 'auto_refunded') {
      expect(outcome.amountMinor).toBe(200_000);
      expect(outcome.message).toContain('J$2,000.00');
    }
    expect(Date.now() - started).toBeLessThan(5 * 60_000); // <5min, actually ms
    expect((await disputes.ledger.orderSummary(orderId)).refunded).toBe(200_000);
  });

  it('a completed order with proof goes to human review, evidence assembled', async () => {
    const orderId = await paidOrder(1, { complete: true });
    const outcome = await disputes.openDispute({
      orderId,
      openedByUserId: buyerId,
      reason: 'not as described',
    });
    expect(outcome.decision).toBe('under_review');
    const evidence = await disputes.assembleEvidence(orderId);
    expect(evidence.order.completionProof).toBe('qr_scan');
    expect(evidence.money.captured).toBe(200_000);
    expect(evidence.buyerHistory.orders).toBeGreaterThan(0);
    expect(evidence.sellerHistory.orders).toBeGreaterThan(0);
  });

  it('the dispute window closes 48h after completion; releases wait for it', async () => {
    const orderId = await paidOrder(2, { complete: true });
    // Inside the window: release not eligible.
    expect(await disputes.releaseEligible(orderId)).toBe(false);
    const after49h = new Date(Date.now() + DISPUTE_WINDOW_MS + 60 * 60_000);
    // After the window with no dispute: eligible.
    expect(await disputes.releaseEligible(orderId, after49h)).toBe(true);
    // A dispute inside the window blocks release even after it.
    await expect(
      disputes.openDispute({
        orderId,
        openedByUserId: buyerId,
        reason: 'late',
        now: after49h, // window closed → refuse the dispute itself
      }),
    ).rejects.toThrowError(/48h/);
  });

  it('GATE: abuse pattern (4 auto-refund claims / 4 sellers / 30d) downgrades privileges', async () => {
    // A fresh buyer works four different sellers with no-proof claims.
    const identity = identityService(db, 'jm');
    const abuser = await identity.findOrCreateUserByPhone({
      phone: '+18767666666',
      displayName: 'Abuser',
    });
    for (let s = 0; s < 4; s++) {
      const sellerId = sellerIds[s]!;
      const order = await orders.createDraft({
        sellerId,
        buyerUserId: abuser.id,
        windowId: windowBySeller.get(sellerId)!,
        verticalId: 'tours',
        units: 1,
      });
      await orders.placeHold(order.id);
      await orders.confirm(order.id);
      await disputes.ledger.capture({
        orderRef: order.id,
        amountMinor: 100_000,
        currency: 'JMD',
        idempotencyKey: `cap:${order.id}`,
      });
      const outcome = await disputes.openDispute({
        orderId: order.id,
        openedByUserId: abuser.id,
        reason: 'claim',
      });
      expect(outcome.decision).toBe('auto_refunded');
    }

    const downgraded = await db
      .selectFrom('users')
      .where('id', '=', abuser.id)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(downgraded.trust_level).toBe('restricted');

    // The FIFTH claim gets a human, not an auto-refund.
    const sellerId = sellerIds[4]!;
    const order = await orders.createDraft({
      sellerId,
      buyerUserId: abuser.id,
      windowId: windowBySeller.get(sellerId)!,
      verticalId: 'tours',
      units: 1,
    });
    await orders.placeHold(order.id);
    await orders.confirm(order.id);
    await disputes.ledger.capture({
      orderRef: order.id,
      amountMinor: 100_000,
      currency: 'JMD',
      idempotencyKey: `cap:${order.id}`,
    });
    const fifth = await disputes.openDispute({
      orderId: order.id,
      openedByUserId: abuser.id,
      reason: 'claim again',
    });
    expect(fifth.decision).toBe('under_review');
    expect((await disputes.ledger.orderSummary(order.id)).refunded).toBe(0);
  });
});
