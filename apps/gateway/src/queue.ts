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
 * Second idempotency layer at the consumer (webhooks WILL double-fire,
 * and queue retention is finite).
 *
 * CLAIM, DO, CONFIRM — it used to be MARK, then DO. The marker was
 * written with SET NX and a seven-day TTL and the handler was called
 * afterwards, so a worker that died in between left behind a marker
 * saying the message had been processed. The retry was then classified
 * as a duplicate and returned without doing anything, and the booking a
 * seller was waiting on simply never happened. The external review of
 * 2026-09-16 found it, and the tests could not: suppressing that retry
 * is exactly what the code was written to do.
 *
 * Three states now, not one:
 *
 *   absent      nobody has this message. Claim it with a short LEASE.
 *   'claimed'   somebody is working on it. Skip — and when the lease
 *               expires the claim vanishes with it, so a dead worker's
 *               message becomes claimable again instead of being lost.
 *   'done'      the handler returned. NOW it is a duplicate, and now the
 *               seven-day memory is the right memory to keep.
 *
 * A failure deletes the claim immediately, so BullMQ's own retry (three
 * attempts, exponential backoff) can actually retry rather than walk
 * into a marker.
 *
 * This is the cache-side layer and it is deliberately not the only one.
 * Redis can lose a key; a lease can expire under a slow handler. The
 * durable answer is `claimInbound` in core, whose row lives in the same
 * database as the effect it guards — this keeps duplicate work off the
 * worker, that one keeps duplicate EFFECTS out of the ledger.
 */
export const CLAIM_LEASE_SECONDS = 300;
export const DONE_MEMORY_SECONDS = 7 * 86_400;

export function createInboundWorker(
  connection: Redis,
  markerConnection: Redis,
  handler: (message: InboundMessage) => Promise<void>,
  options: { concurrency?: number; leaseSeconds?: number } = {},
): Worker {
  return new Worker<InboundMessage>(
    INBOUND_QUEUE,
    async (job) => {
      const message = job.data;
      const marker = `processed:${message.channel}:${message.id}`;
      const lease = options.leaseSeconds ?? CLAIM_LEASE_SECONDS;
      const claimed = await markerConnection.set(marker, 'claimed', 'EX', lease, 'NX');
      if (claimed === null) {
        const state = await markerConnection.get(marker);
        // 'done' is a genuine duplicate delivery; 'claimed' is another
        // worker mid-flight. Either way this job stops here — but only
        // the first one is spent for ever.
        if (state === 'done' || state === 'claimed') return;
      }
      try {
        await handler(message);
      } catch (err) {
        // Hand the claim back at once: this message was NOT processed,
        // and the retry must be free to process it.
        await markerConnection.del(marker);
        throw err;
      }
      await markerConnection.set(marker, 'done', 'EX', DONE_MEMORY_SECONDS);
    },
    { connection, concurrency: options.concurrency ?? 10 },
  );
}
