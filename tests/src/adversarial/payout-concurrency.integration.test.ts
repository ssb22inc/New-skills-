/**
 * C04 CLOSURE TESTS — payout concurrency, external review 2026-09-16.
 *
 * The finding: `payoutSeller` reads a seller's accumulated payable and
 * referral balances and then posts the debits, with no lock on the
 * seller. Its idempotency key stops the SAME key repeating; it does
 * nothing about two batches with DIFFERENT keys, which is exactly what
 * `runPayoutBatch` builds — one key per batch id. Two batches, two
 * reads of 100,000, two payouts of 100,000, and a payable balance that
 * has gone negative while every individual ledger transaction still
 * balances perfectly.
 *
 * The review's closure conditions:
 *
 *   "Run at least 100 simultaneous attempts for one seller using
 *    distinct batch keys and a fixed opening balance. Total reserved/paid
 *    funds must never exceed that balance; no balance may become
 *    negative. […] Add a regression test for the exact interleaving that
 *    previously allowed both workers to read the same unpaid balance."
 *
 * The second finding in the same function had nothing to do with races:
 * the balance read filtered by SELLER but never by CURRENCY, so a seller
 * holding two currencies had both summed into one payout denominated in
 * whichever currency the caller happened to pass. That is the last test
 * here, and it fails on the old code with no concurrency at all.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  createDb,
  databaseUrl,
  identityService,
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
if (!reachable) console.warn('⚠ C04 payout concurrency gates SKIPPED: Postgres unreachable.');

const OPENING_BALANCE = 900_000;

describe.runIf(reachable)('C04 — a seller is paid what they are owed, once', () => {
  const db = createDb(databaseUrl());
  const ledger = ledgerService(db, 'jm');
  let sellerId = '';
  let nth = 0;

  /** Put a known, fixed balance in front of the payout logic. */
  async function fundSeller(amountMinor: number, currency = 'JMD'): Promise<void> {
    const ref = `fund-${(nth += 1)}`;
    await ledger.capture({
      orderRef: ref,
      amountMinor,
      currency,
      idempotencyKey: `cap:${ref}`,
    });
    await ledger.release({
      orderRef: ref,
      currency,
      split: { sellerBps: 10_000, platformBps: 0, referralBps: 0, processorBps: 0 },
      idempotencyKey: `rel:${ref}`,
      sellerId,
    });
  }

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765559501',
      displayName: 'Payout Owner',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Payout Tours' })).id;
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: 120 simultaneous payouts with DISTINCT keys pay the balance exactly once', async () => {
    await fundSeller(OPENING_BALANCE);
    expect((await ledger.sellerBalances(sellerId, 'JMD')).payable).toBe(OPENING_BALANCE);

    // Distinct keys, so idempotency offers no protection at all — this
    // is the batch-key shape runPayoutBatch actually produces.
    const attempts = Array.from({ length: 120 }, (_, i) =>
      ledger.payoutSeller({
        sellerId,
        currency: 'JMD',
        idempotencyKey: `race:payout:${i}`,
      }),
    );
    const results = await Promise.allSettled(attempts);
    const posted = results.filter(
      (r) => r.status === 'fulfilled' && r.value.posted && r.value.amountMinor > 0,
    );
    const paid = posted.reduce(
      (sum, r) => sum + (r as PromiseFulfilledResult<{ amountMinor: number }>).value.amountMinor,
      0,
    );

    // The whole finding, in two assertions: money out never exceeds the
    // balance, and the balance never goes negative.
    expect(paid).toBeLessThanOrEqual(OPENING_BALANCE);
    expect(paid).toBe(OPENING_BALANCE);
    expect(posted).toHaveLength(1);
    const after = await ledger.sellerBalances(sellerId, 'JMD');
    expect(after.payable).toBe(0);
    expect(after.payable).toBeGreaterThanOrEqual(0);

    // And the ledger still balances, which it did even while wrong —
    // the reason a trial balance alone could never catch this.
    const trial = await ledger.trialBalance();
    expect(trial.debits).toBe(trial.credits);
  });

  it('GATE: the interleaving itself — two payouts that both read the same balance', async () => {
    await fundSeller(OPENING_BALANCE);
    // Deliberately the narrow case, run many times: two workers, two
    // keys, launched together. Before the lock, one in a handful of
    // runs produced two payouts of the full balance.
    for (let round = 0; round < 12; round++) {
      const [a, b] = await Promise.allSettled([
        ledger.payoutSeller({
          sellerId,
          currency: 'JMD',
          idempotencyKey: `interleave:${round}:a`,
        }),
        ledger.payoutSeller({
          sellerId,
          currency: 'JMD',
          idempotencyKey: `interleave:${round}:b`,
        }),
      ]);
      const paid = [a, b]
        .filter((r) => r.status === 'fulfilled')
        .reduce(
          (sum, r) =>
            sum + (r as PromiseFulfilledResult<{ amountMinor: number }>).value.amountMinor,
          0,
        );
      expect(paid, `round ${round} paid ${paid}`).toBeLessThanOrEqual(OPENING_BALANCE);
      const balance = (await ledger.sellerBalances(sellerId, 'JMD')).payable;
      expect(balance, `round ${round} left ${balance}`).toBeGreaterThanOrEqual(0);
      if (round === 0) expect(paid).toBe(OPENING_BALANCE);
      await fundSeller(OPENING_BALANCE); // top up for the next round
    }
  });

  it('GATE: a payout pays ONE currency — the other one stays where it is', async () => {
    // Nothing concurrent here. The old read filtered by seller and not
    // by currency, so this seller's DOP balance would have left the
    // building inside a JMD payout.
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765559502',
      displayName: 'Two Currency Owner',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Two Currencies' }))
      .id;

    await fundSeller(500_000, 'JMD');
    await fundSeller(300_000, 'DOP');

    const jmd = await ledger.payoutSeller({
      sellerId,
      currency: 'JMD',
      idempotencyKey: 'currency:jmd',
    });
    expect(jmd.amountMinor).toBe(500_000);

    const dop = await ledger.payoutSeller({
      sellerId,
      currency: 'DOP',
      idempotencyKey: 'currency:dop',
    });
    expect(dop.amountMinor).toBe(300_000);

    // Both are now settled, and neither took the other's money.
    const trial = await ledger.trialBalance();
    expect(trial.debits).toBe(trial.credits);
    const third = await ledger.payoutSeller({
      sellerId,
      currency: 'JMD',
      idempotencyKey: 'currency:jmd:again',
    });
    expect(third.posted).toBe(false);
  });
});
