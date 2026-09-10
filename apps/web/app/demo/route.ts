import {
  createDb,
  databaseUrl,
  databaseUrlSource,
  DATABASE_URL_NAMES,
  marketsRegistry,
  sellerInstallRate,
} from '@sycamore/core';
import { darkTheme } from '@sycamore/design';
import { deployDefaults } from '../../src/deploy-defaults.js';

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
 * DEMO SCAFFOLDING — not product surface.
 *
 * Sycamore has no directory and no homepage: buyers arrive from a link,
 * sellers arrive from their own link, and building a browsable index
 * would contradict Constitution §1. But somebody evaluating the build on
 * a phone has no link to arrive from, so this hands them the seeded
 * sellers to tap through.
 *
 * It is OFF unless `SYCAMORE_DEMO_INDEX=1` (ON by default only on a
 * Vercel deploy, see deploy-defaults.ts), and it 404s otherwise —
 * deliberately, so it cannot become a de-facto product page by accident.
 */
export async function GET(): Promise<Response> {
  if (!deployDefaults().demoIndex) {
    return new Response('not found', { status: 404 });
  }

  // A deploy whose database is not wired yet should say so in one plain
  // sentence, not in a stack trace. This is the page the founder opens
  // first; "DATABASE_URL is not set" is an instruction, a 500 is a puzzle.
  let live: string[];
  try {
    live = await marketsRegistry(db).listLive();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const source = databaseUrlSource();
    // Names only, never values: which variables this build can see that
    // look like they might be the database. When the secret was pasted
    // under the wrong name or the wrong scope, this is the line that
    // says so — on the phone, without a trip to the Vercel dashboard.
    const lookalikes = Object.keys(process.env)
      .filter((k) => /DATABASE|POSTGRES|SUPABASE|^PG/i.test(k))
      .sort();
    const scope = process.env.VERCEL_ENV ? `Vercel ${process.env.VERCEL_ENV}` : 'this host';
    return new Response(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sycamore — database</title><style>${darkTheme()}</style></head><body><main>` +
        `<h1>Sycamore — not connected yet</h1>` +
        (source
          ? `<p>${esc(source)} is set but the database did not answer.</p><p class="muted">${esc(reason)}</p>`
          : `<p>No database URL is set on this deployment (${esc(scope)}).</p>` +
            `<p class="muted">Accepted names: ${DATABASE_URL_NAMES.map(esc).join(', ')}. ` +
            `Add one in the host's environment variables — on Vercel, ticked for the <strong>Production</strong> environment — and redeploy. ` +
            `Migrations and the demo seed run by themselves on the next boot.</p>` +
            `<p class="muted">Database-looking variables this build can see: ${
              lookalikes.length ? lookalikes.map(esc).join(', ') : 'none'
            }.</p>`) +
        `</main></body></html>`,
      { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }
  const rows: string[] = [];
  for (const market of live) {
    const sellers = await db
      .selectFrom('sellers')
      .where('market_id', '=', market)
      .orderBy('completed_orders', 'desc')
      .selectAll()
      .execute();
    const rate = await sellerInstallRate(db, market);
    rows.push(
      `<h2>${esc(market)} — ${sellers.length} sellers, ${(rate.rate * 100).toFixed(0)}% installed</h2>`,
    );
    for (const s of sellers) {
      const newcomer = s.completed_orders < 10;
      rows.push(`<section>
<p><strong>${esc(s.business_name)}</strong> <span class="muted">${s.completed_orders} completed${newcomer ? ' · newcomer' : ' · verified'}</span></p>
<p><a href="/s/${esc(market)}/${esc(s.id)}?offer=1">Seller's day — install offer</a> <span class="muted">(install this one)</span></p>
<p><a href="/t/${esc(market)}/${esc(s.id)}">Buyer trust page</a> · <a href="/why/${esc(market)}/${esc(s.id)}">show-me-why</a> · <a href="/c/${esc(market)}/${esc(s.id)}">chat door</a></p>
</section>`);
    }
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sycamore — demo index</title>
<style>
${darkTheme()}
a{color:inherit}
</style>
</head>
<body><main>
<h1>Sycamore — demo</h1>
<p class="muted">Seeded data. Install from a seller's day: open it, then use your browser's
&ldquo;Add to home screen&rdquo;. Buyers are never offered an install — only sellers.</p>
${rows.join('\n')}
<h2>Founder</h2>
<section><p><a href="/cockpit?market=jm">Cockpit</a></p></section>
</main></body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
