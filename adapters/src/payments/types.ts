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

/**
 * WHAT HAPPENED, AND WHAT WE KNOW (C05 — external review, 2026-09-16).
 *
 * A refusal and a timeout are not the same event, and a `Promise` that
 * rejects with a plain Error cannot tell them apart. Getting this
 * distinction wrong is how one payout becomes two:
 *
 *   PaymentRefused    The provider said NO and holds nothing. Safe to
 *                     release the reservation and tell somebody.
 *   PaymentAmbiguous  The request may or may not have been accepted — a
 *                     timeout, a dropped connection, a 5xx. NOTHING may
 *                     be retried or rerouted until the provider is asked
 *                     what it did with this idempotency key.
 */
export class PaymentRefused extends Error {
  readonly provider: string;
  readonly providerCode: string | undefined;
  constructor(provider: string, message: string, providerCode?: string) {
    super(message);
    this.name = 'PaymentRefused';
    this.provider = provider;
    this.providerCode = providerCode;
  }
}

export class PaymentAmbiguous extends Error {
  readonly provider: string;
  constructor(provider: string, message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = 'PaymentAmbiguous';
    this.provider = provider;
  }
}

/** Where a transfer has got to, as the PROVIDER sees it. */
export type TransferState = 'submitted' | 'succeeded' | 'failed' | 'unknown';

export interface TransferAck {
  state: TransferState;
  /** The provider's own id. Null when they have not issued one yet. */
  providerRef: string | null;
  provider: string;
}

export interface PayoutRequest {
  sellerRef: string;
  amountMinor: number;
  currency: string;
  /**
   * Stable for the life of the intended payout. A retry carries the
   * SAME key, so a provider that already accepted it answers with the
   * original transfer instead of making a second one.
   */
  idempotencyKey: string;
}

export interface RefundRequest {
  orderRef: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
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
  /**
   * Ask for the money to move. Throws PaymentRefused when the provider
   * says no and PaymentAmbiguous when the outcome is unknown; an
   * ordinary return means ACCEPTED, not arrived — arrival is a webhook
   * or a status query, never an optimistic assumption.
   */
  requestRefund(input: RefundRequest): Promise<TransferAck>;
  requestPayout(input: PayoutRequest): Promise<TransferAck>;
  /**
   * What did you do with this key? The question that resolves an
   * ambiguous outcome without risking a second transfer. Adapters that
   * cannot answer it yet say so by returning 'unknown', which keeps the
   * intent open for a human rather than quietly retrying.
   */
  getTransferStatus(input: {
    idempotencyKey: string;
    providerRef?: string | null;
  }): Promise<TransferAck>;
}
