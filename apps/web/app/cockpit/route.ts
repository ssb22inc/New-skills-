import { chairmanService, createDb, databaseUrl } from '@sycamore/core';

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
 */
export async function GET(req: Request): Promise<Response> {
  const marketId = new URL(req.url).searchParams.get('market') ?? 'jm';
  const chairman = chairmanService(db, marketId);
  const cards = await chairman.reportCards();

  const incidents = await db
    .selectFrom('agent_incidents')
    .where('market_id', '=', marketId)
    .orderBy('created_at', 'desc')
    .limit(10)
    .selectAll()
    .execute();
  const radar = await db
    .selectFrom('radar_items')
    .where('market_id', '=', marketId)
    .where('status', '=', 'cleared')
    .orderBy('pain_score', 'desc')
    .limit(5)
    .selectAll()
    .execute();

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sycamore cockpit — ${esc(marketId)}</title>
<style>
body{margin:0;background:#0B1A26;color:#F7F3EC;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
main{max-width:640px;margin:0 auto;padding:16px}
h1{font-size:22px}h2{font-size:15px;color:#9FB3C0;text-transform:uppercase;letter-spacing:.06em}
section{background:#12283A;border-radius:12px;padding:14px;margin-bottom:12px}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:4px 8px;font-size:14px}
.ok{color:#7BD8A8}.warn{color:#F4A24C}.bad{color:#F26D6D}
</style>
</head>
<body><main>
<h1>Sycamore cockpit — ${esc(marketId)}</h1>
<section data-panel="report-cards">
<h2>Agent report cards</h2>
<table>
<tr><th>Agent</th><th>Record</th></tr>
<tr><td>Watchman</td><td>${cards.watchman.incidentsOpened} incidents opened</td></tr>
<tr><td>Fixer</td><td class="${cards.fixer.escalated > 0 ? 'warn' : 'ok'}">${cards.fixer.healed} healed · ${cards.fixer.escalated} escalated · ${cards.fixer.actionsExecuted} runbook actions</td></tr>
<tr><td>Builder</td><td>${cards.builder.shipped} shipped · ${cards.builder.stopped} stopped at a gate</td></tr>
</table>
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
            `<p data-radar="${r.id}">${esc(r.lane)} — pain ${r.pain_score}, est. ${Number(r.revenue_estimate_minor ?? 0)} minor/mo</p>`,
        )
        .join('\n')
}
</section>
</main></body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
