/* Try-before-sign-up in a real browser (phone 390×844 and desktop 1280×800):
   a guest answers exactly GUEST_LIMIT built-in questions with rationales,
   the floating toolkit opens with lab ranges, the AI lookup and tutor show
   a sign-up invitation and never call /api/ai, rapid taps earn no XP, the
   save moment appears, the answers persist for the handoff, and reward
   motion switches off under prefers-reduced-motion. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchBrowser } from "../ops/browser.mjs";

const supabaseStub = {
  name: "guest-test-supabase",
  enforce: "pre",
  resolveId(source) { return /(^|\/)supabase\.js$/.test(source) ? "\0supabase-stub" : null; },
  load(id) {
    return id === "\0supabase-stub"
      ? 'const q = new Proxy({}, { get(_t, p) { if (p === "then") return (res) => Promise.resolve({ data: null, error: { message: "offline" } }).then(res); return () => q; } }); export const supabase = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from() { return q; } };'
      : null;
  },
};

let server, browser, base;
beforeAll(async () => {
  server = await createServer({
    configFile: false, cacheDir: "node_modules/.vite-guest-browser", root: process.cwd(), plugins: [supabaseStub, react()], logLevel: "silent",
    server: { port: 0, host: "127.0.0.1" },
    optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime"] },
  });
  await server.listen();
  base = server.resolvedUrls.local[0];
  browser = await launchBrowser({ proxy: undefined });
}, 120_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

async function open(viewport, { touch = false, reduced = "reduce" } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, reducedMotion: reduced });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const aiCalls = [];
  await page.route("**/api/**", (route) => { if (route.request().url().includes("/api/ai")) aiCalls.push(route.request().url()); return route.fulfill({ status: 401, contentType: "application/json", body: "{}" }); });
  await page.goto(`${base}tests/browser/guest.html`);
  await page.waitForFunction(() => window.T?.ready, null, { timeout: 90_000 });
  await page.waitForSelector(".stem", { timeout: 20_000 });
  return { ctx, page, errors, aiCalls };
}

async function answerFirst(page) {
  await page.locator("main .opt").first().click();
  await page.getByRole("button", { name: /^Check answer$/ }).click();
  await page.waitForSelector(".feedback");
}

for (const [name, viewport, touch] of [["phone", { width: 390, height: 844 }, true], ["desktop", { width: 1280, height: 800 }, false]]) {
  describe(`guest trial on ${name}`, () => {
    it("runs exactly five questions, then the save-your-progress moment", async () => {
      const { ctx, page, errors, aiCalls } = await open(viewport, { touch });
      try {
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await page.waitForSelector(".stem", { timeout: 20_000 });
        for (let i = 0; i < 5; i++) {
          await answerFirst(page);
          // full rationale on every question
          await expect(page.locator(".rationale").first().innerText()).resolves.toMatch(/Rationale\./);
          // rapid taps never earn XP
          await expect(page.locator(".fb-head").innerText()).resolves.not.toMatch(/\+\d+ XP/);
          // the AI tutor is an invitation, not a broken button
          expect(await page.locator("main .guest-ai").count()).toBe(1);
          if (i === 1) {
            await page.locator(".lab-fab").click();
            await page.waitForSelector(".toolkit.open");
            await page.getByPlaceholder(/Search a lab value/).fill("potassium");
            await expect(page.locator(".lp-row").count()).resolves.toBeGreaterThan(0);
            await page.getByPlaceholder(/Search a lab value/).fill("what is preload");
            await page.waitForSelector(".lp-ask-guest");
            expect(await page.getByRole("button", { name: /Ask AI/ }).count()).toBe(0);
            await page.getByPlaceholder(/Search a lab value/).press("Enter");
            await page.keyboard.press("Escape");
            await page.waitForTimeout(200);
          }
          await page.getByRole("button", { name: /Next question|Continue/ }).click();
          await page.waitForTimeout(150);
        }
        await page.waitForSelector("#guest-save-title");
        expect(await page.locator(".stem").count()).toBe(0);
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pulsern-guest-v1")));
        expect(stored.log).toHaveLength(5);
        expect(stored.log.every((l) => typeof l.id === "number" && l.cat)).toBe(true);
        await page.getByRole("button", { name: "Create free account" }).click();
        expect(await page.evaluate(() => window.T.signUps)).toBe(1);
        // a reload never grants a sixth question
        await page.reload(); await page.waitForSelector("#guest-save-title", { timeout: 20_000 });
        expect(await page.locator(".stem").count()).toBe(0);
        expect(aiCalls).toEqual([]);
        expect(errors).toEqual([]);
      } finally { await ctx.close(); }
    }, 120_000);
  });
}

describe("guest labs control", () => {
  it("opens the toolkit when the question navigation asks for labs", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 });
    try {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("pulsern:open-labs")));
      await page.waitForSelector(".toolkit.open");
      expect(await page.getByRole("tab", { name: /Labs/ }).getAttribute("aria-selected")).toBe("true");
    } finally { await ctx.close(); }
  }, 120_000);
});

describe("reward motion and reduced motion", () => {
  const seed = (n) => JSON.stringify({ v: 1, startedAt: Date.now(), day: null, log: Array.from({ length: n }, (_, i) => ({ id: i + 1, cat: "Pharmacology", diff: 1, correct: true })), xp: 50, run: 5, bestRun: 5, ability: null, missSchedule: {} });
  for (const [mode, expectMotion] of [["reduce", false], ["no-preference", true]]) {
    it(`${mode}: heartbeat and ripple ${expectMotion ? "animate" : "are off"}`, async () => {
      const { ctx, page } = await open({ width: 390, height: 844 }, { reduced: mode });
      try {
        await page.evaluate((g) => localStorage.setItem("pulsern-guest-v1", g), seed(5));
        await page.reload(); await page.waitForSelector("#guest-save-title", { timeout: 20_000 });
        const anim = await page.evaluate(() => getComputedStyle(document.querySelector(".rw-beat path")).animationName);
        const ripple = await page.locator(".rw-ripple:visible").count();
        if (expectMotion) { expect(anim).toBe("rwDraw"); expect(ripple).toBe(1); }
        else { expect(anim).toBe("none"); expect(ripple).toBe(0); }
      } finally { await ctx.close(); }
    }, 120_000);
  }
});
