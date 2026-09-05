import { verifyHmacSignature } from '../signature.js';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../types.js';

export interface WhatsAppCloudOptions {
  appSecret: string;
  accessToken: string;
  phoneNumberId: string;
  baseUrl?: string;
}

interface WaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  audio?: { id: string };
  image?: { id: string };
  interactive?: {
    button_reply?: { id: string };
    list_reply?: { id: string };
  };
}

interface WaWebhook {
  entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[];
}

/**
 * WhatsApp Cloud API adapter — enabled by env flag only (P5 runs on mocks;
 * real credentials enter at the marked prompts). Signature is Meta's
 * X-Hub-Signature-256 over the raw body.
 */
export function whatsappCloudChannel(options: WhatsAppCloudOptions): ChannelAdapter {
  const baseUrl = options.baseUrl ?? 'https://graph.facebook.com/v21.0';
  return {
    id: 'whatsapp',
    verifySignature(rawBody, headers) {
      return verifyHmacSignature(options.appSecret, rawBody, headers['x-hub-signature-256']);
    },
    parseInbound(rawBody) {
      const webhook = JSON.parse(rawBody.toString()) as WaWebhook;
      const out: InboundMessage[] = [];
      for (const entry of webhook.entry ?? []) {
        for (const change of entry.changes ?? []) {
          for (const m of change.value?.messages ?? []) {
            const receivedAt = new Date(Number(m.timestamp) * 1000).toISOString();
            const base = { id: m.id, channel: 'whatsapp', from: m.from, receivedAt };
            if (m.type === 'text' && m.text) {
              out.push({ ...base, kind: 'text', text: m.text.body });
            } else if (m.type === 'audio' && m.audio) {
              out.push({ ...base, kind: 'voice', mediaRef: m.audio.id });
            } else if (m.type === 'image' && m.image) {
              out.push({ ...base, kind: 'image', mediaRef: m.image.id });
            } else if (m.type === 'interactive' && m.interactive) {
              const tap = m.interactive.button_reply?.id ?? m.interactive.list_reply?.id;
              if (tap !== undefined) out.push({ ...base, kind: 'tap', tapPayload: tap });
            }
            // Unknown types are dropped here; conversation-layer handling
            // of unsupported media arrives with P10.
          }
        }
      }
      return out;
    },
    async send(message: OutboundMessage) {
      const res = await fetch(`${baseUrl}/${options.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: message.to,
          type: 'text',
          text: { body: message.text },
        }),
      });
      if (!res.ok) {
        throw new Error(`whatsapp send failed: ${res.status} ${await res.text()}`);
      }
    },
  };
}
