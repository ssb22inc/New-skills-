import { createDb, databaseUrl, marketsRegistry } from '@sycamore/core';

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

  const gatewayUrl = process.env.SYCAMORE_GATEWAY_URL ?? '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chat — ${esc(seller.business_name)}</title>
<link rel="manifest" href="/manifest.webmanifest">
<style>
body{margin:0;background:#F7F3EC;color:#0B1A26;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
main{max-width:480px;margin:0 auto;padding:16px;display:flex;flex-direction:column;min-height:100vh}
header{background:linear-gradient(135deg,#0B4F6C,#01BAEF);color:#F7F3EC;border-radius:12px;padding:16px}
h1{margin:0;font-size:22px}
#thread{flex:1;padding:12px 0}
form{display:flex;gap:8px}
input{flex:1;border:1px solid #B9C6CF;border-radius:12px;padding:12px;font-size:16px}
button{background:#F4A24C;border:none;border-radius:12px;padding:12px 16px;font-weight:700}
.muted{color:#4A5A66;font-size:13px}
</style>
</head>
<body><main>
<header>
<h1>${esc(seller.business_name)}</h1>
<p class="muted" style="color:#DCE9F0">Chat and book right here — same conversation, your own door.</p>
</header>
<section id="thread" data-channel="pwa" data-seller="${esc(sellerId)}"></section>
<form method="post" action="${esc(gatewayUrl)}/webhooks/pwa" data-chat-form>
<input name="text" placeholder="Ask about dates, prices, anything…" autocomplete="off" required>
<button type="submit">Send</button>
</form>
<p class="muted">Works on any connection. Reply STOP any time to pause messages.</p>
</main></body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
