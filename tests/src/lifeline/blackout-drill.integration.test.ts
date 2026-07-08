/**
 * P34 GATE — the blackout drill (run every June 1 as a company ritual):
 * 48h total data loss for one parish. Orders keep landing by SMS, the
 * PWA queue replays on reconnect, the ledger reconciles to the cent,
 * zero duplicate side effects, dispute windows correctly extended, and
 * escrow never moves on stale information.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  blackoutMode,
  capacityEngine,
  createDb,
  databaseUrl,
  DISPUTE_WINDOW_MS,
  identityService,
  LifelineError,
  liteModeService,
  migrateDownAll,
  migrateToLatest,
  ordersService,
  seedMarkets,
  type OfflineAction,
} from '@sycamore/core';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';
import { hmacSha256Hex, twilioSmsChannel } from '@sycamore/gateway';

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
if (!reachable) console.warn('⚠ P34 blackout drill SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
const tours = loadVerticalPack('tours');
const SMS_ORDERS = 7;
const PRICE = 100_000;
const SPLIT = { sellerBps: 8500, platformBps: 1000, referralBps: 300, processorBps: 200 };
const T0 = new Date('2026-09-01T09:00:00Z'); // the parish goes dark
const T48 = new Date(T0.getTime() + 48 * 3_600_000); // the island comes back

describe('P34 — SMS lane parses like any other door', () => {
  const sms = twilioSmsChannel({
    accountSid: 'AC-test',
    authToken: 'sms-secret',
    fromNumber: '+18760001111',
  });

  it("inbound SMS webhook verifies and parses into the engine's own message shape", () => {
    const raw = Buffer.from(
      JSON.stringify([
        { MessageSid: 'SM1', From: '+18765550001', Body: 'book 2 for saturday' },
        { MessageSid: 'SM2', From: '+18765550002', Body: 'STOP' },
      ]),
    );
    const signature = `sha256=${hmacSha256Hex('sms-secret', raw)}`;
    expect(sms.verifySignature(raw, { 'x-twilio-signature': signature })).toBe(true);
    expect(sms.verifySignature(raw, { 'x-twilio-signature': 'sha256=forged' })).toBe(false);

    const messages = sms.parseInbound(raw);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: 'SM1',
      channel: 'sms',
      from: '+18765550001',
      kind: 'text',
      text: 'book 2 for saturday',
    });
    expect(messages[1]!.text).toBe('STOP'); // the kill switch works over SMS too
  });
});

describe.runIf(reachable)('P34 — the 48h blackout drill (gate)', () => {
  const db = createDb(databaseUrl());
  const blackout = blackoutMode(db, 'jm', jm);
  const lite = liteModeService(db, 'jm');
  const orders = ordersService(db, 'jm');
  let sellerId: string;
  let windowId: string;
  const orderIds: string[] = [];
  let buyerId = '';

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const engine = capacityEngine(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765700000',
      displayName: 'Blackout Seller',
      role: 'seller',
    });
    sellerId = (
      await identity.createSeller({ userId: owner.id, businessName: 'Dark Parish Tours' })
    ).id;
    windowId = (
      await engine.createWindow(tours, {
        sellerId,
        startsAt: new Date('2026-09-05T14:00:00Z'),
        endsAt: new Date('2026-09-05T16:00:00Z'),
        totalUnits: 20,
        unitPriceMinor: PRICE,
      })
    ).id;
    buyerId = (
      await identity.findOrCreateUserByPhone({
        phone: '+18765700099',
        displayName: 'Lite Buyer',
      })
    ).id;
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: dark 48h — SMS orders land, queue replays once, money to the cent, windows extended', async () => {
    const identity = identityService(db, 'jm');
    await blackout.activate('parish fiber + towers down', T0);
    expect(await blackout.isActive()).toBe(true);

    // COMMERCE CONTINUES during the blackout: orders arrive over the SMS
    // lane and book normally (record now, settle later).
    for (let i = 0; i < SMS_ORDERS; i++) {
      const buyer = await identity.findOrCreateUserByPhone({
        phone: `+187657001${String(i).padStart(2, '0')}`,
        displayName: `SMS Buyer ${i}`,
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
      await blackout.ledger.capture({
        orderRef: draft.id,
        amountMinor: PRICE,
        currency: 'JMD',
        idempotencyKey: `sms-capture:SM-order-${i}`, // MessageSid-derived
      });
      orderIds.push(draft.id);
    }

    // ESCROW NEVER MOVES on stale information: release refuses mid-blackout.
    await expect(
      blackout.guardedRelease({
        orderRef: orderIds[0]!,
        split: SPLIT,
        idempotencyKey: `rel:${orderIds[0]}`,
        sellerId,
      }),
    ).rejects.toThrowError(LifelineError);

    // Sellers worked offline: the PWA queued completion actions locally.
    const backlog: OfflineAction[] = orderIds.map((orderId) => ({
      idempotencyKey: `complete:${orderId}`,
      kind: 'complete_order',
      payload: { orderId },
    }));
    // The phone crashed mid-sync and resent EVERYTHING — double delivery.
    const doubleDelivered = [...backlog, ...backlog];

    let completions = 0;
    const handlers = {
      complete_order: async (payload: unknown) => {
        const { orderId } = payload as { orderId: string };
        await orders.complete(orderId, 'qr_scan', tours);
        completions++;
      },
    };

    // RECONNECT at T+48h: the sweep processes the backlog in order.
    const sweep = await blackout.deactivate(doubleDelivered, handlers, T48);
    expect(sweep.applied).toBe(SMS_ORDERS); // exactly once each
    expect(sweep.duplicates).toBe(SMS_ORDERS); // the resend was harmless
    expect(completions).toBe(SMS_ORDERS); // zero duplicate side effects
    expect(await blackout.isActive()).toBe(false);

    // Releases resume the moment the blackout lifts.
    for (const orderId of orderIds) {
      const release = await blackout.guardedRelease({
        orderRef: orderId,
        split: SPLIT,
        idempotencyKey: `rel:${orderId}`,
        sellerId,
      });
      expect(release.posted).toBe(true);
    }

    // The ledger reconciles to the cent after the island comes back.
    const balance = await blackout.ledger.trialBalance();
    expect(balance.debits).toBe(balance.credits);

    // Dispute windows widened by exactly the outage.
    const extended = await blackout.extendedDisputeWindowMs(DISPUTE_WINDOW_MS, T48);
    expect(extended).toBe(DISPUTE_WINDOW_MS + 48 * 3_600_000);

    // The reconciliation is on the record.
    const lifted = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'lifeline.blackout_lifted')
      .selectAll()
      .execute();
    expect(lifted).toHaveLength(1);
    const paused = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'lifeline.pause_nonessential')
      .selectAll()
      .execute();
    expect(paused).toHaveLength(1); // Pulse + Mentor went quiet
    const broadcast = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'lifeline.blackout_broadcast')
      .selectAll()
      .execute();
    expect(JSON.stringify(broadcast[0]!.payload)).toContain('your money is safe');
  });

  it('lite mode flips automatically with delivery health and strips media honestly', async () => {
    expect(await lite.autoFlip(buyerId, { latencyMs: 12_000, failureRate: 0.1 })).toBe(true);
    expect(await lite.isLite(buyerId)).toBe(true);
    expect(
      lite.stripToText({ text: 'Your booking is confirmed for Saturday.', mediaRefs: ['photo-1'] }),
    ).toContain('text me instead');
    expect(lite.stripToText({ text: 'plain text passes through' })).toBe(
      'plain text passes through',
    );
    // Link recovers → flips back, user never lifted a finger.
    expect(await lite.autoFlip(buyerId, { latencyMs: 900, failureRate: 0.01 })).toBe(false);
    expect(await lite.isLite(buyerId)).toBe(false);
  });
});
