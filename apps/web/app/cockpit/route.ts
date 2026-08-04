import {
  chairmanService,
  createDb,
  databaseUrl,
  fairnessMeter,
  listenerService,
  marketMoney,
  sellerInstallRate,
} from '@sycamore/core';
import { formatAmount, loadContextPack } from '@sycamore/packs';
import { darkTheme } from '@sycamore/design';

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
 * P30 — the founder cockpit (Keeper UI): the whole business readable in
 * five minutes on a Monday. Pure HTML like the trust page — the founder
 * is on the same phones our sellers are. Hardening (SSO + hardware key)
 * is a Phase-7 trigger item, on record in BUILD_STATUS.md.
 *
 * Every one of the EIGHT agents reports here, and every number behind a
 * report card is a row in a table or the outbox — never a figure
 * computed for display. Money is plain numbers, per Constitution §3, and
 * the fairness meter is on the page because a promise nobody can see is
 * a promise nobody keeps.
 *
 * This page is founder-facing operational instrumentation: agent names,
 * vitals and lane ids are the founder's working vocabulary and stay in
 * English by design. Seller- and buyer-facing surfaces localize.
 */
export async function GET(req: Request): Promise<Response> {
  const marketId = new URL(req.url).searchParams.get('market') ?? 'jm';
  const pack = loadContextPack(marketId);
  const chairman = chairmanService(db, marketId, pack);
  const cards = await chairman.reportCards();
  const patterns = await listenerService(db, marketId).minePatterns();

  const incidents = await db
    .selectFrom('agent_incidents')
    .where('market_id', '=', marketId)
    .orderBy('created_at', 'desc')
    .limit(10)
    .selectAll()
    .execute();
  // P36d — survivability, not vanity: how much of this market can still
  // be reached through a door we own.
  const install = await sellerInstallRate(db, marketId);
  const fairness = await fairnessMeter(db, marketId);
  const money = await marketMoney(db, marketId);
  const radar = await db
    .selectFrom('radar_items')
    .where('market_id', '=', marketId)
    .where('status', '=', 'cleared')
    .orderBy('pain_score', 'desc')
    .limit(5)
    .selectAll()
    .execute();

  const pct = (n: number): string => (n * 100).toFixed(0);
  /** "1 review", not "1 reviews" — the founder reads this every Monday. */
  const plural = (n: number, one: string, many = `${one}s`): string =>
    `${n} ${n === 1 ? one : many}`;
  const cash = (n: number): string => formatAmount(pack, n);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sycamore cockpit — ${esc(marketId)}</title>
<style>
${darkTheme()}
</style>
</head>
<body><main>
<h1>Sycamore cockpit — ${esc(marketId)}</h1>

<section data-panel="money">
<h2>Money</h2>
<table>
<tr><td>Buyers paid in</td><td class="num money" data-money="captured">${esc(cash(money.capturedMinor))}</td></tr>
<tr><td>Refunded</td><td class="num money" data-money="refunded">${esc(cash(money.refundedMinor))}</td></tr>
<tr><td>Paid out to sellers</td><td class="num money" data-money="paid-out">${esc(cash(money.paidOutMinor))}</td></tr>
<tr><td>Sycamore kept</td><td class="num money" data-money="fees">${esc(cash(money.feesMinor))}</td></tr>
</table>
</section>

<section data-panel="fairness">
<h2>Fairness meter</h2>
<p data-fairness="${pct(fairness.newcomerShare)}">${pct(fairness.newcomerShare)}% of first-time bookings went to a newcomer — ${fairness.newcomerSellers} of ${fairness.sellers} sellers are still building their record.</p>
<p class="muted">Exposure floor: newcomers get audition slots, always badged, never the top slot.</p>
</section>

<section data-panel="install-rate">
<h2>Seller install rate</h2>
<p data-install-rate="${pct(install.rate)}">${install.installed} of ${install.active} active sellers reachable through our own door — <strong>${pct(install.rate)}%</strong></p>
<p class="muted">Watched, never chased: sellers are offered the install at most twice, ever.</p>
</section>

<section data-panel="report-cards">
<h2>Agent report cards</h2>
<table>
<tr><th>Agent</th><th>Record</th></tr>
<tr data-agent="watchman"><td>Watchman</td><td>${plural(cards.watchman.incidentsOpened, 'incident')} opened</td></tr>
<tr data-agent="fixer"><td>Fixer</td><td class="${cards.fixer.escalated > 0 ? 'warn' : 'ok'}">${cards.fixer.healed} healed · ${cards.fixer.escalated} escalated · ${cards.fixer.actionsExecuted} runbook actions</td></tr>
<tr data-agent="listener"><td>Listener</td><td>${plural(cards.listener.surveysSent, 'survey')} · ${cards.listener.thumbsUp} 👍 · ${cards.listener.thumbsDown} 👎</td></tr>
<tr data-agent="scout"><td>Scout</td><td>${cards.scout.cleared} cleared · ${cards.scout.parked} parked</td></tr>
<tr data-agent="mentor"><td>Mentor</td><td>${plural(cards.mentor.messagesSent, 'weekly message')} sent</td></tr>
<tr data-agent="builder"><td>Builder</td><td>${cards.builder.shipped} shipped · ${cards.builder.stopped} stopped at a gate</td></tr>
<tr data-agent="bursar"><td>Bursar</td><td class="${cards.bursar.blockedOnDpa > 0 ? 'ok' : ''}">${plural(cards.bursar.reviews, 'review')} · ${plural(cards.bursar.proposed, 'swap')} proposed · ${cards.bursar.blockedOnDpa} blocked on DPA</td></tr>
<tr data-agent="herald"><td>Herald</td><td>${plural(cards.herald.pilots, 'pilot')} · best lift ${(cards.herald.bestLift * 100).toFixed(1)}%</td></tr>
<tr data-agent="chairman"><td>Chairman</td><td>Memo below · zero spend authority</td></tr>
</table>
</section>

<section data-panel="complaints">
<h2>Listener — what people are unhappy about</h2>
${
  patterns.length === 0
    ? '<p class="ok">Nothing recurring this month.</p>'
    : patterns
        .map(
          (p) =>
            `<p data-complaint-lane="${esc(p.lane)}">${esc(p.lane)} — <span class="num">${p.count}</span></p>`,
        )
        .join('\n')
}
</section>

<section data-panel="incidents">
<h2>Incidents</h2>
${
  incidents.length === 0
    ? '<p class="ok">Quiet. Nothing on the board.</p>'
    : incidents
        .map(
          (i) =>
            `<p data-incident="${i.id}" class="${i.status === 'escalated' ? 'bad' : i.status === 'open' ? 'warn' : 'ok'}">${esc(i.vital)} ${esc(i.direction)} — ${esc(i.status)}${i.runbook_id ? ` (runbook ${esc(i.runbook_id)})` : ''}</p>`,
        )
        .join('\n')
}
</section>

<section data-panel="radar">
<h2>Scout radar (cleared)</h2>
${
  radar.length === 0
    ? '<p>Nothing cleared this week.</p>'
    : radar
        .map(
          (r) =>
            `<p data-radar="${r.id}">${esc(r.lane)} — pain <span class="num">${r.pain_score}</span>, est. <span class="num money">${esc(cash(Number(r.revenue_estimate_minor ?? 0)))}</span>/mo</p>`,
        )
        .join('\n')
}
</section>
</main></body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
