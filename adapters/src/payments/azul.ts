import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentAdapter, PaymentWebhookEvent } from './types.js';

export interface AzulOptions {
  apiKey: string;
  webhookSecret: string;
  baseUrl?: string;
}

/**
 * Azul / CardNet (DO) skeleton — the Dominican Republic's payment lane
 * for P31. Same port as every other payment adapter: core never learns
 * a new market exists. Real credentials enter at DO's own partner
 * onboarding; the P31 gate runs against the mock adapter.
 */
export function azulPayments(options: AzulOptions): PaymentAdapter {
  const baseUrl = options.baseUrl ?? 'https://api.azul.do.example'; // sandbox URL set at onboarding
  async function post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`azul ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
  }
  return {
    id: 'azul',
    async createLink(input) {
      const body = (await post('/v1/payment-links', {
        reference: input.orderRef,
        amount: input.amountMinor,
        currency: input.currency,
      })) as { id: string; url: string };
      return { id: body.id, url: body.url, ...input };
    },
    verifyAndParseWebhook(rawBody, headers) {
      const provided = headers['x-azul-signature'] ?? '';
      const expected = createHmac('sha256', options.webhookSecret).update(rawBody).digest('hex');
      if (
        provided.length !== expected.length ||
        !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
      ) {
        throw new Error('azul webhook signature invalid');
      }
      const parsed = JSON.parse(rawBody.toString()) as { events: PaymentWebhookEvent[] };
      return parsed.events;
    },
    async requestRefund(input) {
      await post('/v1/refunds', {
        reference: input.orderRef,
        amount: input.amountMinor,
        currency: input.currency,
      });
    },
    async requestPayout(input) {
      await post('/v1/payouts', {
        reference: input.sellerRef,
        amount: input.amountMinor,
        currency: input.currency,
      });
    },
  };
}
