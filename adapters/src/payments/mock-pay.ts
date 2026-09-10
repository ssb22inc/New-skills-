import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PaymentAdapter, PaymentLink, PaymentWebhookEvent } from './types.js';

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
  /** Craft a signed capture delivery for a link; call repeatedly to double-fire. */
  deliverCapture(linkId: string): WebhookDelivery;
  deliverRefund(orderRef: string, amountMinor: number, currency: string): WebhookDelivery;
  deliverPayout(sellerRef: string, amountMinor: number, currency: string): WebhookDelivery;
} {
  const links: PaymentLink[] = [];
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

    requestRefund() {
      return Promise.resolve(); // result arrives via deliverRefund webhook
    },
    requestPayout() {
      return Promise.resolve();
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
