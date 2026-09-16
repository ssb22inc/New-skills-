/**
 * C02 CLOSURE TESTS — completion evidence, external review 2026-09-16.
 *
 * The finding: the seller action route parsed a client-supplied proof
 * and, when it did not parse, substituted the vertical pack's FIRST
 * ACCEPTED proof. "Finish this order" carrying nothing at all was
 * recorded as a scanned QR code, and that record is what a dispute is
 * judged on. Settlement then released escrow without checking whether
 * the order was completed, disputed, or frozen.
 *
 * The review's closure conditions, one test each:
 *
 *   "No proof, an invalid enum, a forged event, the wrong buyer,
 *    another order's proof, and reused/expired proof all fail with no
 *    status or ledger change."
 *
 *   "A genuine authorized proof completes exactly one eligible order. A
 *    disputed or frozen order cannot release funds through any
 *    available settlement entrypoint."
 *
 * Every refusal here is checked twice: the call throws, AND the order is
 * still confirmed with no evidence row behind it. A test that only
 * asserts the throw would pass against a system that threw after
 * writing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  capacityEngine,
  createDb,
  databaseUrl,
  EvidenceError,
  identityService,
  ledgerService,
  migrateDownAll,
  migrateToLatest,
  ordersService,
  seedMarkets,
  settlementService,
  SettlementError,
} from '@sycamore/core';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';

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
if (!reachable) console.warn('⚠ C02 completion-evidence gates SKIPPED: Postgres unreachable.');

const tours = loadVerticalPack('tours');
const jm = loadContextPack('jm');

describe.runIf(reachable)('C02 — completion takes evidence, not assertions', () => {
  const db = createDb(databaseUrl());
  const orders = ordersService(db, 'jm');
  const settlement = settlementService(db, 'jm', jm);
  const ledger = ledgerService(db, 'jm');
  let sellerId = '';
  let buyerId = '';
  let otherBuyerId = '';
  let windowId = '';

  /** A fresh confirmed order, plus the code its buyer was sent. */
  async function confirmedOrder(): Promise<{ orderId: string; code: string }> {
    const order = await db
      .insertInto('orders')
      .values({
        market_id: 'jm',
        seller_id: sellerId,
        buyer_user_id: buyerId,
        window_id: windowId,
        vertical_id: 'tours',
        units: 1,
        status: 'held',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const hold = await capacityEngine(db, 'jm').requestHold({
      windowId,
      units: 1,
      userId: buyerId,
    });
    // The window has 200 seats and each order takes one, so a waitlist
    // here means the fixture is wrong, not the engine.
    if (hold.kind !== 'held') throw new Error('fixture: expected a hold, got a waitlist place');
    await db
      .updateTable('orders')
      .set({ hold_id: hold.holdId })
      .where('id', '=', order.id)
      .execute();
    await orders.confirm(order.id);
    // confirm() mints the buyer's code and posts it to the outbox for
    // delivery down their own channel — that is where this comes from.
    const event = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'order.completion_code')
      .orderBy('id', 'desc')
      .select('payload')
      .executeTakeFirstOrThrow();
    const payload = event.payload as unknown as { orderId: string; code: string };
    expect(payload.orderId).toBe(order.id);
    return { orderId: order.id, code: payload.code };
  }

  async function stateOf(orderId: string) {
    const order = await db
      .selectFrom('orders')
      .where('id', '=', orderId)
      .select(['status', 'completion_proof'])
      .executeTakeFirstOrThrow();
    const evidence = await db
      .selectFrom('completion_evidence')
      .where('order_id', '=', orderId)
      .select('id')
      .execute();
    return { status: order.status, proof: order.completion_proof, evidence: evidence.length };
  }

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765558801',
      displayName: 'Evidence Owner',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Proof Tours' })).id;
    buyerId = (
      await identity.findOrCreateUserByPhone({
        phone: '+18765558802',
        displayName: 'The Buyer',
        role: 'buyer',
      })
    ).id;
    otherBuyerId = (
      await identity.findOrCreateUserByPhone({
        phone: '+18765558803',
        displayName: 'Somebody Else',
        role: 'buyer',
      })
    ).id;
    const startsAt = new Date(Date.now() + 3_600_000);
    windowId = (
      await capacityEngine(db, 'jm').createWindow(tours, {
        sellerId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 7_200_000),
        totalUnits: 200,
        unitPriceMinor: 900_000,
      })
    ).id;
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: no evidence at all is refused, and the order does not move', async () => {
    const { orderId } = await confirmedOrder();
    await expect(
      // Exactly what the seller's installed client used to send.
      orders.complete(orderId, undefined as never, tours, { userId: null, role: 'seller_client' }),
    ).rejects.toBeInstanceOf(EvidenceError);
    expect(await stateOf(orderId)).toEqual({ status: 'confirmed', proof: null, evidence: 0 });
  });

  it('GATE: naming a proof without holding it is refused', async () => {
    const { orderId } = await confirmedOrder();
    // The old signature took exactly this — a string — and believed it.
    for (const claim of [
      { type: 'qr_scan' },
      { type: 'qr_scan', code: '' },
      { type: 'geo_checkin' },
      { type: 'buyer_confirm' },
      { type: 'not_a_proof', code: 'x' },
      'qr_scan',
      null,
    ]) {
      await expect(
        orders.complete(orderId, claim as never, tours, { userId: null, role: 'seller_client' }),
        `accepted: ${JSON.stringify(claim)}`,
      ).rejects.toBeInstanceOf(EvidenceError);
    }
    expect(await stateOf(orderId)).toEqual({ status: 'confirmed', proof: null, evidence: 0 });
  });

  it('GATE: a proof the vertical does not accept is refused', async () => {
    const { orderId } = await confirmedOrder();
    // tours completes by code or check-in; buyer_confirm belongs to food.
    await expect(
      orders.complete(orderId, { type: 'buyer_confirm', buyerUserId: buyerId }, tours, {
        userId: buyerId,
        role: 'buyer',
      }),
    ).rejects.toThrowError(/is not accepted here/);
    expect((await stateOf(orderId)).evidence).toBe(0);
  });

  it('GATE: a forged code, and another order’s real code, are both refused', async () => {
    const mine = await confirmedOrder();
    const theirs = await confirmedOrder();
    for (const code of [randomUUID(), theirs.code, mine.code.slice(0, -1), `${mine.code}x`]) {
      await expect(
        orders.complete(mine.orderId, { type: 'qr_scan', code }, tours, {
          userId: null,
          role: 'seller_client',
        }),
      ).rejects.toThrowError(/does not belong to this order/);
    }
    expect(await stateOf(mine.orderId)).toEqual({
      status: 'confirmed',
      proof: null,
      evidence: 0,
    });
  });

  it('GATE: an expired code is refused', async () => {
    const { orderId } = await confirmedOrder();
    const { code } = await orders.issueCompletionCode({ orderId, ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 20));
    await expect(
      orders.complete(orderId, { type: 'qr_scan', code }, tours, {
        userId: null,
        role: 'seller_client',
      }),
    ).rejects.toThrowError(/expired/);
    expect((await stateOf(orderId)).evidence).toBe(0);
  });

  it('GATE: a genuine code completes exactly one order, exactly once', async () => {
    const { orderId, code } = await confirmedOrder();
    const done = await orders.complete(orderId, { type: 'qr_scan', code }, tours, {
      userId: null,
      role: 'seller_client',
    });
    expect(done.proof).toBe('qr_scan');
    const after = await stateOf(orderId);
    expect(after.status).toBe('completed');
    expect(after.evidence).toBe(1);
    // The same code a second time: consumed, and the order is already
    // completed — refused either way, and still ONE evidence row.
    await expect(
      orders.complete(orderId, { type: 'qr_scan', code }, tours, {
        userId: null,
        role: 'seller_client',
      }),
    ).rejects.toThrowError();
    expect((await stateOf(orderId)).evidence).toBe(1);
    // And the evidence says who, what and when — a server clock.
    const evidence = await orders.completionEvidenceFor(orderId);
    expect(evidence?.proof_type).toBe('qr_scan');
    expect(evidence?.actor_role).toBe('seller_client');
    expect(new Date(evidence!.verified_at).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('GATE: buyer_confirm must come from the order’s own buyer', async () => {
    const food = loadVerticalPack('food');
    const order = await db
      .insertInto('orders')
      .values({
        market_id: 'jm',
        seller_id: sellerId,
        buyer_user_id: buyerId,
        window_id: windowId,
        vertical_id: 'food',
        units: 1,
        status: 'confirmed',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    // The seller confirming on the buyer's behalf is the whole fraud.
    await expect(
      orders.complete(order.id, { type: 'buyer_confirm', buyerUserId: otherBuyerId }, food, {
        userId: otherBuyerId,
        role: 'buyer',
      }),
    ).rejects.toThrowError(/own buyer/);
    expect((await stateOf(order.id)).evidence).toBe(0);
    await orders.complete(order.id, { type: 'buyer_confirm', buyerUserId: buyerId }, food, {
      userId: buyerId,
      role: 'buyer',
    });
    expect((await stateOf(order.id)).status).toBe('completed');
  });

  it('GATE: a geo check-in nobody can verify is refused, not accepted on trust', async () => {
    const { orderId } = await confirmedOrder();
    const near = {
      type: 'geo_checkin' as const,
      lat: 18.4762,
      lng: -77.8939,
      capturedAt: new Date(),
    };
    // This seller has no service point recorded, so there is nothing to
    // check the claim against. Refusing is the policy.
    await expect(
      orders.complete(orderId, near, tours, { userId: null, role: 'seller' }),
    ).rejects.toThrowError(/no service point/);
    await db
      .updateTable('sellers')
      .set({ service_point_lat: 18.4762, service_point_lng: -77.8939, service_radius_m: 250 })
      .where('id', '=', sellerId)
      .execute();
    // Now it can be checked — and a check-in in the next parish fails.
    await expect(
      orders.complete(
        orderId,
        { type: 'geo_checkin', lat: 18.0179, lng: -76.8099, capturedAt: new Date() },
        tours,
        { userId: null, role: 'seller' },
      ),
    ).rejects.toThrowError(/outside/);
    // So does one from the right place, claimed hours ago.
    await expect(
      orders.complete(
        orderId,
        {
          type: 'geo_checkin',
          lat: 18.4762,
          lng: -77.8939,
          capturedAt: new Date(Date.now() - 4 * 3_600_000),
        },
        tours,
        { userId: null, role: 'seller' },
      ),
    ).rejects.toThrowError(/too old/);
    expect((await stateOf(orderId)).evidence).toBe(0);
    await orders.complete(orderId, near, tours, { userId: null, role: 'seller' });
    expect((await stateOf(orderId)).status).toBe('completed');
    await db
      .updateTable('sellers')
      .set({ service_point_lat: null, service_point_lng: null, service_radius_m: null })
      .where('id', '=', sellerId)
      .execute();
  });

  it('GATE: settlement refuses an order that is not completed, or has no evidence', async () => {
    const { orderId, code } = await confirmedOrder();
    await ledger.capture({
      orderRef: orderId,
      amountMinor: 900_000,
      currency: 'JMD',
      idempotencyKey: `cap:${orderId}`,
    });
    // Confirmed, not completed: the state the review found releasing.
    await expect(settlement.releaseForOrder(orderId)).rejects.toBeInstanceOf(SettlementError);
    await expect(settlement.releaseForOrder(orderId)).rejects.toThrowError(
      /releases on completion/,
    );

    await orders.complete(orderId, { type: 'qr_scan', code }, tours, {
      userId: null,
      role: 'seller_client',
    });
    // Completed, but the 48h dispute window is still open.
    const refused = await settlement.releaseEligibility(orderId);
    expect(refused).toMatchObject({ ok: false, reason: 'dispute_window_open' });
    await expect(settlement.releaseForOrder(orderId)).rejects.toThrowError(/dispute window/);

    // Completion marked by hand with the evidence deleted underneath it
    // — the shape of a compromised or buggy writer.
    await db.deleteFrom('completion_evidence').where('order_id', '=', orderId).execute();
    const later = new Date(Date.now() + 3 * 86_400_000);
    expect(await settlement.releaseEligibility(orderId, later)).toMatchObject({
      ok: false,
      reason: 'no_evidence',
    });
    // Nothing above moved money.
    const released = await db
      .selectFrom('ledger_transactions')
      .where('reference', '=', orderId)
      .where('kind', '=', 'release')
      .select('id')
      .execute();
    expect(released).toEqual([]);
  });

  it('GATE: a disputed or frozen order cannot release through any entrypoint', async () => {
    const { orderId, code } = await confirmedOrder();
    await ledger.capture({
      orderRef: orderId,
      amountMinor: 900_000,
      currency: 'JMD',
      idempotencyKey: `cap2:${orderId}`,
    });
    await orders.complete(orderId, { type: 'qr_scan', code }, tours, {
      userId: null,
      role: 'seller_client',
    });
    const later = new Date(Date.now() + 3 * 86_400_000);
    expect(await settlement.releaseEligibility(orderId, later)).toEqual({ ok: true });

    await db
      .insertInto('disputes')
      .values({
        market_id: 'jm',
        order_id: orderId,
        opened_by_user_id: buyerId,
        reason: 'never turned up',
        status: 'open',
        evidence: JSON.stringify({}),
      })
      .execute();
    expect(await settlement.releaseEligibility(orderId, later)).toMatchObject({
      ok: false,
      reason: 'dispute_open',
    });
    await expect(settlement.releaseForOrder(orderId, later)).rejects.toThrowError(/open dispute/);
    await db.deleteFrom('disputes').where('order_id', '=', orderId).execute();

    // A market in a storm does not move money on days-old information.
    await db
      .insertInto('hurricane_states')
      .values({ market_id: 'jm', active: true, reason: 'test storm' })
      .onConflict((oc) => oc.column('market_id').doUpdateSet({ active: true }))
      .execute();
    expect(await settlement.releaseEligibility(orderId, later)).toMatchObject({
      ok: false,
      reason: 'market_frozen',
    });
    await expect(settlement.releaseForOrder(orderId, later)).rejects.toThrowError(/frozen/);

    // Blackout is the other switch on the same row: bookings continue,
    // money waits (P34d).
    await db
      .updateTable('hurricane_states')
      .set({ active: false, blackout: true, blackout_started_at: new Date() })
      .where('market_id', '=', 'jm')
      .execute();
    expect(await settlement.releaseEligibility(orderId, later)).toMatchObject({
      ok: false,
      reason: 'market_frozen',
    });

    await db
      .updateTable('hurricane_states')
      .set({ active: false, blackout: false })
      .where('market_id', '=', 'jm')
      .execute();
    // Clear again, it releases — once.
    const released = await settlement.releaseForOrder(orderId, later);
    expect(released.posted).toBe(true);
    const rows = await db
      .selectFrom('ledger_transactions')
      .where('reference', '=', orderId)
      .where('kind', '=', 'release')
      .select('id')
      .execute();
    expect(rows).toHaveLength(1);
  });
});
