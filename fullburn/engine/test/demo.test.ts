import { describe, expect, it } from "vitest";
import {
  APPROVAL_DAYS,
  businessName,
  counterfactual,
  dailyBudget,
  displayName,
  initialState,
  normalizeState,
  reduce,
  SAMPLE_CAP_USD,
  siteFacts,
  TEST_BUDGET_USD,
  type DemoAction,
  type DemoState,
} from "../src/preview/demo-engine.ts";
import { DEMO_SCRIPT, renderApp, renderDemoShell } from "../src/preview/demo-view.ts";
import { makeWorker, parseAction, siteReader } from "../src/preview/worker.ts";

/** THE CLICKABLE DEMO (human request 2026-10-22): every client screen and
 * action, on a simulated engine that follows ENGINE_BUILD.md's rules. Each
 * rule is driven with input that must be refused. */

const run = (s: DemoState, ...actions: DemoAction[]) => actions.reduce((st, a) => reduce(st, a).state, s);
const FACTS = { title: "Maple & Moss Candles | Home", description: "Hand-poured soy candles.", stack: ["Shopify"], hasPrices: true, hasPolicyLinks: true };
const ready = () =>
  run(initialState(), { type: "intake", url: "maplemoss.com", facts: FACTS }, { type: "confirmBrief" }, { type: "connect", service: "meta" }, { type: "connect", service: "shop" }, { type: "testPurchase" });
const launched = () => run(ready(), { type: "launch" });
const live = (a: { status: string }) => a.status === "testing" || a.status === "winner";

describe("demo onboarding follows the URL-in pipeline (§7)", () => {
  it("refuses to launch until site, brief, ad account, store and a test purchase are all done", () => {
    let s = initialState();
    for (const step of [
      { type: "intake", url: "maplemoss.com", facts: null },
      { type: "confirmBrief" },
      { type: "connect", service: "meta" },
      { type: "connect", service: "shop" },
      { type: "testPurchase" },
    ] as DemoAction[]) {
      const r = reduce(s, { type: "launch" });
      expect(r.state.launched, `launched before "${step.type}"`).toBe(false);
      expect(r.notice).toMatch(/^Not yet/);
      s = reduce(s, step).state;
    }
    expect(reduce(s, { type: "launch" }).state.launched).toBe(true);
  });

  it("orders the steps: no connecting before the brief, no test purchase before the store", () => {
    expect(run(initialState(), { type: "connect", service: "meta" }).connections.meta).toBe(false);
    const briefed = run(initialState(), { type: "intake", url: "a.com", facts: null }, { type: "confirmBrief" });
    expect(run(briefed, { type: "testPurchase" }).testPurchase).toBe(false);
  });

  it("launching makes a batch that waits for approval — nothing runs until the client says yes", () => {
    const s = launched();
    expect(s.batch?.names).toHaveLength(10);
    expect(s.batch!.names.filter((n) => n.endsWith("(exploration)"))).toHaveLength(2);
    expect(s.ads).toHaveLength(0);
    const later = run(s, { type: "advance", days: 5 });
    expect(later.ads, "an unapproved batch went live").toHaveLength(0);
    expect(later.days.every((d) => d.spend === 0)).toBe(true);
  });

  it("refuses addresses that are not a public website", () => {
    for (const bad of ["", "localhost", "http://127.0.0.1", "javascript:alert(1)", "ftp://x.com", "printer.local", "nodot"]) expect(businessName(bad), bad).toBeNull();
    expect(businessName("https://www.maple-moss.co.uk/shop")).toBe("Maple Moss");
    expect(displayName("Maplemoss", FACTS)).toBe("Maple & Moss Candles");
    expect(displayName("Maplemoss", null)).toBe("Maplemoss");
  });
});

describe("demo bracket follows §6 and the Laws", () => {
  const approved = () => run(launched(), { type: "approve" });

  it("approval launches the batch at the test budget", () => {
    const s = approved();
    expect(s.ads).toHaveLength(10);
    expect(s.ads.every((a) => a.status === "testing" && a.budget === TEST_BUDGET_USD)).toBe(true);
  });

  it("nothing is switched off inside the protection window; then the worse half is", () => {
    const d2 = run(approved(), { type: "advance", days: 2 });
    expect(d2.ads.filter((a) => a.status === "killed")).toHaveLength(0);
    const d3 = run(d2, { type: "advance", days: 1 });
    const killed = d3.ads.filter((a) => a.status === "killed");
    expect(killed).toHaveLength(5);
    const ctr = (a: { clicks: number; impressions: number }) => a.clicks / a.impressions;
    const worstKept = Math.min(...d3.ads.filter((a) => a.status === "winner").map(ctr));
    expect(killed.every((a) => ctr(a) <= worstKept), "a better ad was switched off than one kept").toBe(true);
  });

  it("proxies never promote: an ad with no verified sale never gets more than the test budget", () => {
    let s = approved();
    for (let i = 0; i < 40; i++) {
      s = run(s, { type: "advance", days: 1 }, { type: "approve" });
      for (const a of s.ads) if (a.sales === 0) expect(a.budget, `${a.name} was scaled with no sales on day ${s.day}`).toBeLessThanOrEqual(TEST_BUDGET_USD);
    }
    expect(s.ads.some((a) => a.status === "winner" && a.budget > TEST_BUDGET_USD), "nothing was ever scaled — this check proves nothing").toBe(true);
  });

  it("the daily cap is never exceeded, approving every batch for 60 days", () => {
    let s = approved();
    for (let i = 0; i < 60; i++) {
      s = run(s, { type: "advance", days: 1 }, { type: "approve" });
      expect(dailyBudget(s), `day ${s.day}`).toBeLessThanOrEqual(SAMPLE_CAP_USD);
      expect(s.days[s.days.length - 1]!.spend).toBeLessThanOrEqual(SAMPLE_CAP_USD);
    }
  });

  it("the cap cannot be raised", () => {
    const s = approved();
    const r = reduce(s, { type: "raiseCap" });
    expect(r.notice).toMatch(/can't be raised/);
    expect(r.state).toEqual(s);
  });

  it("the big red button stops all spending at once, and refuses new launches while stopped", () => {
    const s = run(approved(), { type: "advance", days: 4 }, { type: "halt" });
    expect(s.halted).toBe(true);
    const next = run(s, { type: "advance", days: 3 });
    expect(next.days.slice(-3).every((d) => d.spend === 0 && d.sales === 0)).toBe(true);
    expect(next.ads.map((a) => a.spend)).toEqual(s.ads.map((a) => a.spend));
    const withBatch = { ...next, batch: { proposedDay: next.day, names: ["x — image"], vetoAt: null } };
    expect(reduce(withBatch, { type: "approve" }).state.ads.length).toBe(withBatch.ads.length);
    const resumed = run(next, { type: "resume" }, { type: "advance", days: 1 });
    expect(resumed.days[resumed.days.length - 1]!.spend).toBeGreaterThan(0);
  });

  it("the trust ladder: approvals required for 14 days, then exactly one step up, after which batches launch unless vetoed", () => {
    let s = run(approved(), { type: "advance", days: APPROVAL_DAYS - 1 });
    expect(reduce(s, { type: "trustUp" }).state.trust).toBe("approve");
    s = run(s, { type: "advance", days: 1 }, { type: "trustUp" });
    expect(s.trust).toBe("veto");
    expect(reduce(s, { type: "trustUp" }).notice).toMatch(/stops at auto-with-veto/);
    // Let a batch appear, then let its veto window pass.
    for (let i = 0; i < 6 && !s.batch; i++) s = run(s, { type: "advance", days: 1 });
    expect(s.batch?.vetoAt).not.toBeNull();
    const before = s.ads.length;
    const vetoed = run(s, { type: "veto" }, { type: "advance", days: 1 });
    expect(vetoed.ads.length, "a vetoed batch launched").toBe(before);
    const passed = run(s, { type: "advance", days: 1 });
    expect(passed.ads.length, "the batch did not launch after its veto window").toBeGreaterThan(before);
  });

  it("is deterministic: the same clicks give the same result", () => {
    const go = () => run(approved(), { type: "advance", days: 9 }, { type: "approve" }, { type: "advance", days: 5 });
    expect(go()).toEqual(go());
  });

  it("the monthly report counts what was switched off", () => {
    const s = run(approved(), { type: "advance", days: 10 });
    const cf = counterfactual(s);
    expect(cf.killed).toBe(s.ads.filter((a) => a.status === "killed" || a.status === "retired").length);
    expect(cf.killed).toBeGreaterThan(0);
    expect(cf.cost).toBeGreaterThan(0);
  });

  it("chat answers from the demo's own numbers, by rule", () => {
    const s = run(approved(), { type: "advance", days: 4 }, { type: "ask", q: "why was an ad switched off?" });
    expect(s.chat[0]!.a).toContain("bottom half of its batch");
    expect(run(s, { type: "ask", q: "what's my cap" }).chat[1]!.a).toContain(`$${SAMPLE_CAP_USD}/day`);
  });
});

describe("demo state from the browser is untrusted", () => {
  it("garbage or another version is the starting state", () => {
    for (const bad of [null, 1, "x", [], { v: 2 }, { v: "1" }]) expect(normalizeState(bad)).toEqual(initialState());
  });

  it("a tampered budget, status or site is clamped, not obeyed", () => {
    const s = JSON.parse(JSON.stringify(run(launched(), { type: "approve" }))) as Record<string, unknown> & { ads: Record<string, unknown>[] };
    s.ads[0]!["budget"] = 1e9;
    s.ads[1]!["status"] = "promoted-forever";
    s["site"] = { url: "javascript:alert(1)", name: "x" };
    s["tab"] = "admin";
    const n = normalizeState(s);
    expect(n.ads[0]!.budget).toBeLessThanOrEqual(40);
    expect(n.ads[1]!.status).toBe("killed");
    expect(n.site).toBeNull();
    expect(n.tab).toBe("connect");
  });

  it("a round trip through JSON changes nothing", () => {
    const s = run(launched(), { type: "approve" }, { type: "advance", days: 8 }, { type: "ask", q: "spend?" });
    expect(normalizeState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe("demo site reader and screens", () => {
  it("reads title, description and stack from a page, as data", () => {
    const f = siteFacts(`<title>Shop &amp; Co</title><meta name="description" content="Nice things."><script src="https://cdn.shopify.com/a.js"></script><script src="https://js.stripe.com/v3"></script> $19.99 Refund policy`);
    expect(f).toEqual({ title: "Shop & Co", description: "Nice things.", stack: ["Shopify", "Stripe"], hasPrices: true, hasPolicyLinks: true });
    expect(siteFacts("<html></html>")).toEqual({ title: "", description: "", stack: [], hasPrices: false, hasPolicyLinks: false });
  });

  it("escapes what the site says when it is shown", () => {
    const s = run(initialState(), { type: "intake", url: "evil.com", facts: { ...FACTS, title: `<img src=x onerror=alert(1)>`, description: `"><script>alert(2)</script>` } });
    const html = renderApp(s, "");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert(2)");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("every screen renders, and the shell carries exactly the demo script", () => {
    const s = run(launched(), { type: "approve" }, { type: "advance", days: 5 });
    for (const tab of ["connect", "today", "chat", "report"] as const) {
      const html = renderApp({ ...s, tab }, "hello");
      expect(html).toContain("DEMO — simulated engine on sample data");
      expect(html).toContain('data-act="halt"');
    }
    const shell = renderDemoShell(initialState());
    expect(shell.split("<script>")).toHaveLength(2);
    expect(shell).toContain(`<script>${DEMO_SCRIPT}</script>`);
  });

  it("the site reader asks only for https home pages of real hostnames, and fails soft", async () => {
    const asked: string[] = [];
    const ok = siteReader(async (u) => (asked.push(u), new Response("<title>Hi</title>", { headers: { "content-type": "text/html; charset=utf-8" } })));
    expect((await ok("http://maplemoss.com/some/path?x=1"))?.title).toBe("Hi");
    expect(asked).toEqual(["https://maplemoss.com/"]);
    expect(await ok("http://127.0.0.1")).toBeNull();
    expect(await ok("localhost")).toBeNull();
    expect(asked).toHaveLength(1);
    expect(await siteReader(async () => new Response("{}", { headers: { "content-type": "application/json" } }))("a.com")).toBeNull();
    expect(await siteReader(async () => new Response("x", { status: 500, headers: { "content-type": "text/html" } }))("a.com")).toBeNull();
    expect(await siteReader(async () => Promise.reject(new Error("down")))("a.com")).toBeNull();
  });
});

describe("demo routes on the Worker", () => {
  const data = { builtAt: "2026-10-22T00:00:00.000Z", commit: "x", phase: 0, phases: ["a"], live: null, done: null, left: [] };
  let reads = 0;
  const worker = makeWorker(data, () => Promise.reject(new Error("unused")), async () => (reads++, FACTS));
  const env = { PREVIEW_PASSWORD: "correct horse battery" };
  const auth = { authorization: `Basic ${btoa("me:correct horse battery")}` };
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    worker.fetch(new Request("https://p.example/demo/act", { method: "POST", headers: { ...auth, "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }), env);

  it("needs sign-in for the demo page and for every click", async () => {
    expect((await worker.fetch(new Request("https://p.example/demo"), env)).status).toBe(401);
    expect((await worker.fetch(new Request("https://p.example/demo/act", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), env)).status).toBe(401);
  });

  it("serves the demo with a policy that allows only its own script and same-origin requests", async () => {
    const r = await worker.fetch(new Request("https://p.example/demo", { headers: auth }), env);
    expect(r.status).toBe(200);
    const csp = r.headers.get("content-security-policy")!;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(DEMO_SCRIPT));
    expect(csp).toContain(`script-src 'sha256-${Buffer.from(digest).toString("base64")}'`);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });

  it("runs a click and returns the new state and screen", async () => {
    const r = await post({ state: null, action: "intake", arg: "maplemoss.com" });
    const out = (await r.json()) as { state: DemoState; html: string };
    expect(out.state.site?.name).toBe("Maple & Moss Candles");
    expect(out.html).toContain("from your site");
    expect(reads).toBe(1);
    await post({ state: null, action: "intake", arg: "localhost" });
    expect(reads, "the reader was asked for an address that is not a public site").toBe(1);
  });

  it("refuses cross-site posts, non-JSON, oversized bodies and the wrong method", async () => {
    expect((await post({}, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post("{}", { "content-type": "text/plain" })).status).toBe(415);
    expect((await post("not json")).status).toBe(400);
    expect((await post("x".repeat(400_001))).status).toBe(413);
    expect((await worker.fetch(new Request("https://p.example/demo/act", { headers: auth }), env)).status).toBe(405);
    expect((await post({ state: null, action: "tab", arg: "today" }, { origin: "https://p.example" })).status).toBe(200);
  });

  it("an unknown action changes nothing", async () => {
    expect(parseAction("deleteEverything", null)).toBeNull();
    expect(parseAction("connect", "bank")).toBeNull();
    expect(parseAction("tab", "admin")).toBeNull();
    const s = launched();
    const out = (await (await post({ state: s, action: "deleteEverything" })).json()) as { state: DemoState };
    expect(out.state).toEqual(s);
  });
});
