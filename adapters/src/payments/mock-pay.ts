import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  PaymentAdapter,
  PaymentLink,
  PaymentWebhookEvent,
  PayoutRequest,
  RefundRequest,
} from './types.js';

export const MOCK_PAY_SECRET = 'mock-pay-secret';

export interface WebhookDelivery {
  rawBody: Buffer;
  headers: Record<string, string>;
}

/**
 * Full-lifecycle payment simulator: links, captures, refunds, payouts —
 * and the vendor pathologies that matter: DOUBLE-FIRED deliveries and
 * OUT-OF-ORDER arrival. Used by every test until the sandbox human gate.
 */
export function mockPay(): PaymentAdapter & {
  links: PaymentLink[];
  /** Every refund/payout actually asked of this provider. A test that
   *  must prove a provider was NOT asked has something to assert on. */
  refunded: RefundRequest[];
  paidOut: PayoutRequest[];
  /** Craft a signed capture delivery for a link; call repeatedly to double-fire. */
  deliverCapture(linkId: string): WebhookDelivery;
  deliverRefund(orderRef: string, amountMinor: number, currency: string): WebhookDelivery;
  deliverPayout(sellerRef: string, amountMinor: number, currency: string): WebhookDelivery;
} {
  const links: PaymentLink[] = [];
  const refunded: RefundRequest[] = [];
  const paidOut: PayoutRequest[] = [];
  const captureEventIds = new Map<string, string>(); // linkId → stable event id
  const refundEventIds = new Map<string, string>();

  function sign(body: Buffer): Record<string, string> {
    return {
      'x-mockpay-signature': `sha256=${createHmac('sha256', MOCK_PAY_SECRET).update(body).digest('hex')}`,
    };
  }

  function delivery(event: PaymentWebhookEvent): WebhookDelivery {
    const rawBody = Buffer.from(JSON.stringify({ events: [event] }));
    return { rawBody, headers: sign(rawBody) };
  }

  return {
    id: 'mock-pay',
    links,
    refunded,
    paidOut,

    createLink(input) {
      const link: PaymentLink = {
        id: randomUUID(),
        url: `https://pay.mock/${randomUUID()}`,
        ...input,
      };
      links.push(link);
      return Promise.resolve(link);
    },

    verifyAndParseWebhook(rawBody, headers) {
      const provided = headers['x-mockpay-signature'];
      const expected = sign(rawBody)['x-mockpay-signature']!;
      if (
        !provided ||
        provided.length !== expected.length ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
      ) {
        throw new Error('mock-pay webhook signature invalid');
      }
      const parsed = JSON.parse(rawBody.toString()) as { events: PaymentWebhookEvent[] };
      return parsed.events;
    },

    requestRefund(input) {
      // Accepted, not arrived: the money moves when the webhook says so
      // (C05). The same key twice is the same transfer, exactly as a
      // real provider behaves.
      const seen = refunded.find((r) => r.idempotencyKey === input.idempotencyKey);
      if (!seen) refunded.push(input);
      return Promise.resolve({
        state: 'submitted' as const,
        providerRef: `mockpay-ref-${input.idempotencyKey}`,
        provider: 'mock-pay',
      });
    },
    requestPayout(input) {
      const seen = paidOut.find((p) => p.idempotencyKey === input.idempotencyKey);
      if (!seen) paidOut.push(input);
      return Promise.resolve({
        state: 'submitted' as const,
        providerRef: `mockpay-payout-${input.idempotencyKey}`,
        provider: 'mock-pay',
      });
    },
    getTransferStatus(input) {
      // A provider that has seen the key reports the transfer it made;
      // one that has not says so, and the caller may submit.
      const known =
        paidOut.some((p) => p.idempotencyKey === input.idempotencyKey) ||
        refunded.some((r) => r.idempotencyKey === input.idempotencyKey);
      return Promise.resolve({
        state: known ? ('submitted' as const) : ('failed' as const),
        providerRef: known ? `mockpay-payout-${input.idempotencyKey}` : null,
        provider: 'mock-pay',
      });
    },

    deliverCapture(linkId) {
      const link = links.find((l) => l.id === linkId);
      if (!link) throw new Error(`no such link ${linkId}`);
      // The SAME event id on every redelivery — that is what vendors do.
      const id = captureEventIds.get(linkId) ?? `evt-cap-${linkId}`;
      captureEventIds.set(linkId, id);
      return delivery({
        id,
        type: 'payment.captured',
        orderRef: link.orderRef,
        amountMinor: link.amountMinor,
        currency: link.currency,
      });
    },

    deliverRefund(orderRef, amountMinor, currency) {
      const key = `${orderRef}:${amountMinor}`;
      const id = refundEventIds.get(key) ?? `evt-ref-${key}`;
      refundEventIds.set(key, id);
      return delivery({ id, type: 'refund.completed', orderRef, amountMinor, currency });
    },

    deliverPayout(sellerRef, amountMinor, currency) {
      return delivery({
        id: `evt-pay-${sellerRef}-${amountMinor}`,
        type: 'payout.completed',
        orderRef: sellerRef,
        amountMinor,
        currency,
      });
    },
  };
}
