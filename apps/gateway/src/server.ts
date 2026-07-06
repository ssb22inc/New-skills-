import { createServer, type Server } from 'node:http';
import type { Queue } from 'bullmq';
import type { ChannelAdapter } from './types.js';
import { handleWebhook } from './ingress.js';

export interface GatewayServerOptions {
  adapters: Map<string, ChannelAdapter>;
  queue: Queue;
  /** For GET webhook verification handshakes (Meta's hub.challenge). */
  verifyToken?: string;
}

export function createGatewayServer(options: GatewayServerOptions): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
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
