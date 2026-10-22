/** THE CLICKABLE DEMO'S SIMULATED ENGINE (human request 2026-10-22: "every
 * feature and every action need to function"). Pure and deterministic: the
 * same state and action always give the same next state, so the browser keeps
 * the state and the Worker runs the rules.
 *
 * It follows ENGINE_BUILD.md's real rules, on SAMPLE DATA:
 *   - §7 pipeline: URL in → brief (confirmed with one tap) → pre-flight checks
 *     → Connect (OAuth buttons) → a test purchase must land before launch.
 *   - §6 bracket: batches of 10 (2 sets × 5, 20% exploration, Law 7), a 3-day
 *     protection window nobody touches, then the worst half by click-through
 *     is cut (a proxy may KILL, Law 5), survivors join the winners pool and
 *     only warehouse-verified revenue earns budget (proxies never promote).
 *   - Law 2: the daily cap is a constant; nothing here can raise it.
 *   - Law 8: approvals are mandatory for the first 14 days, then one rung up
 *     to auto-with-veto, never skipping.
 *   - §8: the big red button halts all spend instantly, with no confirmation.
 *
 * NOTHING HERE IS REAL: no ad account, no money, no AI model. The only real
 * input is what the client's public web page says (`SiteFacts`, read by the
 * Worker), and the brief says which parts came from it. */

export const DEMO_VERSION = 1;
/** Sample-client constants. Real caps live in config/caps.ts (Law 2). */
export const SAMPLE_CAP_USD = 120;
export const SAMPLE_PRICE_USD = 38;
export const TEST_BUDGET_USD = 6;
export const WINNER_MAX_USD = 40;
export const PROTECTION_DAYS = 3;
export const APPROVAL_DAYS = 14;
export const BATCH_SIZE = 10;
export const EXPLORATION_SLOTS = 2;
const CPM_USD = 9;
const MAX_ADS = 80;
const MAX_DAYS = 120;

export type AdStatus = "testing" | "winner" | "killed" | "retired";
export interface Ad {
  id: number;
  name: string;
  exploration: boolean;
  q: number;
  status: AdStatus;
  born: number;
  budget: number;
  impressions: number;
  clicks: number;
  sales: number;
  spend: number;
  ctrs: number[];
  reason: string;
}
export interface DayRecord {
  day: number;
  spend: number;
  verified: number;
  reported: number;
  sales: number;
  events: string[];
}
export interface SiteFacts {
  title: string;
  description: string;
  stack: string[];
  hasPrices: boolean;
  hasPolicyLinks: boolean;
}
export interface DemoState {
  v: number;
  tab: "connect" | "today" | "chat" | "report";
  day: number;
  site: { url: string; name: string; facts: SiteFacts | null } | null;
  briefConfirmed: boolean;
  connections: { meta: boolean; shop: boolean; analytics: boolean; email: boolean };
  testPurchase: boolean;
  launched: boolean;
  trust: "approve" | "veto";
  halted: boolean;
  nextId: number;
  batch: { proposedDay: number; names: string[]; vetoAt: number | null } | null;
  ads: Ad[];
  days: DayRecord[];
  chat: { q: string; a: string }[];
}

export function initialState(): DemoState {
  return {
    v: DEMO_VERSION,
    tab: "connect",
    day: 0,
    site: null,
    briefConfirmed: false,
    connections: { meta: false, shop: false, analytics: false, email: false },
    testPurchase: false,
    launched: false,
    trust: "approve",
    halted: false,
    nextId: 1,
    batch: null,
    ads: [],
    days: [],
    chat: [],
  };
}

/** Deterministic noise in [0, 1). */
export function noise(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const ANGLES = [
  "Long burn time", "The gift that gets kept", "Clean ingredients", "Room before and after", "Founder story",
  "Real customer review", "Bundle and save", "Cosy evenings in", "Limited seasonal edition", "Unboxing",
  "Problem then fix", "Made by hand", "Compare with the big brand", "Three reasons to switch", "Day in the life",
];
const FORMATS = ["video", "image", "carousel"];
const NEW_DNA = ["Trending audio remix", "Competitor-inspired hook", "Podcast insight", "Viral format test"];

/** A client's URL → a business name. Only http(s) with a real hostname. */
export function businessName(url: string): string | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^\d+(\.\d+)+$/.test(host) || host.endsWith(".local") || host === "localhost") return null;
  const word = host.split(".")[0]!.replace(/-/g, " ");
  return word.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The name a client recognises: the site's own title up to its first
 * separator, when it was read; otherwise the one from the address. */
export function displayName(fromUrl: string, facts: SiteFacts | null): string {
  const t = (facts?.title ?? "").split(/\s[|–—-]\s|\s[|]/)[0]!.trim();
  return t.length >= 2 && t.length <= 60 ? t : fromUrl;
}

function proposeBatch(s: DemoState): string[] {
  const names: string[] = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const k = `${s.site?.name ?? ""}:${s.day}:${i}`;
    if (i >= BATCH_SIZE - EXPLORATION_SLOTS) names.push(`${NEW_DNA[Math.floor(noise(`x${k}`) * NEW_DNA.length)]!} (exploration)`);
    else names.push(`${ANGLES[Math.floor(noise(`a${k}`) * ANGLES.length)]!} — ${FORMATS[Math.floor(noise(`f${k}`) * FORMATS.length)]!}`);
  }
  return names;
}

export const launchBlockers = (s: DemoState): string[] => {
  const out: string[] = [];
  if (!s.site) out.push("paste your website");
  else if (!s.briefConfirmed) out.push("confirm the business brief");
  if (!s.connections.meta) out.push("connect Facebook / Instagram ads");
  if (!s.connections.shop) out.push("connect Shopify or Stripe (where sales are verified)");
  if (!s.testPurchase) out.push("send a test purchase and see it land in your data");
  return out;
};

const activeAds = (s: DemoState) => s.ads.filter((a) => a.status === "testing" || a.status === "winner");
export const dailyBudget = (s: DemoState) => activeAds(s).reduce((t, a) => t + a.budget, 0);
const verifiedRevenue = (a: Ad) => a.sales * SAMPLE_PRICE_USD;
const ctr = (a: Ad) => (a.impressions > 0 ? a.clicks / a.impressions : 0);

function launchBatch(s: DemoState, names: string[], note: string): string {
  const room = Math.floor((SAMPLE_CAP_USD - dailyBudget(s)) / TEST_BUDGET_USD);
  const n = Math.max(0, Math.min(names.length, room));
  for (const name of names.slice(0, n)) {
    const id = s.nextId++;
    const exploration = name.endsWith("(exploration)");
    const q = exploration ? noise(`q${id}`) ** 0.7 : 0.15 + 0.7 * noise(`q${id}`);
    s.ads.push({ id, name, exploration, q, status: "testing", born: s.day, budget: TEST_BUDGET_USD, impressions: 0, clicks: 0, sales: 0, spend: 0, ctrs: [], reason: `launched day ${s.day} (${note})` });
  }
  s.batch = null;
  if (n === 0) return `No room under the $${SAMPLE_CAP_USD}/day cap for new tests — nothing launched. The cap can only be changed by a person.`;
  return n < names.length ? `Launched ${n} of ${names.length} ads; the rest would have gone over the $${SAMPLE_CAP_USD}/day cap.` : `Launched ${n} ads at $${TEST_BUDGET_USD}/day each. They are protected for ${PROTECTION_DAYS} days.`;
}

/** One simulated day of delivery, then the bracket's decisions. */
function simulateDay(s: DemoState): void {
  s.day += 1;
  const rec: DayRecord = { day: s.day, spend: 0, verified: 0, reported: 0, sales: 0, events: [] };
  if (s.halted) {
    rec.events.push("All spending stopped (big red button). Nothing ran.");
  } else {
    for (const a of activeAds(s)) {
      const age = s.day - a.born;
      const fatigue = a.status === "winner" && age > 7 ? Math.max(0.45, 1 - 0.05 * (age - 7)) : 1;
      const dayCtr = Math.max(0.001, (0.003 + 0.022 * a.q) * fatigue + (noise(`c${a.id}:${s.day}`) - 0.5) * 0.002);
      const impressions = Math.round((a.budget / CPM_USD) * 1000);
      const clicks = Math.round(impressions * dayCtr);
      const sales = Math.floor(clicks * (0.01 + 0.045 * a.q) + noise(`s${a.id}:${s.day}`));
      a.impressions += impressions;
      a.clicks += clicks;
      a.sales += sales;
      a.spend += a.budget;
      a.ctrs.push(impressions > 0 ? clicks / impressions : 0);
      rec.spend += a.budget;
      rec.sales += sales;
    }
    rec.verified = rec.sales * SAMPLE_PRICE_USD;
    // The platform over-claims; the report states the gap (Law 10).
    rec.reported = Math.round(rec.verified * 1.28);
    bracket(s, rec);
  }
  s.days.push(rec);
  if (s.days.length > MAX_DAYS) s.days.shift();
  if (s.launched && !s.halted && !s.batch && (s.day - (lastBatchDay(s) ?? 0)) >= PROTECTION_DAYS) {
    s.batch = { proposedDay: s.day, names: proposeBatch(s), vetoAt: s.trust === "veto" ? s.day + 1 : null };
    rec.events.push(s.trust === "veto" ? "A new batch of 10 ads is ready. It launches tomorrow unless you veto it." : "A new batch of 10 ads is ready for your OK.");
  } else if (s.batch && s.batch.vetoAt !== null && s.day >= s.batch.vetoAt && !s.halted) {
    rec.events.push(launchBatch(s, s.batch.names, "veto window passed"));
  }
  if (s.ads.length > MAX_ADS) s.ads = s.ads.filter((a, i) => a.status === "testing" || a.status === "winner" || i >= s.ads.length - MAX_ADS);
}

const lastBatchDay = (s: DemoState): number | null => (s.ads.length ? Math.max(...s.ads.map((a) => a.born)) : null);

function bracket(s: DemoState, rec: DayRecord): void {
  // CUT THE WORST: a cohort leaves protection together; the worse half by
  // click-through is switched off. A proxy may kill (Law 5).
  const cohorts = new Map<number, Ad[]>();
  for (const a of s.ads) if (a.status === "testing" && s.day - a.born >= PROTECTION_DAYS) cohorts.set(a.born, [...(cohorts.get(a.born) ?? []), a]);
  for (const cohort of cohorts.values()) {
    const ranked = [...cohort].sort((x, y) => ctr(x) - ctr(y));
    const cut = Math.floor(ranked.length / 2);
    ranked.forEach((a, i) => {
      if (i < cut) {
        a.status = "killed";
        a.budget = 0;
        a.reason = `switched off day ${s.day}: click-through ${(ctr(a) * 100).toFixed(2)}% was in the bottom half of its batch after the ${PROTECTION_DAYS}-day window (fast metrics may switch ads off)`;
        rec.events.push(`Switched off "${a.name}" — weak click-through.`);
      } else {
        a.status = "winner";
        a.reason = `kept day ${s.day}: click-through ${(ctr(a) * 100).toFixed(2)}%, top half of its batch`;
      }
    });
  }
  // FATIGUE: retire a winner only on sustained decay (3 straight days, >30% off its peak).
  for (const a of s.ads) {
    if (a.status !== "winner" || a.ctrs.length < 6) continue;
    const peak = Math.max(...a.ctrs);
    const last3 = a.ctrs.slice(-3);
    if (last3.every((c, i) => c < peak * 0.7 && (i === 0 || c <= last3[i - 1]!))) {
      a.status = "retired";
      a.budget = 0;
      a.reason = `retired day ${s.day}: click-through fell three days running to ${(last3[2]! * 100).toFixed(2)}% from a peak of ${(peak * 100).toFixed(2)}% (ad fatigue)`;
      rec.events.push(`Retired "${a.name}" — the audience is tired of it.`);
    }
  }
  // WINNERS POOL: only verified revenue earns budget; everything stays under the cap.
  const winners = s.ads.filter((a) => a.status === "winner");
  const testing = s.ads.filter((a) => a.status === "testing").reduce((t, a) => t + a.budget, 0);
  const pool = Math.max(0, SAMPLE_CAP_USD - testing);
  const earning = winners.filter((a) => a.sales > 0);
  const totalRev = earning.reduce((t, a) => t + verifiedRevenue(a) / Math.max(1, a.spend), 0);
  let left = pool - (winners.length - earning.length) * TEST_BUDGET_USD;
  for (const a of winners.filter((w) => w.sales === 0)) {
    if (a.budget !== TEST_BUDGET_USD) a.reason = `held at $${TEST_BUDGET_USD}/day: no verified sales yet, so it cannot be scaled (clicks alone never earn budget)`;
    a.budget = TEST_BUDGET_USD;
  }
  for (const a of [...earning].sort((x, y) => verifiedRevenue(y) / y.spend - verifiedRevenue(x) / x.spend)) {
    const share = totalRev > 0 ? (verifiedRevenue(a) / Math.max(1, a.spend) / totalRev) * Math.max(0, left) : 0;
    const next = Math.max(TEST_BUDGET_USD, Math.min(WINNER_MAX_USD, Math.round(share)));
    const capped = Math.min(next, Math.max(TEST_BUDGET_USD, left));
    if (capped > a.budget) {
      rec.events.push(`Scaled "${a.name}" from $${a.budget} to $${capped}/day — ${a.sales} verified sale${a.sales === 1 ? "" : "s"} in your store data.`);
      a.reason = `scaled day ${s.day} to $${capped}/day on ${a.sales} verified sales ($${verifiedRevenue(a)} on $${a.spend} spent)`;
    }
    a.budget = capped;
    left -= capped;
  }
  // The cap is absolute: trim from the smallest earners if rounding overshot.
  let over = dailyBudget(s) - SAMPLE_CAP_USD;
  for (const a of [...winners].sort((x, y) => verifiedRevenue(x) - verifiedRevenue(y))) {
    if (over <= 0) break;
    const cut = Math.min(over, a.budget - TEST_BUDGET_USD);
    if (cut > 0) {
      a.budget -= cut;
      over -= cut;
    }
  }
}

export type DemoAction =
  | { type: "tab"; tab: DemoState["tab"] }
  | { type: "intake"; url: string; facts: SiteFacts | null }
  | { type: "confirmBrief" }
  | { type: "connect"; service: keyof DemoState["connections"] }
  | { type: "testPurchase" }
  | { type: "launch" }
  | { type: "approve" }
  | { type: "veto" }
  | { type: "advance"; days: number }
  | { type: "halt" }
  | { type: "resume" }
  | { type: "trustUp" }
  | { type: "raiseCap" }
  | { type: "ask"; q: string }
  | { type: "reset" };

export function reduce(prev: DemoState, action: DemoAction): { state: DemoState; notice: string } {
  const s = structuredClone(prev);
  switch (action.type) {
    case "tab":
      s.tab = action.tab;
      return { state: s, notice: "" };
    case "reset":
      return { state: initialState(), notice: "The demo was reset." };
    case "intake": {
      const name = businessName(action.url);
      if (!name) return { state: s, notice: "That doesn't look like a website address. Try something like yourshop.com." };
      if (s.launched) return { state: s, notice: "This demo client is already running. Reset the demo to try another website." };
      s.site = { url: action.url.trim().slice(0, 200), name: displayName(name, action.facts), facts: action.facts };
      s.briefConfirmed = false;
      return { state: s, notice: action.facts ? `Read ${name}'s website.` : `Couldn't read that website right now, so the brief below uses sample details.` };
    }
    case "confirmBrief":
      if (!s.site) return { state: s, notice: "Paste your website first." };
      s.briefConfirmed = true;
      return { state: s, notice: "Brief confirmed." };
    case "connect":
      if (!s.briefConfirmed) return { state: s, notice: "Confirm the business brief first." };
      s.connections[action.service] = true;
      return { state: s, notice: "Connected (simulated — no real account was touched)." };
    case "testPurchase":
      if (!s.connections.shop) return { state: s, notice: "Connect Shopify or Stripe first — that's where the test purchase has to land." };
      s.testPurchase = true;
      return { state: s, notice: "Test purchase received in your data. Sales tracking works." };
    case "launch": {
      const blockers = launchBlockers(s);
      if (blockers.length) return { state: s, notice: `Not yet — first ${blockers.join(", then ")}.` };
      if (s.launched) return { state: s, notice: "Already running." };
      s.launched = true;
      s.tab = "today";
      s.batch = { proposedDay: s.day, names: proposeBatch(s), vetoAt: null };
      return { state: s, notice: "Your first batch of 10 ads is ready. Nothing goes live until you approve it." };
    }
    case "approve":
      if (s.halted) return { state: s, notice: "Spending is stopped. Turn it back on before launching anything." };
      if (!s.batch) return { state: s, notice: "Nothing is waiting for approval." };
      return { state: s, notice: launchBatch(s, s.batch.names, "you approved") };
    case "veto":
      if (!s.batch) return { state: s, notice: "Nothing is waiting." };
      s.batch = null;
      return { state: s, notice: "Batch vetoed. Nothing from it will run." };
    case "advance": {
      if (!s.launched) return { state: s, notice: "Launch first — there's nothing running to watch yet." };
      const n = Math.max(1, Math.min(30, Math.floor(action.days)));
      for (let i = 0; i < n; i++) simulateDay(s);
      return { state: s, notice: n === 1 ? `It's now day ${s.day}.` : `Skipped ahead ${n} days. It's now day ${s.day}.` };
    }
    case "halt":
      s.halted = true;
      return { state: s, notice: "Stopped. All ads are paused and no money will be spent. (On the real system this takes effect in under 60 seconds.)" };
    case "resume":
      if (!s.halted) return { state: s, notice: "Spending is already on." };
      s.halted = false;
      return { state: s, notice: "Spending is back on. Ads resume at the budgets they had." };
    case "trustUp":
      if (s.trust === "veto") return { state: s, notice: "This demo stops at auto-with-veto. Full auto is earned later, one step at a time." };
      if (s.day < APPROVAL_DAYS) return { state: s, notice: `Approvals are required for the first ${APPROVAL_DAYS} days (day ${s.day} now). No step can be skipped.` };
      s.trust = "veto";
      // A batch already waiting gets the same one-day veto window.
      if (s.batch) s.batch.vetoAt = s.day + 1;
      return { state: s, notice: "Moved up one step: new batches now launch automatically after a one-day window in which you can veto them." };
    case "raiseCap":
      return { state: s, notice: `The $${SAMPLE_CAP_USD}/day cap can't be raised from here. Caps are fixed in code and change only through a change a person approves.` };
    case "ask": {
      const q = action.q.trim().slice(0, 300);
      if (!q) return { state: s, notice: "" };
      s.chat.push({ q, a: answer(s, q) });
      if (s.chat.length > 20) s.chat.shift();
      s.tab = "chat";
      return { state: s, notice: "" };
    }
  }
}

/** Scripted answers computed from the demo's own data. The real chat
 * (Stage 7) answers over the client's warehouse with citations. */
export function answer(s: DemoState, q: string): string {
  const t = q.toLowerCase();
  const last = s.days[s.days.length - 1];
  const tot = totals(s);
  const named = s.ads.find((a) => t.includes(a.name.toLowerCase().split(" — ")[0]!.split(" (")[0]!.toLowerCase()));
  if (named) return `"${named.name}": ${named.reason}. So far: $${named.spend} spent, ${named.clicks} clicks, ${named.sales} verified sales ($${verifiedRevenue(named)}).`;
  if (/stop|pause|red button|halt/.test(t)) return s.halted ? "Spending is stopped right now. Press 'Turn spending back on' when you're ready." : "Press the red 'Stop all spending' button at the top. Everything pauses at once — no confirmation step.";
  if (/cap|limit|max/.test(t)) return `Your cap is $${SAMPLE_CAP_USD}/day. Today's planned spend is $${dailyBudget(s)}. Nothing in the software can raise the cap — only a person, through an approved change.`;
  if (/why.*(off|kill|stop|cut)|switched off|killed/.test(t)) {
    const k = s.ads.filter((a) => a.status === "killed").slice(-3);
    return k.length ? `Most recent switch-offs: ${k.map((a) => `"${a.name}" (${a.reason})`).join("; ")}.` : "Nothing has been switched off yet. Ads are protected for their first 3 days.";
  }
  if (/scal|winner|best|working/.test(t)) {
    const w = s.ads.filter((a) => a.status === "winner").sort((x, y) => verifiedRevenue(y) - verifiedRevenue(x)).slice(0, 3);
    return w.length ? `Top ads by verified sales: ${w.map((a) => `"${a.name}" — ${a.sales} sales, $${a.budget}/day`).join("; ")}. Only real sales in your store data earn more budget.` : "No winners yet — the first batch is still in its 3-day window.";
  }
  if (/dip|drop|down|worse/.test(t) && last) return `Day ${last.day}: ${last.sales} verified sales on $${last.spend}. ${last.events.length ? `What changed: ${last.events.slice(0, 3).join(" ")}` : "Nothing was changed that day."}`;
  if (/spend|spent|cost|money|roas|return/.test(t)) return `So far: $${tot.spend} spent, $${tot.verified} in verified sales (${tot.spend ? (tot.verified / tot.spend).toFixed(2) : "0.00"}× return). Facebook reports $${tot.reported}; your store data is what counts.`;
  return "In this demo I can answer about specific ads, what was switched off or scaled, spend and returns, the cap, and the red button. The real chat answers any question about your business from your own data, with sources.";
}

export function totals(s: DemoState) {
  return s.days.reduce((t, d) => ({ spend: t.spend + d.spend, verified: t.verified + d.verified, reported: t.reported + d.reported, sales: t.sales + d.sales }), { spend: 0, verified: 0, reported: 0, sales: 0 });
}

/** The monthly counterfactual: what the bracket switched off, and what keeping
 * those ads at their test budget would have cost against what they returned. */
export function counterfactual(s: DemoState) {
  const killed = s.ads.filter((a) => a.status === "killed" || a.status === "retired");
  let cost = 0;
  let sales = 0;
  for (const a of killed) {
    const ranDays = Math.max(1, a.ctrs.length);
    const keptDays = Math.max(0, s.day - a.born - ranDays);
    cost += keptDays * TEST_BUDGET_USD;
    sales += Math.round((a.sales / ranDays) * keptDays);
  }
  return { killed: killed.length, cost, revenue: sales * SAMPLE_PRICE_USD };
}

const siteOf = (url: string, facts: SiteFacts | null) => ({ url, name: displayName(businessName(url)!, facts), facts });

/** The browser holds the state, so it is UNTRUSTED input: rebuilt field by
 * field, anything malformed falls back to the default. */
export function normalizeState(raw: unknown): DemoState {
  const init = initialState();
  if (typeof raw !== "object" || raw === null || (raw as { v?: unknown }).v !== DEMO_VERSION) return init;
  const r = raw as Record<string, unknown>;
  const num = (x: unknown, d: number, lo = 0, hi = 1e9) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  const str = (x: unknown, d: string, max = 300) => (typeof x === "string" ? x.slice(0, max) : d);
  const bool = (x: unknown) => x === true;
  const rec = (x: unknown): Record<string, unknown> => (typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {});
  const strs = (x: unknown, n: number, max = 300) => (Array.isArray(x) ? x.slice(0, n).map((e) => str(e, "", max)) : []);
  const tab = ["connect", "today", "chat", "report"].includes(r["tab"] as string) ? (r["tab"] as DemoState["tab"]) : init.tab;
  const site = rec(r["site"]);
  const facts = rec(site["facts"]);
  const conn = rec(r["connections"]);
  const batch = rec(r["batch"]);
  const statuses: AdStatus[] = ["testing", "winner", "killed", "retired"];
  return {
    v: DEMO_VERSION,
    tab,
    day: Math.floor(num(r["day"], 0, 0, 100_000)),
    site: typeof site["url"] === "string" && businessName(site["url"]) ? siteOf(str(site["url"], "", 200), typeof facts["title"] === "string" ? { title: str(facts["title"], "", 200), description: str(facts["description"], "", 400), stack: strs(facts["stack"], 8, 40), hasPrices: bool(facts["hasPrices"]), hasPolicyLinks: bool(facts["hasPolicyLinks"]) } : null) : null,
    briefConfirmed: bool(r["briefConfirmed"]),
    connections: { meta: bool(conn["meta"]), shop: bool(conn["shop"]), analytics: bool(conn["analytics"]), email: bool(conn["email"]) },
    testPurchase: bool(r["testPurchase"]),
    launched: bool(r["launched"]),
    trust: r["trust"] === "veto" ? "veto" : "approve",
    halted: bool(r["halted"]),
    nextId: Math.floor(num(r["nextId"], 1, 1, 1e7)),
    batch: Array.isArray(batch["names"]) ? { proposedDay: Math.floor(num(batch["proposedDay"], 0)), names: strs(batch["names"], BATCH_SIZE, 120), vetoAt: typeof batch["vetoAt"] === "number" ? Math.floor(num(batch["vetoAt"], 0)) : null } : null,
    ads: (Array.isArray(r["ads"]) ? r["ads"] : []).slice(0, MAX_ADS + BATCH_SIZE).map((x) => {
      const a = rec(x);
      return {
        id: Math.floor(num(a["id"], 0)),
        name: str(a["name"], "ad", 120),
        exploration: bool(a["exploration"]),
        q: num(a["q"], 0.5, 0, 1),
        status: statuses.includes(a["status"] as AdStatus) ? (a["status"] as AdStatus) : "killed",
        born: Math.floor(num(a["born"], 0)),
        budget: Math.floor(num(a["budget"], 0, 0, WINNER_MAX_USD)),
        impressions: Math.floor(num(a["impressions"], 0)),
        clicks: Math.floor(num(a["clicks"], 0)),
        sales: Math.floor(num(a["sales"], 0)),
        spend: Math.floor(num(a["spend"], 0)),
        ctrs: (Array.isArray(a["ctrs"]) ? a["ctrs"] : []).slice(-MAX_DAYS).map((c) => num(c, 0, 0, 1)),
        reason: str(a["reason"], "", 400),
      };
    }),
    days: (Array.isArray(r["days"]) ? r["days"] : []).slice(-MAX_DAYS).map((x) => {
      const d = rec(x);
      return { day: Math.floor(num(d["day"], 0)), spend: Math.floor(num(d["spend"], 0)), verified: Math.floor(num(d["verified"], 0)), reported: Math.floor(num(d["reported"], 0)), sales: Math.floor(num(d["sales"], 0)), events: strs(d["events"], 40, 300) };
    }),
    chat: (Array.isArray(r["chat"]) ? r["chat"] : []).slice(-20).map((x) => ({ q: str(rec(x)["q"], ""), a: str(rec(x)["a"], "", 1200) })),
  };
}

/** What a client's public page says — the one real input. Parsed as DATA:
 * nothing in it is followed, only displayed (escaped). */
export function siteFacts(html: string): SiteFacts {
  const text = html.slice(0, 500_000);
  const attr = (re: RegExp) => (re.exec(text)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const title = decode(attr(/<title[^>]*>([^<]{0,300})<\/title>/i)).slice(0, 200);
  const description = decode(attr(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,600})["']/i) || attr(/<meta[^>]+content=["']([^"']{0,600})["'][^>]+name=["']description["']/i)).slice(0, 400);
  const stack: string[] = [];
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(text)) stack.push("Shopify");
  if (/woocommerce/i.test(text)) stack.push("WooCommerce");
  if (/js\.stripe\.com/i.test(text)) stack.push("Stripe");
  if (/wp-content|wp-includes/i.test(text)) stack.push("WordPress");
  if (/googletagmanager\.com|google-analytics\.com/i.test(text)) stack.push("Google Analytics");
  if (/posthog/i.test(text)) stack.push("PostHog");
  if (/connect\.facebook\.net|fbq\(/i.test(text)) stack.push("Meta Pixel");
  return {
    title,
    description,
    stack,
    hasPrices: /[$£€]\s?\d{1,4}(?:[.,]\d{2})?/.test(text),
    hasPolicyLinks: /refund|return[s]? policy|privacy policy|terms of service|terms & conditions/i.test(text),
  };
}
