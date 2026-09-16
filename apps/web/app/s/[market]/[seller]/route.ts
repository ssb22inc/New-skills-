import { createDb, databaseUrl, marketsRegistry } from '@sycamore/core';
import { loadContextPack, translator } from '@sycamore/packs';
import { darkTheme, INK } from '@sycamore/design';

export const dynamic = 'force-dynamic';

const db = createDb(databaseUrl());

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
 *
 * Every string the script renders is handed to it as pack copy — the
 * client script owns no sentences either.
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

  const pack = loadContextPack(market);
  const say = translator(pack);

  const offered = new URL(req.url).searchParams.get('offer') === '1';
  const alreadyInstalled = seller.install_prompt_state === 'installed';
  const showInstallOffer = offered && !alreadyInstalled;
  const dayUrl = `/s/${market}/${sellerId}/day.json`;
  const actionsUrl = `/s/${market}/${sellerId}/actions`;

  // The script renders rows client-side, so it needs its sentences up
  // front. They come from the catalogue, never from the script itself.
  const copy = {
    upToDate: say('seller_day.up_to_date'),
    offlineAsOf: say('seller_day.offline_as_of', { when: '{when}' }),
    offlineNoCache: say('seller_day.offline_no_cache'),
    noOpenOrders: say('seller_day.no_open_orders'),
    noCapacity: say('seller_day.no_capacity'),
    noContacts: say('seller_day.no_contacts'),
    noCatalog: say('seller_day.no_catalog'),
    done: say('seller_day.done'),
    sent: say('seller_day.sent'),
    askCode: say('seller_day.ask_code'),
    codeMissing: say('seller_day.code_missing'),
    queueWaiting: say('seller_day.queue_waiting', { count: '{count}' }),
  };

  const html = `<!doctype html>
<html lang="${esc(pack.language.primary)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${INK}">
<title>${esc(seller.business_name)} — Sycamore</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<style>
${darkTheme()}
</style>
</head>
<body><main>
<h1>${esc(seller.business_name)}</h1>
<p class="muted" id="freshness" data-freshness>${esc(say('seller_day.loading'))}</p>

<section id="install-offer" data-panel="install-offer" ${showInstallOffer ? '' : 'hidden'}>
<p>${esc(say('seller_day.install_pitch'))}</p>
<button type="button" data-action="install">${esc(say('seller_day.install_accept'))}</button>
<button type="button" class="ghost" data-action="decline">${esc(
    say('seller_day.install_decline'),
  )}</button>
</section>

<h2>${esc(say('seller_day.open_orders'))}</h2>
<section data-panel="open-orders"><p class="muted">…</p></section>

<h2>${esc(say('seller_day.next_seven_days'))}</h2>
<section data-panel="capacity"><p class="muted">…</p></section>

<h2>${esc(say('seller_day.your_people'))}</h2>
<section data-panel="contacts"><p class="muted">…</p></section>

<h2>${esc(say('seller_day.what_you_sell'))}</h2>
<section data-panel="catalog"><p class="muted">…</p></section>

<p class="muted" id="queue-state" data-queue-state></p>
</main>
<script>
(function(){
  var DAY_URL=${JSON.stringify(dayUrl)}, ACTIONS_URL=${JSON.stringify(actionsUrl)};
  var COPY=${JSON.stringify(copy)};
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
    if(el) el.textContent=COPY.queueWaiting.replace('{count}',q.length);
    if(!navigator.onLine) return;
    // Idempotency keys are generated ONCE, when the action happens, so a
    // resend after a crash is the same action, not a second one (P34).
    //
    // ACKNOWLEDGE PER ACTION. This used to clear the whole queue on any
    // 200, which threw away two things: actions the server did NOT
    // apply, and actions this phone added while the request was in
    // flight. The external review of 2026-09-16 found both. The server
    // now answers with an outcome per idempotency key, and only the keys
    // it actually settled are removed — from the queue as it is NOW, not
    // as it was when the request left.
    var sent=q.slice();
    fetch(ACTIONS_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actions:sent})})
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(body){
        if(!body||!body.results) return;
        var settled={};
        body.results.forEach(function(x){
          // 'applied' and 'duplicate' are both finished business.
          // 'in_flight' and 'failed' stay queued and go again.
          if(x.outcome==='applied'||x.outcome==='duplicate') settled[x.idempotencyKey]=true;
        });
        var remaining=queue().filter(function(a){ return !settled[a.idempotencyKey]; });
        if(remaining.length) localStorage.setItem(QUEUE_KEY,JSON.stringify(remaining));
        else localStorage.removeItem(QUEUE_KEY);
        if(el) el.textContent=remaining.length?COPY.queueWaiting.replace('{count}',remaining.length):'';
      })
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
      ? COPY.offlineAsOf.replace('{when}', new Date(day.capturedAt).toLocaleString())
      : COPY.upToDate;
    f.className=fromCache?'stale':'muted';
    fill('open-orders',day.openOrders,function(o){
      return '<p data-order="'+o.id+'">'+esc(o.buyerName)+' — <span class="num">'+o.units+'</span> ('+esc(o.status)+') '+
        '<button type="button" data-complete="'+o.id+'">'+esc(COPY.done)+'</button></p>';
    },COPY.noOpenOrders);
    fill('capacity',day.capacity,function(c){
      return '<p data-window="'+c.windowId+'">'+new Date(c.startsAt).toDateString()+' — <span class="num">'+c.available+'/'+c.totalUnits+'</span></p>';
    },COPY.noCapacity);
    fill('contacts',day.contacts,function(p){
      return '<p data-contact="'+p.userId+'">'+esc(p.name)+' <a class="num" href="tel:'+esc(p.phone)+'">'+esc(p.phone)+'</a></p>';
    },COPY.noContacts);
    fill('catalog',day.catalog,function(i){ return '<p data-item="'+i.id+'">'+esc(i.name)+'</p>'; },COPY.noCatalog);
    Array.prototype.forEach.call(document.querySelectorAll('[data-complete]'),function(b){
      b.addEventListener('click',function(){
        var id=b.getAttribute('data-complete');
        // The buyer got a one-use code in their chat when the booking
        // was confirmed. Asking for it is what makes an OFFLINE
        // completion evidence rather than an assertion: the phone can
        // queue it with no signal, and the server verifies it against
        // the order on reconnect. A completion with no code is refused,
        // so the client does not pretend to send one.
        var code=window.prompt(COPY.askCode);
        if(!code){ window.alert(COPY.codeMissing); return; }
        enqueue({idempotencyKey:'complete:'+id,kind:'complete_order',
          payload:{orderId:id,evidence:{type:'qr_scan',code:code.trim()}}});
        b.disabled=true; b.textContent=COPY.sent;
      });
    });
  }
  function fill(panel,rows,fn,empty){
    var el=document.querySelector('[data-panel="'+panel+'"]');
    el.innerHTML=(rows&&rows.length)?rows.map(fn).join(''):'<p class="muted">'+esc(empty)+'</p>';
  }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  var cached=null;
  try{ cached=JSON.parse(localStorage.getItem(DAY_KEY)||'null'); }catch(_){}
  if(cached) render(cached,true);
  fetch(DAY_URL).then(function(r){ return r.json(); }).then(function(day){
    localStorage.setItem(DAY_KEY,JSON.stringify(day));
    render(day,false);
  }).catch(function(){ if(!cached) document.getElementById('freshness').textContent=COPY.offlineNoCache; });
  flush();
})();
</script>
</body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
