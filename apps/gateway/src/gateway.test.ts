import { describe, expect, it } from 'vitest';
import { hmacSha256Hex, verifyHmacSignature } from './signature.js';
import { mockChannel } from './adapters/mock-channel.js';
import { whatsappCloudChannel } from './adapters/whatsapp-cloud.js';
import { smsFallbackChannel, sendWithFallback } from './adapters/sms-fallback.js';
import type { InboundMessage } from './types.js';

function inbound(id: string): InboundMessage {
  return {
    id,
    channel: 'mock',
    from: '+18761234567',
    kind: 'text',
    text: 'book 2 seats',
    receivedAt: new Date().toISOString(),
  };
}

describe('P5 — channel gateway (unit)', () => {
  describe('signature verification', () => {
    it('accepts a correctly signed body and rejects everything else', () => {
      const body = Buffer.from('{"a":1}');
      const good = `sha256=${hmacSha256Hex('secret', body)}`;
      expect(verifyHmacSignature('secret', body, good)).toBe(true);
      expect(verifyHmacSignature('secret', body, `sha256=${'0'.repeat(64)}`)).toBe(false);
      expect(verifyHmacSignature('wrong-secret', body, good)).toBe(false);
      expect(verifyHmacSignature('secret', Buffer.from('{"a":2}'), good)).toBe(false);
      expect(verifyHmacSignature('secret', body, undefined)).toBe(false);
    });
  });

  describe('mock channel', () => {
    it('roundtrips: crafted webhook verifies and parses back', () => {
      const channel = mockChannel();
      const { rawBody, headers } = channel.makeWebhook([inbound('m1'), inbound('m2')]);
      expect(channel.verifySignature(rawBody, headers)).toBe(true);
      const parsed = channel.parseInbound(rawBody);
      expect(parsed.map((m) => m.id)).toEqual(['m1', 'm2']);
    });

    it('rejects a tampered body', () => {
      const channel = mockChannel();
      const { rawBody, headers } = channel.makeWebhook([inbound('m1')]);
      const tampered = Buffer.from(rawBody.toString().replace('book 2 seats', 'refund all'));
      expect(channel.verifySignature(tampered, headers)).toBe(false);
    });
  });

  describe('whatsapp-cloud normalization', () => {
    const wa = whatsappCloudChannel({
      appSecret: 's',
      accessToken: 't',
      phoneNumberId: 'p',
    });

    it('normalizes text, voice, image, and tap to InboundMessage', () => {
      const webhook = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.1',
                      from: '18761234567',
                      timestamp: '1751750000',
                      type: 'text',
                      text: { body: 'wah gwaan' },
                    },
                    {
                      id: 'wamid.2',
                      from: '18761234567',
                      timestamp: '1751750001',
                      type: 'audio',
                      audio: { id: 'media-9' },
                    },
                    {
                      id: 'wamid.3',
                      from: '18761234567',
                      timestamp: '1751750002',
                      type: 'image',
                      image: { id: 'media-10' },
                    },
                    {
                      id: 'wamid.4',
                      from: '18761234567',
                      timestamp: '1751750003',
                      type: 'interactive',
                      interactive: { button_reply: { id: 'approve' } },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const parsed = wa.parseInbound(Buffer.from(JSON.stringify(webhook)));
      expect(parsed.map((m) => m.kind)).toEqual(['text', 'voice', 'image', 'tap']);
      expect(parsed[0]?.text).toBe('wah gwaan');
      expect(parsed[1]?.mediaRef).toBe('media-9');
      expect(parsed[3]?.tapPayload).toBe('approve');
      expect(parsed.every((m) => m.channel === 'whatsapp')).toBe(true);
    });
  });

  describe('sms fallback', () => {
    it('delivers through sms when the primary channel fails', async () => {
      const failing = mockChannel();
      failing.send = () => Promise.reject(new Error('whatsapp degraded'));
      const sms = smsFallbackChannel();
      const result = await sendWithFallback(failing, sms, { to: '+1876', text: 'hi' });
      expect(result.deliveredVia).toBe('sms');
      expect(sms.sent).toHaveLength(1);
    });

    it('uses the primary when healthy', async () => {
      const primary = mockChannel();
      const sms = smsFallbackChannel();
      const result = await sendWithFallback(primary, sms, { to: '+1876', text: 'hi' });
      expect(result.deliveredVia).toBe('mock');
      expect(primary.sent).toHaveLength(1);
      expect(sms.sent).toHaveLength(0);
    });
  });
});
