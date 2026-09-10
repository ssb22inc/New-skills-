/**
 * The payments port (P16). Licensed partners custody the money
 * (Constitution: hold the trust, never the float); Sycamore owns the
 * split logic and the ledger. Adapters translate one vendor's shapes.
 */

export interface PaymentLink {
  id: string;
  url: string;
  orderRef: string;
  amountMinor: number;
  currency: string;
}

export type PaymentEventType = 'payment.captured' | 'refund.completed' | 'payout.completed';

export interface PaymentWebhookEvent {
  /** Vendor event id — becomes the ledger idempotency key. */
  id: string;
  type: PaymentEventType;
  orderRef: string;
  amountMinor: number;
  currency: string;
}

export interface PaymentAdapter {
  readonly id: string;
  createLink(input: {
    orderRef: string;
    amountMinor: number;
    currency: string;
  }): Promise<PaymentLink>;
  /** MUST verify the signature against raw bytes before parsing. */
  verifyAndParseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): PaymentWebhookEvent[];
  requestRefund(input: { orderRef: string; amountMinor: number; currency: string }): Promise<void>;
  requestPayout(input: { sellerRef: string; amountMinor: number; currency: string }): Promise<void>;
}
