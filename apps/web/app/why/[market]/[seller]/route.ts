import {
  blendedScore,
  createDb,
  databaseUrl,
  hasVerifiedSurface,
  marketsRegistry,
  sellerStateOf,
} from '@sycamore/core';
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
 * SHOW-ME-WHY (Constitution §4): "Every automated decision (ranking,
 * budget move, pause, route) can explain itself in one tap. No black
 * boxes facing users."
 *
 * The ranking engine has always carried its components; this route is
 * the tap. One link from the trust page lands here and a buyer sees the
 * actual numbers that placed this business where they found it —
 * including, plainly, when the placement is a newcomer audition rather
 * than earned rank. Nothing is computed for display: these are the same
 * `blendedScore` components the ranker itself uses.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ market: string; seller: string }> },
): Promise<Response> {
  const { market, seller: sellerId } = await ctx.params;

  if ((await marketsRegistry(db).statusOf(market)) !== 'live') {
    return new Response('not found', { status: 404 });
  }
  const pack = loadContextPack(market);
  const say = translator(pack);

  const seller = await db
    .selectFrom('sellers')
    .where('market_id', '=', market)
    .where('id', '=', sellerId)
    .selectAll()
    .executeTakeFirst();
  if (!seller) return new Response(say('why.no_seller'), { status: 404 });

  // The same signals the ranker reads, straight from this seller's record.
  const reviews = await db
    .selectFrom('reviews')
    .where('market_id', '=', market)
    .where('seller_id', '=', sellerId)
    .where('status', '=', 'published')
    .select(['rating'])
    .execute();
  const orders = await db
    .selectFrom('orders')
    .where('market_id', '=', market)
    .where('seller_id', '=', sellerId)
    .select(['status'])
    .execute();
  const decided = orders.filter((o) => o.status !== 'draft');
  const cancelled = decided.filter((o) => o.status === 'cancelled').length;

  const RESPONSE_P50_SECONDS = 15 * 60; // until the channel adapter reports it
  const explain = blendedScore({
    sellerId,
    ratingSum: reviews.reduce((s, r) => s + r.rating, 0),
    ratingCount: reviews.length,
    responseP50Seconds: RESPONSE_P50_SECONDS,
    acceptanceRate: orders.length === 0 ? 0 : decided.length / orders.length,
    cancellationRate: decided.length === 0 ? 0 : cancelled / decided.length,
    availabilityFit: 1,
    newcomer: !hasVerifiedSurface(sellerStateOf(seller)),
  });
  const pct = (n: number): string => (n * 100).toFixed(0);

  const html = `<!doctype html>
<html lang="${esc(pack.language.primary)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(say('why.title'))} — ${esc(seller.business_name)}</title>
<style>
${lightTheme()}
</style>
</head>
<body><main>
<header><h1>${esc(say('why.title'))}</h1></header>
<section data-panel="why">
<p>${esc(say('why.intro'))}</p>
<p data-why-line="rating">${esc(
    say('why.rating', { rating: explain.bayesianRating.toFixed(2) }),
  )}</p>
<p data-why-line="response">${esc(
    say('why.response', { minutes: Math.round(RESPONSE_P50_SECONDS / 60) }),
  )}</p>
<p data-why-line="acceptance">${esc(
    say('why.acceptance', { acceptance: pct(explain.acceptanceRate) }),
  )}</p>
<p data-why-line="cancellation">${esc(
    say('why.cancellation', { cancellation: pct(explain.cancellationScore) }),
  )}</p>
<p data-why-line="availability">${esc(
    say('why.availability', { availability: pct(explain.availabilityFit) }),
  )}</p>
${
  hasVerifiedSurface(sellerStateOf(seller))
    ? ''
    : `<p data-why-line="newcomer">${esc(say('why.newcomer'))}</p>`
}
<p class="money" data-why-score="${explain.score.toFixed(4)}">${esc(
    say('why.score', { score: (explain.score * 100).toFixed(0) }),
  )}</p>
</section>
<p><a href="/t/${esc(market)}/${esc(sellerId)}">${esc(say('why.back'))}</a></p>
</main></body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
