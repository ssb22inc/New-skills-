import type { PaymentAdapter, PaymentWebhookEvent, TransferAck } from './types.js';

/**
 * Payment failover (BUILD §5.6 partner-down drill): try the primary,
 * reroute to the fallback when it is down. Webhooks verify against
 * whichever adapter recognizes the signature — each partner signs its
 * own deliveries. Zero lost orders is the drill's pass condition.
 *
 * FAILOVER APPLIES TO CHECKOUT ONLY, AND ONLY BEFORE MONEY MOVES.
 *
 * An external review on 2026-09-16 found this wrapper rerouting refunds
 * and payouts to the other provider on ANY exception. That is the
 * classic double-payment: a request times out AFTER the primary accepted
 * it, the exception looks identical to a refusal, and the fallback is
 * asked to move the same money again. Worse, it is asked to move money
 * it never took — a refund belongs to the provider holding the original
 * capture, and two providers are not one settlement account.
 *
 * So the rule is now asymmetric, on purpose:
 *
 *   createLink            — MAY reroute. Nothing has moved yet; the buyer
 *                           just needs a door that opens, and a duplicate
 *                           link is a duplicate offer, not a duplicate
 *                           payment.
 *   requestRefund/Payout  — MAY NOT. The failure is raised to the caller,
 *                           which owns the payout intent and the
 *                           reconciliation for an ambiguous outcome. A
 *                           retry goes back to the SAME provider under
 *                           the SAME idempotency key.
 *   verifyAndParseWebhook — unchanged: this identifies a delivery, it
 *                           does not move money.
 */
export class PaymentFailoverRefused extends Error {
  readonly provider: string;
  readonly operation: 'refund' | 'payout';
  constructor(operation: 'refund' | 'payout', provider: string, cause: unknown) {
    super(
      `${operation} through ${provider} failed and was NOT rerouted: the outcome may be ` +
        `unknown, and a second provider must never be asked to move the same money. ` +
        `Reconcile with ${provider} and retry there under the same idempotency key.`,
    );
    this.name = 'PaymentFailoverRefused';
    this.provider = provider;
    this.operation = operation;
    this.cause = cause;
  }
}

export function failoverPayments(
  primary: PaymentAdapter,
  fallback: PaymentAdapter,
): PaymentAdapter & { reroutes: number } {
  const state = { reroutes: 0 };
  return {
    id: `${primary.id}+${fallback.id}`,
    get reroutes() {
      return state.reroutes;
    },
    async createLink(input) {
      try {
        return await primary.createLink(input);
      } catch {
        state.reroutes++;
        return fallback.createLink(input);
      }
    },
    verifyAndParseWebhook(rawBody, headers): PaymentWebhookEvent[] {
      try {
        return primary.verifyAndParseWebhook(rawBody, headers);
      } catch {
        return fallback.verifyAndParseWebhook(rawBody, headers);
      }
    },
    async requestRefund(input): Promise<TransferAck> {
      try {
        return await primary.requestRefund(input);
      } catch (err) {
        throw new PaymentFailoverRefused('refund', primary.id, err);
      }
    },
    async requestPayout(input): Promise<TransferAck> {
      try {
        return await primary.requestPayout(input);
      } catch (err) {
        throw new PaymentFailoverRefused('payout', primary.id, err);
      }
    },
    /**
     * Status is asked of the provider that HOLDS the transfer, and the
     * primary is the only one that can hold one — nothing was ever
     * rerouted. Asking the fallback would invite the same confusion the
     * reroute caused.
     */
    getTransferStatus(input): Promise<TransferAck> {
      return primary.getTransferStatus(input);
    },
  };
}
