import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { sql } from 'kysely';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { computeSplit, ledgerService, LedgerError, type SplitBps } from './ledger.js';

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
if (!reachable) console.warn('⚠ P15 gate tests SKIPPED: Postgres unreachable.');

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe.runIf(reachable)('P15 — double-entry ledger (gate)', () => {
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

  it('the ledger is append-only AT THE DATABASE', async () => {
    await ledger.capture({
      orderRef: 'order-ao',
      amountMinor: 1000,
      currency: 'JMD',
      idempotencyKey: 'ao-1',
    });
    await expect(
      sql`update ledger_entries set amount_minor = 1 where market_id = 'jm'`.execute(db),
    ).rejects.toThrowError(/append-only/);
    await expect(
      sql`delete from ledger_transactions where market_id = 'jm'`.execute(db),
    ).rejects.toThrowError(/append-only/);
  });

  it('unbalanced or invalid transactions refuse before touching rows', async () => {
    await expect(
      ledger.refund({
        orderRef: 'never-captured',
        amountMinor: 1,
        currency: 'JMD',
        idempotencyKey: 'x1',
      }),
    ).rejects.toThrowError(LedgerError);
    await expect(
      ledger.capture({ orderRef: 'o', amountMinor: 10.5, currency: 'JMD', idempotencyKey: 'x2' }),
    ).rejects.toThrowError(/positive integer/);
  });

  it('splits sum to EXACTLY the amount for fuzzed values (remainder → seller)', () => {
    const rand = mulberry32(15);
    for (let i = 0; i < 2_000; i++) {
      const amount = 1 + Math.floor(rand() * 10_000_000);
      const platformBps = Math.floor(rand() * 2000);
      const referralBps = Math.floor(rand() * 500);
      const processorBps = Math.floor(rand() * 400);
      const split: SplitBps = {
        sellerBps: 10_000 - platformBps - referralBps - processorBps,
        platformBps,
        referralBps,
        processorBps,
      };
      const parts = computeSplit(amount, split);
      expect(parts.seller + parts.platform + parts.referral + parts.processor).toBe(amount);
      expect(parts.seller).toBeGreaterThan(0);
    }
    expect(() =>
      computeSplit(1000, { sellerBps: 9000, platformBps: 999, referralBps: 0, processorBps: 0 }),
    ).toThrowError(/10000 bps/);
  });

  it(
    'GATE: 10,000 fuzzed book/cancel/refund/dispute/retry ops reconcile to the cent',
    { timeout: 600_000 },
    async () => {
      const rand = mulberry32(20260707);
      const ORDERS = 150;
      const local = new Map<string, { captured: number; refunded: number; released: boolean }>();
      const usedKeys: { op: 'capture' | 'refund' | 'release'; key: string; args: never[] }[] = [];
      let keySeq = 0;
      let idempotentReplays = 0;
      let refusedGuards = 0;

      const split: SplitBps = {
        sellerBps: 8500,
        platformBps: 1000,
        referralBps: 300,
        processorBps: 200,
      };

      for (let i = 0; i < 10_000; i++) {
        const orderRef = `order-${Math.floor(rand() * ORDERS)}`;
        const state = local.get(orderRef) ?? { captured: 0, refunded: 0, released: false };
        const roll = rand();

        try {
          if (roll < 0.35) {
            // book: capture a payment
            const amount = 100 + Math.floor(rand() * 500_000);
            const key = `k-${keySeq++}`;
            await ledger.capture({
              orderRef,
              amountMinor: amount,
              currency: 'JMD',
              idempotencyKey: key,
            });
            if (!state.released) {
              state.captured += amount;
            } else {
              state.captured += amount; // post-release captures start a new cycle in escrow
            }
            usedKeys.push({ op: 'capture', key, args: [] as never[] });
          } else if (roll < 0.6) {
            // cancel / dispute: refund some of what's available
            const available =
              state.captured -
              state.refunded -
              (state.released ? state.captured - state.refunded : 0);
            const amount = 1 + Math.floor(rand() * Math.max(1, available));
            const key = `k-${keySeq++}`;
            await ledger.refund({
              orderRef,
              amountMinor: amount,
              currency: 'JMD',
              idempotencyKey: key,
            });
            state.refunded += amount;
          } else if (roll < 0.8) {
            // completion: release the escrow once
            const key = `k-${keySeq++}`;
            await ledger.release({ orderRef, currency: 'JMD', split, idempotencyKey: key });
            state.released = true;
          } else {
            // retry: replay a previously used idempotency key verbatim
            if (keySeq > 0) {
              const replayKey = `k-${Math.floor(rand() * keySeq)}`;
              const res = await ledger.capture({
                orderRef,
                amountMinor: 12345,
                currency: 'JMD',
                idempotencyKey: replayKey,
              });
              if (!res.posted) idempotentReplays++;
              else state.captured += 12345; // the key happened to be unused (skipped seq)
            }
          }
        } catch (err) {
          // Over-refunds and double-releases MUST refuse — that is correct.
          expect(err).toBeInstanceOf(LedgerError);
          refusedGuards++;
        }
        local.set(orderRef, state);
      }

      // THE INVARIANT: the whole market balances to the cent.
      const { debits, credits } = await ledger.trialBalance();
      expect(debits).toBe(credits);

      // Escrow can never be negative, per order or overall.
      const escrow = await ledger.accountBalance('buyer_escrow');
      expect(escrow).toBeLessThanOrEqual(0); // credit-normal account, debit-positive convention
      for (let o = 0; o < ORDERS; o++) {
        const sums = await ledger.orderSummary(`order-${o}`);
        expect(sums.refunded, `order-${o} refund > capture`).toBeLessThanOrEqual(sums.captured);
        expect(sums.released, `order-${o}`).toBeLessThanOrEqual(sums.captured - sums.refunded);
      }

      // The fuzz genuinely exercised the guards and the idempotency path.
      expect(idempotentReplays).toBeGreaterThan(50);
      expect(refusedGuards).toBeGreaterThan(50);
      console.log(
        `ledger fuzz: ${keySeq} ops, ${idempotentReplays} idempotent replays, ` +
          `${refusedGuards} guard refusals — debits ${debits} = credits ${credits}`,
      );
    },
  );

  it('release splits exactly and refuses to settle twice', async () => {
    await ledger.capture({
      orderRef: 'settle-1',
      amountMinor: 100_003, // awkward number to prove integer split
      currency: 'JMD',
      idempotencyKey: 's1-cap',
    });
    const result = await ledger.release({
      orderRef: 'settle-1',
      currency: 'JMD',
      split: { sellerBps: 8500, platformBps: 1000, referralBps: 300, processorBps: 200 },
      idempotencyKey: 's1-rel',
    });
    const a = result.amounts!;
    expect(a.seller + a.platform + a.referral + a.processor).toBe(100_003);
    await expect(
      ledger.release({
        orderRef: 'settle-1',
        currency: 'JMD',
        split: { sellerBps: 10_000, platformBps: 0, referralBps: 0, processorBps: 0 },
        idempotencyKey: 's1-rel-2',
      }),
    ).rejects.toThrowError(/already settled/);
  });
});
