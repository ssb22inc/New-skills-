import {
  capacityEngine,
  createDb,
  databaseUrl,
  hasVerifiedSurface,
  marketsRegistry,
  sellerStateOf,
} from '@sycamore/core';
import { formatAmount, loadContextPack, loadVerticalPack, unitLabel } from '@sycamore/packs';

export const dynamic = 'force-dynamic'; // live availability, always

const db = createDb(process.env.DATABASE_URL ?? databaseUrl());

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * The buyer-facing trust page (P14): verified badge state, licence slots
 * from the vertical pack, verified-review slots (Early Days until P20),
 * LIVE availability from capacity, WhatsApp CTA, back-on-time guarantee
 * for tours. Served as PURE HTML — zero client JavaScript — because the
 * performance budget (<100KB, interactive <2s on 3G) is a product law,
 * and a buyer page with one link needs no framework runtime. The Next
 * shell still hosts checkout and the founder cockpit as React routes.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ market: string; seller: string }> },
): Promise<Response> {
  const { market, seller: sellerId } = await ctx.params;

  // Region lockdown: a dark market's routes 404 (P6.5).
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

  const contextPack = loadContextPack(market);
  const owner = await db
    .selectFrom('users')
    .where('id', '=', seller.user_id)
    .selectAll()
    .executeTakeFirstOrThrow();
  const items = await db
    .selectFrom('catalog_items')
    .where('market_id', '=', market)
    .where('seller_id', '=', sellerId)
    .where('active', '=', true)
    .selectAll()
    .execute();
  const windows = await db
    .selectFrom('capacity_windows')
    .where('market_id', '=', market)
    .where('seller_id', '=', sellerId)
    .where('starts_at', '>', new Date())
    .orderBy('starts_at', 'asc')
    .limit(5)
    .selectAll()
    .execute();
  const engine = capacityEngine(db, market);
  const availability = await Promise.all(
    windows.map(async (w) => ({ window: w, ...(await engine.availability(w.id)) })),
  );

  const verticalId = windows[0]?.vertical_id ?? 'tours';
  const verticalPack = loadVerticalPack(verticalId);
  const verified = hasVerifiedSurface(sellerStateOf(seller));
  const waLink = `https://wa.me/${owner.phone.replace(/[^0-9]/g, '')}`;

  const html = `<!doctype html>
<html lang="${esc(contextPack.language.primary)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(seller.business_name)} — Sycamore</title>
<link rel="manifest" href="/manifest.webmanifest">
<style>
body{margin:0;background:#F7F3EC;color:#0B1A26;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
main{max-width:480px;margin:0 auto;padding:16px}
header{background:linear-gradient(135deg,#0B4F6C,#01BAEF);color:#F7F3EC;border-radius:12px;padding:20px}
h1{margin:0;font-size:28px}h2{font-size:16px}
article{background:#fff;border-radius:8px;padding:12px;margin-bottom:8px}
article span{float:right;font-family:ui-monospace,monospace}
.g{background:#E8F6F1;border-radius:8px;padding:12px;margin-top:12px}
.muted{color:#4A5A66}
.cta{display:block;text-align:center;background:#F4A24C;color:#0B1A26;font-weight:700;border-radius:12px;padding:16px;margin-top:20px;text-decoration:none}
</style>
</head>
<body><main>
<header>
<h1>${esc(seller.business_name)}</h1>
<p>${
    verified
      ? '<strong data-badge="verified">✓ Sycamore Verified</strong>'
      : `<span data-badge="early-days">🌱 Early days — first ${seller.completed_orders} orders done</span>`
  }</p>
</header>
${
  verticalPack.trust.back_on_time_guarantee
    ? '<section class="g" data-guarantee="back-on-time">⏱ Back-on-time guarantee: late return, money back.</section>'
    : ''
}
<section>
${items
  .map(
    (i) =>
      `<article><strong>${esc(i.name)}</strong><span>${esc(
        formatAmount(contextPack, Number(i.price_minor)),
      )}</span></article>`,
  )
  .join('\n')}
</section>
<section>
<h2>Next openings</h2>
${
  availability.length === 0
    ? '<p>Message us for the next dates.</p>'
    : availability
        .map(
          ({ window, available }) =>
            `<p data-window="${window.id}">${new Date(window.starts_at)
              .toUTCString()
              .slice(
                0,
                22,
              )} — <strong>${esc(unitLabel(verticalPack, available))} open</strong></p>`,
        )
        .join('\n')
}
</section>
<section>
<h2>Licences</h2>
${verticalPack.trust.licence_fields
  .map((f) => `<p class="muted" data-licence-slot="${esc(f)}">${esc(f)}: on file</p>`)
  .join('\n')}
</section>
<section data-reviews="early-days">
<h2>Reviews</h2>
<p class="muted">Verified reviews come only from completed bookings. This business is building its record — watch this space.</p>
</section>
<a class="cta" data-cta="whatsapp" href="${waLink}">Chat &amp; book on WhatsApp</a>
</main></body></html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
