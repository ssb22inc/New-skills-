export const WORKSPACE = '@sycamore/gateway';

export type { ChannelAdapter, InboundMessage, InboundKind, OutboundMessage } from './types.js';
export { verifyHmacSignature, hmacSha256Hex } from './signature.js';
export { mockChannel, MOCK_CHANNEL_SECRET, type MockChannel } from './adapters/mock-channel.js';
export { whatsappCloudChannel, type WhatsAppCloudOptions } from './adapters/whatsapp-cloud.js';
export { smsFallbackChannel, sendWithFallback } from './adapters/sms-fallback.js';
export { handleWebhook, type IngressResult } from './ingress.js';
export { createGatewayServer, type GatewayServerOptions } from './server.js';
export {
  INBOUND_QUEUE,
  redisUrl,
  createRedis,
  createInboundQueue,
  createInboundWorker,
  enqueueInbound,
} from './queue.js';
