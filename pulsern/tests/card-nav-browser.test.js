/* Cards Back / Skip / Next on a 390×844 phone: tap targets, and the row
   stays clear of the labs button and the tab bar. A skip does not grade. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchBrowser } from "../ops/browser.mjs";

const supabaseStub = {
  name: "card-nav-test-supabase",
  enforce: "pre",
  resolveId(source) { return /(^|\/)supabase\.js$/.test(source) ? "\0supabase-stub" : null; },
  load(id) {
    return id === "\0supabase-stub"
      ? 'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from() { return { select() { return this; }, insert: async () => ({ error: null }) }; } };'
      : null;
  },
};

function overlaps(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5
    && a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;
}

let server, browser, page;
beforeAll(async () => {
  server = await createServer({
    configFile: false, cacheDir: "node_modules/.vite-card-nav-browser",
    root: process.cwd(),
    plugins: [supabaseStub, react()],
    logLevel: "silent",
    server: { port: 0, host: "127.0.0.1" },
    optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime"] },
  });
  await server.listen();
  browser = await launchBrowser({ proxy: undefined });
  page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on("pageerror", (err) => { throw err; });
  await page.goto(`${server.resolvedUrls.local[0]}tests/browser/card-nav.html`);
  await page.waitForFunction(() => window.T?.ready && document.body.innerText.includes("Card one front"), null, { timeout: 60_000 });
}, 120_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

describe("card navigation on a phone", () => {
  it("places Back, Skip, and Next clear of the labs button and the tab bar", async () => {
    const back = page.getByRole("button", { name: "Back to the previous card" });
    const skip = page.getByRole("button", { name: "Skip this card without grading it" });
    const next = page.getByRole("button", { name: "Next card. This one stays ungraded and comes back later in this queue" });
    expect(await back.isDisabled()).toBe(true);
    const boxes = [];
    for (const button of [back, skip, next, page.getByRole("button", { name: "No skipped cards" })]) {
      const box = await button.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      boxes.push(box);
    }
    const fab = await page.getByRole("button", { name: "Lab values" }).boundingBox();
    const tabs = await page.getByRole("navigation", { name: "Sections" }).boundingBox();
    for (const box of boxes) {
      expect(overlaps(box, fab)).toBe(false);
      expect(overlaps(box, tabs)).toBe(false);
    }
    const nextBox = boxes[2];
    expect(fab.x - (nextBox.x + nextBox.width)).toBeGreaterThanOrEqual(24);
    expect(tabs.y - (nextBox.y + nextBox.height)).toBeGreaterThanOrEqual(8);
    await page.locator(".card-nav").scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    const again = [];
    for (const button of [back, skip, next]) again.push(await button.boundingBox());
    const fab2 = await page.getByRole("button", { name: "Lab values" }).boundingBox();
    const tabs2 = await page.getByRole("navigation", { name: "Sections" }).boundingBox();
    for (const box of again) {
      expect(overlaps(box, fab2)).toBe(false);
      expect(overlaps(box, tabs2)).toBe(false);
    }
  }, 60_000);

  it("skips without grading, walks history, and still grades on Good", async () => {
    await page.reload();
    await page.waitForFunction(() => document.body.innerText.includes("Card one front"));
    const srs = () => page.getByTestId("srs").innerText();
    const news = () => page.getByTestId("news").innerText();
    const front = () => page.locator(".fc-text").innerText();
    expect(await srs()).toBe("{}");
    expect(await news()).toBe("0");

    const field = page.getByRole("textbox", { name: "Type your answer before flipping" });
    await field.fill("sixty");
    await field.press("ArrowLeft");
    await field.press("ArrowRight");
    expect(await front()).toBe("Card one front");
    expect(await field.inputValue()).toBe("sixty");

    await page.locator(".eyebrow").first().click();
    await page.keyboard.press("ArrowRight");
    expect(await front()).toBe("Card two front");
    expect(await srs()).toBe("{}");
    expect(await news()).toBe("0");

    await page.keyboard.press("ArrowLeft");
    expect(await front()).toBe("Card one front");
    expect(await page.getByRole("textbox", { name: "Type your answer before flipping" }).inputValue()).toBe("sixty");
    await page.locator(".eyebrow").first().click();
    await page.keyboard.press("ArrowRight");
    expect(await front()).toBe("Card two front");
    expect(await srs()).toBe("{}");

    await page.locator(".flashcard").click();
    await page.getByRole("button", { name: /^Good/ }).click();
    await page.waitForFunction(() => document.querySelector("[data-testid=srs]")?.textContent?.includes("c2"));
    expect(await news()).toBe("1");
    expect(await front()).toBe("Card three front");
  }, 60_000);
});
