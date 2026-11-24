/* REVIEW-2 M2 + M6 in a real browser, on the real App component:
   - M6: a Supabase read error shows a retry state; nothing is upserted over
     the account until a read succeeds, and the trial is not merged.
   - M2: trial answers on this device auto-merge only into a brand-new
     account created after the trial; an existing account is asked
     ("Add ... to this account?"), Discard merges nothing, Add merges once,
     and the device copy is removed either way. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchBrowser } from "../ops/browser.mjs";
import { todayStr } from "../src/dates.js";
import { QUESTIONS } from "../src/App.jsx";
import { NGN_SAMPLES, CALC_SAMPLES, COVERAGE_SAMPLES } from "../src/ngn-samples.js";

const STUB = `
const offline = { data: null, error: { message: "offline" } };
const q = new Proxy({}, { get(_t, p) { if (p === "then") return (res) => Promise.resolve(offline).then(res); return () => q; } });
const progress = new Proxy({}, { get(_t, p) {
  if (p === "then") return (res) => Promise.resolve(window.__readError ? { data: null, error: { message: "network" } } : window.__nullBlob ? { data: { blob: null }, error: null } : window.__row ? { data: { blob: window.__row }, error: null } : { data: null, error: null }).then(res);
  if (p === "delete") { window.__deletes = (window.__deletes || 0) + 1; return () => progress; }
  if (p === "upsert") return async (row) => { if (window.__stallSave) await new Promise(() => {}); (window.__upserts ||= []).push(row.blob); return { error: null }; };
  return () => progress;
} });
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: window.__session || null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => { window.__signOuts = (window.__signOuts || 0) + 1; return { error: null }; },
  },
  from: (t) => (t === "progress" ? progress : q),
  rpc: () => q,
};`;
const supabaseStub = {
  name: "progress-load-test-supabase",
  enforce: "pre",
  resolveId(source, importer) { return (importer ?? "").includes("/src/") && /(^|\/)supabase\.js$/.test(source) ? "\0supabase-stub" : null; },
  load(id) { return id === "\0supabase-stub" ? STUB : null; },
};

let server, browser, base;
beforeAll(async () => {
  server = await createServer({
    configFile: false, root: process.cwd(), plugins: [supabaseStub, react()], logLevel: "silent",
    cacheDir: "node_modules/.vite-progress-load-test", // own dep cache: parallel suites re-optimizing a shared cache can 504 this page
    server: { port: 0, host: "127.0.0.1" },
    optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime"] },
  });
  await server.listen();
  base = server.resolvedUrls.local[0];
  browser = await launchBrowser({ proxy: undefined });
}, 120_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

const NOW = Date.now();
const guest = (startedAt) => ({ v: 1, startedAt, lastAt: startedAt + 60_000, day: null, log: [
  { id: 1, cat: "Pharmacology", diff: 2, correct: true }, { id: 2, cat: "Management of Care", diff: 1, correct: false },
], xp: 20, run: 0, bestRun: 1, ability: null, missSchedule: {} });
const existingRow = { theme: "light", tourSeen: true, xp: 500, bestRun: 7, log: Array.from({ length: 30 }, (_, i) => ({ id: 1000 + i, cat: "Pharmacology", diff: 1, correct: true })), streak: { count: 20, lastDay: "2020-01-01", shield: true } };

async function open({ session, row = null, readError = false, guestData = null, nullBlob = false, oldBackup = false, stallSave = false, pendingKey = false }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/api/**", (r) => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.addInitScript(({ session, row, readError, guestData, nullBlob, oldBackup, stallSave, pendingKey }) => {
    if (oldBackup && !sessionStorage.getItem("backupSeeded")) { localStorage.setItem("pulsern-progress-backup-v1", JSON.stringify([{ userId: "someone-else", raw: "{}" }])); sessionStorage.setItem("backupSeeded", "1"); }
    if (pendingKey) localStorage.setItem("pulsern-pending-progress-v1:leftover", JSON.stringify({ log: [{ id: 1, correct: true }] }));
    window.__session = session; window.__row = row; window.__readError = readError; window.__nullBlob = nullBlob; window.__upserts = []; window.__stallSave = stallSave;
    if (guestData && !sessionStorage.getItem("seeded")) { localStorage.setItem("pulsern-guest-v1", JSON.stringify(guestData)); sessionStorage.setItem("seeded", "1"); }
  }, { session, row, readError, guestData, nullBlob, oldBackup, stallSave, pendingKey });
  await page.goto(`${base}ops/product-screenshot.html`, { waitUntil: "networkidle" });
  return { ctx, page, errors };
}
const sessionFor = (createdAt) => ({ access_token: "t", user: { id: "u1", created_at: new Date(createdAt).toISOString() } });

describe("M6: a failed progress read never overwrites the account", () => {
  it("shows a retry state, blocks autosave and the trial merge, then loads on retry", async () => {
    const { ctx, page, errors } = await open({ session: sessionFor(NOW - 90 * 86400000), row: existingRow, readError: true, guestData: guest(NOW - 3600_000) });
    try {
      await page.getByRole("heading", { name: "We couldn't load your progress" }).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => window.__upserts.length)).toBe(0);
      expect(await page.evaluate(() => localStorage.getItem("pulsern-guest-v1"))).not.toBeNull();
      await page.evaluate(() => { window.__readError = false; });
      await page.getByRole("button", { name: "Try again" }).click();
      await page.getByRole("heading", { name: "Welcome back." }).waitFor({ timeout: 15_000 });
      await page.getByText("the practice answers weren't added").waitFor();
      await page.waitForTimeout(800);
      const saved = await page.evaluate(() => window.__upserts.at(-1));
      expect(saved.xp).toBe(500);
      expect(saved.log).toHaveLength(30);
      expect(await page.evaluate(() => localStorage.getItem("pulsern-guest-v1"))).toBeNull();
      expect(errors).toEqual([]);
    } finally { await ctx.close(); }
  }, 120_000);
});

describe("M2: trial answers and an existing account", () => {
  it("asks first; Discard merges nothing and clears the device copy", async () => {
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row: existingRow, guestData: guest(NOW - 3600_000) });
    try {
      await page.getByRole("heading", { name: "Welcome back." }).waitFor({ timeout: 30_000 });
      await page.getByText("the practice answers weren't added").waitFor();
      expect(await page.evaluate(() => localStorage.getItem("pulsern-guest-v1"))).toBeNull();
      const saved = await page.evaluate(() => window.__upserts.at(-1));
      expect(saved.log).toHaveLength(30);
      expect(saved.xp).toBe(500);
      expect(saved.streak.count).toBe(20);
    } finally { await ctx.close(); }
  }, 120_000);

  it("Add merges once, then clears the device copy after the save", async () => {
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row: existingRow, guestData: guest(NOW - 3600_000) });
    try {
      await page.getByRole("heading", { name: "Welcome back." }).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(800);
      const saved = await page.evaluate(() => window.__upserts.at(-1));
      expect(saved.log).toHaveLength(30);
      expect(saved.xp).toBe(500);
      expect(saved.missSchedule?.["builtin:2"]).toBeUndefined();
      expect(await page.evaluate(() => localStorage.getItem("pulsern-guest-v1"))).toBeNull();
    } finally { await ctx.close(); }
  }, 120_000);

  it("a brand-new account created from the trial merges without asking", async () => {
    const started = NOW - 600_000;
    const { ctx, page } = await open({ session: sessionFor(started + 120_000), row: null, guestData: guest(started) });
    try {
      await page.getByText("Your trial answers are in your account").waitFor({ timeout: 30_000 });
      expect(await page.getByRole("heading", { name: /trial answers to this account\?/ }).count()).toBe(0);
      await page.waitForTimeout(800);
      const saved = await page.evaluate(() => window.__upserts.at(-1));
      expect(saved.log.map((l) => l.key)).toEqual(["builtin:1", "builtin:2"]);
    } finally { await ctx.close(); }
  }, 120_000);
});

describe("N1: a saved row the app cannot open", () => {
  it("is not blamed on the connection, never overwritten or copied to the device, and can be studied without saving", async () => {
    const { ctx, page, errors } = await open({ session: sessionFor(NOW - 90 * 86400000), nullBlob: true, guestData: guest(NOW - 3600_000), oldBackup: true });
    try {
      await page.getByRole("heading", { name: "Your saved progress couldn't be opened" }).waitFor({ timeout: 30_000 });
      expect(await page.getByText("This isn't a connection problem").count()).toBe(1);
      expect(await page.getByRole("button", { name: "Try again" }).count()).toBe(0);
      // R4-2: nothing written to the device, and an old backup from an earlier build is gone
      expect(await page.evaluate(() => localStorage.getItem("pulsern-progress-backup-v1"))).toBeNull();
      expect(await page.getByText(/copy is kept/).count()).toBe(0);
      await page.getByRole("button", { name: "Study without saving" }).click();
      await page.getByRole("heading", { name: "This session isn't being saved" }).waitFor();
      expect(await page.locator(".tour-card").count()).toBe(0); // no first-run tour over a student whose data we could not read
      await page.getByRole("button", { name: "Start today's round" }).first().waitFor();
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => window.__upserts.length)).toBe(0);
      // R4-1: Stats offers no Reset while not saving, so nothing can delete the unreadable row
      await page.getByRole("button", { name: "Stats", exact: true }).click();
      await page.getByText("Reset is off while this session isn't being saved").waitFor();
      expect(await page.getByRole("button", { name: /Reset all progress/ }).count()).toBe(0);
      expect(await page.getByRole("button", { name: /erase everything/ }).count()).toBe(0);
      expect(await page.evaluate(() => window.__deletes || 0)).toBe(0);
      expect(await page.evaluate(() => window.__upserts.length)).toBe(0);
      // the trial is neither merged nor offered into an account we cannot read
      expect(await page.getByRole("heading", { name: /trial answers to this account\?/ }).count()).toBe(0);
      expect(errors).toEqual([]);
    } finally { await ctx.close(); }
  }, 120_000);

  it("a network error keeps the retry copy about the connection", async () => {
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row: existingRow, readError: true });
    try {
      await page.getByRole("heading", { name: "We couldn't load your progress" }).waitFor({ timeout: 30_000 });
      expect(await page.getByText(/couldn't reach the server/).count()).toBe(1);
    } finally { await ctx.close(); }
  }, 120_000);
});

describe("N2: every sign-out path forgets the trial on this device", () => {
  const trialKey = (page) => page.evaluate(() => localStorage.getItem("pulsern-guest-v1"));
  const signOuts = (page) => page.evaluate(() => window.__signOuts || 0);

  it("from the read-error screen", async () => {
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row: existingRow, readError: true, guestData: guest(NOW - 3600_000) });
    try {
      await page.getByRole("heading", { name: "We couldn't load your progress" }).waitFor({ timeout: 30_000 });
      expect(await trialKey(page)).not.toBeNull();
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForFunction(() => (window.__signOuts || 0) === 1);
      expect(await trialKey(page)).toBeNull();
    } finally { await ctx.close(); }
  }, 120_000);

  it("from the unreadable-progress screen", async () => {
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), nullBlob: true, guestData: guest(NOW - 3600_000) });
    try {
      await page.getByRole("heading", { name: "Your saved progress couldn't be opened" }).waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForFunction(() => (window.__signOuts || 0) === 1);
      expect(await trialKey(page)).toBeNull();
    } finally { await ctx.close(); }
  }, 120_000);

  it("from the menu", async () => {
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row: existingRow, guestData: guest(NOW - 3600_000) });
    try {
      await page.getByRole("heading", { name: "Welcome back." }).waitFor({ timeout: 30_000 });
      expect(await trialKey(page)).toBeNull();
      await page.locator("header .menu-btn").click();
      await page.getByRole("button", { name: /Sign out/ }).first().click();
      await page.waitForFunction(() => (window.__signOuts || 0) === 1);
      expect(await trialKey(page)).toBeNull();
    } finally { await ctx.close(); }
  }, 120_000);

  it("from Stats", async () => {
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row: existingRow, guestData: guest(NOW - 3600_000) });
    try {
      await page.getByRole("heading", { name: "Welcome back." }).waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: "Stats", exact: true }).click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.waitForFunction(() => (window.__signOuts || 0) === 1);
      expect(await trialKey(page)).toBeNull();
      expect(await signOuts(page)).toBe(1);
    } finally { await ctx.close(); }
  }, 120_000);
});

describe("REVIEW-4", () => {
  it("R4-2: an old device backup is removed on a normal load too", async () => {
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row: existingRow, oldBackup: true });
    try {
      await page.getByRole("button", { name: "Stats", exact: true }).waitFor({ timeout: 30_000 });
      await page.waitForFunction(() => localStorage.getItem("pulsern-progress-backup-v1") === null);
    } finally { await ctx.close(); }
  }, 120_000);

  it("R4-2: sign-out removes an old device backup", async () => {
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row: existingRow, readError: true, oldBackup: true });
    try {
      await page.getByRole("heading", { name: "We couldn't load your progress" }).waitFor({ timeout: 30_000 });
      await page.evaluate(() => localStorage.setItem("pulsern-progress-backup-v1", "[]")); // put back after the load-time clear
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForFunction(() => (window.__signOuts || 0) === 1);
      expect(await page.evaluate(() => localStorage.getItem("pulsern-progress-backup-v1"))).toBeNull();
    } finally { await ctx.close(); }
  }, 120_000);

  it("R4-1: Reset still works when progress loaded normally", async () => {
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row: existingRow });
    try {
      await page.getByRole("button", { name: "Stats", exact: true }).click({ timeout: 30_000 });
      await page.getByRole("button", { name: /Reset all progress/ }).click();
      await page.getByRole("button", { name: /Yes, erase everything/ }).click();
      await page.waitForFunction(() => (window.__deletes || 0) === 1);
    } finally { await ctx.close(); }
  }, 120_000);
});

describe("sign-out waits, then asks before leaving a stalled save", () => {
  it("does not sign out until Sign out anyway, and a leftover journal is already gone", async () => {
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row: existingRow, stallSave: true, pendingKey: true });
    try {
      await page.getByRole("button", { name: "Stats", exact: true }).waitFor({ timeout: 30_000 });
      expect(await page.evaluate(() => localStorage.getItem("pulsern-pending-progress-v1:leftover"))).toBeNull();
      await page.locator("header .menu-btn").click();
      await page.getByRole("button", { name: /Sign out/ }).first().click();
      await page.getByRole("heading", { name: "Still saving your progress." }).waitFor({ timeout: 15_000 });
      expect(await page.evaluate(() => window.__signOuts || 0)).toBe(0);
      await page.getByRole("button", { name: "Sign out anyway" }).click();
      await page.waitForFunction(() => (window.__signOuts || 0) === 1);
      const keys = await page.evaluate(() => Object.keys(localStorage));
      expect(keys.some((key) => key.startsWith("pulsern-pending-progress-v1"))).toBe(false);
    } finally { await ctx.close(); }
  }, 120_000);
});

describe("Today leaves an unresolved due miss and continues", () => {
  it("Leave unresolved serves a new question instead of the same card", async () => {
    const row = {
      theme: "light", tourSeen: true, xp: 40, bestRun: 1,
      log: [
        { id: 7, unclassified: true, key: null, cat: "Pharmacology", diff: 2, correct: false },
        { id: 1001, cat: "Pharmacology", diff: 1, correct: true },
      ],
      streak: { count: 2, lastDay: "2020-01-01", shield: true },
      missSchedule: { 7: { interval: 1, due: "2020-01-02" } },
      fcNew: { day: todayStr(), count: 20 },
      srsMap: {},
    };
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row });
    try {
      await page.getByRole("button", { name: /Start today's round/ }).click({ timeout: 30_000 });
      await page.getByRole("heading", { name: "Which question was this?" }).waitFor({ timeout: 15_000 });
      await page.getByRole("button", { name: "Leave unresolved" }).click();
      await page.getByRole("button", { name: "Check answer" }).waitFor({ timeout: 15_000 });
      expect(await page.getByRole("heading", { name: "Which question was this?" }).count()).toBe(0);
      expect(await page.getByText("Loading a question").count()).toBe(0);
    } finally { await ctx.close(); }
  }, 120_000);

  it("Leave unresolved ends the round when no new question remains", async () => {
    const seen = [...QUESTIONS, ...NGN_SAMPLES, ...CALC_SAMPLES, ...COVERAGE_SAMPLES].map((q) => ({
      id: q.id, source: "builtin", key: `builtin:${q.id}`, cat: q.cat, diff: q.diff || 1, correct: true,
    }));
    const row = {
      theme: "light", tourSeen: true, xp: 40, bestRun: 1,
      log: [...seen, { id: 7, unclassified: true, key: null, cat: "Pharmacology", diff: 2, correct: false }],
      streak: { count: 2, lastDay: "2020-01-01", shield: true },
      missSchedule: { 7: { interval: 1, due: "2020-01-02" } },
      fcNew: { day: todayStr(), count: 20 },
      srsMap: {},
    };
    const { ctx, page } = await open({ session: sessionFor(NOW - 90 * 86400000), row });
    try {
      await page.getByRole("button", { name: /Start today's round/ }).click({ timeout: 30_000 });
      await page.getByRole("heading", { name: "Which question was this?" }).waitFor({ timeout: 15_000 });
      await page.getByRole("button", { name: "Leave unresolved" }).click();
      await page.getByRole("button", { name: "Back to Today" }).waitFor({ timeout: 15_000 });
      expect(await page.getByRole("heading", { name: "Which question was this?" }).count()).toBe(0);
    } finally { await ctx.close(); }
  }, 120_000);
});
