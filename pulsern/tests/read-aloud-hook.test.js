/* The real reading hook, mounted in a real browser: what the device's
   voice says, in what order, and when it must stop.
   - every part is spoken in order, with its highlight, in the best English
     voice the device offers, at the student's speed;
   - on a strict browser (Safari, iOS) one tap reads the whole item;
   - a part whose signs could be read two ways is shown, not spoken;
   - moving to the explanation or the next item, closing the reader, or
     another voice starting, stops what was being read;
   - a browser with no speech engine shows no Listen button.
   The page (tests/browser/read-aloud-harness.jsx) runs the shipped hook,
   served by Vite, with only the speech engine stood in for. Each test gets
   a fresh page, as on a fresh visit. */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchBrowser } from "../ops/browser.mjs";

let server, browser, page, base;
const open = async (query = "") => {
  page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => { throw e; });
  await page.goto(`${base}tests/browser/read-aloud.html${query}`);
  await page.waitForFunction(() => window.T?.ready, null, { timeout: 60_000 });
};
beforeAll(async () => {
  server = await createServer({ configFile: false, root: process.cwd(), plugins: [react()], logLevel: "silent", server: { port: 0, host: "127.0.0.1" }, optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime"] } });
  await server.listen();
  base = server.resolvedUrls.local[0];
  browser = await launchBrowser({ proxy: undefined });
}, 120_000);
afterAll(async () => { await browser?.close(); await server?.close(); });
beforeEach(() => open(), 90_000);

const T = (fn, arg) => page.evaluate(fn, arg);
const SEGS = [{ id: "stem", text: "Which value is the priority?" }, { id: "opt0", text: "Potassium 2.9 milliequivalents per liter." }, { id: "opt1", text: "Sodium 138." }];
const render = (props) => T((p) => window.T.render(p), props);
const tap = (method) => T((m) => window.T.tap(m), method);
const state = () => T(() => window.T.state());
const finish = () => T(() => window.T.finish());
const gap = (ms) => T((m) => window.T.gap(m), ms);
const env = (patch) => T((p) => Object.assign(window.T.env, p), patch);
const next = async () => { await finish(); await gap(); };

describe("reading with the device's voice, in a browser", () => {
  it("speaks every part in order, highlighting each, the moment Listen is pressed", async () => {
    await render({ segments: SEGS, itemKey: "q:1" });
    await tap("play");
    let s = await state();
    expect(s.spoken).toEqual(["Which value is the priority?"]); // at once: nothing to download or wait for
    expect(s.active).toBe("stem");
    expect(s.status).toBe("playing");
    await next();
    s = await state();
    expect(s.active).toBe("opt0");
    expect(s.spoken.at(-1)).toBe("Potassium 2.9 milliequivalents per liter."); // a decimal is never split
    await next();
    await next();
    s = await state();
    expect(s.spoken).toEqual(SEGS.map((x) => x.text));
    expect(s.status).toBe("idle");
    expect(s.active).toBe(null);
  });

  it("uses the best English voice the device offers, at the student's speed", async () => {
    await render({ segments: SEGS, itemKey: "q:1" });
    await T(() => window.T.setPrefs({ rate: 1.25 }));
    await tap("play");
    const [u] = (await state()).utterances;
    expect(u.voice).toBe("Google US English"); // not the novelty voice, not the default, not French
    expect(u.lang).toBe("en-US");
    expect(u.rate).toBe(1.25);
    // a new speed applies from the next sentence
    await T(() => window.T.setPrefs({ rate: 0.8 }));
    await next();
    expect((await state()).utterances.at(-1).rate).toBe(0.8);
  });

  it("reads the whole item after one tap on a strict browser (Safari, iOS)", async () => {
    await env({ strict: true });
    await render({ segments: SEGS, itemKey: "q:1" });
    await tap("play");
    await next(); await next(); await next();
    expect((await state()).spoken).toEqual(SEGS.map((x) => x.text));
  });

  it("asks for one more tap when the browser holds the sound back, and then reads", async () => {
    await env({ strict: true, refuse: true });
    await render({ segments: SEGS, itemKey: "q:1" });
    await tap("play");
    let s = await state();
    expect(s.status).toBe("blocked");
    expect(s.spoken).toEqual([]);
    const bar = await T(() => window.T.barText());
    expect(bar.text).toContain(bar.notes.blocked);
    await env({ refuse: false });
    await tap("resume");
    s = await state();
    expect(s.spoken).toEqual(["Which value is the priority?"]);
    expect(s.status).toBe("playing");
  });

  it("says so, and stops, when the voice fails part-way", async () => {
    await render({ segments: SEGS, itemKey: "q:1" });
    await tap("play");
    await env({ failNext: true });
    await next();
    const s = await state();
    expect(s.status).toBe("error");
    const bar = await T(() => window.T.barText());
    expect(bar.text).toContain(bar.notes.error);
  });

  it("shows a part whose signs could be read two ways, without speaking it, then reads the rest", async () => {
    const segs = [SEGS[0], { id: "opt0", text: "0.1 milligrams per kilogram · 70 kg." }, SEGS[2]];
    await render({ segments: segs, itemKey: "q:2" });
    await tap("play");
    await next();
    let s = await state();
    expect(s.active).toBe("opt0");
    expect(s.silent).toBe(true);
    const bar = await T(() => window.T.barText());
    expect(bar.text).toContain(bar.notes.silent);
    await gap(3500); // its reading time on screen
    s = await state();
    expect(s.spoken).toEqual(["Which value is the priority?", "Sodium 138."]);
    expect(s.spoken.join(" ")).not.toContain("·");
  });

  it("pauses at the current part and resumes from its start", async () => {
    await render({ segments: SEGS, itemKey: "q:1" });
    await tap("play");
    await next();
    await tap("pause");
    let s = await state();
    expect(s.status).toBe("paused");
    expect(s.speaking).toBe(false);
    await tap("resume");
    s = await state();
    expect(s.spoken.at(-1)).toBe("Potassium 2.9 milliequivalents per liter."); // the same part again, from its start
    expect(s.active).toBe("opt0");
  });

  it("stops the old item's voice when the student moves on", async () => {
    await render({ segments: SEGS, itemKey: "q:1" });
    await tap("play");
    await render({ segments: SEGS, itemKey: "q:2" });
    const s = await state();
    expect(s.speaking).toBe(false);
    expect(s.status).toBe("idle");
    await gap();
    expect((await state()).spoken).toEqual(["Which value is the priority?"]); // nothing more of the old item
  });

  it("stops when the reader closes", async () => {
    await render({ segments: SEGS, itemKey: "q:1" });
    await tap("play");
    await T(() => window.T.unmount());
    await gap();
    const s = await state();
    expect(s.speaking).toBe(false);
    expect(s.spoken).toEqual(["Which value is the priority?"]);
  });

  it("stops the question's voice when the explanation takes over", async () => {
    await render({ segments: SEGS, itemKey: "q:1" });
    await tap("play");
    await render({ segments: [], itemKey: "off" }); // answered: the question reader switches off
    const s = await state();
    expect(s.speaking).toBe(false);
    expect(s.status).toBe("idle");
  });

  it("stops when another voice on the page starts (a diagram's narration)", async () => {
    await render({ segments: SEGS, itemKey: "q:1" });
    await tap("play");
    await T(() => window.T.otherAudioPlays());
    const s = await state();
    expect(s.speaking).toBe(false);
    expect(s.status).toBe("idle");
  });

  it("with read-each-new-one ON, reads a new item by itself but never a reader switched off", async () => {
    await render({ segments: SEGS, itemKey: "q:1" });
    await T(() => window.T.setPrefs({ auto: true }));
    expect((await state()).prefs.auto).toBe(true);
    await render({ segments: SEGS, itemKey: "off" });
    expect((await state()).spoken).toEqual([]);
    await render({ segments: SEGS, itemKey: "q:2" });
    expect((await state()).spoken).toEqual(["Which value is the priority?"]);
  });

  it("shows no Listen button on a browser with no speech voice", async () => {
    await open("?nospeech");
    await render({ segments: SEGS, itemKey: "q:1" });
    expect((await state()).available).toBe(false);
    expect((await T(() => window.T.barText())).text).toBe("");
  });
});

describe("exhibits while being read", () => {
  it("opens the exhibit being read, leaves the student's own choices alone otherwise", async () => {
    let panels = await T(() => window.T.exhibits(null));
    expect(panels.map((d) => d.open)).toEqual([true, false]);
    // the student closes the first panel themselves
    await T(() => window.T.closePanel(0));
    // read aloud reaches the second exhibit (say, shown on screen only): it opens and is highlighted
    panels = await T(() => window.T.exhibits("exhibit1"));
    expect(panels[1].open).toBe(true);
    expect(panels[1].className).toContain("ra-now");
    expect(panels[0].open).toBe(false); // their choice stands
  });
});
