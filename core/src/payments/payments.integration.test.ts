import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { mockPay } from '@sycamore/adapters';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { ledgerService } from '../ledger/ledger.js';
import { handlePaymentWebhook } from './handler.js';

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
if (!reachable) console.warn('⚠ P16 gate tests SKIPPED: Postgres unreachable.');

describe.runIf(reachable)('P16 — payment adapter + links (gate)', () => {
  const db = createDb(databaseUrl());
  const ledger = ledgerService(db, 'jm');
  const pay = mockPay();

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: a double-fired capture webhook produces exactly ONE ledger effect', async () => {
    const link = await pay.createLink({ orderRef: 'pay-1', amountMinor: 250_000, currency: 'JMD' });
    expect(link.url).toContain('https://');

    // The vendor fires the same delivery five times.
    for (let i = 0; i < 5; i++) {
      const { rawBody, headers } = pay.deliverCapture(link.id);
      await handlePaymentWebhook(pay, ledger, rawBody, headers);
    }

    const sums = await ledger.orderSummary('pay-1');
    expect(sums.captured).toBe(250_000); // once, not five times
    const { debits, credits } = await ledger.trialBalance();
    expect(debits).toBe(credits);
  });

  it('GATE: out-of-order webhooks (refund before capture) still yield exactly one effect each', async () => {
    const link = await pay.createLink({ orderRef: 'pay-2', amountMinor: 100_000, currency: 'JMD' });
    const refundDelivery = pay.deliverRefund('pay-2', 40_000, 'JMD');
    const captureDelivery = pay.deliverCapture(link.id);

    // 1. Refund arrives FIRST: not applied, marked retryable, nothing posted.
    const early = await handlePaymentWebhook(
      pay,
      ledger,
      refundDelivery.rawBody,
      refundDelivery.headers,
    );
    expect(early[0]).toMatchObject({ applied: false, retry: true });
    expect((await ledger.orderSummary('pay-2')).refunded).toBe(0);

    // 2. Capture lands.
    await handlePaymentWebhook(pay, ledger, captureDelivery.rawBody, captureDelivery.headers);

    // 3. The queue redelivers the refund: applied exactly once.
    const retried = await handlePaymentWebhook(
      pay,
      ledger,
      refundDelivery.rawBody,
      refundDelivery.headers,
    );
    expect(retried[0]).toEqual({ applied: true });

    // 4. Chaos: both deliveries replay again — zero additional effects.
    await handlePaymentWebhook(pay, ledger, captureDelivery.rawBody, captureDelivery.headers);
    const replayed = await handlePaymentWebhook(
      pay,
      ledger,
      refundDelivery.rawBody,
      refundDelivery.headers,
    );
    expect(replayed[0]).toMatchObject({ applied: false, replay: true });

    const sums = await ledger.orderSummary('pay-2');
    expect(sums.captured).toBe(100_000);
    expect(sums.refunded).toBe(40_000);
    const { debits, credits } = await ledger.trialBalance();
    expect(debits).toBe(credits);
  });

  it('a tampered webhook is rejected before any parsing', async () => {
    const link = await pay.createLink({ orderRef: 'pay-3', amountMinor: 50_000, currency: 'JMD' });
    const { rawBody, headers } = pay.deliverCapture(link.id);
    const tampered = Buffer.from(rawBody.toString().replace('50000', '99999'));
    await expect(() => handlePaymentWebhook(pay, ledger, tampered, headers)).rejects.toThrowError(
      /signature invalid/,
    );
    expect((await ledger.orderSummary('pay-3')).captured).toBe(0);
  });
});
