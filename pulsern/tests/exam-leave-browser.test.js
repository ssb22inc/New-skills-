/* Home during a readiness exam, in a real browser. The page mounts the
   shipped ExamCenter and the same leave hook App uses. The exam service
   is stood in for, so the test can see the submission and the progress
   updates. */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchBrowser } from "../ops/browser.mjs";

const supabaseStub = {
  name: "exam-leave-test-supabase",
  enforce: "pre",
  resolveId(source) { return /(^|\/)supabase\.js$/.test(source) ? "\0supabase-stub" : null; },
  load(id) {
    return id === "\0supabase-stub"
      ? 'export const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };'
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
  page.on("pageerror", (error) => { throw error; });
  await page.goto(`${base}tests/browser/exam-leave.html`);
  await page.waitForFunction(() => window.T?.ready, null, { timeout: 60_000 });
}, 90_000);

const home = () => page.getByRole("button", { name: "Home", exact: true });
const start = () => page.getByRole("button", { name: "Start exam (owner) →" }).first();

async function beginExam() {
  await start().waitFor({ state: "visible" });
  await start().click();
  await page.getByRole("button", { name: "Begin exam" }).click();
  await page.getByText("STEM ONE").waitFor();
}

describe("leaving a readiness exam", () => {
  it("scores the committed answers and records each one before going home", async () => {
    await beginExam();
    await page.getByRole("button", { name: "Alpha" }).click();
    await page.getByRole("button", { name: "Next →" }).click();
    await page.getByText("STEM TWO").waitFor();
    expect(await page.getByTestId("place").innerText()).toBe("exam");
    await home().click();
    await page.waitForFunction(() => document.querySelector("[data-testid=place]")?.textContent === "home");
    const submits = await page.evaluate(() => window.T.submits());
    const log = await page.evaluate(() => window.T.log());
    expect(submits).toHaveLength(1);
    expect(submits[0].responses).toEqual([{ key: "k1", sel: [0], order: [] }]);
    expect(submits[0].keys).toEqual(["k1", "k2"]);
    expect(submits[0].timedOut).toBe(false);
    expect(log).toEqual([
      { event: "record", id: 11, ok: true },
      { event: "home", destination: "home" },
    ]);
  });

  it("keeps the same answers when scoring fails, then records them once on retry", async () => {
    await page.evaluate(() => window.T.fail(1));
    await beginExam();
    await page.getByRole("button", { name: "Alpha" }).click();
    await page.getByRole("button", { name: "Next →" }).click();
    await page.getByText("STEM TWO").waitFor();
    await home().click();
    await page.getByRole("button", { name: "Try again" }).waitFor();
    expect(await page.getByTestId("place").innerText()).toBe("exam");
    expect(await page.evaluate(() => window.T.log())).toEqual([]);
    await page.getByRole("button", { name: "Try again" }).click();
    await page.waitForFunction(() => document.querySelector("[data-testid=place]")?.textContent === "home");
    const submits = await page.evaluate(() => window.T.submits());
    expect(submits).toHaveLength(2);
    expect(submits[1].responses).toEqual(submits[0].responses);
    expect(submits[1].attemptId).toBe(submits[0].attemptId);
    expect(await page.evaluate(() => window.T.log())).toEqual([
      { event: "record", id: 11, ok: true },
      { event: "home", destination: "home" },
    ]);
  });

  it("does not take a later exam home when the failed one was abandoned", async () => {
    await page.evaluate(() => window.T.fail(1));
    await beginExam();
    await page.getByRole("button", { name: "Alpha" }).click();
    await page.getByRole("button", { name: "Next →" }).click();
    await page.getByText("STEM TWO").waitFor();
    await home().click();
    await page.getByRole("button", { name: "Back to exams" }).click();
    await beginExam();
    await page.getByRole("button", { name: "Alpha" }).click();
    await page.getByRole("button", { name: "Next →" }).click();
    await page.getByRole("button", { name: "Gamma" }).click();
    await page.getByRole("button", { name: "Submit final answer" }).click();
    await page.getByText("complete").waitFor();
    expect(await page.getByTestId("place").innerText()).toBe("exam");
    const log = await page.evaluate(() => window.T.log());
    expect(log.map((entry) => entry.event)).toEqual(["record", "record"]);
    expect(log.map((entry) => entry.id)).toEqual([11, 12]);
  });
});
