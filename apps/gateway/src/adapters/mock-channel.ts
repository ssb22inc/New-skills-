import { hmacSha256Hex, verifyHmacSignature } from '../signature.js';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../types.js';

export const MOCK_CHANNEL_SECRET = 'mock-channel-secret';

/**
 * In-memory channel used by every test: crafts signed webhooks like a real
 * vendor would, and captures outbound sends for assertions.
 */
export interface MockChannel extends ChannelAdapter {
  sent: OutboundMessage[];
  /** Builds a signed webhook delivery for the given messages. */
  makeWebhook(messages: InboundMessage[]): {
    rawBody: Buffer;
    headers: Record<string, string>;
  };
}

export function mockChannel(): MockChannel {
  const sent: OutboundMessage[] = [];
  return {
    id: 'mock',
    sent,
    makeWebhook(messages) {
      const rawBody = Buffer.from(JSON.stringify({ messages }));
      return {
        rawBody,
        headers: { 'x-mock-signature': `sha256=${hmacSha256Hex(MOCK_CHANNEL_SECRET, rawBody)}` },
      };
    },
    verifySignature(rawBody, headers) {
      return verifyHmacSignature(MOCK_CHANNEL_SECRET, rawBody, headers['x-mock-signature']);
    },
    parseInbound(rawBody) {
      const parsed = JSON.parse(rawBody.toString()) as { messages: InboundMessage[] };
      return parsed.messages.map((m) => ({ ...m, channel: 'mock' }));
    },
    send(message) {
      sent.push(message);
      return Promise.resolve();
    },
  };
}
