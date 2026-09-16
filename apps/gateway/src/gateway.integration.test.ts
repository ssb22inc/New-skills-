import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import type { Queue, Worker } from 'bullmq';
import { mockChannel } from './adapters/mock-channel.js';
import { handleWebhook } from './ingress.js';
import {
  createInboundQueue,
  createInboundWorker,
  createRedis,
  enqueueInbound,
  redisUrl,
} from './queue.js';
import type { InboundMessage } from './types.js';

async function redisReachable(): Promise<boolean> {
  const probe = new Redis(redisUrl(), {
    connectTimeout: 1500,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const reachable = await redisReachable();
if (!reachable) {
  console.warn('⚠ P5 gate tests SKIPPED: Redis unreachable. Run `docker compose up -d`.');
}

function inbound(id: string, text = 'book 2 seats'): InboundMessage {
  return {
    id,
    channel: 'mock',
    from: '+18761234567',
    kind: 'text',
    text,
    receivedAt: new Date().toISOString(),
  };
}

async function waitUntil(cond: () => boolean, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe.runIf(reachable)('P5 — channel gateway (gate, against real Redis)', () => {
  const connections: Redis[] = [];
  let queue: Queue;
  let worker: Worker;
  const processed: InboundMessage[] = [];

  beforeAll(async () => {
    const flush = createRedis();
    connections.push(flush);
    await flush.flushdb(); // clean slate: queue state + idempotency markers

    const queueConn = createRedis();
    const workerConn = createRedis();
    const markerConn = createRedis();
    connections.push(queueConn, workerConn, markerConn);
    queue = createInboundQueue(queueConn);
    worker = createInboundWorker(workerConn, markerConn, (m) => {
      processed.push(m);
      return Promise.resolve();
    });
  });

  afterAll(async () => {
    await worker.close();
    await queue.close();
    for (const c of connections) c.disconnect();
  });

  it('GATE: replaying the same webhook 5× produces exactly one processed message', async () => {
    const channel = mockChannel();
    const webhook = channel.makeWebhook([inbound('replay-1')]);

    for (let i = 0; i < 5; i++) {
      const result = await handleWebhook(channel, queue, webhook.rawBody, webhook.headers);
      expect(result.status).toBe(200); // every delivery is ACKed…
    }

    await waitUntil(() => processed.some((m) => m.id === 'replay-1'), 5000);
    await new Promise((r) => setTimeout(r, 300)); // grace for stray duplicates
    expect(processed.filter((m) => m.id === 'replay-1')).toHaveLength(1); // …one effect
  });

  it('distinct messages all process exactly once each', async () => {
    const channel = mockChannel();
    const ids = Array.from({ length: 20 }, (_, i) => `distinct-${i}`);
    for (const id of ids) {
      const webhook = channel.makeWebhook([inbound(id)]);
      // Each delivery double-fires, because real webhooks do.
      await handleWebhook(channel, queue, webhook.rawBody, webhook.headers);
      await handleWebhook(channel, queue, webhook.rawBody, webhook.headers);
    }
    await waitUntil(() => ids.every((id) => processed.some((m) => m.id === id)), 10_000);
    for (const id of ids) {
      expect(processed.filter((m) => m.id === id)).toHaveLength(1);
    }
  });

  it('a bad signature is rejected and nothing is queued', async () => {
    const channel = mockChannel();
    const { rawBody } = channel.makeWebhook([inbound('bad-sig')]);
    const result = await handleWebhook(channel, queue, rawBody, {
      'x-mock-signature': `sha256=${'0'.repeat(64)}`,
    });
    expect(result.status).toBe(401);
    await new Promise((r) => setTimeout(r, 300));
    expect(processed.some((m) => m.id === 'bad-sig')).toBe(false);
  });

  /**
   * C03 (external review, 2026-09-16). The worker used to mark a message
   * processed BEFORE calling the handler, so a handler that threw left
   * behind a marker saying the work was done. Every retry — BullMQ's own
   * three attempts included — walked into that marker and returned
   * without doing anything. The message was acknowledged to the channel
   * and the booking never happened.
   *
   * The test that could not catch it is the one above: replaying a
   * message five times gives one effect either way. This one injects the
   * failure.
   */
  it('GATE: a handler that throws does not consume the message', async () => {
    // Its own Redis database, because the shared worker in this file
    // consumes the same queue name and would race for the job.
    const url = `${redisUrl().split('/').slice(0, 3).join('/')}/3`;
    const markerConn = createRedis(url);
    const workerConn = createRedis(url);
    const queueConn = createRedis(url);
    connections.push(markerConn, workerConn, queueConn);
    await markerConn.flushdb();
    const ownQueue = createInboundQueue(queueConn);
    const seen: string[] = [];
    let failFirst = true;
    const flaky = createInboundWorker(workerConn, markerConn, (m) => {
      if (failFirst) {
        failFirst = false;
        return Promise.reject(new Error('worker died mid-handler'));
      }
      seen.push(m.id);
      return Promise.resolve();
    });
    try {
      await enqueueInbound(ownQueue, inbound('crash-1'));
      // BullMQ retries with backoff; the second attempt must be allowed
      // to do the work rather than find a 'processed' marker.
      await waitUntil(() => seen.includes('crash-1'), 15000);
      expect(seen).toEqual(['crash-1']);
      // Only NOW is the message spent.
      expect(await markerConn.get('processed:mock:crash-1')).toBe('done');
    } finally {
      await flaky.close();
      await ownQueue.close();
    }
  }, 30000);
});
