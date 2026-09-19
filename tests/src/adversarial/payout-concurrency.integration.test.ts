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
import { mockPay } from '@sycamore/adapters';
import {
  createDb,
  databaseUrl,
  identityService,
  ledgerService,
  migrateDownAll,
  migrateToLatest,
  payoutService,
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
  // Since C05 a payout is an INTENT: reserving moves money out of the
  // seller's balance into `payout_in_flight` and nowhere else. The race
  // these gates describe is now a race to reserve, and it is the same
  // race — two workers reading one balance.
  const payouts = payoutService(db, 'jm');
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

    // 120 batches at once, each asking for this seller's money. Every
    // one of them used to build its own idempotency key, so idempotency
    // offered no protection at all.
    const attempts = Array.from({ length: 120 }, (_, i) =>
      payouts.reserve({ sellerId, currency: 'JMD', batchKey: `race-${i}` }),
    );
    const results = await Promise.allSettled(attempts);
    const intents = new Set(
      results
        .filter((r) => r.status === 'fulfilled' && r.value)
        .map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id),
    );
    // ONE intent, for the whole balance, and no more.
    expect(intents.size).toBe(1);
    const rows = await db.selectFrom('payout_intents').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.amount_minor)).toBe(OPENING_BALANCE);

    // The whole finding, in two assertions: money out never exceeds the
    // balance, and the balance never goes negative.
    const after = await ledger.sellerBalances(sellerId, 'JMD');
    expect(after.payable).toBe(0);
    expect(after.payable).toBeGreaterThanOrEqual(0);
    // And it is IN FLIGHT, not paid. `external` is no use as a witness
    // here — it already carries the capture that funded this seller — so
    // the question is asked of the intent, which is the thing that knows
    // whether a provider was ever told to move anything.
    expect(-(await ledger.accountBalance('payout_in_flight'))).toBe(OPENING_BALANCE);
    expect(rows[0]!.state).toBe('reserved');
    expect(rows[0]!.settled_at).toBeNull();
    expect(rows[0]!.provider).toBeNull();

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
    const pay = mockPay();
    for (let round = 0; round < 12; round++) {
      const [a, b] = await Promise.allSettled([
        payouts.reserve({ sellerId, currency: 'JMD', batchKey: `interleave-${round}-a` }),
        payouts.reserve({ sellerId, currency: 'JMD', batchKey: `interleave-${round}-b` }),
      ]);
      const ids = new Set(
        [a, b]
          .filter((r) => r.status === 'fulfilled' && r.value)
          .map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id),
      );
      expect(ids.size, `round ${round} opened ${ids.size} intents`).toBe(1);
      const balance = (await ledger.sellerBalances(sellerId, 'JMD')).payable;
      expect(balance, `round ${round} left ${balance}`).toBeGreaterThanOrEqual(0);
      // Settle it so the next round starts from a clean seller, the way
      // a real week does.
      const [id] = [...ids];
      const submitted = await payouts.submit(id!, pay);
      await payouts.settle({
        intentId: submitted.id,
        providerEventId: `evt-interleave-${round}`,
      });
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

    const jmd = await payouts.reserve({ sellerId, currency: 'JMD' });
    expect(jmd?.amountMinor).toBe(500_000);

    const dop = await payouts.reserve({ sellerId, currency: 'DOP' });
    expect(dop?.amountMinor).toBe(300_000);

    // Neither took the other's money, and the books still balance.
    const trial = await ledger.trialBalance();
    expect(trial.debits).toBe(trial.credits);
    // A seller with nothing left owed opens no intent at all.
    const pay = mockPay();
    for (const intent of [jmd!, dop!]) {
      const submitted = await payouts.submit(intent.id, pay);
      await payouts.settle({
        intentId: submitted.id,
        providerEventId: `evt-${intent.currency}`,
      });
    }
    expect(await payouts.reserve({ sellerId, currency: 'JMD' })).toBeUndefined();
  });
});
