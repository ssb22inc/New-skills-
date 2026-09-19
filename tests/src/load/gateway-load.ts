/**
 * P5 load gate: 100 msg/s sustained for 60s against the real HTTP server
 * and real Redis queue — zero drops (every message ACKed and queued).
 *
 * Run:  docker compose up -d && pnpm --filter @sycamore/tests load:gateway
 * Env:  LOAD_RATE (msg/s, default 100), LOAD_SECONDS (default 60)
 */
import {
  createGatewayServer,
  createInboundQueue,
  createInboundWorker,
  createRedis,
  mockChannel,
  type ChannelAdapter,
  type InboundMessage,
} from '@sycamore/gateway';

const RATE = Number(process.env.LOAD_RATE ?? 100);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 60);
const TOTAL = RATE * SECONDS;

const flush = createRedis();
await flush.flushdb();

const channel = mockChannel();
const adapters = new Map<string, ChannelAdapter>([['mock', channel]]);
const queueConn = createRedis();
const workerConn = createRedis();
const markerConn = createRedis();
const queue = createInboundQueue(queueConn);

let processedCount = 0;
const worker = createInboundWorker(
  workerConn,
  markerConn,
  () => {
    processedCount++;
    return Promise.resolve();
  },
  { concurrency: 50 },
);

const server = createGatewayServer({ adapters, queue });
await new Promise<void>((resolve) => server.listen(0, resolve));
const address = server.address();
const port = typeof address === 'object' && address !== null ? address.port : 0;
const url = `http://127.0.0.1:${port}/webhooks/mock`;

function makeMessage(i: number): InboundMessage {
  return {
    id: `load-${i}`,
    channel: 'mock',
    from: `+1876${String(i % 10_000_000).padStart(7, '0')}`,
    kind: 'text',
    text: `message ${i}`,
    receivedAt: new Date().toISOString(),
  };
}

console.log(`firing ${TOTAL} messages at ${RATE}/s for ${SECONDS}s ...`);
let accepted = 0;
let rejected = 0;
let sent = 0;
const started = Date.now();

await new Promise<void>((resolve) => {
  const timer = setInterval(() => {
    const bodies = Array.from({ length: RATE }, () => {
      const webhook = channel.makeWebhook([makeMessage(sent)]);
      sent++;
      return webhook;
    });
    for (const { rawBody, headers } of bodies) {
      fetch(url, { method: 'POST', headers, body: new Uint8Array(rawBody) })
        .then((res) => {
          if (res.status === 200) accepted++;
          else rejected++;
        })
        .catch(() => rejected++);
    }
    if (sent >= TOTAL) {
      clearInterval(timer);
      resolve();
    }
  }, 1000);
});

// Wait for every in-flight ACK, then for the queue to drain.
while (accepted + rejected < TOTAL) await new Promise((r) => setTimeout(r, 100));
const sendElapsed = ((Date.now() - started) / 1000).toFixed(1);
while (processedCount < TOTAL && Date.now() - started < (SECONDS + 120) * 1000) {
  await new Promise((r) => setTimeout(r, 250));
}

const counts = await queue.getJobCounts('completed', 'failed', 'waiting', 'active');
console.log(`sent=${sent} accepted=${accepted} rejected=${rejected} in ${sendElapsed}s`);
console.log(`processed=${processedCount} queueCounts=${JSON.stringify(counts)}`);

const pass = accepted === TOTAL && rejected === 0 && processedCount === TOTAL;
console.log(pass ? '✅ GATE PASSED: zero drops, all queued and processed' : '❌ GATE FAILED');

await worker.close();
await queue.close();
server.close();
for (const c of [flush, queueConn, workerConn, markerConn]) c.disconnect();
process.exit(pass ? 0 : 1);
