import { createServer, type Server } from 'node:http';
import type { Queue } from 'bullmq';
import type { ChannelAdapter } from './types.js';
import { handleWebhook } from './ingress.js';
import { NOOP_TRACER, traced, type MetricsRegistry, type Tracer } from '@sycamore/core';

export interface GatewayServerOptions {
  adapters: Map<string, ChannelAdapter>;
  queue: Queue;
  /** For GET webhook verification handshakes (Meta's hub.challenge). */
  verifyToken?: string;
  /** When provided, /metrics renders it and webhook counters feed it. */
  metrics?: MetricsRegistry;
  /**
   * Spans for webhook handling. Defaults to the no-op tracer, so a
   * deployment with no collector pays nothing (Constitution §7).
   */
  tracer?: Tracer;
}

const startedAt = Date.now();

/**
 * A webhook body has a shape and a size; anything larger is not a
 * delivery, it is a way to make the gateway hold megabytes per
 * connection until it dies. The buffer was previously unbounded, which
 * the review of 2026-09-16 listed under gateway hardening. Meta's
 * largest documented delivery is a few kilobytes; a megabyte is
 * generous and still refuses a flood.
 */
const MAX_BODY_BYTES = Number(process.env.GATEWAY_MAX_BODY_BYTES ?? 1_048_576);

export function createGatewayServer(options: GatewayServerOptions): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/metrics' && options.metrics) {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      res.end(options.metrics.render());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      // The tiny status dashboard: queue depth + uptime, glanceable.
      options.queue
        .getJobCounts('waiting', 'active', 'completed', 'failed')
        .then((counts) => {
          const uptimeS = Math.round((Date.now() - startedAt) / 1000);
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end(
            `<!doctype html><meta charset="utf-8"><title>Sycamore gateway</title>` +
              `<body style="font-family:monospace;padding:2rem">` +
              `<h1>gateway</h1><p>up ${uptimeS}s</p>` +
              `<table>` +
              Object.entries(counts)
                .map(([k, v]) => `<tr><td>${k}</td><td align="right">${v}</td></tr>`)
                .join('') +
              `</table></body>`,
          );
        })
        .catch(() => {
          res.writeHead(500).end();
        });
      return;
    }

    const webhookMatch = /^\/webhooks\/([a-z-]+)$/.exec(url.pathname);
    if (!webhookMatch) {
      res.writeHead(404).end();
      return;
    }
    const adapter = options.adapters.get(webhookMatch[1] ?? '');
    if (!adapter) {
      res.writeHead(404).end();
      return;
    }

    if (req.method === 'GET') {
      // Channel verification handshake (Meta sends hub.challenge).
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (
        mode === 'subscribe' &&
        options.verifyToken !== undefined &&
        token === options.verifyToken
      ) {
        res.writeHead(200).end(challenge ?? '');
      } else {
        res.writeHead(403).end();
      }
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }

    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > MAX_BODY_BYTES) {
      res.writeHead(413).end();
      req.destroy();
      return;
    }
    const chunks: Buffer[] = [];
    let received = 0;
    let tooLarge = false;
    req.on('data', (c: Buffer) => {
      received += c.length;
      // A chunked delivery declares no length, so the cap is enforced
      // again as the bytes actually arrive.
      if (received > MAX_BODY_BYTES) {
        tooLarge = true;
        res.writeHead(413).end();
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooLarge) return;
      const rawBody = Buffer.concat(chunks);
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        headers[k] = Array.isArray(v) ? v[0] : v;
      }
      const tracer = options.tracer ?? NOOP_TRACER;
      traced(tracer, 'gateway.webhook', { channel: adapter.id, bytes: rawBody.length }, (span) =>
        handleWebhook(adapter, options.queue, rawBody, headers).then((result) => {
          span.setAttribute('status', result.status);
          if ('received' in result) span.setAttribute('messages', result.received);
          else span.recordError(result.error);
          return result;
        }),
      )
        .then((result) => {
          options.metrics
            ?.counter('gateway_webhooks_total', 'Webhook deliveries by outcome')
            .inc({ channel: adapter.id, status: String(result.status) });
          if (result.status === 200) {
            options.metrics
              ?.counter('gateway_messages_enqueued_total', 'Inbound messages queued')
              .inc({ channel: adapter.id }, result.received);
          }
          res.writeHead(result.status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(result));
        })
        .catch(() => {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'internal' }));
        });
    });
  });
}
