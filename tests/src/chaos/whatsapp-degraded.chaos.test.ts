/**
 * Chaos drill (BUILD §5.6, monthly): WhatsApp API degraded → SMS/PWA
 * fallback carries confirmations.
 * Run alone: `pnpm --filter @sycamore/tests chaos:whatsapp`
 */
import { describe, expect, it } from 'vitest';
import { sendWithFallback, smsFallbackChannel, type ChannelAdapter } from '@sycamore/gateway';

function degradedWhatsApp(failRate: (i: number) => boolean): ChannelAdapter {
  let i = 0;
  return {
    id: 'whatsapp',
    verifySignature: () => true,
    parseInbound: () => [],
    send() {
      i++;
      if (failRate(i)) return Promise.reject(new Error('whatsapp 5xx'));
      return Promise.resolve();
    },
  };
}

describe('chaos drill — WhatsApp degraded', () => {
  it('every confirmation is delivered; the degraded minutes ride SMS', async () => {
    const sms = smsFallbackChannel();
    const whatsapp = degradedWhatsApp((i) => i % 3 !== 0); // 2 of 3 sends fail
    const results = [];
    for (let n = 0; n < 30; n++) {
      results.push(
        await sendWithFallback(whatsapp, sms, {
          to: `+1876555${String(n).padStart(4, '0')}`,
          text: `Booking confirmed — see you Saturday (${n}).`,
        }),
      );
    }
    expect(results).toHaveLength(30); // nothing dropped
    const viaSms = results.filter((r) => r.deliveredVia === 'sms').length;
    const viaWhatsApp = results.filter((r) => r.deliveredVia === 'whatsapp').length;
    expect(viaSms + viaWhatsApp).toBe(30);
    expect(viaSms).toBe(20); // the failures all landed on SMS
    expect(sms.sent).toHaveLength(20);
  });
});
