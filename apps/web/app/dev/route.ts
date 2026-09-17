import {
  createDb,
  databaseUrl,
  databaseUrlSource,
  describeDatabaseUrl,
  ledgerService,
  marketsRegistry,
  sessionsService,
  pendingMigrations,
} from '@sycamore/core';
import { AMBER, darkTheme } from '@sycamore/design';
import { deployDefaults } from '../../src/deploy-defaults.js';
import { demoSurfaces } from '../../src/demo-guard.js';

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
 * is gated behind the same guard that hides /demo: the flag, plus the
 * data itself. It names sellers and links to their pages, so it closes
 * for the whole deployment as soon as one seller here is real rather
 * than seeded — an environment variable is a promise a human has to
 * keep, and the review of 2026-09-16 was right that it should not be the
 * only thing between a stranger and a seller's day.
 *
 * It is READ-ONLY. It writes nothing, queues nothing, and mutates
 * nothing — a diagnostic that can change the thing it diagnoses is not
 * a diagnostic.
 */
const REFRESH_SECONDS = 10;

/**
 * A place you can go, named the way a person would name it.
 *
 * `label` is what you READ; `path` is only ever what the link points at.
 * They used to be the same string, so this page printed raw URLs, seller
 * UUIDs and single-use sign-in tokens as visible text — the founder's
 * words on 2026-09-17: "this creates an unnecessary barrier". A page
 * whose job is to tell you whether the machine is working should not
 * make you read a token to find out.
 */
interface Surface {
  label: string;
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
  const verdict = await demoSurfaces(db);
  // An unreachable database holds no seller to protect and is exactly
  // what this console exists to report, so it falls through; anything
  // else closed is a closed door.
  if (!verdict.open && verdict.why !== 'unreachable') {
    return new Response('not found', { status: 404 });
  }
  const origin = new URL(req.url).origin;
  const rows: string[] = [];
  const problems: string[] = [];

  // ── The deployment itself ────────────────────────────────────────
  const { onVercel } = deployDefaults();
  const env = process.env.VERCEL_ENV ?? (onVercel ? 'vercel' : 'self-hosted');
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown').slice(0, 7);

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

  // PLAIN WORDS, AND THE CONNECTION STRING ONLY WHEN IT IS BROKEN.
  //
  // This table used to print the database host, the variable it came
  // from, and two words of deployment jargon on every load. When the
  // database is answering, none of that tells you anything you can act
  // on — and the founder was right on 2026-09-17 that reading it is a
  // barrier, not information. It appears when it is the ANSWER to a
  // problem, and stays out of the way when it is not.
  const healthy = pending.length === 0 && schema !== 'unreachable';
  rows.push(
    `<h2>This deployment</h2><section><table>
<tr><td>Database</td><td class="num ${healthy ? 'ok' : 'bad'}">${esc(
      schema === 'unreachable' ? 'not answering' : healthy ? 'ready' : schema,
    )}</td></tr>
<tr><td>Build</td><td class="num">${esc(commit)} <span class="muted">${esc(env)}</span></td></tr>
${
  healthy
    ? ''
    : `<tr><td>Connecting to</td><td class="num">${esc(describeDatabaseUrl())}</td></tr>` +
      `<tr><td>From variable</td><td class="num">${esc(databaseUrlSource() ?? 'none set')}</td></tr>`
}
</table></section>`,
  );

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
          `<span class="${level ? 'ok' : 'bad'}">${level ? 'books balance' : `OUT BY ${balance.debits - balance.credits}`}</span></p>` +
          `<table>${accounts.join('')}</table></section>`,
      );
    }
    rows.push(`<h2>Money</h2>${money.join('')}`);
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
      `<h2>What just happened <span class="muted">${esc(unpublished?.n ?? '0')} waiting to send</span></h2>` +
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
    rows.push(`<h2>How much there is</h2><section><table>${counts.join('')}</table></section>`);
  } catch {
    rows.push('<h2>How much there is</h2><section><p class="bad">unreadable</p></section>');
  }

  // ── Every surface, with a live link to each ──────────────────────
  const surfaces: Surface[] = [
    { label: 'Demo index', path: '/demo', what: 'every seeded seller' },
    { label: 'Cockpit', path: '/cockpit?market=jm', what: 'money, agents, fairness' },
    {
      label: 'Installed client',
      path: '/s/',
      what: "opens whichever seller's day this phone holds",
    },
    { label: 'App manifest', path: '/manifest.webmanifest', what: 'what makes it installable' },
    { label: 'Service worker', path: '/sw.js', what: 'the offline cache' },
    { label: 'App icon', path: '/icons/icon-192.png', what: 'shown on the home screen' },
  ];
  try {
    const seller = await db
      .selectFrom('sellers')
      .orderBy('completed_orders', 'desc')
      .select(['id', 'market_id', 'business_name', 'user_id'])
      .executeTakeFirst();
    if (seller) {
      const s = `${seller.market_id}/${seller.id}`;
      const name = seller.business_name;
      // The seller's day needs a session (C01). The link is still a
      // single-use one — that rule has not moved — but it is BEHIND the
      // words "Open their day", not printed as a token to squint at.
      try {
        const link = await sessionsService(db, seller.market_id).signInUrlFor({
          userId: seller.user_id,
          appOrigin: origin,
        });
        surfaces.push({
          label: `Open ${name}'s day`,
          path: link.url.replace(origin, ''),
          what: 'signs this device in as that seller',
        });
      } catch {
        /* the public surfaces still list */
      }
      surfaces.push(
        { label: `${name} — trust page`, path: `/t/${s}`, what: 'what a buyer sees' },
        { label: `${name} — show me why`, path: `/why/${s}`, what: 'how the ranking was decided' },
        { label: `${name} — chat door`, path: `/c/${s}`, what: 'booking without WhatsApp' },
        {
          label: `${name} — install offer`,
          path: `/s/${s}?offer=1`,
          what: 'their day, with the earned offer showing',
        },
      );
    }
  } catch {
    /* the surfaces list still renders without a seller */
  }
  rows.push(
    `<h2>Go and look</h2><section><table>` +
      surfaces
        .map(
          (s) =>
            `<tr><td><a href="${esc(s.path)}">${esc(s.label)}</a></td>` +
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
<h1>Is it working?</h1>
<p class="muted">Refreshes itself every ${REFRESH_SECONDS} seconds. Reads only — nothing on this
page changes anything.</p>
${banner}
${rows.join('\n')}
</main></body></html>`;

  return new Response(html, {
    status: problems.length === 0 ? 200 : 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
