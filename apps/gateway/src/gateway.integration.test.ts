import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import type { Queue, Worker } from 'bullmq';
import { mockChannel } from './adapters/mock-channel.js';
import { handleWebhook } from './ingress.js';
import { createInboundQueue, createInboundWorker, createRedis, redisUrl } from './queue.js';
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
});
