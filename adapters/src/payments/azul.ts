import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentAdapter, PaymentWebhookEvent, TransferAck } from './types.js';
import { assertUsableInProduction, providerPost } from './transport.js';

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
  assertUsableInProduction('azul', baseUrl, options.apiKey);
  async function post(path: string, body: unknown): Promise<unknown> {
    // Refusal, ambiguity and success are three different answers, and
    // the transport is the only place that can tell them apart (C05).
    return providerPost('azul', `${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey}`,
        // The provider's own duplicate protection. Same key, same
        // transfer — this is what makes a retry safe.
        'idempotency-key': String((body as { idempotency_key?: string }).idempotency_key ?? ''),
      },
      body: JSON.stringify(body),
    });
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
    async requestRefund(input): Promise<TransferAck> {
      const res = (await post('/v1/refunds', {
        reference: input.orderRef,
        amount: input.amountMinor,
        currency: input.currency,
        idempotency_key: input.idempotencyKey,
      })) as { id?: string };
      // Accepted, NOT arrived. Arrival is the webhook's word.
      return { state: 'submitted', providerRef: res.id ?? null, provider: 'azul' };
    },
    async requestPayout(input): Promise<TransferAck> {
      const res = (await post('/v1/payouts', {
        reference: input.sellerRef,
        amount: input.amountMinor,
        currency: input.currency,
        idempotency_key: input.idempotencyKey,
      })) as { id?: string };
      return { state: 'submitted', providerRef: res.id ?? null, provider: 'azul' };
    },

    /**
     * The reconciliation question: what did you do with this key? The
     * endpoint shape is confirmed at sandbox onboarding (P16 human
     * gate); until then an unreachable provider answers 'unknown',
     * which keeps the intent OPEN for a human instead of quietly
     * retrying a transfer that may already exist.
     */
    async getTransferStatus(input): Promise<TransferAck> {
      try {
        const res = (await providerPost('azul', `${baseUrl}/v1/transfers/lookup`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({ idempotency_key: input.idempotencyKey }),
        })) as { id?: string; state?: string };
        const state =
          res.state === 'succeeded' || res.state === 'failed' || res.state === 'submitted'
            ? res.state
            : 'unknown';
        return { state, providerRef: res.id ?? input.providerRef ?? null, provider: 'azul' };
      } catch {
        return { state: 'unknown', providerRef: input.providerRef ?? null, provider: 'azul' };
      }
    },
  };
}
