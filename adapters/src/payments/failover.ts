import type { PaymentAdapter, PaymentWebhookEvent } from './types.js';

/**
 * Payment failover (BUILD §5.6 partner-down drill): try the primary,
 * reroute to the fallback when it is down. Webhooks verify against
 * whichever adapter recognizes the signature — each partner signs its
 * own deliveries. Zero lost orders is the drill's pass condition.
 */
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
    async requestRefund(input) {
      try {
        await primary.requestRefund(input);
      } catch {
        state.reroutes++;
        await fallback.requestRefund(input);
      }
    },
    async requestPayout(input) {
      try {
        await primary.requestPayout(input);
      } catch {
        state.reroutes++;
        await fallback.requestPayout(input);
      }
    },
  };
}
