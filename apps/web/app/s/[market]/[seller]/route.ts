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
 * P36a/c — the seller's day: the installed client's home, and the shell
 * the service worker precaches. Pure HTML plus one small inline script,
 * because the seller is on the same low-end Android their buyers are.
 *
 * THE INSTALL RULE lives in this file's script:
 *   • `beforeinstallprompt` is ALWAYS captured and suppressed. Nothing
 *     appears on its own — the browser's own nag is a nag.
 *   • The install button renders only when the seller arrived from an
 *     EARNED offer (`?offer=1`), which core only ever emits to sellers,
 *     never during Genesis, and at most twice in a lifetime (P36b).
 *   • Declining is one tap and is recorded. Two declines and the offer
 *     never comes again.
 *   • This page is the SELLER's door. The buyer surfaces (`/t/…`, `/c/…`)
 *     carry no install affordance at all.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ market: string; seller: string }> },
): Promise<Response> {
  const { market, seller: sellerId } = await ctx.params;

  // Region lockdown: a dark market's routes 404 (P6.5).
  if ((await marketsRegistry(db).statusOf(market)) !== 'live') {
    return new Response('not found', { status: 404 });
  }
  const seller = await db
    .selectFrom('sellers')
    .where('market_id', '=', market)
    .where('id', '=', sellerId)
    .selectAll()
    .executeTakeFirst();
  if (!seller) return new Response('not found', { status: 404 });

  const offered = new URL(req.url).searchParams.get('offer') === '1';
  const alreadyInstalled = seller.install_prompt_state === 'installed';
  const showInstallOffer = offered && !alreadyInstalled;
  const dayUrl = `/s/${market}/${sellerId}/day.json`;
  const actionsUrl = `/s/${market}/${sellerId}/actions`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0B1A26">
<title>${esc(seller.business_name)} — your day</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<style>
body{margin:0;background:#0B1A26;color:#F7F3EC;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
main{max-width:480px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:14px;color:#9FB3C0;text-transform:uppercase;letter-spacing:.06em;margin:20px 0 8px}
section{background:#12283A;border-radius:12px;padding:14px;margin-bottom:12px}
p{margin:6px 0;font-size:15px}
button{background:#F4A24C;color:#0B1A26;border:none;border-radius:12px;padding:12px 16px;font-weight:700;font-size:15px}
button.ghost{background:transparent;color:#9FB3C0;font-weight:400;text-decoration:underline}
.muted{color:#9FB3C0;font-size:13px}
.stale{color:#F4A24C;font-size:13px}
[hidden]{display:none!important}
</style>
</head>
<body><main>
<h1>${esc(seller.business_name)}</h1>
<p class="muted" id="freshness" data-freshness>Loading your day…</p>

<section id="install-offer" data-panel="install-offer" ${showInstallOffer ? '' : 'hidden'}>
<p>Put this on your home screen — it opens faster, and it keeps working when the internet drops.</p>
<button type="button" data-action="install">Add to home screen</button>
<button type="button" class="ghost" data-action="decline">Not now</button>
</section>

<h2>Open orders</h2>
<section data-panel="open-orders"><p class="muted">…</p></section>

<h2>Next 7 days</h2>
<section data-panel="capacity"><p class="muted">…</p></section>

<h2>Your people</h2>
<section data-panel="contacts"><p class="muted">…</p></section>

<h2>What you sell</h2>
<section data-panel="catalog"><p class="muted">…</p></section>

<p class="muted" id="queue-state" data-queue-state></p>
</main>
<script>
(function(){
  var DAY_URL=${JSON.stringify(dayUrl)}, ACTIONS_URL=${JSON.stringify(actionsUrl)};
  var DAY_KEY='sycamore-day:'+DAY_URL, QUEUE_KEY='sycamore-queue:'+ACTIONS_URL;

  // The installed client launches at /s/ — remember whose day this is.
  try{ localStorage.setItem('sycamore-home',${JSON.stringify(`/s/${market}/${sellerId}`)}); }catch(_){}

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});
  }

  // The browser's own install nag is still a nag: capture it, hold it,
  // and only ever fire it from an EARNED offer the seller taps.
  var deferred=null;
  window.addEventListener('beforeinstallprompt',function(e){ e.preventDefault(); deferred=e; });

  function queue(){ try{ return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]'); }catch(_){ return []; } }
  function enqueue(action){
    var q=queue(); q.push(action); localStorage.setItem(QUEUE_KEY,JSON.stringify(q)); flush();
  }
  function flush(){
    var q=queue();
    var el=document.getElementById('queue-state');
    if(!q.length){ if(el) el.textContent=''; return; }
    if(el) el.textContent=q.length+' change'+(q.length===1?'':'s')+' waiting to send.';
    if(!navigator.onLine) return;
    // Idempotency keys are generated ONCE, when the action happens, so a
    // resend after a crash is the same action, not a second one (P34).
    fetch(ACTIONS_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actions:q})})
      .then(function(r){ if(r.ok){ localStorage.removeItem(QUEUE_KEY); if(el) el.textContent=''; } })
      .catch(function(){});
  }
  window.addEventListener('online',flush);

  var offer=document.getElementById('install-offer');
  if(offer){
    offer.querySelector('[data-action="install"]').addEventListener('click',function(){
      if(!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function(choice){
        enqueue({idempotencyKey:'install:'+${JSON.stringify(sellerId)}+':'+choice.outcome,
                 kind: choice.outcome==='accepted'?'client_installed':'install_declined',
                 payload:{}});
        offer.hidden=true;
      });
    });
    offer.querySelector('[data-action="decline"]').addEventListener('click',function(){
      enqueue({idempotencyKey:'install-declined:'+${JSON.stringify(sellerId)}+':'+Date.now(),kind:'install_declined',payload:{}});
      offer.hidden=true;
    });
  }

  function render(day,fromCache){
    var f=document.getElementById('freshness');
    f.textContent=fromCache
      ? 'Offline — showing your day as of '+new Date(day.capturedAt).toLocaleString()
      : 'Up to date.';
    f.className=fromCache?'stale':'muted';
    fill('open-orders',day.openOrders,function(o){
      return '<p data-order="'+o.id+'">'+esc(o.buyerName)+' — '+o.units+' ('+esc(o.status)+') '+
        '<button type="button" data-complete="'+o.id+'">Done</button></p>';
    },'Nothing open right now.');
    fill('capacity',day.capacity,function(c){
      return '<p data-window="'+c.windowId+'">'+new Date(c.startsAt).toDateString()+' — '+c.available+' of '+c.totalUnits+' open</p>';
    },'No openings set for the next 7 days.');
    fill('contacts',day.contacts,function(p){
      return '<p data-contact="'+p.userId+'">'+esc(p.name)+' <a href="tel:'+esc(p.phone)+'">'+esc(p.phone)+'</a></p>';
    },'No customers yet.');
    fill('catalog',day.catalog,function(i){ return '<p data-item="'+i.id+'">'+esc(i.name)+'</p>'; },'Nothing listed yet.');
    Array.prototype.forEach.call(document.querySelectorAll('[data-complete]'),function(b){
      b.addEventListener('click',function(){
        var id=b.getAttribute('data-complete');
        enqueue({idempotencyKey:'complete:'+id,kind:'complete_order',payload:{orderId:id}});
        b.disabled=true; b.textContent='Sent';
      });
    });
  }
  function fill(panel,rows,fn,empty){
    var el=document.querySelector('[data-panel="'+panel+'"]');
    el.innerHTML=(rows&&rows.length)?rows.map(fn).join(''):'<p class="muted">'+empty+'</p>';
  }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  var cached=null;
  try{ cached=JSON.parse(localStorage.getItem(DAY_KEY)||'null'); }catch(_){}
  if(cached) render(cached,true);
  fetch(DAY_URL).then(function(r){ return r.json(); }).then(function(day){
    localStorage.setItem(DAY_KEY,JSON.stringify(day));
    render(day,false);
  }).catch(function(){ if(!cached) document.getElementById('freshness').textContent='Offline — no saved day yet.'; });
  flush();
})();
</script>
</body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
