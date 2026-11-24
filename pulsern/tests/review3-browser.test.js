/* REVIEW-3 N4 in a real browser: the live region re-announces an identical
   message, and the guest trial announces combos through it. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchBrowser } from "../ops/browser.mjs";

const supabaseStub = {
  name: "review3-supabase",
  enforce: "pre",
  resolveId(source) { return /(^|\/)supabase\.js$/.test(source) ? "\0supabase-stub" : null; },
  load(id) {
    return id === "\0supabase-stub"
      ? "export const supabase = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };"
      : null;
  },
};

let server, browser, base;
beforeAll(async () => {
  server = await createServer({
    configFile: false, cacheDir: "node_modules/.vite-review3-browser", root: process.cwd(), plugins: [supabaseStub, react()], logLevel: "silent",
    server: { port: 0, host: "127.0.0.1" },
    optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime"] },
  });
  await server.listen();
  base = server.resolvedUrls.local[0];
  browser = await launchBrowser({ proxy: undefined });
}, 120_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

/* Every non-empty text the live region shows, in order. */
const watchRegion = (page) => page.evaluate(() => {
  window.__said = [];
  const el = document.querySelector("[data-announcer]");
  new MutationObserver(() => { const t = el.textContent; if (t) window.__said.push(t); }).observe(el, { childList: true, characterData: true, subtree: true });
});

describe("N4: live region", () => {
  it("re-announces the same message twice in a row", async () => {
    const page = await browser.newPage();
    await page.goto(`${base}tests/browser/announcer.html`);
    await page.waitForFunction(() => window.T?.ready, null, { timeout: 90_000 });
    await watchRegion(page);
    await page.getByRole("button", { name: "say" }).click();
    await page.waitForFunction(() => window.__said.length === 1);
    await page.getByRole("button", { name: "say" }).click();
    await page.waitForFunction(() => window.__said.length === 2);
    expect(await page.evaluate(() => window.__said)).toEqual(["3 in a row, On a roll", "3 in a row, On a roll"]);
    await page.close();
  }, 120_000);

  it("the guest trial announces a combo", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.route("**/api/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await page.addInitScript(() => {
      if (sessionStorage.getItem("seeded")) return;
      const now = Date.now();
      localStorage.setItem("pulsern-guest-v1", JSON.stringify({ v: 1, startedAt: now - 60_000, lastAt: now - 30_000, day: null,
        log: [{ id: 3, cat: "Pharmacology", diff: 1, correct: true }, { id: 4, cat: "Pharmacology", diff: 1, correct: true }],
        xp: 20, run: 2, bestRun: 2, ability: null, missSchedule: {} }));
      sessionStorage.setItem("seeded", "1");
    });
    await page.goto(`${base}tests/browser/guest.html`);
    await page.waitForFunction(() => window.T?.ready && window.QUESTIONS, null, { timeout: 90_000 });
    await page.waitForSelector(".stem", { timeout: 20_000 });
    await watchRegion(page);
    const right = await page.evaluate(() => {
      const stem = document.querySelector(".stem").textContent.trim();
      const q = window.QUESTIONS.find((x) => stem.includes(x.stem.slice(0, 60)));
      return [q.answer].flat().map((i) => q.options[i]);
    });
    await page.waitForTimeout(6500); // past the reading-time floor, or the answer pays 0 and builds no combo
    for (const text of right) await page.locator("main .opt", { hasText: text }).first().click();
    await page.getByRole("button", { name: /^Check answer$/ }).click();
    await page.waitForFunction(() => window.__said.length >= 1, null, { timeout: 5000 });
    expect((await page.evaluate(() => window.__said))[0]).toMatch(/^3 in a row/);
    await ctx.close();
  }, 120_000);
});
