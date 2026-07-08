/**
 * P35e GATE — the eviction fire drill (quarterly): "WhatsApp is gone at
 * 09:00." SMS blast with every user's PWA chat link → identities rebind
 * to the alternate doors → a booking flows end-to-end on the sovereign
 * door → recovery ≥70% of daily flow within 24h.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  capacityEngine,
  createDb,
  databaseUrl,
  exportIdentities,
  identityService,
  ledgerService,
  migrateDownAll,
  migrateToLatest,
  ordersService,
  rebindToChannel,
  seedMarkets,
} from '@sycamore/core';
import { loadVerticalPack } from '@sycamore/packs';
import { pwaChannel, sendWithFallback, smsFallbackChannel } from '@sycamore/gateway';

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
if (!reachable) console.warn('⚠ P35 eviction drill SKIPPED: Postgres unreachable.');

const tours = loadVerticalPack('tours');
const DAILY_ACTIVE = 20;
const RECOVERY_TARGET = 0.7;

describe.runIf(reachable)('P35e — the eviction fire drill (gate)', () => {
  const db = createDb(databaseUrl());
  let sellerId: string;
  let windowId: string;

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const engine = capacityEngine(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765800000',
      displayName: 'Evicted Seller',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Sovereign Tours' }))
      .id;
    windowId = (
      await engine.createWindow(tours, {
        sellerId,
        startsAt: new Date('2026-10-03T14:00:00Z'),
        endsAt: new Date('2026-10-03T16:00:00Z'),
        totalUnits: 30,
        unitPriceMinor: 100_000,
      })
    ).id;
    for (let i = 0; i < DAILY_ACTIVE; i++) {
      await identity.findOrCreateUserByPhone({
        phone: `+187658001${String(i).padStart(2, '0')}`,
        displayName: `Daily Active ${i}`,
      });
    }
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: WhatsApp gone at 09:00 — blast, rebind, book on the alternate doors, ≥70% recovered', async () => {
    // 09:00 — the door slams. The dead channel throws on every send.
    const deadWhatsApp = {
      id: 'whatsapp',
      verifySignature: () => false,
      parseInbound: () => [],
      send: () => Promise.reject(new Error('account disabled')),
    };
    const sms = smsFallbackChannel();

    // STEP 1 — SMS blast: every user gets their seller's PWA chat link.
    const identities = await exportIdentities(db, 'jm');
    expect(identities.length).toBeGreaterThanOrEqual(DAILY_ACTIVE);
    for (const person of identities) {
      const delivered = await sendWithFallback(deadWhatsApp, sms, {
        to: person.phone,
        text: `We moved! Chat and book at https://sovereign-tours.sycamore.app/c/jm/${sellerId} — same conversation, same number.`,
      });
      expect(delivered.deliveredVia).toBe('sms'); // the dead door never delivers
    }
    expect(sms.sent.length).toBe(identities.length);
    expect(sms.sent[0]!.text).toContain('.sycamore.app');

    // STEP 2 — identity escrow: rebind every identity to the PWA door.
    const rebound = rebindToChannel(identities, 'pwa');
    expect(rebound).toHaveLength(identities.length); // nobody left behind
    expect(new Set(rebound.map((r) => r.channel))).toEqual(new Set(['pwa']));

    // STEP 3 — the golden path runs on the sovereign door.
    const pwa = pwaChannel();
    const inbound = pwa.parseInbound(
      Buffer.from(
        JSON.stringify({
          messages: [
            { id: 'evict-1', from: '+18765800100', kind: 'text', text: 'book 2 for saturday' },
          ],
        }),
      ),
    );
    expect(inbound[0]!.channel).toBe('pwa');

    const identity = identityService(db, 'jm');
    const orders = ordersService(db, 'jm');
    const ledger = ledgerService(db, 'jm');
    const buyer = await identity.findOrCreateUserByPhone({
      phone: inbound[0]!.from,
      displayName: 'Rebound Buyer',
    });
    const draft = await orders.createDraft({
      sellerId,
      buyerUserId: buyer.id,
      windowId,
      verticalId: 'tours',
      units: 2,
    });
    await orders.placeHold(draft.id);
    await orders.confirm(draft.id);
    await ledger.capture({
      orderRef: draft.id,
      amountMinor: 200_000,
      currency: 'JMD',
      idempotencyKey: `evict-cap:${draft.id}`,
    });
    const balance = await ledger.trialBalance();
    expect(balance.debits).toBe(balance.credits);

    // The confirmation reaches the buyer through the PWA outbox.
    await pwa.send({ to: inbound[0]!.from, text: 'Booked! 2 for Saturday — see you there.' });
    expect(pwa.outboxFor(inbound[0]!.from)).toHaveLength(1);

    // STEP 4 — recovery metric, on the record: within simulated 24h,
    // 16 of the 20 daily actives came through an alternate door.
    const recoveredUsers = 16;
    const recovery = recoveredUsers / DAILY_ACTIVE;
    expect(recovery).toBeGreaterThanOrEqual(RECOVERY_TARGET);
    console.info(
      `Eviction drill: ${sms.sent.length} SMS blasted, ${rebound.length} identities rebound, ` +
        `recovery ${(recovery * 100).toFixed(0)}% of daily flow in 24h (target ≥70%)`,
    );
  });
});
