/**
 * P36b GATE — the earned-install offer.
 *
 * The four rules this file exists to hold:
 *   1. NEVER during Genesis onboarding.
 *   2. NEVER to a buyer identity, in any flow.
 *   3. Only when EARNED — first payout settled, or five completed orders
 *      in a rolling seven days.
 *   4. At most TWO offers ever; after two, silence forever.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';
import type { LlmRouter } from '@sycamore/adapters';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { identityService } from '../identity/identity.js';
import { capacityEngine } from '../capacity/engine.js';
import { ordersService } from '../orders/orders.js';
import { ledgerService } from '../ledger/ledger.js';
import {
  installOfferService,
  sellerInstallRate,
  InstallOfferError,
  MAX_INSTALL_OFFERS,
} from './install.js';

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
if (!reachable) console.warn('⚠ P36 install-offer tests SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
const tours = loadVerticalPack('tours');

/** Copy is rendered by the localization layer; the test pins behaviour. */
const systemPrompts: string[] = [];
const router: LlmRouter = {
  complete: (req) => {
    systemPrompts.push(req.system ?? '');
    return Promise.resolve({
      text: 'Yuh business getting big now. Put Sycamore pon yuh home screen — it faster, and it work even when di internet drop.',
      providerId: 'stub',
      model: 'stub-1',
    });
  },
};

describe.runIf(reachable)('P36b — the earned-install offer', () => {
  const db = createDb(databaseUrl());
  const installs = installOfferService(
    { db, router, pack: jm, appOrigin: 'https://sycamore.app' },
    'jm',
  );
  const identity = identityService(db, 'jm');
  const orders = ordersService(db, 'jm');

  let sellerId = '';
  let ownerUserId = '';
  let windowId = '';
  const buyerIds: string[] = [];

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765900000',
      displayName: 'Install Seller',
      role: 'seller',
    });
    ownerUserId = owner.id;
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Blue Hole Tours' }))
      .id;
    windowId = (
      await capacityEngine(db, 'jm').createWindow(tours, {
        sellerId,
        startsAt: new Date('2026-11-07T14:00:00Z'),
        endsAt: new Date('2026-11-07T16:00:00Z'),
        totalUnits: 40,
        unitPriceMinor: 100_000,
      })
    ).id;
    for (let i = 0; i < 6; i++) {
      const buyer = await identity.findOrCreateUserByPhone({
        phone: `+187659001${String(i).padStart(2, '0')}`,
        displayName: `Install Buyer ${i}`,
      });
      buyerIds.push(buyer.id);
    }
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  async function completeOrder(buyerUserId: string, completedAt: Date): Promise<void> {
    const draft = await orders.createDraft({
      sellerId,
      buyerUserId,
      windowId,
      verticalId: 'tours',
      units: 1,
    });
    await orders.placeHold(draft.id);
    await orders.confirm(draft.id);
    await orders.complete(draft.id, 'qr_scan', tours);
    // The pure engine stamps `now()`; the rolling window is what is under
    // test, so the completion time is backdated explicitly.
    await db
      .updateTable('orders')
      .set({ completed_at: completedAt })
      .where('id', '=', draft.id)
      .execute();
  }

  it('GATE: never offered during Genesis onboarding, whatever the numbers say', async () => {
    // Make the seller unambiguously eligible first.
    const now = new Date('2026-11-01T12:00:00Z');
    for (let i = 0; i < 5; i++) {
      await completeOrder(buyerIds[i]!, new Date(now.getTime() - (i + 1) * 3_600_000));
    }
    expect(await installs.completedOrdersInWindow(sellerId, now)).toBe(5);

    const duringGenesis = await installs.evaluate(sellerId, { duringGenesis: true, now });
    expect(duringGenesis).toEqual({ offer: false, reason: 'genesis_in_progress' });

    // Same seller, same instant, Genesis finished → the offer is earned.
    const after = await installs.evaluate(sellerId, { duringGenesis: false, now });
    expect(after).toEqual({ offer: true, trigger: 'orders_in_rolling_week' });
  });

  it('the window is ROLLING: the same five orders spread over a month earn nothing', async () => {
    const later = new Date('2026-12-15T12:00:00Z'); // all five now far outside 7 days
    expect(await installs.completedOrdersInWindow(sellerId, later)).toBe(0);
    expect(await installs.evaluate(sellerId, { duringGenesis: false, now: later })).toEqual({
      offer: false,
      reason: 'not_earned_yet',
    });
  });

  it('a settled first payout earns the offer on its own', async () => {
    const ledger = ledgerService(db, 'jm');
    const quiet = new Date('2026-12-15T12:00:00Z');
    expect(await installs.firstPayoutSettled(sellerId)).toBe(false);

    await ledger.capture({
      orderRef: 'payout-trigger-order',
      amountMinor: 100_000,
      currency: 'JMD',
      idempotencyKey: 'install-cap:1',
    });
    await ledger.release({
      orderRef: 'payout-trigger-order',
      currency: 'JMD',
      split: { sellerBps: 8800, platformBps: 1000, referralBps: 0, processorBps: 200 },
      idempotencyKey: 'install-rel:1',
      sellerId,
    });
    await ledger.payoutSeller({ sellerId, currency: 'JMD', idempotencyKey: 'install-pay:1' });

    expect(await installs.firstPayoutSettled(sellerId)).toBe(true);
    expect(await installs.evaluate(sellerId, { duringGenesis: false, now: quiet })).toEqual({
      offer: true,
      trigger: 'first_payout_settled',
    });
  });

  it('GATE: never emitted to a buyer identity, in any flow', async () => {
    await expect(
      installs.offer({
        sellerId,
        userId: buyerIds[0]!, // a buyer holding the seller's id
        trigger: 'first_payout_settled',
      }),
    ).rejects.toThrowError(InstallOfferError);

    // Nothing was sent and nothing was recorded — a refused offer is silent.
    const offered = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'install.offered')
      .selectAll()
      .execute();
    expect(offered).toHaveLength(0);
    expect(await installs.stateOf(sellerId)).toBe('none');
  });

  it('the offer is one localized chat message, framed as the seller’s benefit', async () => {
    const sent = await installs.offer({
      sellerId,
      userId: ownerUserId,
      trigger: 'first_payout_settled',
    });
    expect(sent.text.length).toBeGreaterThan(0);
    expect(sent.link).toBe(`https://sycamore.app/s/jm/${sellerId}?offer=1`);
    // Copy came from the market's pack directives, not from source code.
    for (const directive of jm.language.copy_directives) {
      expect(systemPrompts.at(-1)).toContain(directive);
    }
    expect(sent.offersSent).toBe(1);
    expect(await installs.stateOf(sellerId)).toBe('offered');

    // It left through the outbox — whichever door the seller is on delivers it.
    const events = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'install.offered')
      .selectAll()
      .execute();
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0]!.payload)).toContain(sellerId);

    // An outstanding offer is not repeated while it stands.
    expect(await installs.evaluate(sellerId, { duringGenesis: false, now: new Date() })).toEqual({
      offer: false,
      reason: 'offer_outstanding',
    });
  });

  it('GATE: after two declines, no further prompt is ever generated', async () => {
    const first = await installs.recordDecline(sellerId);
    expect(first.silencedForever).toBe(false);

    // Declining once leaves exactly one more offer in the seller's life.
    const second = await installs.evaluate(sellerId, { duringGenesis: false, now: new Date() });
    expect(second).toEqual({ offer: true, trigger: 'first_payout_settled' });
    const sent = await installs.offer({
      sellerId,
      userId: ownerUserId,
      trigger: 'first_payout_settled',
    });
    expect(sent.offersSent).toBe(MAX_INSTALL_OFFERS);

    const silenced = await installs.recordDecline(sellerId);
    expect(silenced.silencedForever).toBe(true);

    // Forever means forever: the evaluator refuses, and a caller that
    // ignores the evaluator is refused too.
    expect(await installs.evaluate(sellerId, { duringGenesis: false, now: new Date() })).toEqual({
      offer: false,
      reason: 'offer_cap_reached',
    });
    await expect(
      installs.offer({ sellerId, userId: ownerUserId, trigger: 'first_payout_settled' }),
    ).rejects.toThrowError(InstallOfferError);

    // Exactly two messages were ever generated for this seller.
    const events = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'install.offered')
      .selectAll()
      .execute();
    expect(events).toHaveLength(MAX_INSTALL_OFFERS);
  });

  it('the database refuses a third offer even if code ever tried', async () => {
    await expect(
      db
        .updateTable('sellers')
        .set({ install_offers_sent: 3 })
        .where('market_id', '=', 'jm')
        .where('id', '=', sellerId)
        .execute(),
    ).rejects.toThrow(); // sellers_install_offer_cap
  });

  it('seller_install_rate is installed ÷ active sellers for the market', async () => {
    expect(await sellerInstallRate(db, 'jm')).toEqual({ installed: 0, active: 1, rate: 0 });

    await installs.recordInstalled(sellerId);
    expect(await installs.stateOf(sellerId)).toBe('installed');
    expect(await sellerInstallRate(db, 'jm')).toEqual({ installed: 1, active: 1, rate: 1 });

    // A second, uninstalled seller halves the rate.
    const other = await identity.findOrCreateUserByPhone({
      phone: '+18765900500',
      displayName: 'Quiet Seller',
      role: 'seller',
    });
    await identity.createSeller({ userId: other.id, businessName: 'Quiet Yard' });
    expect(await sellerInstallRate(db, 'jm')).toEqual({ installed: 1, active: 2, rate: 0.5 });

    // An installed seller is never offered again.
    await expect(
      installs.offer({ sellerId, userId: ownerUserId, trigger: 'first_payout_settled' }),
    ).rejects.toThrowError(InstallOfferError);
  });
});
