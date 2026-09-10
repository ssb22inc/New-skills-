/**
 * P30 GATE — the founder cockpit renders ALL of it, in plain language.
 *
 * The audit found the cockpit showing three of eight agents, no fairness
 * meter, and no money at all — while the fairness metric sat in core,
 * unit-tested and wired to nothing. This renders the real route against
 * a real database and holds every panel in place.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  capacityEngine,
  createDb,
  databaseUrl,
  fairnessMeter,
  identityService,
  ledgerService,
  marketMoney,
  migrateDownAll,
  migrateToLatest,
  ordersService,
  recordMentorMessage,
  recordPilot,
  recordSwapReview,
  seedMarkets,
} from '@sycamore/core';
import { loadVerticalPack } from '@sycamore/packs';
import { cockpitPage } from '@sycamore/web';

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
if (!reachable) console.warn('⚠ cockpit panel tests SKIPPED: Postgres unreachable.');

const tours = loadVerticalPack('tours');
const PRICE = 100_000;

describe.runIf(reachable)('P30 — every agent reports to the cockpit (gate)', () => {
  const db = createDb(databaseUrl());
  let incumbentId = '';

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const engine = capacityEngine(db, 'jm');
    const orders = ordersService(db, 'jm');
    const ledger = ledgerService(db, 'jm');

    // One established seller and one still building a record, so the
    // fairness meter has something real to say.
    const mkSeller = async (phone: string, name: string, completed: number) => {
      const user = await identity.findOrCreateUserByPhone({
        phone,
        displayName: name,
        role: 'seller',
      });
      const seller = await identity.createSeller({ userId: user.id, businessName: name });
      await db
        .updateTable('sellers')
        .set({ completed_orders: completed })
        .where('id', '=', seller.id)
        .execute();
      const window = await engine.createWindow(tours, {
        sellerId: seller.id,
        startsAt: new Date('2026-11-20T14:00:00Z'),
        endsAt: new Date('2026-11-20T16:00:00Z'),
        totalUnits: 20,
        unitPriceMinor: PRICE,
      });
      return { seller, window };
    };
    const incumbent = await mkSeller('+18765910000', 'Old Reliable Tours', 40);
    const newcomer = await mkSeller('+18765910001', 'Brand New Boats', 1);
    incumbentId = incumbent.seller.id;

    // Four first-time buyers: three to the incumbent, one to the newcomer.
    const targets = [incumbent, incumbent, incumbent, newcomer];
    for (const [i, target] of targets.entries()) {
      const buyer = await identity.findOrCreateUserByPhone({
        phone: `+1876591010${i}`,
        displayName: `Cockpit Buyer ${i}`,
      });
      const draft = await orders.createDraft({
        sellerId: target.seller.id,
        buyerUserId: buyer.id,
        windowId: target.window.id,
        verticalId: 'tours',
        units: 1,
      });
      await orders.placeHold(draft.id);
      await orders.confirm(draft.id);
      await ledger.capture({
        orderRef: draft.id,
        amountMinor: PRICE,
        currency: 'JMD',
        idempotencyKey: `cockpit-cap:${draft.id}`,
      });
    }

    // The three agents that had no durable record until now.
    await recordSwapReview(db, 'jm', {
      proposals: [
        { lane: 'asr', fromVendorId: 'incumbent', toVendorId: 'cheaper', monthlySavingMinor: 4000 },
      ],
      blocked: [{ lane: 'llm', vendorId: 'cheap-no-dpa', reason: 'no signed DPA on a PII lane' }],
    });
    await recordPilot(db, 'jm', { pilotId: 'radio-1', lift: 0.12, filteredOut: 3, sample: 200 });
    await recordMentorMessage(db, 'jm', incumbentId, {
      suggestions: [
        {
          signal: 'photo_freshness',
          text: 'x',
          source: { kind: 'catalog', evidence: 'stale' },
        },
      ],
      strength: null,
      message: 'x',
    });
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: all eight agents have a row on the report card', async () => {
    const html = await (await cockpitPage(new Request('https://x/cockpit?market=jm'))).text();
    for (const agent of [
      'watchman',
      'fixer',
      'listener',
      'scout',
      'mentor',
      'builder',
      'bursar',
      'herald',
      'chairman',
    ]) {
      expect(html, `${agent} has no report card`).toContain(`data-agent="${agent}"`);
    }
  });

  it('GATE: the fairness meter renders, and matches the metric core computes', async () => {
    const meter = await fairnessMeter(db, 'jm');
    // One of four first-time buyers went to the newcomer.
    expect(meter.newcomerShare).toBeCloseTo(0.25, 5);
    expect(meter.newcomerSellers).toBe(1);

    const html = await (await cockpitPage(new Request('https://x/cockpit?market=jm'))).text();
    expect(html).toContain('data-panel="fairness"');
    expect(html).toContain('data-fairness="25"');
    expect(html).toContain('1 of 2 sellers');
  });

  it('GATE: money renders as plain numbers in the market currency', async () => {
    const money = await marketMoney(db, 'jm');
    expect(money.capturedMinor).toBe(4 * PRICE);

    const html = await (await cockpitPage(new Request('https://x/cockpit?market=jm'))).text();
    expect(html).toContain('data-panel="money"');
    expect(html).toContain('data-money="captured"');
    // Plain numbers in the pack's currency — never a chart to interpret.
    expect(html).toContain('J$4,000.00');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('<svg');
  });

  it("the Bursar's DPA block is visible to the founder, not just returned", async () => {
    const html = await (await cockpitPage(new Request('https://x/cockpit?market=jm'))).text();
    expect(html).toContain('1 blocked on DPA');
    // Counts read as English, not as a template: "1 pilot", not "1 pilots".
    expect(html).toContain('1 pilot ·');
    expect(html).toContain('1 weekly message sent'); // Mentor's delivery
  });

  it('the cockpit is still pure HTML — the founder is on a phone too', async () => {
    const res = await cockpitPage(new Request('https://x/cockpit?market=jm'));
    const html = await res.text();
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).not.toContain('<script');
    expect(Buffer.byteLength(html)).toBeLessThan(100_000);
  });

  it('every panel is market-scoped — a dark market shows its own zeroes', async () => {
    const html = await (await cockpitPage(new Request('https://x/cockpit?market=do'))).text();
    expect(html).toContain('data-fairness="0"');
    expect(html).toContain('data-install-rate="0"');
    expect(html).not.toContain('Old Reliable');
    expect(html).not.toContain('NaN');
  });
});
