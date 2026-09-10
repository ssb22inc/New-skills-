/** Gateway entrypoint: `pnpm --filter @sycamore/gateway dev` */
import { mockChannel } from './adapters/mock-channel.js';
import { whatsappCloudChannel } from './adapters/whatsapp-cloud.js';
import { createGatewayServer } from './server.js';
import { createInboundQueue, createRedis } from './queue.js';
import type { ChannelAdapter } from './types.js';

const adapters = new Map<string, ChannelAdapter>();
adapters.set('mock', mockChannel());

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
