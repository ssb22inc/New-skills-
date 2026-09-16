/** Gateway entrypoint: `pnpm --filter @sycamore/gateway dev` */
import { mockChannel } from './adapters/mock-channel.js';
import { whatsappCloudChannel } from './adapters/whatsapp-cloud.js';
import { createGatewayServer } from './server.js';
import { createInboundQueue, createRedis } from './queue.js';
import type { ChannelAdapter } from './types.js';

const adapters = new Map<string, ChannelAdapter>();

/**
 * PRODUCTION IS NOT ALLOWED A MOCK DOOR.
 *
 * `mockChannel` accepts any body with a shared test secret and turns it
 * into an inbound message — a real one, routed to real conversations and
 * real orders. It exists so the build can run without Meta's approval,
 * and until the review of 2026-09-16 it was registered unconditionally,
 * including on a production gateway alongside the real WhatsApp channel.
 *
 * It now requires an explicit opt-in, and production may not opt in at
 * all. `SYCAMORE_ALLOW_MOCK_CHANNEL=1` is how the demo, the tests and
 * the load harness ask for it.
 */
const inProduction = process.env.NODE_ENV === 'production';
const mockAllowed = process.env.SYCAMORE_ALLOW_MOCK_CHANNEL === '1';
if (mockAllowed && inProduction) {
  throw new Error(
    'SYCAMORE_ALLOW_MOCK_CHANNEL=1 with NODE_ENV=production: a mock channel accepts ' +
      'forged messages as real ones. Remove the variable or do not run this as production.',
  );
}
if (mockAllowed || !inProduction) adapters.set('mock', mockChannel());

// Real channel enters behind an env flag only (P5 is mock-first).
if (process.env.WHATSAPP_ENABLED === 'true') {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!appSecret || !accessToken || !phoneNumberId) {
    throw new Error(
      'WHATSAPP_ENABLED=true requires WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID',
    );
  }
  adapters.set('whatsapp', whatsappCloudChannel({ appSecret, accessToken, phoneNumberId }));
}

// Fail closed rather than listening with no way in: a gateway with no
// channel accepts nothing, and starting one looks like success.
if (adapters.size === 0) {
  throw new Error(
    'no channel adapters registered: set WHATSAPP_ENABLED=true with its credentials, ' +
      'or SYCAMORE_ALLOW_MOCK_CHANNEL=1 outside production',
  );
}

const connection = createRedis();
const queue = createInboundQueue(connection);
const port = Number(process.env.GATEWAY_PORT ?? 3001);

const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
createGatewayServer({ adapters, queue, ...(verifyToken !== undefined && { verifyToken }) }).listen(
  port,
  () => {
    console.log(`gateway listening on :${port} (channels: ${[...adapters.keys()].join(', ')})`);
  },
);
