/**
 * CHAT WITHOUT WHATSAPP.
 *
 *   pnpm demo:chat "how much for saturday?"
 *   pnpm demo:chat            # interactive
 *
 * WhatsApp verification is a human gate, and it gates NOTHING about
 * seeing the conversation layer work. WhatsApp is one ChannelAdapter
 * among several; this drives the identical path through the `mock` door,
 * which is a real implementation of the same port.
 *
 * What you are exercising: signature verification, inbound
 * normalization, intent detection, the per-intent tool allow-list with
 * its hard caps, the STOP/RESUME kill switch, and complaint escalation.
 * The only thing standing in for a vendor is the model itself, which is
 * scripted here so the demo is deterministic and free.
 */
import { createInterface } from 'node:readline/promises';
import {
  conversationEngine,
  createDb,
  databaseUrl,
  detectIntent,
  identityService,
  type Intent,
} from '@sycamore/core';
import { hmacSha256Hex, mockChannel, MOCK_CHANNEL_SECRET } from '@sycamore/gateway';
import { loadContextPack } from '@sycamore/packs';

const MARKET = 'jm';
const jm = loadContextPack(MARKET);
const db = createDb(databaseUrl());

/**
 * A scripted stand-in for the LLM: keyword classification, so the demo
 * is deterministic and costs nothing. In production this is the routed
 * model — the engine cannot tell the difference, which is the point of
 * the port.
 */
const router = {
  complete: (req: { prompt: string }) => {
    const text = req.prompt.toLowerCase();
    const intent: Intent = /\b(vex|rude|terrible|awful|complain|refund me|disgust)/.test(text)
      ? 'complaint'
      : /\b(book|reserve|buk|seat|table|space fi)\b/.test(text)
        ? 'book'
        : /\b(cancel|kyansel)\b/.test(text)
          ? 'cancel'
          : /\b(move|reschedule|switch|change)\b/.test(text)
            ? 'reschedule'
            : /\b(how much|price|cost|ow much|wah di)\b/.test(text)
              ? 'price'
              : /\b(any (space|room)|lef|available|open)\b/.test(text)
                ? 'stock'
                : 'other';
    // The engine expects {"intent": "..."} and collapses anything else
    // to 'other' — a compromised model cannot mint an intent. Returning
    // a bare word here would (correctly) be ignored.
    return Promise.resolve({
      text: JSON.stringify({ intent }),
      providerId: 'scripted',
      model: 'demo',
    });
  },
};

const engine = conversationEngine({ db, router, pack: jm }, MARKET);
const channel = mockChannel();

async function speak(userId: string, text: string): Promise<void> {
  // The message goes in through the real door, signature and all.
  const raw = Buffer.from(
    JSON.stringify({ messages: [{ id: `demo-${Date.now()}`, from: '+18765552000', text }] }),
  );
  const signature = `sha256=${hmacSha256Hex(MOCK_CHANNEL_SECRET, raw)}`;
  const verified = channel.verifySignature(raw, { 'x-mock-signature': signature });
  const inbound = channel.parseInbound(raw);

  const action = await engine.handleMessage({ userId, text });
  const intent = await detectIntent(router, jm, text);

  console.info(`\n  you → ${text}`);
  console.info(
    `  ├─ door        ${inbound[0]!.channel} (signature ${verified ? 'ok' : 'REJECTED'})`,
  );
  console.info(`  ├─ intent      ${intent}`);
  console.info(`  └─ engine      ${action.type}`);

  if (action.type === 'escalate_to_owner') {
    console.info(`     ↳ complaint: ZERO bot reply. The owner gets it, with context.`);
  } else if (action.type === 'stopped_ack') {
    console.info(`     ↳ Autopilot is off. Everything after this is silence until RESUME.`);
  } else if (action.type === 'resumed_ack') {
    console.info(`     ↳ Autopilot is back on.`);
  } else if (action.type === 'silent') {
    console.info(`     ↳ stopped means STOPPED — nothing is sent.`);
  } else if (action.type === 'reply') {
    const allowed = action.toolResults.filter((t) => t.allowed).map((t) => t.tool);
    console.info(
      `     ↳ tools this intent may use: ${allowed.length > 0 ? allowed.join(', ') : '(none proposed)'}`,
    );
  }
}

async function main(): Promise<void> {
  const buyer = await identityService(db, MARKET).findOrCreateUserByPhone({
    phone: '+18765552000',
    displayName: 'Demo Buyer',
  });

  const fromArgs = process.argv.slice(2).join(' ').trim();
  if (fromArgs) {
    await speak(buyer.id, fromArgs);
    return;
  }

  console.info('Sycamore chat — the mock door. Try:');
  console.info('  book 2 seats for saturday · how much for the sunset cruise ·');
  console.info('  any space left friday · STOP · RESUME · the captain was rude to my mother');
  console.info('  (blank line or ctrl-c to leave)\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const line = (await rl.question('> ')).trim();
    if (!line) break;
    await speak(buyer.id, line);
  }
  rl.close();
}

await main();
await db.destroy();
