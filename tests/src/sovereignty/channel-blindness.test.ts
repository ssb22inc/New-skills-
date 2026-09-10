/**
 * P35a GATE (permanent CI law) — channel blindness. Core must build and
 * the conversation flow must run with the WhatsApp adapter deleted from
 * the build. If this test fails, a WhatsApp dependency has leaked into
 * core — fix before ship.
 *
 * NOTE this file deliberately imports NOTHING WhatsApp: the flow below
 * runs on the mock + pwa doors alone.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mockChannel, pwaChannel, hmacSha256Hex, PWA_CHANNEL_SECRET } from '@sycamore/gateway';

const CORE_SRC = new URL('../../../core/src', import.meta.url).pathname;

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFilesUnder(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Strip comments — prose may say "WhatsApp"; code never may. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('P35a — channel blindness is law', () => {
  it('GATE: zero WhatsApp references in /core CODE (comments may explain, code may not depend)', () => {
    const offenders: string[] = [];
    for (const file of tsFilesUnder(CORE_SRC)) {
      if (/whatsapp/i.test(codeOnly(readFileSync(file, 'utf8')))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('GATE: the conversation doors work with WhatsApp absent from the build', () => {
    // The build here contains exactly two doors: mock and pwa.
    const doors = [mockChannel(), pwaChannel()];
    expect(doors.map((d) => d.id)).toEqual(['mock', 'pwa']);

    // The same message shape flows through the sovereign door.
    const raw = Buffer.from(
      JSON.stringify({
        messages: [{ id: 'pwa-1', from: '+18765550001', kind: 'text', text: 'is saturday open?' }],
      }),
    );
    const pwa = doors[1] as ReturnType<typeof pwaChannel>;
    const signature = `sha256=${hmacSha256Hex(PWA_CHANNEL_SECRET, raw)}`;
    expect(pwa.verifySignature(raw, { 'x-pwa-signature': signature })).toBe(true);
    const messages = pwa.parseInbound(raw);
    expect(messages[0]).toMatchObject({
      id: 'pwa-1',
      channel: 'pwa',
      kind: 'text',
      text: 'is saturday open?',
    });
  });
});
