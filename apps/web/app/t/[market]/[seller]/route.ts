import {
  capacityEngine,
  createDb,
  databaseUrl,
  hasVerifiedSurface,
  marketsRegistry,
  sellerStateOf,
} from '@sycamore/core';
import {
  formatAmount,
  loadContextPack,
  loadVerticalPack,
  translator,
  unitLabel,
} from '@sycamore/packs';
import { lightTheme } from '@sycamore/design';

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
 * LIVE availability from capacity, chat CTA, back-on-time guarantee for
 * tours. Served as PURE HTML — zero client JavaScript — because the
 * performance budget (<100KB, interactive <2s on 3G) is a product law,
 * and a buyer page with one link needs no framework runtime.
 *
 * Every sentence comes from the copy catalogue and every colour from the
 * design tokens: the page must read as this market's own, and it must
 * never drift from the palette by somebody hand-editing a hex.
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
  const say = translator(contextPack);
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
${lightTheme()}
</style>
</head>
<body><main>
<header>
<h1>${esc(seller.business_name)}</h1>
<p>${
    verified
      ? `<strong data-badge="verified">✓ ${esc(say('trust_page.verified_badge'))}</strong>`
      : `<span data-badge="early-days">🌱 ${esc(
          say('trust_page.early_days', { orders: seller.completed_orders }),
        )}</span>`
  }</p>
</header>
${
  verticalPack.trust.back_on_time_guarantee
    ? `<section class="g" data-guarantee="back-on-time">⏱ ${esc(
        say('trust_page.guarantee_back_on_time'),
      )}</section>`
    : ''
}
<section>
${items
  .map(
    (i) =>
      `<article><strong>${esc(i.name)}</strong><span class="money">${esc(
        formatAmount(contextPack, Number(i.price_minor)),
      )}</span></article>`,
  )
  .join('\n')}
</section>
<section>
<h2>${esc(say('trust_page.next_openings'))}</h2>
${
  availability.length === 0
    ? `<p>${esc(say('trust_page.no_openings'))}</p>`
    : availability
        .map(
          ({ window, available }) =>
            `<p data-window="${window.id}">${new Date(window.starts_at)
              .toUTCString()
              .slice(0, 22)} — <strong>${esc(
              say('trust_page.open_units', { units: unitLabel(verticalPack, available) }),
            )}</strong></p>`,
        )
        .join('\n')
}
</section>
<section>
<h2>${esc(say('trust_page.licences'))}</h2>
${verticalPack.trust.licence_fields
  .map(
    (f) =>
      `<p class="muted" data-licence-slot="${esc(f)}">${esc(
        say('trust_page.licence_on_file', { field: f }),
      )}</p>`,
  )
  .join('\n')}
</section>
<section data-reviews="early-days">
<h2>${esc(say('trust_page.reviews'))}</h2>
<p class="muted">${esc(say('trust_page.reviews_blurb'))}</p>
</section>
<p class="muted"><a data-why href="/why/${esc(market)}/${esc(sellerId)}">${esc(
    say('trust_page.why_ranked'),
  )}</a></p>
<a class="cta" data-cta="whatsapp" href="${waLink}">${esc(say('trust_page.cta'))}</a>
</main></body></html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
