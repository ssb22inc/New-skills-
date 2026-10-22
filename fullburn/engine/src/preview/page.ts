/** THE PRIVATE PREVIEW PAGE — pure HTML from data baked in at publish time
 * (engine/scripts/preview-lib.mjs builds the data). No script, no image, no
 * outside request: the Content-Security-Policy the Worker sends forbids all
 * three, so this file cannot make an AI call or reach a service even by
 * mistake. Every value from a report is escaped. The client mock-up is SAMPLE
 * DATA, labelled as such on the page — nothing in it is a real client, ad or
 * number. */

export interface LiveRow {
  readonly id: string;
  readonly name: string;
  readonly status: "PASS" | "FAIL";
  readonly observed: string;
}

export interface PreviewData {
  readonly builtAt: string;
  readonly commit: string;
  readonly phase: number;
  readonly phases: readonly string[];
  readonly live: { readonly verdict: "PASS" | "FAIL"; readonly tree: string; readonly started: string | null; readonly file: string; readonly attested: boolean; readonly rows: readonly LiveRow[] } | null;
  readonly done: { readonly tree: string | null; readonly started: string | null; readonly headline: string; readonly file: string; readonly conditions: readonly { readonly id: string; readonly title: string; readonly status: "PASS" | "FAIL" }[] } | null;
  readonly left: readonly { readonly who: string; readonly what: string }[];
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const badge = (status: string) => `<span class="badge ${status === "PASS" ? "pass" : "fail"}">${status === "PASS" ? "Pass" : "Fail"}</span>`;

const WHAT_IT_DOES: readonly [string, string][] = [
  ["Paste a website", "Fullburn reads the business — what it sells, who buys, what customers say — and writes a plain brief and audit before any money is spent."],
  ["Research", "It studies real customer reviews and what competitors are running, so ads are built on what buyers actually care about."],
  ["Make the ads", "It produces finished batches of ad creative. A checker blocks any claim the business cannot back up."],
  ["Launch small, judge on real sales", "Ads go live at floor budgets. Weak ads are switched off early; an ad is only scaled up when the client's own sales data proves it made money."],
  ["Stay inside the limits", "Hard spending caps sit in the code and in Cloudflare. They cannot be raised by the software — only by a person."],
  ["Report honestly", "A daily digest and a monthly report, with every number re-checked against the client's own data and the uncertainty stated plainly."],
  ["The client stays in charge", "One approve button, one big red button that stops all spend in under a minute, and a chat to ask why. The data lives in the client's own accounts."],
];

function liveSection(d: PreviewData): string {
  if (!d.live) return `<p>No live check has been recorded yet.</p>`;
  const passed = d.live.rows.filter((r) => r.status === "PASS").length;
  const rows = d.live.rows
    .map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${badge(r.status)}</td><td class="muted small">${escapeHtml(r.observed)}</td></tr>`)
    .join("");
  return `<p><strong>${passed} of ${d.live.rows.length} passed</strong>${d.live.started ? ` · run ${escapeHtml(d.live.started.slice(0, 16).replace("T", " "))} UTC` : ""} · ${d.live.attested ? "signature verified (GitHub artifact attestation from main)" : "<span class=\"warn\">signature NOT verified</span>"}</p>
<p class="muted small">These are real calls to the real services with the keys in the <code>fullburn</code> GitHub environment. Report: <code>${escapeHtml(d.live.file)}</code></p>
<div class="scroll"><table><thead><tr><th>Check</th><th>Result</th><th>What was seen</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function doneSection(d: PreviewData): string {
  if (!d.done) return "";
  const rows = d.done.conditions.map((c) => `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.title)}</td><td>${badge(c.status)}</td></tr>`).join("");
  return `<h3>The completion check</h3>
<p class="muted small">Fullburn is only "done" when an automatic checker says so — never when someone claims it. Latest run: <strong>${escapeHtml(d.done.headline)}</strong>${d.done.started ? `, ${escapeHtml(d.done.started.slice(0, 10))}` : ""} (<code>${escapeHtml(d.done.file)}</code>).</p>
<div class="scroll"><table><thead><tr><th>#</th><th>Condition</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function mockup(): string {
  return `<div class="sample-banner">SAMPLE DATA — an invented business. Not a real client, ad or number.</div>
<div class="mock">
  <div class="mock-head"><strong>Good morning, Maple &amp; Moss Candles</strong><span class="muted small">Daily digest · sample</span></div>
  <div class="tiles">
    <div class="tile"><div class="muted small">Spent yesterday</div><div class="big">$84</div><div class="muted small">cap $120/day</div></div>
    <div class="tile"><div class="muted small">Sales from ads (your Shopify)</div><div class="big">$312</div><div class="muted small">range $240–$390</div></div>
    <div class="tile"><div class="muted small">Ads running</div><div class="big">9</div><div class="muted small">2 switched off</div></div>
  </div>
  <ul class="feed">
    <li><span class="badge pass">Scaled</span> "Burns 60 hours" video — 6 verified sales. Budget raised from $10 to $15/day.</li>
    <li><span class="badge fail">Switched off</span> "Gift bundle" image — 1,900 views, no clicks worth keeping.</li>
    <li><span class="badge neutral">Waiting</span> 3 new ads are in their 3-day learning window — no verdict until it closes.</li>
  </ul>
  <div class="approve">
    <div><strong>Needs your OK:</strong> launch 4 new autumn ads (claims checked against your product pages).</div>
    <button type="button" disabled>Approve</button>
  </div>
  <div class="mock-foot">
    <button type="button" class="red" disabled>Stop all spending</button>
    <div class="chat"><span class="muted small">Ask Fullburn:</span> "Why was the gift bundle ad switched off?"</div>
  </div>
</div>
<p class="muted small">The buttons are not wired to anything — this is a picture of the screen, not the screen.</p>`;
}

export function renderPage(d: PreviewData): string {
  const stages = d.phases
    .map((p, i) => `<li class="${i < d.phase ? "past" : i === d.phase ? "now" : "next"}"><span class="step">${i}</span><span>${escapeHtml(p)}${i === d.phase ? ' <span class="badge now">We are here</span>' : ""}</span></li>`)
    .join("");
  const what = WHAT_IT_DOES.map(([h, t]) => `<div class="card"><h3>${escapeHtml(h)}</h3><p>${escapeHtml(t)}</p></div>`).join("");
  const left = d.left.map((l) => `<li><span class="who">${escapeHtml(l.who)}</span> ${escapeHtml(l.what)}</li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Fullburn Private Preview</title>
<style>
:root{--bg:#f7f7f5;--fg:#1c1c1a;--muted:#6b6b66;--card:#fff;--line:#e3e3de;--pass:#1d7a46;--passbg:#e3f3ea;--fail:#b3261e;--failbg:#fbe7e5;--accent:#c2410c;--accentbg:#fdeee4;--neutral:#55606e;--neutralbg:#eceef1}
@media (prefers-color-scheme: dark){:root{--bg:#141413;--fg:#ecece8;--muted:#a3a39c;--card:#1e1e1c;--line:#33332f;--pass:#6fd39b;--passbg:#173524;--fail:#ff8a80;--failbg:#3d1b18;--accent:#fb923c;--accentbg:#3a2213;--neutral:#b3bcc8;--neutralbg:#262a30}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px 64px}h1{font-size:2rem;margin:.2em 0}h2{margin-top:2.2em;font-size:1.35rem;border-bottom:1px solid var(--line);padding-bottom:.3em}h3{font-size:1.02rem;margin:.2em 0 .3em}
.muted{color:var(--muted)}.small{font-size:.86rem}code{font-size:.85em;word-break:break-all}.warn{color:var(--fail);font-weight:600}
.private{display:inline-block;background:var(--accentbg);color:var(--accent);border-radius:999px;padding:2px 10px;font-size:.8rem;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}.card p{margin:0}
.stages{list-style:none;padding:0;margin:0}.stages li{display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)}.step{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:700;background:var(--neutralbg);color:var(--neutral)}.stages li.now .step{background:var(--accent);color:#fff}.stages li.next{color:var(--muted)}
.badge{display:inline-block;border-radius:6px;padding:1px 8px;font-size:.78rem;font-weight:700;white-space:nowrap}.pass{background:var(--passbg);color:var(--pass)}.fail{background:var(--failbg);color:var(--fail)}.now{background:var(--accentbg);color:var(--accent)}.neutral{background:var(--neutralbg);color:var(--neutral)}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:10px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:.82rem;color:var(--muted);font-weight:600}
.left{list-style:none;padding:0}.left li{display:flex;gap:12px;margin:.5em 0}.who{flex:none;width:96px;font-weight:700;color:var(--accent)}
.sample-banner{background:repeating-linear-gradient(45deg,var(--accentbg),var(--accentbg) 10px,var(--card) 10px,var(--card) 20px);border:2px dashed var(--accent);color:var(--accent);font-weight:800;text-align:center;padding:8px;border-radius:10px 10px 0 0;letter-spacing:.03em}
.mock{border:2px dashed var(--accent);border-top:0;border-radius:0 0 10px 10px;background:var(--card);padding:16px}.mock-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.tile{border:1px solid var(--line);border-radius:8px;padding:10px}.big{font-size:1.6rem;font-weight:700}
.feed{list-style:none;padding:0;margin:14px 0}.feed li{padding:8px 0;border-bottom:1px solid var(--line)}
.approve{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--neutralbg);border-radius:8px;padding:10px 12px}
button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:8px 18px;background:var(--pass);color:#fff;opacity:.9}button.red{background:var(--fail)}
.mock-foot{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px}.chat{flex:1;min-width:200px;border:1px solid var(--line);border-radius:999px;padding:6px 14px}
footer{margin-top:3em}
</style>
</head>
<body>
<main>
<span class="private">Private preview — only you can see this</span>
<h1>Fullburn</h1>
<p>A virtual marketing employee for small businesses. You give it a website; it researches, makes the ads, launches them small, switches off what doesn't sell, grows what does, and tells you the truth about the results — inside spending limits it cannot raise on its own.</p>

<h2>What Fullburn will do for a client</h2>
<div class="grid">${what}</div>

<h2>Where we are</h2>
<p>We are building <strong>Stage ${d.phase}</strong> of ${d.phases.length}. Each stage must pass the automatic checks and the independent AI reviewer before the next one starts.</p>
<ol class="stages">${stages}</ol>

<h2>Latest live check</h2>
${liveSection(d)}
${doneSection(d)}

<h2>What's left before launch</h2>
<ul class="left">${left}</ul>

<h2>What a client will see</h2>
${mockup()}

<footer class="muted small">Built ${escapeHtml(d.builtAt.slice(0, 16).replace("T", " "))} UTC from commit <code>${escapeHtml(d.commit.slice(0, 12))}</code>. This page is static: it makes no AI calls and reads no live service when you open it.</footer>
</main>
</body>
</html>`;
}
