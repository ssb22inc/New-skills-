import type { PaymentAdapter, PaymentWebhookEvent } from '@sycamore/adapters';
import type { LedgerService } from '../ledger/ledger.js';
import { LedgerError } from '../ledger/ledger.js';

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
      case 'payout.completed':
        // Payout ledgering lands with P17 (splits, release, payouts).
        return { applied: false, replay: true };
    }
  } catch (err) {
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
): Promise<PaymentEventOutcome[]> {
  const events = adapter.verifyAndParseWebhook(rawBody, headers);
  const outcomes: PaymentEventOutcome[] = [];
  for (const event of events) {
    outcomes.push(await handlePaymentEvent(ledger, event));
  }
  return outcomes;
}
