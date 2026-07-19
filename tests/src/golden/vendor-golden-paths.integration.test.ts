/**
 * Golden-path suite v1 (P11 gate; BUILD §5.4 items 3, 6 + booking flow).
 * Runs nightly: `pnpm --filter @sycamore/tests golden`.
 * NOTE: "green 3 nights running against staging" is an operational gate —
 * this suite is the executable; staging cadence is tracked in BUILD_STATUS.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  autopilot,
  capacityEngine,
  createDb,
  databaseUrl,
  identityService,
  migrateDownAll,
  migrateToLatest,
  ordersService,
  seedMarkets,
  type Intent,
  type ToolCallRequest,
} from '@sycamore/core';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';
import { createLlmRouter, mockProvider } from '@sycamore/adapters';

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
if (!reachable) console.warn('⚠ GOLDEN SUITE SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
const tours = loadVerticalPack('tours');

describe.runIf(reachable)('Golden paths v1 — Autopilot end-to-end (P11 gate)', () => {
  const db = createDb(databaseUrl());
  const identity = identityService(db, 'jm');
  const engine = capacityEngine(db, 'jm');
  const orders = ordersService(db, 'jm');

  // Deterministic "model": tests enqueue the intent + tool proposals the
  // model would produce; the suite tests WIRING, not NLP.
  let nextIntent: Intent = 'other';
  let nextProposals: ToolCallRequest[] = [];
  const router = createLlmRouter(
    [
      {
        provider: mockProvider({
          id: 'scripted',
          reply: () => JSON.stringify({ intent: nextIntent }),
        }),
        dpaSigned: true,
      },
    ],
    {
      'routine-reply': { primary: 'scripted', fallbacks: [] },
      'intent-detection': { primary: 'scripted', fallbacks: [] },
      'money-math': { primary: 'scripted', fallbacks: [] },
      compliance: { primary: 'scripted', fallbacks: [] },
      creative: { primary: 'scripted', fallbacks: [] },
    },
  );
  const bot = autopilot(
    {
      db,
      router,
      contextPack: jm,
      verticalPacks: new Map([['tours', tours]]),
      proposeToolCalls: () => Promise.resolve(nextProposals),
    },
    'jm',
  );

  let sellerId: string;
  let buyerA: string;
  let buyerB: string;

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18760004000',
      displayName: 'Golden Boss',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Golden Tours' })).id;
    buyerA = (
      await identity.findOrCreateUserByPhone({ phone: '+18760004001', displayName: 'Golden A' })
    ).id;
    buyerB = (
      await identity.findOrCreateUserByPhone({ phone: '+18760004002', displayName: 'Golden B' })
    ).id;
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  function makeWindow(units: number, hour: number, price = 900_000) {
    return engine.createWindow(tours, {
      sellerId,
      startsAt: new Date(`2026-10-01T${String(hour).padStart(2, '0')}:00:00Z`),
      endsAt: new Date(`2026-10-01T${String(hour + 2).padStart(2, '0')}:00:00Z`),
      totalUnits: units,
      unitPriceMinor: price,
    });
  }

  /** Independent truth: availability computed straight from the tables. */
  async function dbTruthAvailable(windowId: string): Promise<number> {
    const win = await db
      .selectFrom('capacity_windows')
      .where('id', '=', windowId)
      .selectAll()
      .executeTakeFirstOrThrow();
    const holds = await db
      .selectFrom('capacity_holds')
      .where('window_id', '=', windowId)
      .selectAll()
      .execute();
    const used = holds
      .filter(
        (h) =>
          h.status === 'confirmed' || (h.status === 'held' && new Date(h.expires_at) > new Date()),
      )
      .reduce((s, h) => s + h.units, 0);
    return win.total_units - used;
  }

  it('booking flow: book via chat → capacity fills → quote is pack-currency', async () => {
    const win = await makeWindow(3, 8);

    nextIntent = 'price';
    nextProposals = [{ tool: 'quote_price', args: { windowId: win.id, units: 2 } }];
    const quote = await bot.handleInbound({ userId: buyerA, text: 'how much fi two seat?' });
    const quoteResult = quote.executions[0]?.result;
    expect(quoteResult?.kind).toBe('quote');
    if (quoteResult?.kind === 'quote') {
      expect(quoteResult.amountMinor).toBe(1_800_000);
      expect(quoteResult.rendered).toBe('J$18,000.00'); // symbol from the pack
    }

    nextIntent = 'book';
    nextProposals = [{ tool: 'place_hold', args: { windowId: win.id, units: 2 } }];
    const booked = await bot.handleInbound({ userId: buyerA, text: 'book 2 seats saturday' });
    expect(booked.executions[0]?.result.kind).toBe('booked');
    expect(await dbTruthAvailable(win.id)).toBe(1); // capacity actually filled
  });

  it('stock questions answer from LIVE inventory — never promising ghosts', async () => {
    const win = await makeWindow(3, 10);

    nextIntent = 'stock';
    nextProposals = [{ tool: 'check_availability', args: { windowId: win.id } }];
    const before = await bot.handleInbound({ userId: buyerB, text: 'any space left?' });
    expect(before.executions[0]?.result).toEqual({
      kind: 'availability',
      total: 3,
      available: 3,
    });

    // Someone else books 2 out from under the conversation.
    nextIntent = 'book';
    nextProposals = [{ tool: 'place_hold', args: { windowId: win.id, units: 2 } }];
    await bot.handleInbound({ userId: buyerA, text: 'book 2' });

    nextIntent = 'stock';
    nextProposals = [{ tool: 'check_availability', args: { windowId: win.id } }];
    const after = await bot.handleInbound({ userId: buyerB, text: 'still have space?' });
    const answer = after.executions[0]?.result;
    expect(answer?.kind).toBe('availability');
    if (answer?.kind === 'availability') {
      expect(answer.available).toBe(await dbTruthAvailable(win.id)); // single source of truth
      expect(answer.available).toBe(1);
    }

    // Booking 2 into 1 remaining can only waitlist — never an overpromise.
    nextIntent = 'book';
    nextProposals = [{ tool: 'place_hold', args: { windowId: win.id, units: 2 } }];
    const over = await bot.handleInbound({ userId: buyerB, text: 'book 2 anyway' });
    expect(over.executions[0]?.result.kind).toBe('waitlisted');
    expect(await dbTruthAvailable(win.id)).toBe(1); // unchanged
  });

  it('cancellation frees capacity and notifies via the outbox', async () => {
    const win = await makeWindow(1, 12);
    nextIntent = 'book';
    nextProposals = [{ tool: 'place_hold', args: { windowId: win.id, units: 1 } }];
    const booked = await bot.handleInbound({ userId: buyerA, text: 'book it' });
    const orderId =
      booked.executions[0]?.result.kind === 'booked' ? booked.executions[0].result.orderId : '';
    expect(orderId).not.toBe('');
    expect(await dbTruthAvailable(win.id)).toBe(0);

    nextIntent = 'cancel';
    nextProposals = [{ tool: 'cancel_order', args: { orderId } }];
    const cancelled = await bot.handleInbound({ userId: buyerA, text: 'cancel mi booking' });
    expect(cancelled.executions[0]?.result.kind).toBe('cancelled');
    expect(await dbTruthAvailable(win.id)).toBe(1); // freed

    const events = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'order.cancelled')
      .selectAll()
      .execute();
    expect(events.length).toBeGreaterThanOrEqual(1); // notification source
  });

  it('reschedule moves to a REAL open slot and refuses a full one atomically', async () => {
    const source = await makeWindow(2, 14);
    const openTarget = await makeWindow(2, 16);
    const fullTarget = await makeWindow(1, 18);

    // Fill fullTarget via a direct order.
    const filler = await orders.createDraft({
      sellerId,
      buyerUserId: buyerB,
      windowId: fullTarget.id,
      verticalId: 'tours',
      units: 1,
    });
    await orders.placeHold(filler.id);

    nextIntent = 'book';
    nextProposals = [{ tool: 'place_hold', args: { windowId: source.id, units: 1 } }];
    const booked = await bot.handleInbound({ userId: buyerA, text: 'book source' });
    const orderId =
      booked.executions[0]?.result.kind === 'booked' ? booked.executions[0].result.orderId : '';

    nextIntent = 'reschedule';
    nextProposals = [
      { tool: 'reschedule_order', args: { orderId, targetWindowId: fullTarget.id } },
    ];
    const refused = await bot.handleInbound({ userId: buyerA, text: 'move me to 6pm' });
    expect(refused.executions[0]?.result.kind).toBe('refused'); // full slot refused
    expect((await orders.get(orderId))?.window_id).toBe(source.id); // untouched

    nextIntent = 'reschedule';
    nextProposals = [
      { tool: 'reschedule_order', args: { orderId, targetWindowId: openTarget.id } },
    ];
    const moved = await bot.handleInbound({ userId: buyerA, text: 'ok 4pm then' });
    expect(moved.executions[0]?.result.kind).toBe('rescheduled');
    expect((await orders.get(orderId))?.window_id).toBe(openTarget.id);
    expect(await dbTruthAvailable(source.id)).toBe(2); // source freed
  });

  it('§5.4-3: STOP silences Autopilot <5s; RESUME restores cleanly', async () => {
    await bot.conversations.setAutopilot(buyerA, true);
    const t0 = Date.now();
    const stopped = await bot.handleInbound({ userId: buyerA, text: 'STOP' });
    expect(stopped.action.type).toBe('stopped_ack');
    expect(Date.now() - t0).toBeLessThan(5000);

    nextIntent = 'book';
    nextProposals = [{ tool: 'place_hold', args: { windowId: crypto.randomUUID(), units: 1 } }];
    const silent = await bot.handleInbound({ userId: buyerA, text: 'book something' });
    expect(silent.action.type).toBe('silent');
    expect(silent.executions).toHaveLength(0); // STOPPED means no tools either

    const resumed = await bot.handleInbound({ userId: buyerA, text: 'RESUME' });
    expect(resumed.action.type).toBe('resumed_ack');
  });

  it('§5.4-6: complaint → zero bot reply → owner pinged with context <60s', async () => {
    const t0 = Date.now();
    nextIntent = 'complaint';
    nextProposals = [];
    const result = await bot.handleInbound({
      userId: buyerA,
      text: 'di boat late two hour an nobody say sorry',
    });
    expect(result.action.type).toBe('escalate_to_owner');
    expect(result.executions).toHaveLength(0); // zero tools, zero reply
    if (result.action.type === 'escalate_to_owner') {
      expect(result.action.userText).toContain('late two hour'); // full context
    }
    expect(Date.now() - t0).toBeLessThan(60_000);
  });
});
