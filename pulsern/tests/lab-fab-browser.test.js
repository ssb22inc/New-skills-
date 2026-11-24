/* The floating 🧪 study toolkit in a real browser (phone 390×844 and
   desktop 1280×800): default spot clear of every target, touch and mouse
   drag, remembered position, snap-off when dropped on Next, keyboard open
   and Escape, the question kept underneath, and the AI lookup sending the
   same signed-in request as before (anonymous → the server's 401 → the
   same error text). /api/ai is stood in for with the server's own door. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchBrowser } from "../ops/browser.mjs";

const supabaseStub = {
  name: "lab-fab-test-supabase",
  enforce: "pre",
  resolveId(source) { return /(^|\/)supabase\.js$/.test(source) ? "\0supabase-stub" : null; },
  load(id) {
    return id === "\0supabase-stub"
      ? 'export const supabase = { auth: { getSession: async () => ({ data: { session: window.__session || null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from() { return { select() { return this; }, insert: async () => ({ error: null }) }; } };'
      : null;
  },
};

const overlaps = (a, b) => a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5 && a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;

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

async function open(viewport, { touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { throw e; });
  const calls = [];
  await page.route("**/api/ai", async (route) => {
    const req = route.request(); const body = JSON.parse(req.postData() || "{}");
    const auth = req.headers().authorization || "";
    calls.push({ auth, body });
    if (!/^Bearer\s+\S+/.test(auth) && !body.token) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Sign in first" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "Preload: end-diastolic stretch on the ventricle." }) });
  });
  await page.goto(`${base}tests/browser/lab-fab.html`);
  await page.waitForFunction(() => window.T?.ready, null, { timeout: 90_000 });
  await page.waitForFunction(() => document.querySelector(".lab-fab")?.dataset.x !== "", null, { timeout: 10_000 });
  await page.waitForTimeout(300);
  return { ctx, page, calls };
}

const fab = (page) => page.locator(".lab-fab");
const targets = async (page) => {
  const out = [];
  for (const l of [page.locator("main button"), page.locator("nav.tabs")]) for (const h of await l.all()) out.push(await h.boundingBox());
  return out.filter(Boolean);
};
const clearOfAll = async (page) => {
  const f = await fab(page).boundingBox();
  for (const t of await targets(page)) if (overlaps(f, t)) return false;
  return true;
};
async function mouseDrag(page, to) {
  const b = await fab(page).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(450);
}

describe("floating 🧪 study toolkit", () => {
  for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
    it(`starts clear of every button, option, nav row and the tab bar (${name})`, async () => {
      const { ctx, page } = await open(viewport);
      const f = await fab(page).boundingBox();
      /* A phone whose reading column fills the screen has no full-size
         gap, so the button shrinks to an edge tab. That tab stays 44px tall. */
      expect(f.height).toBeGreaterThanOrEqual(44);
      expect(f.width).toBeGreaterThanOrEqual(name === "phone" ? 28 : 44);
      expect(await clearOfAll(page)).toBe(true);
      expect(f.x + f.width).toBeLessThanOrEqual(viewport.width);
      expect(f.y + f.height).toBeLessThanOrEqual(viewport.height);
      await ctx.close();
    }, 120_000);
  }

  it("drags with a mouse, stays inside the screen, is remembered, and a drag never opens it", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 });
    await mouseDrag(page, { x: 30, y: 180 });
    const b = await fab(page).boundingBox();
    expect(b.x).toBeLessThan(195);
    expect(await page.locator(".toolkit.open").count()).toBe(0);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem("pulsern-labfab-v1"))).side).toBe("left");
    await mouseDrag(page, { x: -200, y: -200 });
    const c = await fab(page).boundingBox();
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
    await page.reload();
    await page.waitForFunction(() => document.querySelector(".lab-fab")?.dataset.x !== "");
    await page.waitForTimeout(300);
    expect((await fab(page).boundingBox()).x).toBeLessThan(195);
    expect(await clearOfAll(page)).toBe(true);
    await ctx.close();
  }, 120_000);

  it("drags with touch (pointer events) on a phone", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 }, { touch: true });
    const cdp = await ctx.newCDPSession(page);
    const b = await fab(page).boundingBox();
    const sx = b.x + b.width / 2, sy = b.y + b.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy }] });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx + (30 - sx) * i / 10, y: sy + (200 - sy) * i / 10 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(450);
    expect((await fab(page).boundingBox()).x).toBeLessThan(195);
    expect(await page.locator(".toolkit.open").count()).toBe(0);
    await ctx.close();
  }, 120_000);

  it("moves clear when a short stem grows into a long one", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 });
    await page.evaluate(() => { window.T.setCrowded(false); window.T.setStem("Short stem."); });
    await page.waitForTimeout(200);
    const stem = await page.locator(".stem").boundingBox();
    await mouseDrag(page, { x: stem.x + stem.width - 20, y: stem.y + stem.height + 48 });
    const parked = await fab(page).boundingBox();
    expect(overlaps(parked, stem)).toBe(false);
    await page.evaluate(() => window.T.setStem("Which client should the nurse see first? " + "The deciding finding continues across the full width of the question. ".repeat(12)));
    await page.waitForTimeout(250);
    const button = await fab(page).boundingBox();
    const grown = await page.locator(".stem").boundingBox();
    expect(overlaps(parked, grown), JSON.stringify({ parked, grown })).toBe(true);
    expect(overlaps(button, grown)).toBe(false);
    await ctx.close();
  }, 120_000);

  it("never covers a clinical diagram, image, or table", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 });
    for (const selector of [".exh-wrap", ".exh-svg", ".ngn-matrix", ".mx-row", "figure", "img", "table"]) {
      const region = await page.locator(selector).first().boundingBox();
      expect(region, selector).toBeTruthy();
      await mouseDrag(page, { x: region.x + Math.min(region.width / 2, 40), y: region.y + region.height / 2 });
      const button = await fab(page).boundingBox();
      expect(overlaps(button, region), selector).toBe(false);
    }
    await ctx.close();
  }, 120_000);

  it("keeps question navigation on screen when the stem is long, and Check answer clear at the screenshot size", async () => {
    const long = await open({ width: 390, height: 844 });
    await long.page.evaluate(() => window.T.setStem("Which client should the nurse see first? " + "The deciding finding continues across the question. ".repeat(40)));
    await long.page.waitForTimeout(250);
    const stuck = await long.page.locator(".q-nav-wrap").boundingBox();
    expect(stuck.y).toBeGreaterThanOrEqual(0);
    expect(stuck.y + stuck.height).toBeLessThanOrEqual(844);
    await long.ctx.close();
    const { ctx, page } = await open({ width: 720, height: 620 });
    await page.evaluate(() => {
      document.querySelectorAll(".ngn-matrix, .exh-wrap, figure, table, .rationale, .chart").forEach((el) => { el.style.display = "none"; });
    });
    await page.waitForTimeout(200);
    const check = await page.getByRole("button", { name: "Check answer" }).boundingBox();
    const nav = await page.locator(".q-nav-wrap").boundingBox();
    expect(check && nav).toBeTruthy();
    expect(overlaps(check, nav)).toBe(false);
    expect(check.y + check.height).toBeLessThanOrEqual(nav.y + 0.5);
    await ctx.close();
  }, 120_000);

  it("never covers the stem, rationale, or chart after a drag or a snap", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 });
    const reading = async () => {
      const boxes = [];
      for (const handle of await page.locator(".stem, .rationale, .chart").all()) {
        const box = await handle.boundingBox();
        if (box) boxes.push(box);
      }
      return boxes;
    };
    const clearOfReading = async () => {
      const button = await fab(page).boundingBox();
      for (const region of await reading()) if (overlaps(button, region)) return false;
      return true;
    };
    expect(await clearOfReading()).toBe(true);
    for (const selector of [".stem", ".rationale", ".chart"]) {
      const region = await page.locator(selector).boundingBox();
      await mouseDrag(page, { x: region.x + Math.min(region.width - 4, 40), y: region.y + region.height / 2 });
      expect(await clearOfReading(), selector).toBe(true);
    }
    await fab(page).focus();
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(250);
      expect(await clearOfReading(), key).toBe(true);
    }
    await ctx.close();
  }, 120_000);

  it("dropped on top of Next, it snaps to a clear spot on an edge", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 });
    const next = await page.getByRole("button", { name: "Next question" }).boundingBox();
    await mouseDrag(page, { x: next.x + next.width / 2, y: next.y + next.height / 2 });
    expect(await clearOfAll(page)).toBe(true);
    const f = await fab(page).boundingBox();
    expect(f.x < 20 || f.x + f.width > 370).toBe(true);
    await ctx.close();
  }, 120_000);

  it("does not answer the question underneath an open toolkit", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 });
    await page.locator(".lab-fab").click();
    await page.waitForSelector(".toolkit.open");
    await page.getByLabel("Search a lab value or ask any NCLEX question").fill("potassium");
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");
    expect(await page.locator("[aria-checked='true']").count()).toBe(0);
    await ctx.close();
  }, 120_000);

  it("opens by tap or keyboard over the question without losing it; Escape closes and focus returns", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 });
    await page.getByRole("radio", { name: "Beta choice" }).click();
    await fab(page).click();
    await page.getByRole("dialog", { name: "Study toolkit" }).waitFor();
    expect(await page.locator(".stem").innerText()).toMatch(/STEM-ONE/);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    expect(await page.locator(".toolkit.open").count()).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.classList.contains("lab-fab"))).toBe(true);
    await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: "Study toolkit" }).waitFor();
    await page.getByRole("button", { name: "Close study toolkit" }).click();
    await page.waitForTimeout(300);
    await fab(page).focus();
    await page.keyboard.press(" ");
    await page.getByRole("dialog", { name: "Study toolkit" }).waitFor();
    await page.keyboard.press("Escape");
    expect(await page.getByRole("radio", { name: "Beta choice" }).getAttribute("aria-checked")).toBe("true");
    await ctx.close();
  }, 120_000);

  it("reset while the toolkit is open returns the button to its default spot when the toolkit closes", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 });
    const start = await fab(page).boundingBox();
    await mouseDrag(page, { x: 30, y: 180 });
    expect((await fab(page).boundingBox()).x).toBeLessThan(195);
    await fab(page).click();
    const dialog = page.getByRole("dialog", { name: "Study toolkit" });
    await dialog.waitFor();
    expect(await page.locator(".lab-fab").count()).toBe(0);
    await dialog.getByRole("button", { name: /Reset 🧪 button position/ }).click();
    await dialog.getByRole("button", { name: "Close study toolkit" }).click();
    await page.locator(".lab-fab").waitFor();
    await page.waitForFunction(() => document.querySelector(".lab-fab")?.dataset.x !== "");
    await page.waitForTimeout(300);
    const back = await fab(page).boundingBox();
    expect(Math.abs(back.x - start.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.y - start.y)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => localStorage.getItem("pulsern-labfab-v1"))).toBeNull();
    await ctx.close();
  }, 120_000);

  it("keeps Tab and Shift+Tab inside the Focus sheet and the study toolkit", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 });
    const inside = (sel) => page.evaluate((s) => document.querySelector(s)?.contains(document.activeElement) ?? false, sel);
    await page.getByRole("button", { name: /Focus:/ }).click();
    const sheet = page.getByRole("dialog", { name: "Focus filters" });
    await sheet.waitFor();
    await page.keyboard.press("Shift+Tab");
    expect(await inside(".sheet")).toBe(true);
    await page.keyboard.press("Tab");
    expect(await inside(".sheet")).toBe(true);
    await page.getByRole("button", { name: "Close filters" }).click();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.activeElement?.classList.contains("focus-trigger"))).toBe(true);

    await fab(page).click();
    const dialog = page.getByRole("dialog", { name: "Study toolkit" });
    await dialog.waitFor();
    await page.keyboard.press("Shift+Tab");
    expect(await inside(".toolkit")).toBe(true);
    await page.keyboard.press("Tab");
    expect(await inside(".toolkit")).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.activeElement?.classList.contains("lab-fab"))).toBe(true);
    await ctx.close();
  }, 120_000);

  it("arrow keys move it, so dragging is never the only way", async () => {
    const { ctx, page } = await open({ width: 390, height: 844 });
    await fab(page).focus();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(400);
    expect((await fab(page).boundingBox()).x).toBeLessThan(195);
    expect(await clearOfAll(page)).toBe(true);
    await ctx.close();
  }, 120_000);

  it("collapsible groups, search, and the AI lookup with the same signed-in request as before", async () => {
    const { ctx, page, calls } = await open({ width: 390, height: 844 });
    await fab(page).click();
    const dialog = page.getByRole("dialog", { name: "Study toolkit" });
    await dialog.waitFor();
    const electrolytes = dialog.getByRole("button", { name: /Electrolytes/ });
    expect(await electrolytes.getAttribute("aria-expanded")).toBe("false");
    await electrolytes.click();
    expect(await electrolytes.getAttribute("aria-expanded")).toBe("true");
    const search = dialog.getByRole("searchbox", { name: /Search a lab value/ });
    await search.fill("potassium");
    await expect.poll(() => dialog.locator(".lp-row").count()).toBeGreaterThan(0);
    for (const h of await dialog.locator("button").all()) {
      const b = await h.boundingBox();
      if (b) { expect(b.height).toBeGreaterThanOrEqual(44); expect(b.width).toBeGreaterThanOrEqual(44); }
    }

    await page.evaluate(() => { window.__session = { access_token: "signed-in-token" }; });
    await search.fill("what is preload");
    await dialog.getByRole("button", { name: /Ask AI/ }).click();
    await dialog.getByText(/Preload: end-diastolic stretch/).waitFor();
    await dialog.getByText(/Verify it against your course materials before relying on it/).waitFor();
    expect(calls[0].auth).toBe("Bearer signed-in-token");
    expect(calls[0].body).toMatchObject({ provider: "deepseek", maxTokens: 400, token: "signed-in-token" });
    expect(calls[0].body.prompt).toMatch(/The student typed: "what is preload"/);

    await page.evaluate(() => { window.__session = null; });
    await search.fill("what is afterload");
    await search.press("Enter");
    await dialog.getByText("The AI lookup is unavailable right now. Try again in a moment.").waitFor();
    expect(calls[1].auth).toBe("");
    expect(calls).toHaveLength(2);

    await search.fill("what is preload");
    await dialog.getByText(/Preload: end-diastolic stretch/).waitFor();
    expect(calls).toHaveLength(2); // cached for this session, as before
    await ctx.close();
  }, 120_000);
});
