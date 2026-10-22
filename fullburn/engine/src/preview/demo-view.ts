/** THE CLICKABLE DEMO'S SCREENS — ENGINE_BUILD.md §8: Connect, the daily
 * digest with one approve button, the big red button, chat, and the monthly
 * counterfactual report. Rendered on the Worker from the simulated state
 * (demo-engine.ts); every value is escaped. The browser script only sends
 * clicks and swaps in the HTML that comes back. */
import { escapeHtml as e } from "./page.ts";
import {
  APPROVAL_DAYS,
  counterfactual,
  dailyBudget,
  launchBlockers,
  PROTECTION_DAYS,
  SAMPLE_CAP_USD,
  SAMPLE_PRICE_USD,
  totals,
  type Ad,
  type DemoState,
} from "./demo-engine.ts";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const btn = (act: string, label: string, cls = "", arg = "") => `<button type="button" class="${cls}" data-act="${e(act)}"${arg ? ` data-arg="${e(arg)}"` : ""}>${e(label)}</button>`;
const STATUS: Record<Ad["status"], [string, string]> = { testing: ["Testing", "neutral"], winner: ["Winner", "pass"], killed: ["Switched off", "fail"], retired: ["Retired", "fail"] };

function header(s: DemoState): string {
  const tabs: [DemoState["tab"], string][] = [["connect", "Connect"], ["today", "Today"], ["chat", "Chat"], ["report", "Monthly report"]];
  return `<div class="demo-banner">DEMO — simulated engine on sample data. No real ads, accounts, money or AI.</div>
<header class="bar">
  <div><strong>Fullburn</strong> <span class="muted small">${s.site ? e(s.site.name) : "new client"} · day ${s.day}</span></div>
  ${s.halted ? btn("resume", "Turn spending back on", "go") : btn("halt", "Stop all spending", "red")}
</header>
${s.halted ? `<div class="halted">All spending is stopped. No ad is running and no money is being spent.</div>` : ""}
<nav class="tabs">${tabs.map(([t, l]) => `<button type="button" class="tab${s.tab === t ? " on" : ""}" data-act="tab" data-arg="${t}">${l}</button>`).join("")}</nav>`;
}

function connect(s: DemoState): string {
  const f = s.site?.facts ?? null;
  const live = (v: string | boolean | undefined, sample: string) => (f ? `${e(String(v || "—"))} <span class="tag live">from your site</span>` : `${e(sample)} <span class="tag">sample</span>`);
  const step = (n: number, done: boolean, title: string, body: string) => `<section class="step${done ? " done" : ""}"><h3><span class="num">${done ? "✓" : n}</span>${e(title)}</h3>${body}</section>`;
  const brief = s.site
    ? `<dl class="brief">
<dt>Business</dt><dd>${e(s.site.name)} <span class="muted small">(${e(s.site.url)})</span></dd>
<dt>Page title</dt><dd>${live(f?.title, `${s.site.name} — handmade goods`)}</dd>
<dt>What's sold</dt><dd>${live(f?.description, "Handmade products sold online")}</dd>
<dt>Built on</dt><dd>${live(f?.stack.join(", ") || "nothing detected", "Shopify")}</dd>
<dt>Typical order</dt><dd>${e(usd(SAMPLE_PRICE_USD))} <span class="tag">sample</span></dd>
<dt>Who buys</dt><dd>Gift buyers and repeat customers, 25–45 <span class="tag">sample</span></dd>
</dl>
<h4>Checks before any money moves</h4>
<ul class="checks">
<li>${f ? (f.hasPrices ? "✓" : "✗") : "✓"} Prices are visible on the site ${f ? '<span class="tag live">checked live</span>' : '<span class="tag">sample</span>'}</li>
<li>${f ? (f.hasPolicyLinks ? "✓" : "✗") : "✓"} Refund and privacy pages exist ${f ? '<span class="tag live">checked live</span>' : '<span class="tag">sample</span>'}</li>
<li>✓ Checkout completes end to end <span class="tag">simulated</span></li>
<li>✓ Nothing in this business breaks Facebook's ad rules <span class="tag">simulated</span></li>
<li>! The site says "ships in 2 days" but 4 reviews mention slow shipping — that claim is kept out of every ad <span class="tag">sample</span></li>
</ul>
${s.briefConfirmed ? "" : btn("confirmBrief", "Looks right — confirm", "go")}`
    : "";
  const svc = (k: keyof DemoState["connections"], label: string, need: string) =>
    `<div class="svc"><div><strong>${e(label)}</strong><div class="muted small">${e(need)}</div></div>${s.connections[k] ? '<span class="badge pass">Connected</span>' : btn("connect", "Connect", "", k)}</div>`;
  const blockers = launchBlockers(s);
  return `${step(1, Boolean(s.site && s.briefConfirmed), "Paste your website", `<form data-act="intake" class="row"><input name="q" placeholder="yourshop.com" value="${e(s.site?.url ?? "")}" ${s.launched ? "disabled" : ""} autocomplete="off"><button type="submit" ${s.launched ? "disabled" : ""}>Read my site</button></form><p class="muted small">Fullburn reads your public page right now (title, description, what it's built on). Everything else in the brief is sample text until the real reader ships.</p>${brief}`)}
${step(2, s.connections.meta && s.connections.shop, "Connect your accounts", `<div class="svcs">${svc("meta", "Facebook & Instagram ads", "Required — where ads run. Fullburn can only publish, pause and promote.")}${svc("shop", "Shopify or Stripe", "Required — your real sales, the only thing that earns an ad more budget.")}${svc("analytics", "Google Analytics or PostHog", "Optional — site behaviour.")}${svc("email", "Email", "Optional — for the daily digest.")}<div class="svc locked"><div><strong>Google Ads</strong><div class="muted small">Locked — turns on only after Facebook beats your baseline.</div></div><span class="badge neutral">Locked</span></div></div>`)}
${step(3, s.testPurchase, "Prove sales tracking works", `<p>One test purchase must show up in your data before any ad can launch.</p>${s.testPurchase ? "" : btn("testPurchase", "Send a test purchase")}`)}
${step(4, s.launched, "Launch", s.launched ? `<p>Running since day ${s.days.length ? s.days[0]!.day - 1 : s.day}. See <strong>Today</strong>.</p>` : `${blockers.length ? `<p class="muted">Still to do: ${e(blockers.join("; "))}.</p>` : `<p>Ready. The first 10 ads will wait for your OK.</p>`}${btn("launch", "Get my first ads ready", blockers.length ? "dim" : "go")}`)}`;
}

function adsTable(s: DemoState): string {
  if (s.ads.length === 0) return `<p class="muted">No ads have run yet.</p>`;
  const order: Ad["status"][] = ["winner", "testing", "retired", "killed"];
  const rows = [...s.ads]
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.sales - a.sales)
    .map((a) => {
      const [label, cls] = STATUS[a.status];
      const prot = a.status === "testing" && s.day - a.born < PROTECTION_DAYS ? ` <span class="tag">protected ${PROTECTION_DAYS - (s.day - a.born)}d</span>` : "";
      return `<tr><td>${e(a.name)}${a.exploration ? ' <span class="tag">new idea</span>' : ""}</td><td><span class="badge ${cls}">${label}</span>${prot}</td><td>${a.budget ? usd(a.budget) + "/day" : "—"}</td><td>${usd(a.spend)}</td><td>${a.impressions ? pct(a.clicks / a.impressions) : "—"}</td><td>${a.sales}</td><td class="muted small">${e(a.reason)}</td></tr>`;
    })
    .join("");
  return `<div class="scroll"><table><thead><tr><th>Ad</th><th>Status</th><th>Budget</th><th>Spent</th><th>Click-through</th><th>Verified sales</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function today(s: DemoState): string {
  if (!s.launched) return `<section class="step"><p>Nothing is running yet. Finish the steps on <strong>Connect</strong> first.</p>${btn("tab", "Go to Connect", "go", "connect")}</section>`;
  const y = s.days[s.days.length - 1];
  const running = s.ads.filter((a) => a.status === "testing" || a.status === "winner").length;
  const approval = s.batch
    ? `<div class="approve"><div><strong>${s.trust === "veto" ? "Launching tomorrow unless you veto:" : "Needs your OK:"}</strong> ${s.batch.names.length} new ads — ${e(s.batch.names.slice(0, 3).join(", "))}${s.batch.names.length > 3 ? ", …" : ""} (every claim checked against your site)</div>${s.trust === "veto" ? btn("veto", "Veto", "red") : btn("approve", "Approve", "go")}</div>`
    : `<div class="approve muted">Nothing waiting for you. A new batch comes every ${PROTECTION_DAYS} days.</div>`;
  return `<div class="tiles">
<div class="tile"><div class="muted small">Spent ${y ? "yesterday" : "so far"}</div><div class="big">${usd(y?.spend ?? 0)}</div><div class="muted small">cap ${usd(SAMPLE_CAP_USD)}/day · planned today ${usd(s.halted ? 0 : dailyBudget(s))}</div></div>
<div class="tile"><div class="muted small">Sales from ads (your store)</div><div class="big">${usd(y?.verified ?? 0)}</div><div class="muted small">${y?.sales ?? 0} orders · Facebook claims ${usd(y?.reported ?? 0)}</div></div>
<div class="tile"><div class="muted small">Ads running</div><div class="big">${s.halted ? 0 : running}</div><div class="muted small">${s.ads.filter((a) => a.status === "killed" || a.status === "retired").length} switched off so far</div></div>
</div>
${approval}
<div class="row wrap">
  <span class="muted small">Demo clock:</span>${btn("advance", "Next day", "", "1")}${btn("advance", "+3 days", "", "3")}${btn("advance", "+7 days", "", "7")}
</div>
<h3>What happened${y ? ` on day ${y.day}` : ""}</h3>
${y && y.events.length ? `<ul class="feed">${y.events.map((x) => `<li>${e(x)}</li>`).join("")}</ul>` : `<p class="muted">${y ? "Nothing needed changing." : "Approve the batch, then move the demo clock forward."}</p>`}
<h3>Your ads</h3>
${adsTable(s)}
<h3>Safety</h3>
<div class="svcs">
<div class="svc"><div><strong>Daily spending cap: ${usd(SAMPLE_CAP_USD)}</strong><div class="muted small">Fixed in code. Fullburn can never raise it.</div></div>${btn("raiseCap", "Raise the cap")}</div>
<div class="svc"><div><strong>Autonomy: ${s.trust === "veto" ? "auto-launch with a one-day veto" : "you approve every launch"}</strong><div class="muted small">${s.trust === "veto" ? "Earned after the first two weeks." : `Required for the first ${APPROVAL_DAYS} days (now day ${s.day}).`}</div></div>${s.trust === "veto" ? '<span class="badge pass">Step 3 of 4</span>' : btn("trustUp", "Move up one step")}</div>
</div>`;
}

function chat(s: DemoState): string {
  const ideas = ["Why was an ad switched off?", "What's working best?", "How much have I spent?", "What's my cap?", "How do I stop everything?"];
  return `<div class="chatlog">${s.chat.length ? s.chat.map((c) => `<div class="q">${e(c.q)}</div><div class="a">${e(c.a)}</div>`).join("") : '<p class="muted">Ask about your ads, spend or results.</p>'}</div>
<form data-act="ask" class="row"><input name="q" placeholder="Ask Fullburn…" autocomplete="off" maxlength="300"><button type="submit">Ask</button></form>
<div class="row wrap">${ideas.map((i) => `<button type="button" class="chip" data-act="ask" data-arg="${e(i)}">${e(i)}</button>`).join("")}</div>
<p class="muted small">Demo answers are worked out from this demo's numbers by fixed rules — no AI is called. The real chat answers any question from your own data, with sources.</p>`;
}

function report(s: DemoState): string {
  const t = totals(s);
  const cf = counterfactual(s);
  if (s.days.length === 0) return `<p class="muted">The monthly report fills in once ads have run. Launch, then move the demo clock forward.</p>`;
  const incremental = Math.round(t.verified * 0.7);
  const max = Math.max(1, ...s.days.map((d) => Math.max(d.spend, d.verified)));
  const bars = s.days.slice(-30).map((d) => `<div class="barday" title="day ${d.day}"><div class="b spend" style="height:${Math.round((d.spend / max) * 100)}%"></div><div class="b rev" style="height:${Math.round((d.verified / max) * 100)}%"></div></div>`).join("");
  return `<div class="tiles">
<div class="tile"><div class="muted small">Spent</div><div class="big">${usd(t.spend)}</div></div>
<div class="tile"><div class="muted small">Sales from ads (your store)</div><div class="big">${usd(t.verified)}</div><div class="muted small">${t.sales} orders · ${(t.spend ? t.verified / t.spend : 0).toFixed(2)}× return</div></div>
<div class="tile"><div class="muted small">Facebook claims</div><div class="big">${usd(t.reported)}</div><div class="muted small">${usd(t.reported - t.verified)} more than your store shows</div></div>
</div>
<h3>Spend and sales by day</h3>
<div class="bars" aria-label="spend and verified sales per day">${bars}</div>
<p class="muted small"><span class="key spend"></span> spend <span class="key rev"></span> verified sales</p>
<h3>What switching ads off saved you</h3>
<p>The bracket switched off <strong>${cf.killed}</strong> ads. Keeping them running would have cost about <strong>${usd(cf.cost)}</strong> more for roughly <strong>${usd(cf.revenue)}</strong> in sales.</p>
<h3>How sure are these numbers?</h3>
<p>Store sales tied to an ad: ${usd(t.verified)}. Some of those buyers would have bought anyway. A holdout test (ads off in some areas) measures how much is truly extra; in this demo we assume about 70% — <strong>${usd(incremental)}</strong>, likely between ${usd(incremental * 0.8)} and ${usd(incremental * 1.2)}. The real report runs that test and states the gap every month.</p>`;
}

export function renderApp(s: DemoState, notice: string): string {
  const body = s.tab === "connect" ? connect(s) : s.tab === "today" ? today(s) : s.tab === "chat" ? chat(s) : report(s);
  return `${header(s)}${notice ? `<div class="notice" role="status">${e(notice)}</div>` : ""}<div class="view">${body}</div><footer class="row wrap muted small"><span>Demo data stays in this browser.</span>${btn("reset", "Reset demo", "chip")}<a href="/">Back to the project page</a></footer>`;
}

/** The thin browser half: send the click, show what comes back. */
export const DEMO_SCRIPT = `(() => {
  const KEY = "fullburn-demo-v1";
  const app = document.getElementById("app");
  let state = null;
  try { state = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}
  let busy = false;
  async function act(action, arg) {
    if (busy) return;
    busy = true;
    try {
      const r = await fetch("/demo/act", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ state, action, arg }) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const out = await r.json();
      state = out.state;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
      app.innerHTML = out.html;
    } catch (err) {
      const n = document.createElement("div");
      n.className = "notice err";
      n.textContent = "That didn't go through (" + err.message + "). Try again.";
      app.prepend(n);
    } finally { busy = false; }
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-act]");
    if (!b || b.type === "submit") return;
    ev.preventDefault();
    act(b.dataset.act, b.dataset.arg ?? null);
  });
  document.addEventListener("submit", (ev) => {
    const f = ev.target.closest("form[data-act]");
    if (!f) return;
    ev.preventDefault();
    act(f.dataset.act, String(new FormData(f).get("q") || ""));
  });
  act("tab", null);
})();`;

export const DEMO_STYLE = `:root{--bg:#f7f7f5;--fg:#1c1c1a;--muted:#6b6b66;--card:#fff;--line:#e3e3de;--pass:#1d7a46;--passbg:#e3f3ea;--fail:#b3261e;--failbg:#fbe7e5;--accent:#c2410c;--accentbg:#fdeee4;--neutral:#55606e;--neutralbg:#eceef1}
@media (prefers-color-scheme: dark){:root{--bg:#141413;--fg:#ecece8;--muted:#a3a39c;--card:#1e1e1c;--line:#33332f;--pass:#6fd39b;--passbg:#173524;--fail:#ff8a80;--failbg:#3d1b18;--accent:#fb923c;--accentbg:#3a2213;--neutral:#b3bcc8;--neutralbg:#262a30}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
#app{max-width:980px;margin:0 auto;padding:0 16px 48px}h3{margin:1.4em 0 .5em;font-size:1.05rem}h4{margin:1em 0 .3em}.muted{color:var(--muted)}.small{font-size:.85rem}
.demo-banner{background:repeating-linear-gradient(45deg,var(--accentbg),var(--accentbg) 10px,var(--card) 10px,var(--card) 20px);border:2px dashed var(--accent);color:var(--accent);font-weight:800;text-align:center;padding:6px;margin:12px 0;border-radius:8px;font-size:.9rem}
.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 0}
.halted{background:var(--failbg);color:var(--fail);font-weight:700;padding:10px 12px;border-radius:8px;margin-bottom:8px}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:14px;overflow-x:auto}.tab{background:none;color:var(--muted);border-radius:8px 8px 0 0;padding:8px 14px;font-weight:600}.tab.on{color:var(--fg);border-bottom:3px solid var(--accent)}
button{font:inherit;font-weight:700;border:1px solid var(--line);border-radius:8px;padding:8px 16px;background:var(--card);color:var(--fg);cursor:pointer}button:disabled{opacity:.5;cursor:default}
button.go{background:var(--pass);border-color:var(--pass);color:#fff}button.red{background:var(--fail);border-color:var(--fail);color:#fff}button.dim{opacity:.7}button.chip{font-weight:500;padding:4px 12px;border-radius:999px;font-size:.88rem}
.notice{background:var(--neutralbg);border-left:4px solid var(--accent);padding:10px 12px;border-radius:6px;margin:10px 0}.notice.err{border-color:var(--fail)}
.step{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:12px 0}.step.done{border-color:var(--pass)}.step h3{margin:0 0 .5em;display:flex;gap:10px;align-items:center}
.num{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--neutralbg);font-size:.9rem}.done .num{background:var(--pass);color:#fff}
.row{display:flex;gap:8px;align-items:center;margin:10px 0}.wrap{flex-wrap:wrap}input{flex:1;min-width:0;font:inherit;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}
.brief{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:12px 0}.brief dt{color:var(--muted)}.brief dd{margin:0;word-break:break-word}
.checks{padding-left:0;list-style:none}.checks li{margin:.3em 0}
.tag{display:inline-block;font-size:.72rem;font-weight:600;border-radius:4px;padding:0 6px;background:var(--neutralbg);color:var(--neutral)}.tag.live{background:var(--passbg);color:var(--pass)}
.svcs{display:grid;gap:8px}.svc{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--card)}.svc.locked{opacity:.7}
.badge{display:inline-block;border-radius:6px;padding:1px 8px;font-size:.78rem;font-weight:700;white-space:nowrap}.pass{background:var(--passbg);color:var(--pass)}.fail{background:var(--failbg);color:var(--fail)}.neutral{background:var(--neutralbg);color:var(--neutral)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.big{font-size:1.7rem;font-weight:700}
.approve{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin:12px 0}
.feed{padding-left:1.1em}.feed li{margin:.3em 0}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line)}th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line);vertical-align:top;font-size:.9rem}th{color:var(--muted);font-weight:600;font-size:.8rem}
.chatlog{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}.q{align-self:flex-end;background:var(--accentbg);border-radius:12px 12px 2px 12px;padding:8px 12px;max-width:85%}.a{align-self:flex-start;background:var(--card);border:1px solid var(--line);border-radius:12px 12px 12px 2px;padding:8px 12px;max-width:85%}
.bars{display:flex;align-items:flex-end;gap:3px;height:140px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px}.barday{flex:1;display:flex;align-items:flex-end;gap:1px;height:100%}.b{flex:1;border-radius:2px 2px 0 0;min-height:1px}.b.spend,.key.spend{background:var(--neutral)}.b.rev,.key.rev{background:var(--pass)}.key{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 10px}
footer{margin-top:2em;justify-content:space-between}footer a{color:var(--accent)}`;

export function renderDemoShell(s: DemoState): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Fullburn Demo</title>
<style>${DEMO_STYLE}</style>
</head>
<body>
<div id="app">${renderApp(s, "")}</div>
<script>${DEMO_SCRIPT}</script>
</body>
</html>`;
}
