import { createDb, databaseUrl, marketsRegistry } from '@sycamore/core';
import { loadContextPack, translator } from '@sycamore/packs';
import { darkTheme, INK } from '@sycamore/design';

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
 * P36a — the installed client's launch point (`start_url`). Tapping the
 * home-screen icon lands here; the client remembers whose day it is and
 * goes straight there. If it does not know yet (a fresh browser, or the
 * icon tapped before the first visit), it says so in one plain sentence
 * instead of showing an empty app — the seller's chat still has their
 * link, and chat is always the door that works (Constitution §1).
 *
 * The launch shell has no seller yet, so it speaks the language of the
 * market it is serving: `?market=` when the client knows, otherwise the
 * live market from the registry. Never a hardcoded default.
 */
export async function GET(req: Request): Promise<Response> {
  const asked = new URL(req.url).searchParams.get('market');
  const live = await marketsRegistry(db).listLive();
  const market = asked && live.includes(asked) ? asked : live[0];
  if (!market) return new Response('not found', { status: 404 });

  const pack = loadContextPack(market);
  const say = translator(pack);

  const html = `<!doctype html>
<html lang="${esc(pack.language.primary)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${INK}">
<title>Sycamore</title>
<link rel="manifest" href="/manifest.webmanifest">
<style>
${darkTheme()}
p{font-size:16px;line-height:1.5}
</style>
</head>
<body><main>
<p id="msg">${esc(say('seller_day.opening'))}</p>
</main>
<script>
(function(){
  var home=null;
  try{ home=localStorage.getItem('sycamore-home'); }catch(_){}
  if(home){ location.replace(home); return; }
  document.getElementById('msg').textContent=${JSON.stringify(say('seller_day.launch_hint'))};
})();
</script>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
