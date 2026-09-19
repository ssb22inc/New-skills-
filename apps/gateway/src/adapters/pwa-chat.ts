import { verifyHmacSignature } from '../signature.js';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../types.js';

export const PWA_CHANNEL_SECRET = 'pwa-channel-secret'; // env-injected in prod

interface PwaInbound {
  messages: {
    id: string;
    from: string;
    kind?: 'text' | 'tap';
    text?: string;
    tapPayload?: string;
  }[];
}

/**
 * P35b — the sovereign door. The PWA chat surface speaks to the SAME
 * conversation engine through the same ChannelAdapter port as WhatsApp:
 * same patois, same thumbs-up approvals, same STOP. It is always alive
 * at {seller}.sycamore.app, so the habit pre-exists any crisis. Outbound
 * messages are held per recipient for the PWA to fetch — no push
 * infrastructure required for the door to stay open.
 */
export function pwaChannel(secret = PWA_CHANNEL_SECRET): ChannelAdapter & {
  outboxFor(to: string): OutboundMessage[];
} {
  const outbox = new Map<string, OutboundMessage[]>();
  return {
    id: 'pwa',
    verifySignature(rawBody, headers) {
      return verifyHmacSignature(secret, rawBody, headers['x-pwa-signature']);
    },
    parseInbound(rawBody) {
      const payload = JSON.parse(rawBody.toString()) as PwaInbound;
      const out: InboundMessage[] = [];
      for (const m of payload.messages ?? []) {
        if (!m.id || !m.from) continue;
        const base = {
          id: m.id,
          channel: 'pwa',
          from: m.from,
          receivedAt: new Date().toISOString(),
        };
        if (m.kind === 'tap' && m.tapPayload !== undefined) {
          out.push({ ...base, kind: 'tap', tapPayload: m.tapPayload });
        } else {
          out.push({ ...base, kind: 'text', text: m.text ?? '' });
        }
      }
      return out;
    },
    send(message) {
      const queue = outbox.get(message.to) ?? [];
      queue.push(message);
      outbox.set(message.to, queue);
      return Promise.resolve();
    },
    outboxFor(to: string) {
      return outbox.get(to) ?? [];
    },
  };
}
