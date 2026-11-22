/* Practice question screens, in a real browser: Back, Next, and Skip,
   and a skip that does not count as wrong. The page
   (tests/browser/question-nav-harness.jsx) mounts the shipped QBank and
   case-study step flow. The voice route is stood in for, so "Read each
   new one" can be heard stopping on the way to the next question. */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchBrowser } from "../ops/browser.mjs";

const supabaseStub = {
  name: "question-nav-test-supabase",
  enforce: "pre",
  resolveId(source) { return /(^|\/)supabase\.js$/.test(source) ? "\0supabase-stub" : null; },
  load(id) {
    return id === "\0supabase-stub"
      ? 'export const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from() { return { select() { return this; }, insert: async () => ({ error: null }) }; } };'
      : null;
  },
};

let server, browser, base;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [supabaseStub, react()],
    logLevel: "silent",
    server: { port: 0, host: "127.0.0.1" },
    optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime"] },
  });
  await server.listen();
  base = server.resolvedUrls.local[0];
  browser = await launchBrowser({ proxy: undefined });
}, 120_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

let page;
beforeEach(async () => {
  page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on("pageerror", (e) => { throw e; });
  await page.goto(`${base}tests/browser/question-nav.html`);
  await page.waitForFunction(() => window.T?.ready, null, { timeout: 60_000 });
}, 90_000);

const stem = () => page.locator(".stem").first().innerText();
const stats = () => page.locator("[data-testid=stats]").innerText();
const skip = () => page.getByRole("button", { name: "Skip this question without scoring it" });
const next = () => page.getByRole("button", { name: "Next question" });
const back = () => page.getByRole("button", { name: "Back to the previous question" });
const visible = async (locator) => { await locator.waitFor({ state: "visible" }); };

describe("practice questions", () => {
  it("moves back and forward, and a skip does not count as wrong", async () => {
    await page.evaluate(() => window.T.mountPractice(false));
    await page.getByRole("button", { name: "New questions" }).click();
    await visible(skip());
    await visible(next());
    expect(await back().isDisabled()).toBe(true);
    const box = await skip().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.width).toBeGreaterThanOrEqual(48);

    const first = await stem();
    expect(first).toMatch(/STEM\d/);
    await skip().click();
    await page.waitForFunction((t) => document.querySelector(".stem")?.textContent !== t, first);
    const second = await stem();
    expect(second).not.toBe(first);
    expect(await stats()).toMatch(/^0 recorded, 0 correct, 0 wrong/);
    await visible(page.getByText("1 skipped", { exact: true }));

    await page.getByRole("button", { name: "Review 1 skipped" }).click();
    await page.waitForFunction((t) => document.querySelector(".stem")?.textContent === t, first);

    await page.getByRole("button", { name: "Beta choice" }).click();
    await page.getByRole("button", { name: "Check answer" }).click();
    await visible(page.getByText(/RATIONALE\d/));
    const afterWrong = await stats();
    expect(afterWrong).toMatch(/^1 recorded, 0 correct, 1 wrong/);
    expect(afterWrong).not.toMatch(/theta 1200\.000000/);
    expect(afterWrong).toMatch(/schedule 1$/);

    await next().click();
    await page.waitForFunction((t) => document.querySelector(".stem")?.textContent !== t, first);
    expect(await stats()).toBe(afterWrong);
    await visible(page.getByText("0 skipped", { exact: true }));

    await back().click();
    await visible(page.getByText(/RATIONALE\d/));
    expect(await page.getByRole("button", { name: "Beta choice" }).isDisabled()).toBe(true);
    await visible(page.getByText("Answered earlier"));
    expect(await stats()).toBe(afterWrong);

    await next().click();
    const beforeSkip = await stats();
    await skip().click();
    expect(await stats()).toBe(beforeSkip);
    await visible(page.getByText("1 skipped", { exact: true }));
  }, 60_000);

  it("stops the question that was reading and reads the next one", async () => {
    await page.evaluate(() => window.T.mountSpeaking());
    await page.getByRole("button", { name: "New questions" }).click();
    const first = await stem();
    const token = first.match(/STEM\d/)[0];
    await page.waitForFunction((t) => window.T.spoken().some((line) => line.includes(t)), token, { timeout: 8_000 });
    const cancels = await page.evaluate(() => window.T.cancels());
    await skip().click();
    const nextStem = await stem();
    const nextToken = nextStem.match(/STEM\d/)[0];
    expect(nextToken).not.toBe(token);
    await page.waitForFunction((t) => window.T.spoken().some((line) => line.includes(t)), nextToken, { timeout: 8_000 });
    expect(await page.evaluate(() => window.T.cancels())).toBeGreaterThan(cancels);
  }, 60_000);

  it("shows the same controls on the Today question flow", async () => {
    await page.evaluate(() => window.T.mountPractice(true));
    await visible(skip());
    const first = await stem();
    await skip().click();
    await page.waitForFunction((t) => document.querySelector(".stem")?.textContent !== t, first);
    expect(await stats()).toMatch(/^0 recorded, 0 correct, 0 wrong/);
  }, 60_000);
});

describe("case-study steps", () => {
  it("skips a step without scoring it, and Back shows an answer read-only", async () => {
    await page.evaluate(() => window.T.mountCase());
    await page.getByRole("button", { name: /Pharmacology/ }).click();
    await page.getByRole("button", { name: "Open case →" }).click();
    await page.getByRole("button", { name: "Begin case →" }).click();
    const first = await stem();
    expect(first).toMatch(/CASESTEP0/);
    await skip().click();
    await page.waitForFunction(() => /CASESTEP1/.test(document.querySelector(".stem")?.textContent ?? ""));
    expect(await stats()).toMatch(/^0 recorded, 0 correct, 0 wrong/);
    await visible(page.getByText("1 skipped", { exact: true }));

    await back().click();
    await page.waitForFunction(() => /CASESTEP0/.test(document.querySelector(".stem")?.textContent ?? ""));
    await page.getByRole("button", { name: "First action" }).click();
    await page.getByRole("button", { name: "Check answer" }).click();
    await visible(page.getByText(/CASERATIONALE0/));
    expect(await stats()).toMatch(/^1 recorded, 1 correct, 0 wrong/);

    await page.getByRole("button", { name: "Next step" }).click();
    await page.waitForFunction(() => /CASESTEP1/.test(document.querySelector(".stem")?.textContent ?? ""));
    await back().click();
    await visible(page.getByText(/CASERATIONALE0/));
    expect(await page.getByRole("button", { name: "First action" }).isDisabled()).toBe(true);
    expect(await stats()).toMatch(/^1 recorded, 1 correct, 0 wrong/);
  }, 60_000);

  it("keeps Review misses above the tour sheet on a phone", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.T.mountTourClearance());
    expect(await page.evaluate(() => window.T.tourClearance())).toBe(true);
  });
});
