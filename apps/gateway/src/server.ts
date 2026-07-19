import { createServer, type Server } from 'node:http';
import type { Queue } from 'bullmq';
import type { ChannelAdapter } from './types.js';
import { handleWebhook } from './ingress.js';
import type { MetricsRegistry } from '@sycamore/core';

export interface GatewayServerOptions {
  adapters: Map<string, ChannelAdapter>;
  queue: Queue;
  /** For GET webhook verification handshakes (Meta's hub.challenge). */
  verifyToken?: string;
  /** When provided, /metrics renders it and webhook counters feed it. */
  metrics?: MetricsRegistry;
}

const startedAt = Date.now();

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

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks);
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        headers[k] = Array.isArray(v) ? v[0] : v;
      }
      handleWebhook(adapter, options.queue, rawBody, headers)
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
