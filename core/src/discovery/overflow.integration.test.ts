import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { identityService } from '../identity/identity.js';
import { capacityEngine } from '../capacity/engine.js';
import { ordersService } from '../orders/orders.js';
import { settlementService } from '../settlement/settlement.js';
import { bundleService, overflowService } from './overflow.js';

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
if (!reachable) console.warn('⚠ P22 gate tests SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
const tours = loadVerticalPack('tours');

describe.runIf(reachable)('P22 — overflow routing + bundles (Phase 3 exit gate)', () => {
  const db = createDb(databaseUrl());
  const overflow = overflowService(db, 'jm');
  const bundles = bundleService(db, 'jm');
  const settlement = settlementService(db, 'jm', jm);
  const orders = ordersService(db, 'jm');
  const engine = capacityEngine(db, 'jm');

  let incumbentId: string;
  let partnerId: string;
  let newcomerId: string;
  let incumbentWindow: string;
  let partnerWindow: string;
  let newcomerWindow: string;
  let buyerId: string;

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');

    async function makeSeller(phone: string, name: string, completedOrders: number) {
      const u = await identity.findOrCreateUserByPhone({
        phone,
        displayName: name,
        role: 'seller',
      });
      const s = await identity.createSeller({ userId: u.id, businessName: name });
      if (completedOrders > 0) {
        await db
          .updateTable('sellers')
          .set({ completed_orders: completedOrders, readiness: 'verified' })
          .where('id', '=', s.id)
          .execute();
      }
      return s.id;
    }
    incumbentId = await makeSeller('+18764000001', 'Incumbent Reef', 40);
    partnerId = await makeSeller('+18764000002', 'Partner Rides', 25);
    newcomerId = await makeSeller('+18764000003', 'Newcomer Boats', 2);

    incumbentWindow = (
      await engine.createWindow(tours, {
        sellerId: incumbentId,
        startsAt: new Date('2027-01-10T14:00:00Z'),
        endsAt: new Date('2027-01-10T16:00:00Z'),
        totalUnits: 1, // tiny — sells out instantly
        unitPriceMinor: 300_000,
      })
    ).id;
    partnerWindow = (
      await engine.createWindow(tours, {
        sellerId: partnerId,
        startsAt: new Date('2027-01-10T15:00:00Z'),
        endsAt: new Date('2027-01-10T17:00:00Z'),
        totalUnits: 10,
        unitPriceMinor: 280_000,
      })
    ).id;
    newcomerWindow = (
      await engine.createWindow(tours, {
        sellerId: newcomerId,
        startsAt: new Date('2027-01-10T16:00:00Z'),
        endsAt: new Date('2027-01-10T18:00:00Z'),
        totalUnits: 8,
        unitPriceMinor: 250_000,
      })
    ).id;

    const identityBuyer = await identity.findOrCreateUserByPhone({
      phone: '+18764000010',
      displayName: 'Overflow Buyer',
    });
    buyerId = identityBuyer.id;
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE §5.4-4 E2E: sold-out attempt converts via overflow; referral credit lands in the incumbent split', async () => {
    // 1. Someone takes the incumbent's only seat.
    const firstBuyer = await identityServiceBuyer('+18764000011', 'First Buyer');
    const filler = await orders.createDraft({
      sellerId: incumbentId,
      buyerUserId: firstBuyer,
      windowId: incumbentWindow,
      verticalId: 'tours',
      units: 1,
    });
    expect((await orders.placeHold(filler.id)).status).toBe('held');

    // 2. Our buyer tries: sold out → waitlisted (their choice is KEPT).
    const attempt = await orders.createDraft({
      sellerId: incumbentId,
      buyerUserId: buyerId,
      windowId: incumbentWindow,
      verticalId: 'tours',
      units: 1,
    });
    expect((await orders.placeHold(attempt.id)).status).toBe('waitlisted');
    expect(await engine.waitlistFor(incumbentWindow)).toHaveLength(1);

    // 3. Overflow finds fit-matched, genuinely available alternatives.
    const alternatives = await overflow.findAlternatives({
      fromWindowId: incumbentWindow,
      units: 1,
    });
    expect(alternatives.length).toBeGreaterThanOrEqual(2);
    expect(alternatives.map((a) => a.sellerId)).not.toContain(incumbentId);

    // 4. Book the partner via overflow — incumbent stamped as referrer.
    const routed = await overflow.bookViaOverflow({
      sourceWindowId: incumbentWindow,
      targetWindowId: partnerWindow,
      buyerUserId: buyerId,
      units: 1,
    });
    expect(routed.status).toBe('held');
    expect(routed.referrerSellerId).toBe(incumbentId);
    // The waitlist spot on the original is still theirs.
    expect(await engine.waitlistFor(incumbentWindow)).toHaveLength(1);

    // 5. The order completes and settles: money flows the referred split.
    await orders.confirm(routed.orderId);
    await settlement.ledger.capture({
      orderRef: routed.orderId,
      amountMinor: 280_000,
      currency: 'JMD',
      idempotencyKey: `cap:${routed.orderId}`,
    });
    await orders.complete(routed.orderId, 'qr_scan', tours);
    const released = await settlement.releaseForOrder(routed.orderId);
    expect(released.amounts!.referral).toBeGreaterThan(0);

    // 6. The referral credit appears in the INCUMBENT's next split/payout.
    const balances = await settlement.ledger.sellerBalances(incumbentId);
    expect(balances.referral).toBe(released.amounts!.referral);
    const payouts = await settlement.runPayoutBatch('overflow-batch');
    const incumbentPayout = payouts.find((p) => p.sellerId === incumbentId);
    expect(incumbentPayout?.amountMinor).toBe(released.amounts!.referral);
    expect(incumbentPayout?.message).toMatch(/^J\$/);

    const { debits, credits } = await settlement.ledger.trialBalance();
    expect(debits).toBe(credits);
  });

  it('bundles: partner offers carry EXACTLY one rotating newcomer slot', async () => {
    const offers0 = await bundles.offersFor({ hostWindowId: incumbentWindow, rotationIndex: 0 });
    expect(offers0.length).toBeGreaterThanOrEqual(2);
    expect(offers0.filter((o) => o.newcomerSlot)).toHaveLength(1);
    expect(offers0.find((o) => o.newcomerSlot)?.sellerId).toBe(newcomerId);
    expect(offers0.map((o) => o.sellerId)).not.toContain(incumbentId); // host never self-offers

    // Rotation: with one newcomer the slot persists; add a second newcomer
    // and the rotation index picks a different one.
    const identity = identityService(db, 'jm');
    const u = await identity.findOrCreateUserByPhone({
      phone: '+18764000004',
      displayName: 'Second Newcomer',
      role: 'seller',
    });
    const n2 = await identity.createSeller({ userId: u.id, businessName: 'Second Newcomer' });
    await engine.createWindow(tours, {
      sellerId: n2.id,
      startsAt: new Date('2027-01-10T17:00:00Z'),
      endsAt: new Date('2027-01-10T19:00:00Z'),
      totalUnits: 5,
      unitPriceMinor: 240_000,
    });
    const offersA = await bundles.offersFor({ hostWindowId: incumbentWindow, rotationIndex: 0 });
    const offersB = await bundles.offersFor({ hostWindowId: incumbentWindow, rotationIndex: 1 });
    const slotA = offersA.find((o) => o.newcomerSlot)?.sellerId;
    const slotB = offersB.find((o) => o.newcomerSlot)?.sellerId;
    expect(slotA).toBeDefined();
    expect(slotB).toBeDefined();
    expect(slotA).not.toBe(slotB); // the newcomer slot ROTATES
  });

  async function identityServiceBuyer(phone: string, name: string): Promise<string> {
    const identity = identityService(db, 'jm');
    return (await identity.findOrCreateUserByPhone({ phone, displayName: name })).id;
  }
});
