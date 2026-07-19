import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { InboundMessage } from './types.js';

export const INBOUND_QUEUE = 'inbound-messages';

export function redisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://localhost:6379';
}

export function createRedis(url = redisUrl()): Redis {
  // BullMQ requires maxRetriesPerRequest: null on its connections.
  return new Redis(url, { maxRetriesPerRequest: null });
}

export function createInboundQueue(connection: Redis): Queue {
  return new Queue(INBOUND_QUEUE, { connection });
}

/**
 * Enqueue with the channel-native message id as jobId: BullMQ ignores an
 * add whose jobId already exists, so a replayed webhook never creates a
 * second job. Completed jobs are retained (bounded) so replays keep
 * deduplicating after processing finishes.
 */
export async function enqueueInbound(queue: Queue, message: InboundMessage): Promise<void> {
  await queue.add('inbound', message, {
    // BullMQ forbids ":" in custom job ids (its own key delimiter).
    jobId: `${message.channel}~${message.id}`,
    removeOnComplete: { count: 10_000 },
    removeOnFail: false,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  });
}

/**
 * Second idempotency layer at the consumer (webhooks WILL double-fire, and
 * queue retention is finite): SET NX marks the message processed exactly
 * once; a duplicate that somehow reaches a worker is skipped.
 */
export function createInboundWorker(
  connection: Redis,
  markerConnection: Redis,
  handler: (message: InboundMessage) => Promise<void>,
  options: { concurrency?: number } = {},
): Worker {
  return new Worker<InboundMessage>(
    INBOUND_QUEUE,
    async (job) => {
      const message = job.data;
      const marker = `processed:${message.channel}:${message.id}`;
      const first = await markerConnection.set(marker, '1', 'EX', 7 * 86_400, 'NX');
      if (first === null) return; // duplicate delivery — exactly-one effect
      await handler(message);
    },
    { connection, concurrency: options.concurrency ?? 10 },
  );
}
