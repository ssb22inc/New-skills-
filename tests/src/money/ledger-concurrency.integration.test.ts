/**
 * The 10,000-op ledger fuzz proves ARITHMETIC. It runs in one process,
 * one operation at a time — so it cannot prove what actually happens on
 * a Friday night: many workers, the same order, at the same instant.
 *
 * The audit flagged that gap. This is the concurrency half: the capacity
 * storm's discipline applied to money.
 *
 *   1. 200 concurrent captures of the SAME order with the SAME key →
 *      exactly one transaction, exactly one set of entries.
 *   2. 100 concurrent captures of 100 DIFFERENT orders → all land, and
 *      the trial balance is exact to the cent.
 *   3. Release and refund racing each other on one order → no double
 *      settle, no refund exceeding capture.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  createDb,
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
if (!reachable) console.warn('⚠ ledger concurrency SKIPPED: Postgres unreachable.');

const STAMPEDE = 200;
const PARALLEL_ORDERS = 100;
const PRICE = 100_000;
const SPLIT = { sellerBps: 8800, platformBps: 1000, referralBps: 0, processorBps: 200 };

describe.runIf(reachable)('money under concurrency (gate)', () => {
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

  it(`GATE: ${STAMPEDE} concurrent captures of ONE key produce exactly one effect`, async () => {
    // The webhook stampede: a partner retries, a queue redelivers, and
    // three workers pick it up at once. Idempotency has to hold under
    // real contention, not just sequential replay.
    const results = await Promise.all(
      Array.from({ length: STAMPEDE }, () =>
        ledger.capture({
          orderRef: 'stampede-order',
          amountMinor: PRICE,
          currency: 'JMD',
          idempotencyKey: 'stampede:one',
        }),
      ),
    );
    expect(results).toHaveLength(STAMPEDE);

    const transactions = await db
      .selectFrom('ledger_transactions')
      .where('market_id', '=', 'jm')
      .where('idempotency_key', '=', 'stampede:one')
      .selectAll()
      .execute();
    expect(transactions).toHaveLength(1); // one key, one transaction, always

    const entries = await db
      .selectFrom('ledger_entries')
      .where('market_id', '=', 'jm')
      .where('transaction_id', '=', transactions[0]!.id)
      .selectAll()
      .execute();
    expect(entries).toHaveLength(2); // one debit, one credit — not 400
    const balance = await ledger.trialBalance();
    expect(balance.debits).toBe(balance.credits);
  });

  it(`GATE: ${PARALLEL_ORDERS} different orders captured in parallel all land, to the cent`, async () => {
    const before = await ledger.trialBalance();
    await Promise.all(
      Array.from({ length: PARALLEL_ORDERS }, (_, i) =>
        ledger.capture({
          orderRef: `parallel-${i}`,
          amountMinor: PRICE + i, // distinct amounts catch off-by-one summing
          currency: 'JMD',
          idempotencyKey: `parallel:${i}`,
        }),
      ),
    );
    const after = await ledger.trialBalance();
    const expected = PARALLEL_ORDERS * PRICE + (PARALLEL_ORDERS * (PARALLEL_ORDERS - 1)) / 2;
    expect(after.debits - before.debits).toBe(expected);
    expect(after.debits).toBe(after.credits); // still exact
  });

  it('GATE: release racing refund on one order never double-settles', async () => {
    await ledger.capture({
      orderRef: 'race-order',
      amountMinor: PRICE,
      currency: 'JMD',
      idempotencyKey: 'race:capture',
    });

    // Both hit at once, each retried three times for good measure.
    const attempts = [
      ...Array.from({ length: 3 }, () =>
        ledger
          .release({
            orderRef: 'race-order',
            currency: 'JMD',
            split: SPLIT,
            idempotencyKey: 'race:release',
          })
          .catch((err: unknown) => err),
      ),
      ...Array.from({ length: 3 }, () =>
        ledger
          .refund({
            orderRef: 'race-order',
            amountMinor: PRICE,
            currency: 'JMD',
            idempotencyKey: 'race:refund',
          })
          .catch((err: unknown) => err),
      ),
    ];
    await Promise.all(attempts);

    // Whichever won, each key produced at most one transaction…
    for (const key of ['race:release', 'race:refund']) {
      const rows = await db
        .selectFrom('ledger_transactions')
        .where('market_id', '=', 'jm')
        .where('idempotency_key', '=', key)
        .selectAll()
        .execute();
      expect(rows.length, `${key} settled more than once`).toBeLessThanOrEqual(1);
    }

    // …and no refund exceeded the capture.
    const summary = await ledger.orderSummary('race-order');
    expect(summary.refunded).toBeLessThanOrEqual(summary.captured);

    // The whole book still balances after the race.
    const balance = await ledger.trialBalance();
    expect(balance.debits).toBe(balance.credits);
    console.info(
      `Ledger concurrency: ${STAMPEDE}-way stampede → 1 transaction; ` +
        `${PARALLEL_ORDERS} parallel orders exact; race settled once. ` +
        `Trial balance ${balance.debits} = ${balance.credits}`,
    );
  });
});
