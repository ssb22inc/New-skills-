import { createDb, databaseUrl, marketsRegistry } from '@sycamore/core';
import { loadContextPack, translator } from '@sycamore/packs';
import { lightTheme } from '@sycamore/design';

export const dynamic = 'force-dynamic';

const db = createDb(process.env.DATABASE_URL ?? databaseUrl());

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * P35b — the sovereign door: {seller}.sycamore.app chat. Pure HTML like
 * the trust page (the performance budget is a product law); messages
 * post to the gateway's `pwa` channel, which speaks to the exact same
 * conversation engine as WhatsApp. If the WhatsApp door ever closes,
 * this one was already open and already a habit.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ market: string; seller: string }> },
): Promise<Response> {
  const { market, seller: sellerId } = await ctx.params;

  const registry = marketsRegistry(db);
  if ((await registry.statusOf(market)) !== 'live') {
    return new Response('not found', { status: 404 });
  }
  const seller = await db
    .selectFrom('sellers')
    .where('market_id', '=', market)
    .where('id', '=', sellerId)
    .selectAll()
    .executeTakeFirst();
  if (!seller) return new Response('not found', { status: 404 });

  const pack = loadContextPack(market);
  const say = translator(pack);
  const gatewayUrl = process.env.SYCAMORE_GATEWAY_URL ?? '';

  const html = `<!doctype html>
<html lang="${esc(pack.language.primary)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chat — ${esc(seller.business_name)}</title>
<link rel="manifest" href="/manifest.webmanifest">
<style>
${lightTheme()}
main{display:flex;flex-direction:column;min-height:100vh}
h1{font-size:22px}
#thread{flex:1;padding:12px 0}
form{display:flex;gap:8px}
</style>
</head>
<body><main>
<header>
<h1>${esc(seller.business_name)}</h1>
<p class="on-ocean">${esc(say('sovereign_door.tagline'))}</p>
</header>
<section id="thread" data-channel="pwa" data-seller="${esc(sellerId)}"></section>
<form method="post" action="${esc(gatewayUrl)}/webhooks/pwa" data-chat-form>
<input name="text" placeholder="${esc(say('sovereign_door.input_placeholder'))}" autocomplete="off" required>
<button type="submit">${esc(say('sovereign_door.send'))}</button>
</form>
<p class="muted">${esc(say('sovereign_door.footer'))}</p>
</main></body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
