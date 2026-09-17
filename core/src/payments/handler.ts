import type { PaymentAdapter, PaymentWebhookEvent } from '@sycamore/adapters';
import type { LedgerService } from '../ledger/ledger.js';
import { LedgerError } from '../ledger/ledger.js';
import type { PayoutService } from '../settlement/payouts.js';
import { PayoutError } from '../settlement/payouts.js';

export type PaymentEventOutcome =
  | { applied: true }
  | { applied: false; replay: true } // idempotent duplicate — done, drop it
  | { applied: false; retry: true; reason: string }; // out-of-order — redeliver later

/**
 * P16 glue: verified vendor events become ledger effects, exactly once.
 * - Duplicate deliveries collapse on the vendor event id (ledger idempotency).
 * - Out-of-order deliveries (refund before its capture) are RETRYABLE, not
 *   dropped and not applied early — the queue redelivers until the capture
 *   has landed, and the event id still guarantees exactly one effect.
 */
export async function handlePaymentEvent(
  ledger: LedgerService,
  event: PaymentWebhookEvent,
  payouts?: PayoutService,
): Promise<PaymentEventOutcome> {
  try {
    switch (event.type) {
      case 'payment.captured': {
        const res = await ledger.capture({
          orderRef: event.orderRef,
          amountMinor: event.amountMinor,
          currency: event.currency,
          idempotencyKey: event.id,
        });
        return res.posted ? { applied: true } : { applied: false, replay: true };
      }
      case 'refund.completed': {
        const res = await ledger.refund({
          orderRef: event.orderRef,
          amountMinor: event.amountMinor,
          currency: event.currency,
          idempotencyKey: event.id,
        });
        return res.posted ? { applied: true } : { applied: false, replay: true };
      }
      case 'payout.completed': {
        /**
         * THIS USED TO BE DISCARDED (C05).
         *
         * The comment here read "payout ledgering lands with P17" —
         * P17 shipped, and this stayed a no-op, so the one message that
         * says money actually reached a seller was dropped as a replay
         * while settlement had already written the payout into the
         * ledger on its own authority.
         *
         * Now it is the ONLY thing that finalises a payout. The event's
         * `orderRef` carries the provider's transfer reference; an event
         * for a transfer we never made is not applied — it is held for
         * redelivery, because a provider reference we do not recognise
         * is either out of order or somebody else's, and neither is a
         * reason to move money.
         */
        if (!payouts) return { applied: false, retry: true, reason: 'no payout service wired' };
        const intent = await payouts.byProviderRef(event.orderRef);
        if (!intent) {
          return {
            applied: false,
            retry: true,
            reason: `no payout intent for provider reference ${event.orderRef}`,
          };
        }
        const res = await payouts.settle({
          intentId: intent.id,
          providerEventId: event.id,
          amountMinor: event.amountMinor,
        });
        return res.settled ? { applied: true } : { applied: false, replay: true };
      }
    }
  } catch (err) {
    if (err instanceof PayoutError) {
      // A mismatched amount or a state that cannot settle is an
      // exception for a human, not a poison message for the queue.
      return { applied: false, retry: true, reason: err.message };
    }
    if (err instanceof LedgerError) {
      // e.g. refund arrived before its capture — try again after redelivery.
      return { applied: false, retry: true, reason: err.message };
    }
    throw err;
  }
}

/** Verify raw bytes with the adapter, then apply each event. */
export async function handlePaymentWebhook(
  adapter: PaymentAdapter,
  ledger: LedgerService,
  rawBody: Buffer,
  headers: Record<string, string | undefined>,
  payouts?: PayoutService,
): Promise<PaymentEventOutcome[]> {
  const events = adapter.verifyAndParseWebhook(rawBody, headers);
  const outcomes: PaymentEventOutcome[] = [];
  for (const event of events) {
    outcomes.push(await handlePaymentEvent(ledger, event, payouts));
  }
  return outcomes;
}
