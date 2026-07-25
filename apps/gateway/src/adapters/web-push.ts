import { verifyHmacSignature } from '../signature.js';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../types.js';

export const WEB_PUSH_SECRET = 'web-push-secret'; // env-injected in prod

/**
 * P36c — the installed-client lane. A seller who installed the PWA is
 * reachable through a door we own: the push lands in the installed
 * client, no carrier and no SMS deliverability involved. It speaks the
 * same ChannelAdapter port as every other door, so core cannot tell the
 * difference — and a seller who never installed loses nothing, they are
 * simply reached by the P35 SMS blast instead.
 *
 * Subscriptions are the client's own registration handles; sends are
 * held per subscriber until the client picks them up, exactly like the
 * PWA chat outbox. No push vendor is coupled in here (Constitution §7).
 */
export function webPushChannel(secret = WEB_PUSH_SECRET): ChannelAdapter & {
  subscribe(to: string): void;
  isSubscribed(to: string): boolean;
  outboxFor(to: string): OutboundMessage[];
  readonly delivered: OutboundMessage[];
} {
  const subscriptions = new Set<string>();
  const outbox = new Map<string, OutboundMessage[]>();
  const delivered: OutboundMessage[] = [];

  return {
    id: 'web_push',
    verifySignature(rawBody, headers) {
      return verifyHmacSignature(secret, rawBody, headers['x-web-push-signature']);
    },
    /** Push is outbound-only; replies come back through the PWA chat door. */
    parseInbound(): InboundMessage[] {
      return [];
    },
    send(message) {
      // An unsubscribed address is not reachable on this lane — the caller
      // falls back rather than pretending delivery happened.
      if (!subscriptions.has(message.to)) {
        return Promise.reject(new Error(`no installed client for ${message.to}`));
      }
      const queue = outbox.get(message.to) ?? [];
      queue.push(message);
      outbox.set(message.to, queue);
      delivered.push(message);
      return Promise.resolve();
    },
    subscribe(to) {
      subscriptions.add(to);
    },
    isSubscribed(to) {
      return subscriptions.has(to);
    },
    outboxFor(to) {
      return outbox.get(to) ?? [];
    },
    delivered,
  };
}
