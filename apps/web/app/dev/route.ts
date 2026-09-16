import {
  createDb,
  databaseUrl,
  databaseUrlSource,
  describeDatabaseUrl,
  ledgerService,
  marketsRegistry,
  pendingMigrations,
} from '@sycamore/core';
import { AMBER, darkTheme } from '@sycamore/design';
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
 * DEVELOPER CONSOLE — scaffolding, not product surface.
 *
 * The founder cockpit answers "how is the business doing". This answers
 * a different question, asked on 2026-09-16 while looking at a seller's
 * day on a phone: "how do I know any of this is actually working?"
 *
 * The cockpit cannot answer that, by design — it shows a market's money
 * and its agents, not the deployment's own state. Nothing showed whether
 * the schema was current, which surfaces were reachable, or whether
 * anything was happening at all. So: one page, every moving part, live,
 * refreshing itself.
 *
 * It is scaffolding for the same reason /demo is. Sycamore has no
 * dashboard as a product — Constitution §1, one door, and that door is a
 * chat message. This exists so a DEVELOPER can watch the machine, and it
 * is gated behind the same `SYCAMORE_DEMO_INDEX` flag that hides /demo.
 * Any real deployment sets that to 0 and this route 404s.
 *
 * It is READ-ONLY. It writes nothing, queues nothing, and mutates
 * nothing — a diagnostic that can change the thing it diagnoses is not
 * a diagnostic.
 */
const REFRESH_SECONDS = 10;

interface Surface {
  path: string;
  what: string;
}

function ago(when: Date | string | null | undefined): string {
  if (!when) return '—';
  const then = typeof when === 'string' ? new Date(when) : when;
  const seconds = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

export async function GET(req: Request): Promise<Response> {
  if (!deployDefaults().demoIndex) {
    return new Response('not found', { status: 404 });
  }
  const origin = new URL(req.url).origin;
  const rows: string[] = [];
  const problems: string[] = [];

  // ── The deployment itself ────────────────────────────────────────
  const { onVercel, migrateOnBoot, demoSeedOnBoot } = deployDefaults();
  const env = process.env.VERCEL_ENV ?? (onVercel ? 'vercel' : 'self-hosted');
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown').slice(0, 7);
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? 'unknown';

  // ── Schema ───────────────────────────────────────────────────────
  let schema = 'unreachable';
  let pending: string[] = [];
  try {
    pending = await pendingMigrations(db);
    schema = pending.length === 0 ? 'up to date' : `${pending.length} pending`;
    if (pending.length > 0) problems.push(`schema is behind: ${pending.join(', ')}`);
  } catch (err) {
    problems.push(`database unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }

  rows.push(`<h2>Deployment</h2><section><table>
<tr><td>environment</td><td class="num">${esc(env)}</td></tr>
<tr><td>commit</td><td class="num">${esc(commit)}</td></tr>
<tr><td>branch</td><td class="num">${esc(branch)}</td></tr>
<tr><td>database</td><td class="num">${esc(describeDatabaseUrl())}</td></tr>
<tr><td>url variable</td><td class="num">${esc(databaseUrlSource() ?? 'none set')}</td></tr>
<tr><td>schema</td><td class="num ${pending.length === 0 && schema !== 'unreachable' ? 'ok' : 'bad'}">${esc(schema)}</td></tr>
<tr><td>migrate on boot</td><td class="num">${migrateOnBoot ? 'on' : 'off (serverless)'}</td></tr>
<tr><td>demo seed on boot</td><td class="num">${demoSeedOnBoot ? 'on' : 'off'}</td></tr>
</table></section>`);

  // ── Markets ──────────────────────────────────────────────────────
  try {
    const markets = await db.selectFrom('markets').orderBy('market_id').selectAll().execute();
    const live = markets.filter((m) => m.status === 'live');
    rows.push(
      `<h2>Markets <span class="muted">${live.length} live of ${markets.length}</span></h2><section><table>` +
        markets
          .map(
            (m) =>
              `<tr><td>${esc(m.market_id)} — ${esc(m.name)}</td>` +
              `<td class="num ${m.status === 'live' ? 'ok' : 'muted'}">${esc(m.status)}</td></tr>`,
          )
          .join('') +
        `</table></section>`,
    );
  } catch {
    rows.push('<h2>Markets</h2><section><p class="bad">unreadable</p></section>');
  }

  // ── Money, per live market ───────────────────────────────────────
  try {
    const liveIds = await marketsRegistry(db).listLive();
    const money: string[] = [];
    for (const marketId of liveIds) {
      const ledger = ledgerService(db, marketId);
      const balance = await ledger.trialBalance();
      const level = balance.debits === balance.credits;
      if (!level) problems.push(`${marketId} ledger is out by ${balance.debits - balance.credits}`);
      // `accountBalance` returns debits − credits, so every credit-side
      // account reads NEGATIVE when it holds money. Printing that raw on
      // a page a developer skims invites the opposite conclusion —
      // "platform_fees −975000" looks like a loss and is earnings. Show
      // the natural balance, and say which way round it is.
      const accounts: string[] = [];
      for (const [account, meaning] of [
        ['buyer_escrow', 'held for buyers'],
        ['seller_payable', 'owed to sellers'],
        ['platform_fees', 'platform earned'],
        ['processor_fees', 'processor earned'],
      ] as const) {
        const natural = -(await ledger.accountBalance(account));
        accounts.push(
          `<tr><td>${esc(account)} <span class="muted">${esc(meaning)}</span></td>` +
            `<td class="num">${natural}</td></tr>`,
        );
      }
      money.push(
        `<section><p><strong>${esc(marketId)}</strong> ` +
          `<span class="${level ? 'ok' : 'bad'}">trial balance ${balance.debits} = ${balance.credits}</span></p>` +
          `<table>${accounts.join('')}</table></section>`,
      );
    }
    rows.push(
      `<h2>Money <span class="muted">minor units · credit-side accounts shown as ` +
        `natural balances, not debits−credits</span></h2>${money.join('')}`,
    );
  } catch {
    rows.push('<h2>Money</h2><section><p class="bad">unreadable</p></section>');
  }

  // ── The event bus, which is what "happening right now" means ─────
  try {
    const events = await db
      .selectFrom('events_outbox')
      .orderBy('id', 'desc')
      .limit(15)
      .selectAll()
      .execute();
    const unpublished = await db
      .selectFrom('events_outbox')
      .where('published_at', 'is', null)
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .executeTakeFirst();
    rows.push(
      `<h2>Event bus <span class="muted">newest first · ${esc(unpublished?.n ?? '0')} unpublished</span></h2>` +
        `<section><table>` +
        (events.length === 0
          ? '<tr><td class="muted">nothing has happened yet</td></tr>'
          : events
              .map(
                (e) =>
                  `<tr><td class="num">${esc(e.topic)}</td>` +
                  `<td class="muted">${esc(ago(e.created_at))}</td></tr>`,
              )
              .join('')) +
        `</table></section>`,
    );
  } catch {
    rows.push('<h2>Event bus</h2><section><p class="bad">unreadable</p></section>');
  }

  // ── Row counts: the shape of the data behind every page ──────────
  try {
    const counts: string[] = [];
    for (const table of [
      'sellers',
      'users',
      'orders',
      'capacity_windows',
      'capacity_holds',
      'catalog_items',
      'reviews',
      'ledger_transactions',
      'ledger_entries',
      'agent_incidents',
    ] as const) {
      const row = await db
        .selectFrom(table)
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .executeTakeFirst();
      counts.push(`<tr><td>${esc(table)}</td><td class="num">${esc(row?.n ?? '0')}</td></tr>`);
    }
    rows.push(`<h2>Data</h2><section><table>${counts.join('')}</table></section>`);
  } catch {
    rows.push('<h2>Data</h2><section><p class="bad">unreadable</p></section>');
  }

  // ── Every surface, with a live link to each ──────────────────────
  const surfaces: Surface[] = [
    { path: '/demo', what: 'demo index — every seeded seller' },
    { path: '/cockpit?market=jm', what: 'founder cockpit (P30) — money, agents, fairness' },
    { path: '/s/', what: "installed client entry — the seller's own day" },
    { path: '/manifest.webmanifest', what: 'PWA manifest (P36a)' },
    { path: '/sw.js', what: 'service worker — offline cache (P34/P36)' },
    { path: '/icons/icon-192.png', what: 'install icon' },
  ];
  try {
    const seller = await db
      .selectFrom('sellers')
      .orderBy('completed_orders', 'desc')
      .select(['id', 'market_id', 'business_name'])
      .executeTakeFirst();
    if (seller) {
      const s = `${seller.market_id}/${seller.id}`;
      surfaces.push(
        { path: `/t/${s}`, what: `buyer trust page — ${seller.business_name}` },
        { path: `/why/${s}`, what: 'show-me-why — Constitution §4' },
        { path: `/c/${s}`, what: 'sovereign chat door (P35b)' },
        { path: `/s/${s}`, what: "seller's day" },
        { path: `/s/${s}?offer=1`, what: 'seller’s day with the earned install offer (P36b)' },
        { path: `/s/${s}/day.json`, what: 'the JSON the installed client caches' },
      );
    }
  } catch {
    /* the surfaces list still renders without a seller */
  }
  rows.push(
    `<h2>Every surface</h2><section><table>` +
      surfaces
        .map(
          (s) =>
            `<tr><td><a href="${esc(s.path)}">${esc(s.path)}</a></td>` +
            `<td class="muted">${esc(s.what)}</td></tr>`,
        )
        .join('') +
      `</table></section>`,
  );

  const banner =
    problems.length === 0
      ? `<p class="ok">Everything this page can check is healthy.</p>`
      : `<p class="bad">${problems.length} problem${problems.length === 1 ? '' : 's'}:</p><ul class="bad">` +
        problems.map((p) => `<li>${esc(p)}</li>`).join('') +
        `</ul>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${REFRESH_SECONDS}">
<title>Sycamore — developer console</title>
<style>
${darkTheme()}
a{color:${AMBER}}
table{width:100%}
td:last-child{text-align:right}
ul{margin:6px 0 0 18px;padding:0}
</style>
</head>
<body><main>
<h1>Developer console</h1>
<p class="muted">Scaffolding, not product. Read-only, refreshing every ${REFRESH_SECONDS}s.
Served from <span class="num">${esc(origin)}</span>. Set <span class="num">SYCAMORE_DEMO_INDEX=0</span>
and this route 404s.</p>
${banner}
${rows.join('\n')}
</main></body></html>`;

  return new Response(html, {
    status: problems.length === 0 ? 200 : 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
