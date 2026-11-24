/* Undo grade has to go through the Flashcards handler, which is what
   restores the schedule, the XP, and the daily new-card charge. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchBrowser } from "../ops/browser.mjs";

const supabaseStub = {
  name: "flashcards-undo-supabase",
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
    configFile: false, root: process.cwd(), plugins: [supabaseStub, react()], logLevel: "silent",
    server: { port: 0, host: "127.0.0.1" },
    optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime"] },
  });
  await server.listen();
  base = server.resolvedUrls.local[0];
  browser = await launchBrowser({ proxy: undefined });
}, 120_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

const snap = (page) => page.evaluate(() => window.__snap);
const reviewed = (page) => page.getByRole("progressbar", { name: "Cards in this sitting" }).getAttribute("aria-valuetext");

describe("Flashcards undo handler", () => {
  it("rolls schedule, XP, the daily charge, and the reviewed count back through Undo grade", async () => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    page.on("pageerror", (e) => { throw e; });
    await page.goto(`${base}tests/browser/flashcards-undo.html`);
    await page.waitForFunction(() => window.T?.ready && document.body.textContent.includes("OLD CARD"));

    const show = () => page.getByRole("button", { name: "Show answer" }).click();
    const grade = (name) => page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    const back = () => page.getByRole("button", { name: "Back to the previous card" }).click();
    const undo = () => page.getByRole("button", { name: "Undo grade" }).click();
    const initial = await page.evaluate(() => window.T.initial);

    await show();
    await grade("Good");
    await page.waitForFunction(() => window.__snap.srs.old?.interval === 7 && window.__snap.xp === 5);
    expect(await reviewed(page)).toMatch(/1 reviewed/);

    await back();
    await undo();
    await page.waitForFunction(() => window.__snap.srs.old?.interval === 3 && window.__snap.xp === 0);
    expect(await snap(page)).toMatchObject({ srs: { old: initial.old }, xp: 0, fcNew: { count: 0 } });
    expect(await reviewed(page)).toMatch(/0 reviewed/);

    await grade("Again");
    await page.waitForFunction(() => window.__snap.srs.old?.interval === 0);
    await back();
    await undo();
    await page.waitForFunction(() => window.__snap.srs.old?.interval === 3 && window.__snap.xp === 0);
    await grade("Good");
    await page.waitForFunction(() => window.__snap.srs.old?.interval === 7 && window.__snap.xp === 5);
    if (!/FRESH CARD/.test(await page.locator("body").innerText())) {
      await page.getByRole("button", { name: /next card/i }).click();
    }
    await page.waitForFunction(() => document.body.textContent.includes("FRESH CARD"));
    await show();
    await grade("Good");
    await page.waitForFunction(() => window.__snap.srs.fresh?.interval === 3 && window.__snap.fcNew.count === 1 && window.__snap.xp === 10);
    await back();
    await undo();
    await page.waitForFunction(() => window.__snap.srs.fresh == null && window.__snap.fcNew.count === 0 && window.__snap.xp === 5);
    expect((await snap(page)).srs.old.interval).toBe(7);
    await page.close();
  }, 60_000);
});
