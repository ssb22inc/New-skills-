import { sql, type Kysely } from 'kysely';
import {
  PaymentAmbiguous,
  PaymentRefused,
  type PaymentAdapter,
  type TransferAck,
} from '@sycamore/adapters';
import type { Database } from '../db/types.js';
import { emitEvent } from '../db/outbox.js';
import { ledgerService } from '../ledger/ledger.js';

/**
 * PAYING A SELLER IS A CONVERSATION WITH A PROVIDER (C05).
 *
 * The external review of 2026-09-16: "Settlement posts an internal
 * payout without invoking a payment provider; payout.completed events
 * are discarded as replays." The ledger said the seller had been paid.
 * Their bank account disagreed. Nothing in the system could tell.
 *
 * The lifecycle, and what each step is allowed to assume:
 *
 *   RESERVE   Under the per-seller lock, move what is owed out of
 *             `seller_payable` and into `payout_in_flight`. The money is
 *             now spoken for and cannot be paid twice — and it has not
 *             gone anywhere. A unique partial index allows ONE open
 *             intent per seller and currency, so this is refused by the
 *             database and not only by the lock.
 *
 *   SUBMIT    Ask the provider, carrying the intent's own stable
 *             idempotency key. Three answers, three different worlds:
 *               refused   → the provider holds nothing. Return the
 *                           reservation to the seller's balance.
 *               ambiguous → the provider MAY hold it. Touch nothing,
 *                           mark `unknown`, and let reconciliation ask.
 *                           This is the case that makes double payments.
 *               accepted  → `submitted`. NOT paid: accepted.
 *
 *   SETTLE    Only a verified provider event moves `payout_in_flight` to
 *             `external`. That is the only step that means "the money
 *             left", and it is the only one a webhook can trigger.
 *
 *   RECONCILE Ask the provider what it did with each open key. An
 *             adapter that cannot answer says `unknown`, which keeps the
 *             intent open for a human rather than retrying blind.
 *
 * Money is never in two places and never in none: it is in the seller's
 * balance, in flight, or gone — and every move between them is a
 * balanced double-entry transaction.
 */
export class PayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayoutError';
  }
}

export type PayoutState = 'pending' | 'reserved' | 'submitted' | 'succeeded' | 'failed' | 'unknown';

export interface PayoutIntent {
  id: string;
  marketId: string;
  sellerId: string;
  currency: string;
  amountMinor: number;
  state: PayoutState;
  provider: string | null;
  providerRef: string | null;
  idempotencyKey: string;
  attempts: number;
  lastError: string | null;
}

/** How long an open intent may sit before reconciliation asks about it. */
export const RECONCILE_AFTER_MS = 10 * 60_000;

function toIntent(row: {
  id: string;
  market_id: string;
  seller_id: string;
  currency: string;
  amount_minor: string | number | bigint;
  state: string;
  provider: string | null;
  provider_ref: string | null;
  idempotency_key: string;
  attempts: number;
  last_error: string | null;
}): PayoutIntent {
  return {
    id: row.id,
    marketId: row.market_id,
    sellerId: row.seller_id,
    currency: row.currency,
    amountMinor: Number(row.amount_minor),
    state: row.state as PayoutState,
    provider: row.provider,
    providerRef: row.provider_ref,
    idempotencyKey: row.idempotency_key,
    attempts: row.attempts,
    lastError: row.last_error,
  };
}

export function payoutService(db: Kysely<Database>, marketId: string) {
  const ledger = ledgerService(db, marketId);

  async function load(intentId: string): Promise<PayoutIntent> {
    const row = await db
      .selectFrom('payout_intents')
      .where('market_id', '=', marketId)
      .where('id', '=', intentId)
      .selectAll()
      .executeTakeFirst();
    if (!row) throw new PayoutError(`no payout intent ${intentId} in ${marketId}`);
    return toIntent(row);
  }

  async function setState(
    intentId: string,
    state: PayoutState,
    patch: {
      provider?: string | null;
      providerRef?: string | null;
      lastError?: string | null;
      submittedAt?: boolean;
      settledAt?: boolean;
    } = {},
  ): Promise<void> {
    await db
      .updateTable('payout_intents')
      .set({
        state,
        updated_at: sql`now()`,
        ...(patch.provider !== undefined && { provider: patch.provider }),
        ...(patch.providerRef !== undefined && { provider_ref: patch.providerRef }),
        ...(patch.lastError !== undefined && { last_error: patch.lastError }),
        ...(patch.submittedAt && { submitted_at: sql`now()` }),
        ...(patch.settledAt && { settled_at: sql`now()` }),
      })
      .where('id', '=', intentId)
      .execute();
  }

  return {
    /**
     * Move what a seller is owed into `payout_in_flight` and record the
     * intent. Returns undefined when there is nothing to pay — which is
     * not an error, it is most sellers on most days.
     */
    async reserve(input: {
      sellerId: string;
      currency: string;
      batchKey?: string;
    }): Promise<(PayoutIntent & { created: boolean }) | undefined> {
      const open = await db
        .selectFrom('payout_intents')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', input.sellerId)
        .where('currency', '=', input.currency)
        .where('state', 'in', ['pending', 'reserved', 'submitted', 'unknown'])
        .selectAll()
        .executeTakeFirst();
      // An open intent is money already in flight. A second batch must
      // not start another one — it must wait for this one to settle.
      // `created: false` is how the caller tells "I reserved this" from
      // "somebody else already did", which is the difference between a
      // payout and a duplicate.
      if (open) return { ...toIntent(open), created: false };

      const balances = await ledger.sellerBalances(input.sellerId, input.currency);
      const owed = balances.payable + balances.referral;
      if (owed <= 0) return undefined;

      const intent = await db
        .insertInto('payout_intents')
        .values({
          market_id: marketId,
          seller_id: input.sellerId,
          currency: input.currency,
          amount_minor: owed,
          // Derived from the intent's OWN identity, not the batch: a
          // retry next week carries this same key, so a provider that
          // already accepted it does not pay a second time.
          idempotency_key: `payout-intent:${marketId}:${input.sellerId}:${input.currency}:${Date.now()}`,
          state: 'pending',
          ...(input.batchKey !== undefined && { batch_key: input.batchKey }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // The reservation itself: out of the seller's balance, into flight.
      const posted = await ledger.reservePayout({
        sellerId: input.sellerId,
        currency: input.currency,
        amountMinor: owed,
        reference: `payout:${intent.id}`,
        idempotencyKey: `payout-reserve:${intent.id}`,
      });
      if (!posted.posted) {
        throw new PayoutError(`payout ${intent.id} could not reserve ${owed} ${input.currency}`);
      }
      await setState(intent.id, 'reserved');
      return { ...toIntent(intent), state: 'reserved', created: true };
    },

    /**
     * Ask the provider to move it. Accepted is not arrived; the only
     * thing this can conclude on its own is a REFUSAL, which returns the
     * money to the seller's balance.
     */
    async submit(intentId: string, adapter: PaymentAdapter): Promise<PayoutIntent> {
      const intent = await load(intentId);
      if (intent.state !== 'reserved') {
        // Submitting a submitted intent is how a double payment starts.
        throw new PayoutError(
          `payout ${intentId} is ${intent.state}; only a reserved intent may be submitted`,
        );
      }
      await db
        .updateTable('payout_intents')
        .set({ attempts: sql`attempts + 1`, updated_at: sql`now()` })
        .where('id', '=', intentId)
        .execute();

      let ack: TransferAck;
      try {
        ack = await adapter.requestPayout({
          sellerRef: intent.sellerId,
          amountMinor: intent.amountMinor,
          currency: intent.currency,
          idempotencyKey: intent.idempotencyKey,
        });
      } catch (err) {
        if (err instanceof PaymentRefused) {
          await this.fail(intentId, `${adapter.id} refused: ${err.message}`);
          return load(intentId);
        }
        // AMBIGUOUS. The provider may be holding this money right now.
        // Nothing is reversed, nothing is retried, nothing is rerouted —
        // the intent waits for reconciliation to ask the provider what
        // it actually did. This branch is the whole finding.
        const message = err instanceof PaymentAmbiguous ? err.message : String(err);
        await setState(intentId, 'unknown', {
          provider: adapter.id,
          lastError: message,
          submittedAt: true,
        });
        await emitEvent(db, {
          marketId,
          topic: 'payout.outcome_unknown',
          payload: { intentId, sellerId: intent.sellerId, provider: adapter.id, error: message },
        });
        return load(intentId);
      }

      await setState(intentId, ack.state === 'succeeded' ? 'submitted' : 'submitted', {
        provider: ack.provider,
        providerRef: ack.providerRef,
        lastError: null,
        submittedAt: true,
      });
      return load(intentId);
    },

    /**
     * The money left. Only a verified provider event gets here, and it
     * is the only step that touches `external` (C05: "Only verified
     * external success may finalize paid/refunded status").
     */
    async settle(input: {
      intentId: string;
      providerEventId: string;
      amountMinor?: number;
    }): Promise<{ settled: boolean }> {
      const intent = await load(input.intentId);
      if (intent.state === 'succeeded') return { settled: false }; // replay
      if (!['submitted', 'unknown', 'reserved'].includes(intent.state)) {
        throw new PayoutError(`payout ${input.intentId} is ${intent.state}; it cannot settle`);
      }
      if (input.amountMinor !== undefined && input.amountMinor !== intent.amountMinor) {
        // A provider reporting a different amount is a reconciliation
        // exception, not a rounding difference to absorb quietly.
        throw new PayoutError(
          `payout ${input.intentId}: provider settled ${input.amountMinor} against ` +
            `${intent.amountMinor} reserved — reconcile before touching the ledger`,
        );
      }
      const posted = await ledger.settlePayout({
        sellerId: intent.sellerId,
        currency: intent.currency,
        amountMinor: intent.amountMinor,
        reference: `payout:${intent.id}`,
        idempotencyKey: input.providerEventId,
      });
      await setState(input.intentId, 'succeeded', { settledAt: true, lastError: null });
      await emitEvent(db, {
        marketId,
        topic: 'payout.settled',
        payload: {
          intentId: intent.id,
          sellerId: intent.sellerId,
          amountMinor: intent.amountMinor,
          currency: intent.currency,
        },
      });
      return { settled: posted.posted };
    },

    /** The provider said no. Give the money back to the seller's balance. */
    async fail(intentId: string, reason: string): Promise<void> {
      const intent = await load(intentId);
      if (intent.state === 'failed') return;
      if (intent.state === 'succeeded') {
        throw new PayoutError(`payout ${intentId} already succeeded; it cannot fail`);
      }
      await ledger.returnPayoutReservation({
        sellerId: intent.sellerId,
        currency: intent.currency,
        amountMinor: intent.amountMinor,
        reference: `payout:${intent.id}`,
        idempotencyKey: `payout-return:${intent.id}`,
      });
      await setState(intentId, 'failed', { lastError: reason });
      await emitEvent(db, {
        marketId,
        topic: 'payout.failed',
        payload: { intentId, sellerId: intent.sellerId, reason },
      });
    },

    /**
     * Ask the provider about everything still open. This is what makes
     * an ambiguous outcome safe: the question "what did you do with this
     * key" has one true answer, and asking costs nothing.
     */
    async reconcile(
      adapter: PaymentAdapter,
      options: { olderThanMs?: number } = {},
    ): Promise<{ checked: number; settled: number; failed: number; stillOpen: number }> {
      const cutoff = new Date(Date.now() - (options.olderThanMs ?? RECONCILE_AFTER_MS));
      const open = await db
        .selectFrom('payout_intents')
        .where('market_id', '=', marketId)
        .where('state', 'in', ['submitted', 'unknown'])
        .where((eb) => eb.or([eb('submitted_at', '<', cutoff), eb('submitted_at', 'is', null)]))
        .selectAll()
        .execute();
      let settled = 0;
      let failed = 0;
      let stillOpen = 0;
      for (const row of open) {
        const intent = toIntent(row);
        const ack = await adapter.getTransferStatus({
          idempotencyKey: intent.idempotencyKey,
          providerRef: intent.providerRef,
        });
        if (ack.state === 'succeeded') {
          await this.settle({
            intentId: intent.id,
            providerEventId: `reconciled:${intent.id}`,
          });
          settled++;
        } else if (ack.state === 'failed') {
          await this.fail(intent.id, `reconciliation: ${adapter.id} has no such transfer`);
          failed++;
        } else {
          // Still in flight, or the provider cannot say. Either way the
          // money stays reserved and the intent stays open — visible,
          // not guessed at.
          stillOpen++;
        }
      }
      return { checked: open.length, settled, failed, stillOpen };
    },

    /** Everything a human needs to look at. The exception queue (C05). */
    async exceptions(olderThanMs = RECONCILE_AFTER_MS): Promise<PayoutIntent[]> {
      const rows = await db
        .selectFrom('payout_intents')
        .where('market_id', '=', marketId)
        .where('state', 'in', ['submitted', 'unknown'])
        .where('submitted_at', '<', new Date(Date.now() - olderThanMs))
        .orderBy('submitted_at', 'asc')
        .selectAll()
        .execute();
      return rows.map(toIntent);
    },

    load,

    /** Find the intent a provider event is talking about. */
    async byProviderRef(providerRef: string): Promise<PayoutIntent | undefined> {
      const row = await db
        .selectFrom('payout_intents')
        .where('market_id', '=', marketId)
        .where('provider_ref', '=', providerRef)
        .selectAll()
        .executeTakeFirst();
      return row ? toIntent(row) : undefined;
    },
  };
}

export type PayoutService = ReturnType<typeof payoutService>;
