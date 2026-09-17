/**
 * C05 CLOSURE TESTS — real payment lifecycle, external review 2026-09-16.
 *
 * The finding: "Settlement posts an internal payout without invoking a
 * payment provider; payout.completed events are discarded as replays.
 * […] An internal ledger can say money was paid while no external
 * transfer happened. A timeout after provider acceptance can trigger a
 * duplicate operation at another provider."
 *
 * The review's closure conditions:
 *
 *   "Provider sandbox contract tests prove capture, partial/full refund,
 *    payout success/failure, duplicate delivery and out-of-order
 *    delivery. An accepted request followed by a timeout produces one
 *    transfer only."
 *
 *   "Failed or unknown transfers remain visible as exceptions, never
 *    reported as paid."
 *
 * What is NOT here, and is not pretended: a CONTRACTED provider's real
 * sandbox. Lynk and Azul remain skeletons behind the P16 human gate
 * (partner agreement + custody sign-off), and no test can conjure
 * credentials nobody has signed for. These run the same contract against
 * the mock provider and against deliberately hostile ones — a provider
 * that times out after accepting, one that refuses, one that answers
 * twice — because those are the shapes that cost money.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  PaymentAmbiguous,
  PaymentRefused,
  mockPay,
  type PaymentAdapter,
  type TransferAck,
} from '@sycamore/adapters';
import {
  createDb,
  databaseUrl,
  handlePaymentEvent,
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
if (!reachable) console.warn('⚠ C05 payout-lifecycle gates SKIPPED: Postgres unreachable.');

const BALANCE = 900_000;

/** A provider that accepts the transfer and then loses the connection. */
function timesOutAfterAccepting(): PaymentAdapter & { accepted: string[] } {
  const accepted: string[] = [];
  const base = mockPay();
  return {
    ...base,
    id: 'flaky-psp',
    accepted,
    requestPayout(input) {
      // The money is moving. The caller will never hear about it.
      accepted.push(input.idempotencyKey);
      return Promise.reject(
        new PaymentAmbiguous('flaky-psp', 'gateway timeout after the transfer was accepted'),
      );
    },
    getTransferStatus(input): Promise<TransferAck> {
      // The truth, once somebody thinks to ask.
      return Promise.resolve({
        state: accepted.includes(input.idempotencyKey) ? 'succeeded' : 'failed',
        providerRef: `flaky-${input.idempotencyKey}`,
        provider: 'flaky-psp',
      });
    },
  };
}

/** A provider that says no, clearly, and holds nothing. */
function refuses(): PaymentAdapter {
  return {
    ...mockPay(),
    id: 'strict-psp',
    requestPayout() {
      return Promise.reject(
        new PaymentRefused('strict-psp', 'beneficiary account closed', 'ACCOUNT_CLOSED'),
      );
    },
  };
}

describe.runIf(reachable)('C05 — a ledger entry is not a payment', () => {
  const db = createDb(databaseUrl());
  const ledger = ledgerService(db, 'jm');
  const payouts = payoutService(db, 'jm');
  let sellerId = '';
  let nth = 0;

  /**
   * Money in flight, as a natural balance. `accountBalance` returns
   * debits − credits, so negating it gives the credit-side reading — and
   * negating a zero gives -0, which `toBe(0)` refuses. The `+ 0`
   * normalises that; it is not a rounding trick.
   */
  async function inFlight(): Promise<number> {
    return -(await ledger.accountBalance('payout_in_flight')) + 0;
  }

  async function fundSeller(amountMinor = BALANCE): Promise<void> {
    const ref = `c05-fund-${(nth += 1)}`;
    await ledger.capture({
      orderRef: ref,
      amountMinor,
      currency: 'JMD',
      idempotencyKey: `cap:${ref}`,
    });
    await ledger.release({
      orderRef: ref,
      currency: 'JMD',
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
      phone: '+18765559701',
      displayName: 'Lifecycle Owner',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: 'Lifecycle Tours' }))
      .id;
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: reserving moves money out of the balance and NOWHERE else', async () => {
    await fundSeller();
    const intent = await payouts.reserve({ sellerId, currency: 'JMD' });
    expect(intent?.amountMinor).toBe(BALANCE);
    expect(intent?.state).toBe('reserved');

    // The seller is owed nothing more; the money is in flight; and no
    // provider has been asked for anything yet. This is the state the
    // old code could not represent — it went straight to "paid".
    expect((await ledger.sellerBalances(sellerId, 'JMD')).payable).toBe(0);
    expect(await inFlight()).toBe(BALANCE);
    expect(intent?.provider).toBeNull();
    expect(intent?.providerRef).toBeNull();

    const trial = await ledger.trialBalance();
    expect(trial.debits).toBe(trial.credits);
  });

  it('GATE: submitting is not paying — only the provider event settles it', async () => {
    const pay = mockPay();
    const open = await db
      .selectFrom('payout_intents')
      .where('state', '=', 'reserved')
      .select('id')
      .executeTakeFirstOrThrow();

    const submitted = await payouts.submit(open.id, pay);
    expect(submitted.state).toBe('submitted');
    expect(submitted.providerRef).toBeTruthy();
    expect(pay.paidOut).toHaveLength(1);
    // Still not paid: `external` has not moved.
    expect(await inFlight()).toBe(BALANCE);

    // The provider says it landed. NOW it is paid.
    const settled = await payouts.settle({
      intentId: open.id,
      providerEventId: 'evt-payout-1',
      amountMinor: BALANCE,
    });
    expect(settled.settled).toBe(true);
    expect((await payouts.load(open.id)).state).toBe('succeeded');
    expect(await inFlight()).toBe(0);

    // A redelivered event changes nothing.
    const replay = await payouts.settle({ intentId: open.id, providerEventId: 'evt-payout-1' });
    expect(replay.settled).toBe(false);
    expect(await inFlight()).toBe(0);
  });

  it('GATE: an accepted request that then times out produces ONE transfer', async () => {
    await fundSeller();
    const flaky = timesOutAfterAccepting();
    const intent = await payouts.reserve({ sellerId, currency: 'JMD' });

    const after = await payouts.submit(intent!.id, flaky);
    // The single most expensive mistake in payments: this is NOT failed,
    // and it is NOT retried. The provider may be holding the money.
    expect(after.state).toBe('unknown');
    expect(flaky.accepted).toHaveLength(1);
    // The money stays in flight — not returned to the seller's balance,
    // which would let a second batch pay it again.
    expect(await inFlight()).toBe(BALANCE);
    expect((await ledger.sellerBalances(sellerId, 'JMD')).payable).toBe(0);

    // Submitting again is refused outright: an unknown intent is not
    // reserved, and only a reserved intent may be submitted.
    await expect(payouts.submit(intent!.id, flaky)).rejects.toThrowError(/only a reserved intent/);
    expect(flaky.accepted).toHaveLength(1);

    // Reconciliation asks the question that resolves it.
    const result = await payouts.reconcile(flaky, { olderThanMs: 0 });
    expect(result.settled).toBe(1);
    expect((await payouts.load(intent!.id)).state).toBe('succeeded');
    expect(flaky.accepted).toHaveLength(1); // still ONE transfer
    const trial = await ledger.trialBalance();
    expect(trial.debits).toBe(trial.credits);
  });

  it('GATE: a refusal returns the money to the seller, not into the void', async () => {
    await fundSeller();
    const intent = await payouts.reserve({ sellerId, currency: 'JMD' });
    const after = await payouts.submit(intent!.id, refuses());
    expect(after.state).toBe('failed');
    expect(after.lastError).toMatch(/ACCOUNT_CLOSED|refused/);

    // Back where it started, to the cent, and payable again next week.
    expect((await ledger.sellerBalances(sellerId, 'JMD')).payable).toBe(BALANCE);
    expect(await inFlight()).toBe(0);
    const trial = await ledger.trialBalance();
    expect(trial.debits).toBe(trial.credits);
  });

  it('GATE: an unresolved transfer is an exception, never a payment', async () => {
    const stuck = await payouts.reserve({ sellerId, currency: 'JMD' });
    const silent: PaymentAdapter = {
      ...mockPay(),
      id: 'silent-psp',
      requestPayout() {
        return Promise.reject(new PaymentAmbiguous('silent-psp', 'no answer'));
      },
      getTransferStatus() {
        // A provider that cannot say. The intent must stay open.
        return Promise.resolve({ state: 'unknown', providerRef: null, provider: 'silent-psp' });
      },
    };
    await payouts.submit(stuck!.id, silent);
    const result = await payouts.reconcile(silent, { olderThanMs: 0 });
    expect(result.stillOpen).toBe(1);
    expect(result.settled).toBe(0);
    expect(result.failed).toBe(0);

    // It shows up where a human looks, and it is not counted as paid.
    const open = await payouts.exceptions(0);
    expect(open.map((i) => i.id)).toContain(stuck!.id);
    expect((await payouts.load(stuck!.id)).state).toBe('unknown');
    expect(await inFlight()).toBe(BALANCE);
  });

  it('GATE: a payout webhook for an unknown transfer moves nothing', async () => {
    // Out-of-order or somebody else's event. Held for redelivery, never
    // applied — an unrecognised provider reference is not money.
    const outcome = await handlePaymentEvent(
      ledger,
      {
        id: 'evt-stranger',
        type: 'payout.completed',
        orderRef: 'a-reference-we-never-issued',
        amountMinor: 500_000,
        currency: 'JMD',
      },
      payouts,
    );
    expect(outcome).toMatchObject({ applied: false, retry: true });
  });

  it('GATE: a provider settling a different amount is refused, not absorbed', async () => {
    await payouts.fail((await payouts.exceptions(0))[0]!.id, 'test cleanup');
    await fundSeller(300_000);
    const intent = await payouts.reserve({ sellerId, currency: 'JMD' });
    const pay = mockPay();
    await payouts.submit(intent!.id, pay);
    await expect(
      payouts.settle({
        intentId: intent!.id,
        providerEventId: 'evt-mismatch',
        amountMinor: 299_999,
      }),
    ).rejects.toThrowError(/reconcile before touching the ledger/);
    expect((await payouts.load(intent!.id)).state).toBe('submitted');
  });
});
