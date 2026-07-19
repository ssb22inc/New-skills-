import type { ChannelAdapter, OutboundMessage } from '../types.js';

/**
 * SMS fallback stub: the shape is real, the wire is not (a vendor adapter
 * lands when a market's pack requires it). Captures sends so failover
 * behavior is testable today.
 */
export function smsFallbackChannel(): ChannelAdapter & { sent: OutboundMessage[] } {
  const sent: OutboundMessage[] = [];
  return {
    id: 'sms',
    sent,
    verifySignature: () => false, // no inbound SMS yet
    parseInbound: () => [],
    send(message) {
      sent.push(message);
      return Promise.resolve();
    },
  };
}

/** Try the primary channel; on failure, deliver through the fallback. */
export async function sendWithFallback(
  primary: ChannelAdapter,
  fallback: ChannelAdapter,
  message: OutboundMessage,
): Promise<{ deliveredVia: string }> {
  try {
    await primary.send(message);
    return { deliveredVia: primary.id };
  } catch {
    await fallback.send(message);
    return { deliveredVia: fallback.id };
  }
}
