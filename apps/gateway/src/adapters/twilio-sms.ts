import { verifyHmacSignature } from '../signature.js';
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../types.js';

export interface TwilioSmsOptions {
  accountSid: string;
  authToken: string;
  /** The Sycamore SMS number users text. */
  fromNumber: string;
  baseUrl?: string;
}

interface TwilioInbound {
  MessageSid: string;
  From: string;
  Body: string;
}

/**
 * P34 Lifeline — the SMS lane as a FULL fallback channel, not just an
 * outbound pager. Same port as WhatsApp: inbound webhooks parse into the
 * same InboundMessage the conversation engine already speaks, so orders,
 * confirmations, cancellations, payout notices and STOP all work over
 * SMS with zero new product logic. Voice/image degrade at the channel
 * boundary — SMS can only carry text, and the engine's "text me instead"
 * prompt covers the rest. Real Twilio (or a local aggregator) credentials
 * enter at onboarding; the shape ships now.
 */
export function twilioSmsChannel(options: TwilioSmsOptions): ChannelAdapter {
  const baseUrl = options.baseUrl ?? 'https://api.twilio.com/2010-04-01';
  return {
    id: 'sms',
    verifySignature(rawBody, headers) {
      // Twilio signs with HMAC-SHA1 over url+params in production; the
      // gateway-side check keeps the same raw-body HMAC contract as every
      // other adapter and is finalized during aggregator onboarding.
      return verifyHmacSignature(options.authToken, rawBody, headers['x-twilio-signature']);
    },
    parseInbound(rawBody) {
      const payload = JSON.parse(rawBody.toString()) as TwilioInbound | TwilioInbound[];
      const messages = Array.isArray(payload) ? payload : [payload];
      const out: InboundMessage[] = [];
      for (const m of messages) {
        if (!m.MessageSid || !m.From) continue;
        out.push({
          id: m.MessageSid,
          channel: 'sms',
          from: m.From,
          receivedAt: new Date().toISOString(),
          kind: 'text',
          text: m.Body ?? '',
        });
      }
      return out;
    },
    async send(message: OutboundMessage) {
      const res = await fetch(`${baseUrl}/Accounts/${options.accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from(`${options.accountSid}:${options.authToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          From: options.fromNumber,
          To: message.to,
          Body: message.text,
        }).toString(),
      });
      if (!res.ok) {
        throw new Error(`sms send failed: ${res.status} ${await res.text()}`);
      }
    },
  };
}
