/**
 * BUILD §5.7 — ADVERSARIAL / FRAUD RED TEAM: payment abuse.
 *
 * §5.7 names three payment attacks by name: "stolen-card patterns,
 * refund-abuse farming, split-manipulation attempts." The review-fraud
 * personas and the prompt-injection corpus were built; these were not,
 * and the standing orders say the adversarial suite runs before every
 * phase gate. A suite with a hole in it is worse than an honest gap,
 * because it reports green over the part nobody wrote.
 *
 * Every test here is an ATTACK on money that already exists. Nothing new
 * is built for them to pass — if one fails, the ledger has a hole, not
 * the test.
 *
 * The three attacks, in the attacker's own terms:
 *
 *   SPLIT MANIPULATION — "make the percentages not add up, or make the
 *   rounding fall my way." Basis points that miss 10,000, amounts that
 *   are negative or fractional or infinite, and 5,000 fuzzed amounts
 *   checking that the rounding remainder always lands on the SELLER.
 *
 *   REFUND-ABUSE FARMING — "refund more than came in, or refund the same
 *   money twice." Over-refunds, salami-slice refunds that sum past the
 *   capture, and refunds after the money is gone.
 *
 *   STOLEN CARD / CHARGEBACK — "pay the seller, then claw the money back
 *   out of escrow that is no longer there." A late reversal after
 *   release must not silently empty an account that has already paid
 *   out; it has to be an explicit, visible adjustment.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  computeSplit,
  createDb,
  MAX_EXACT_SPLIT_MINOR,
  databaseUrl,
  ledgerService,
  migrateDownAll,
  migrateToLatest,
  seedMarkets,
} from '@sycamore/core';

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
if (!reachable) console.warn('⚠ §5.7 payment red team SKIPPED: Postgres unreachable.');

const HONEST = { sellerBps: 8800, platformBps: 1000, referralBps: 0, processorBps: 200 };
const FUZZ_AMOUNTS = 5_000;

/**
 * Seeded so a failure can be reproduced from the log rather than
 * chased. `Math.random()` in a permanent gate means a red CI run nobody
 * can re-create.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pure arithmetic: no database, so NOT gated on one. A money gate that
// disappears when Postgres is down is the exact failure the CI
// database-required guard exists to prevent.
describe('§5.7 red team — split manipulation', () => {
  it('basis points that do not sum to exactly 10,000 are refused', () => {
    const skims = [
      {
        name: 'platform takes one extra point',
        sellerBps: 8800,
        platformBps: 1001,
        referralBps: 0,
        processorBps: 200,
      },
      {
        name: 'a point goes missing',
        sellerBps: 8799,
        platformBps: 1000,
        referralBps: 0,
        processorBps: 200,
      },
      {
        name: 'everything to the platform, twice over',
        sellerBps: 10_000,
        platformBps: 10_000,
        referralBps: 0,
        processorBps: 0,
      },
      { name: 'nothing to anyone', sellerBps: 0, platformBps: 0, referralBps: 0, processorBps: 0 },
    ];
    for (const { name, ...bps } of skims) {
      expect(() => computeSplit(100_000, bps), name).toThrow(/sum to exactly 10000/);
    }
  });

  it('a negative share that still sums to 10,000 is refused', () => {
    // THE FINDING, 2026-09-16. This pair sums to exactly 10,000 and so
    // passed the only check there was, returning seller -10,000 and
    // platform 110,000 on a 100,000 capture: the platform paid more than
    // came in, out of the seller's pocket. Kept as a named test because
    // a regression here is silent — the parts still add up.
    for (const bps of [
      { sellerBps: -1000, platformBps: 11_000, referralBps: 0, processorBps: 0 },
      { sellerBps: 11_000, platformBps: -1000, referralBps: 0, processorBps: 0 },
      { sellerBps: 10_000, platformBps: 0, referralBps: -500, processorBps: 500 },
    ]) {
      expect(() => computeSplit(100_000, bps)).toThrow(/non-negative whole number of bps/);
    }
    // Fractional basis points are refused for the same reason: a share
    // that cannot be counted in whole bps cannot be settled in cents.
    expect(() =>
      computeSplit(100_000, {
        sellerBps: 8800.5,
        platformBps: 999.5,
        referralBps: 0,
        processorBps: 200,
      }),
    ).toThrow(/non-negative whole number of bps/);
  });

  it('an amount too large to split exactly is refused', () => {
    // Above MAX_EXACT_SPLIT_MINOR, amount × bps leaves the range where a
    // double holds integers exactly and Math.floor starts flooring a
    // number that is already wrong. The §5.7 review produced a split
    // whose platform share overshot its own floor by 2 and drove the
    // seller to −1. Refusing the amount beats returning arithmetic
    // nobody can trust.
    expect(() => computeSplit(MAX_EXACT_SPLIT_MINOR + 1, HONEST)).toThrow(
      /exceeds the largest exactly-splittable value/,
    );
    expect(() => computeSplit(9_000_000_000_000_001, HONEST)).toThrow(
      /exceeds the largest exactly-splittable value/,
    );
    // And the boundary itself still splits exactly.
    const parts = computeSplit(MAX_EXACT_SPLIT_MINOR, HONEST);
    expect(parts.seller + parts.platform + parts.referral + parts.processor).toBe(
      MAX_EXACT_SPLIT_MINOR,
    );
    expect(parts.seller).toBeGreaterThan(0);
  });

  it('amounts that are not positive integers are refused', () => {
    for (const amount of [0, -1, -100_000, 1.5, 0.1, NaN, Infinity, -Infinity]) {
      expect(() => computeSplit(amount, HONEST), `amount ${amount}`).toThrow(/positive integer/);
    }
  });

  it(`the rounding remainder lands on the seller, ${FUZZ_AMOUNTS} amounts deep`, () => {
    // The skim that does not look like a skim: take the floor for the
    // seller and let the house keep the fractions. Over a year of
    // Jamaican prices that is real money, and it is invisible in any
    // single receipt.
    let remainderToSeller = 0;
    const random = seededRandom(0x5ca3_0e16);
    for (let i = 0; i < FUZZ_AMOUNTS; i++) {
      // Prices that actually occur: 1 cent to J$50,000.00 in minor units.
      const amount = 1 + Math.floor(random() * 5_000_000);
      const parts = computeSplit(amount, HONEST);

      // 1. Nothing is created or destroyed.
      expect(parts.seller + parts.platform + parts.referral + parts.processor).toBe(amount);
      // 2. Nobody is paid a negative amount.
      for (const [who, value] of Object.entries(parts)) {
        expect(Number.isInteger(value), `${who} must be an integer`).toBe(true);
        expect(value, `${who} must not be negative`).toBeGreaterThanOrEqual(0);
      }
      // 3. The house takes the FLOOR of its share and never a cent more.
      expect(parts.platform).toBe(Math.floor((amount * HONEST.platformBps) / 10_000));
      expect(parts.processor).toBe(Math.floor((amount * HONEST.processorBps) / 10_000));
      // 4. So any remainder is the seller's.
      if (parts.seller > Math.floor((amount * HONEST.sellerBps) / 10_000)) remainderToSeller++;
    }
    // Rounding happens often enough that a "remainder to seller" rule
    // which never fires would mean the test is proving nothing.
    expect(remainderToSeller).toBeGreaterThan(0);
  });
});

describe.runIf(reachable)('§5.7 red team — refund farming and chargebacks', () => {
  const db = createDb(databaseUrl());
  const ledger = ledgerService(db, 'jm');
  const CAPTURE = 900_000;

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('a refund larger than the capture is refused outright', async () => {
    await ledger.capture({
      orderRef: 'farm-1',
      amountMinor: CAPTURE,
      currency: 'JMD',
      idempotencyKey: 'cap:farm-1',
    });
    await expect(
      ledger.refund({
        orderRef: 'farm-1',
        amountMinor: CAPTURE + 1,
        currency: 'JMD',
        idempotencyKey: 'refund:farm-1:greedy',
      }),
    ).rejects.toThrow(/exceeds available escrow/);
  });

  it('salami-sliced refunds cannot sum past the capture', async () => {
    await ledger.capture({
      orderRef: 'farm-2',
      amountMinor: CAPTURE,
      currency: 'JMD',
      idempotencyKey: 'cap:farm-2',
    });
    // Nine honest-looking slices, then one more that tips it over.
    const slice = CAPTURE / 9;
    for (let i = 0; i < 9; i++) {
      await ledger.refund({
        orderRef: 'farm-2',
        amountMinor: slice,
        currency: 'JMD',
        idempotencyKey: `refund:farm-2:${i}`,
      });
    }
    await expect(
      ledger.refund({
        orderRef: 'farm-2',
        amountMinor: 1,
        currency: 'JMD',
        idempotencyKey: 'refund:farm-2:one-more',
      }),
    ).rejects.toThrow(/exceeds available escrow/);
    const summary = await ledger.orderSummary('farm-2');
    expect(summary.refunded).toBe(CAPTURE);
  });

  it('GATE: a chargeback after payout cannot drain escrow that is already gone', async () => {
    // The stolen-card shape. The card clears, the trip happens, the
    // seller is paid — and weeks later the real cardholder disputes it.
    // The money is NOT in escrow any more, and pretending it is would
    // let a thief withdraw twice: once as the seller, once as the
    // refund. It has to surface as an explicit adjustment instead.
    await ledger.capture({
      orderRef: 'stolen-1',
      amountMinor: CAPTURE,
      currency: 'JMD',
      idempotencyKey: 'cap:stolen-1',
    });
    const released = await ledger.release({
      orderRef: 'stolen-1',
      currency: 'JMD',
      split: HONEST,
      idempotencyKey: 'rel:stolen-1',
    });
    expect(released.posted).toBe(true);

    await expect(
      ledger.refund({
        orderRef: 'stolen-1',
        amountMinor: CAPTURE,
        currency: 'JMD',
        idempotencyKey: 'chargeback:stolen-1',
      }),
    ).rejects.toThrow(/exceeds available escrow/);

    // And the same order cannot be released a second time either.
    await expect(
      ledger.release({
        orderRef: 'stolen-1',
        currency: 'JMD',
        split: HONEST,
        idempotencyKey: 'rel:stolen-1:again',
      }),
    ).rejects.toThrow(/already settled/);

    const balance = await ledger.trialBalance();
    expect(balance.debits).toBe(balance.credits);
  });

  it('GATE: refunds fired AT ONCE with distinct keys cannot exceed the capture', async () => {
    // The sequential version of this test passed over a real defect.
    // Idempotency keys stop the SAME key twice; the callers that collide
    // here carry DIFFERENT keys by design — cancel-refund, dispute-refund,
    // hurricane-refund and the payment-webhook path are four keys for one
    // order. Before the row lock, eight of these all read "900,000
    // available", all passed, and all posted.
    await ledger.capture({
      orderRef: 'race-farm',
      amountMinor: CAPTURE,
      currency: 'JMD',
      idempotencyKey: 'cap:race-farm',
    });
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        ledger.refund({
          orderRef: 'race-farm',
          amountMinor: CAPTURE,
          currency: 'JMD',
          idempotencyKey: `refund:race-farm:${i}`,
        }),
      ),
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    const summary = await ledger.orderSummary('race-farm');
    expect(summary.refunded).toBe(CAPTURE);
    expect(summary.refunded).toBeLessThanOrEqual(summary.captured);
  });

  it('GATE: releases fired AT ONCE with distinct keys settle the order once', async () => {
    // Proved on 2026-09-16, before the fix: eight concurrent releases of
    // one 900,000 capture paid the seller 4,500,000. Every posting was
    // internally balanced, so the trial balance stayed level and nothing
    // downstream noticed.
    await ledger.capture({
      orderRef: 'race-settle',
      amountMinor: CAPTURE,
      currency: 'JMD',
      idempotencyKey: 'cap:race-settle',
    });
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        ledger.release({
          orderRef: 'race-settle',
          currency: 'JMD',
          split: HONEST,
          idempotencyKey: `rel:race-settle:${i}`,
        }),
      ),
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    const summary = await ledger.orderSummary('race-settle');
    expect(summary.released).toBe(CAPTURE);
    const balance = await ledger.trialBalance();
    expect(balance.debits).toBe(balance.credits);
  });

  it('GATE: escrow leaves in the currency it arrived in', async () => {
    // A JMD capture released in USD used to be accepted, and
    // trialBalance sums minor units across currencies with no grouping —
    // so the books would have looked level while the money was wrong.
    await ledger.capture({
      orderRef: 'fx-1',
      amountMinor: CAPTURE,
      currency: 'JMD',
      idempotencyKey: 'cap:fx-1',
    });
    await expect(
      ledger.release({
        orderRef: 'fx-1',
        currency: 'USD',
        split: HONEST,
        idempotencyKey: 'rel:fx-1',
      }),
    ).rejects.toThrow(/captured in JMD/);
    await expect(
      ledger.refund({
        orderRef: 'fx-1',
        amountMinor: 1_000,
        currency: 'USD',
        idempotencyKey: 'refund:fx-1',
      }),
    ).rejects.toThrow(/captured in JMD/);
  });

  it('nothing can be released out of an order that was fully refunded', async () => {
    await ledger.capture({
      orderRef: 'refunded-1',
      amountMinor: CAPTURE,
      currency: 'JMD',
      idempotencyKey: 'cap:refunded-1',
    });
    await ledger.refund({
      orderRef: 'refunded-1',
      amountMinor: CAPTURE,
      currency: 'JMD',
      idempotencyKey: 'refund:refunded-1',
    });
    await expect(
      ledger.release({
        orderRef: 'refunded-1',
        currency: 'JMD',
        split: HONEST,
        idempotencyKey: 'rel:refunded-1',
      }),
    ).rejects.toThrow(/nothing to release/);
  });
});

describe.runIf(reachable)('§5.7 red team — forging entries directly', () => {
  const db = createDb(databaseUrl());
  const ledger = ledgerService(db, 'jm');

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('an unbalanced transaction is refused', async () => {
    await expect(
      ledger.postAdjustment({
        reference: 'forge-1',
        idempotencyKey: 'forge:1',
        entries: [
          { account: 'external', direction: 'debit', amountMinor: 100, currency: 'JMD' },
          { account: 'platform_fees', direction: 'credit', amountMinor: 101, currency: 'JMD' },
        ],
      }),
    ).rejects.toThrow(/unbalanced/);
  });

  it('a one-sided transaction is refused', async () => {
    await expect(
      ledger.postAdjustment({
        reference: 'forge-2',
        idempotencyKey: 'forge:2',
        entries: [{ account: 'external', direction: 'debit', amountMinor: 100, currency: 'JMD' }],
      }),
    ).rejects.toThrow(/at least two entries/);
  });

  it('mixing currencies inside one transaction is refused', async () => {
    await expect(
      ledger.postAdjustment({
        reference: 'forge-3',
        idempotencyKey: 'forge:3',
        entries: [
          { account: 'external', direction: 'debit', amountMinor: 100, currency: 'JMD' },
          { account: 'platform_fees', direction: 'credit', amountMinor: 100, currency: 'USD' },
        ],
      }),
    ).rejects.toThrow(/one currency/);
  });

  it('zero and fractional entry amounts are refused', async () => {
    for (const amountMinor of [0, -50, 12.5]) {
      await expect(
        ledger.postAdjustment({
          reference: `forge-amt-${amountMinor}`,
          idempotencyKey: `forge:amt:${amountMinor}`,
          entries: [
            { account: 'external', direction: 'debit', amountMinor, currency: 'JMD' },
            { account: 'platform_fees', direction: 'credit', amountMinor, currency: 'JMD' },
          ],
        }),
      ).rejects.toThrow(/positive integers/);
    }
  });

  it('GATE: history cannot be edited, even with a direct SQL handle', async () => {
    // The last line of defence, and the reason this one opens its own
    // raw connection rather than going through the service: everything
    // above is an attack on the API, and an attacker holding the app's
    // own database credentials does not have to use the API at all. The
    // trigger is what stops them, so the trigger is what gets attacked.
    await ledger.capture({
      orderRef: 'immutable-1',
      amountMinor: 500_000,
      currency: 'JMD',
      idempotencyKey: 'cap:immutable-1',
    });

    const raw = new pg.Client({ connectionString: databaseUrl() });
    await raw.connect();
    try {
      for (const statement of [
        `update ledger_entries set amount_minor = 1 where market_id = 'jm'`,
        `update ledger_entries set account = 'platform_fees' where market_id = 'jm'`,
        `delete from ledger_entries where market_id = 'jm'`,
        `delete from ledger_transactions where market_id = 'jm'`,
      ]) {
        await expect(raw.query(statement), statement).rejects.toThrow(/append-only/);
      }
    } finally {
      await raw.end();
    }

    const balance = await ledger.trialBalance();
    expect(balance.debits).toBe(balance.credits);
    expect(balance.debits).toBeGreaterThan(0);
  });
});
