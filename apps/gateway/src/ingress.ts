import type { Queue } from 'bullmq';
import type { ChannelAdapter } from './types.js';
import { enqueueInbound } from './queue.js';

export type IngressResult =
  | { status: 200; received: number }
  | { status: 400; error: string }
  | { status: 401; error: string };

/**
 * Webhook ingress: verify signature against raw bytes, normalize, enqueue.
 * Returns 200 as soon as every message is durably queued — processing is
 * the worker's job, which is how 100 msg/s sustains with zero drops.
 */
export async function handleWebhook(
  adapter: ChannelAdapter,
  queue: Queue,
  rawBody: Buffer,
  headers: Record<string, string | undefined>,
): Promise<IngressResult> {
  if (!adapter.verifySignature(rawBody, headers)) {
    return { status: 401, error: 'invalid signature' };
  }
  let messages;
  try {
    messages = adapter.parseInbound(rawBody);
  } catch {
    return { status: 400, error: 'unparseable payload' };
  }
  for (const message of messages) {
    await enqueueInbound(queue, message);
  }
  return { status: 200, received: messages.length };
}
