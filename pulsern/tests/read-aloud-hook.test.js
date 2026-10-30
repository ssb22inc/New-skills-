/* The real playback hook, mounted in a real browser: when audio may start,
   and when it must stop. Students must only ever hear checked audio for
   the item on screen:
   - an item with any part not yet voiced (202) or refused never starts;
   - a response that arrives after the item changed or the reader closed
     never starts the old item's audio;
   - moving from the question to its explanation (or to the next item)
     stops what was playing;
   - a part refused by the check is shown, not voiced, and the rest plays;
   - on a strict-autoplay browser, every passage still plays after one tap.
   The page (tests/browser/read-aloud-harness.jsx) runs the shipped hook,
   served by Vite, with only the voice route and the audio element stood
   in for. Each test gets a fresh page: the module's link cache,
   preferences and shared player start empty, as on a fresh visit. */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { launchBrowser } from "../ops/browser.mjs";

/* The page signs in as nobody: the Supabase client is a stand-in that
   hands the voice client a token. */
const supabaseStub = {
  name: "read-aloud-test-supabase",
  enforce: "pre",
  resolveId(source) { return /(^|\/)supabase\.js$/.test(source) ? "\0supabase-stub" : null; },
  load(id) { return id === "\0supabase-stub" ? 'export const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };' : null; },
};

let server, browser, page, base;
beforeAll(async () => {
  server = await createServer({ configFile: false, root: process.cwd(), plugins: [supabaseStub, react()], logLevel: "silent", server: { port: 0, host: "127.0.0.1" }, optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime"] } });
  await server.listen();
  base = server.resolvedUrls.local[0];
  browser = await launchBrowser({ proxy: undefined });
}, 120_000);
afterAll(async () => { await browser?.close(); await server?.close(); });
beforeEach(async () => {
  page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => { throw e; });
  await page.goto(`${base}tests/browser/read-aloud.html`);
  await page.waitForFunction(() => window.T?.ready, null, { timeout: 60_000 });
}, 90_000);

const T = (fn, arg) => page.evaluate(fn, arg);
const SEGS = [{ id: "stem", text: "Which value is the priority?" }, { id: "opt0", text: "Potassium 2.9." }, { id: "opt1", text: "Sodium 138." }];
const REF = (id) => ({ kind: "question", id, part: "question" });
const render = (props) => T((p) => window.T.render(p), props);
const tap = (method) => T((m) => window.T.tap(m), method);
const answer = (replies) => T((r) => window.T.answer(r), replies);
const state = () => T(() => window.T.state());
const pending = () => T(() => window.T.pending());
const end = () => T(() => window.T.end());
const gap = (ms) => T((m) => window.T.gap(m), ms);
const strict = (patch) => T((p) => Object.assign(window.T.env, p), patch);
const ALL_READY = { "*": [200, "url"] };

describe("useReadAloud, mounted in a browser", () => {
  it("plays every checked part in order, highlighting each, through one shared player", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    expect((await pending()).map((b) => b.seg)).toEqual(["stem", "opt0", "opt1"]); // the whole item is asked for at once
    await answer(ALL_READY);
    let s = await state();
    expect(s.played).toEqual(["https://signed.example/1/stem"]);
    expect(s.active).toBe("stem");
    expect(s.status).toBe("playing");
    await end();
    await gap();
    s = await state();
    expect(s.played).toEqual(["https://signed.example/1/stem", "https://signed.example/1/opt0"]);
    expect(s.active).toBe("opt0");
    expect(s.elements).toBe(1);
  });

  it("plays every passage on a strict-autoplay browser after one tap, even when the voice was not cached", async () => {
    await strict({ strict: true });
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer(ALL_READY); // arrives after the tap is over
    expect((await state()).played).toEqual(["https://signed.example/1/stem"]);
    await end(); await gap();
    await end(); await gap();
    expect((await state()).played).toEqual(["https://signed.example/1/stem", "https://signed.example/1/opt0", "https://signed.example/1/opt1"]);
  });

  it("unlocks with a real, decodable silent clip", async () => {
    const s = await T(() => window.T.silent());
    expect(s.prefix).toBe("data:audio/wav;base64,");
    expect(s.samples).toBe(800); // 100 ms at 8 kHz
    expect(s.emptySamples).toBe(0); // an empty WAV (no samples) is what a decoder may refuse
  });

  it("asks for one more tap when the browser holds the sound back, and then plays", async () => {
    await strict({ strict: true, refuseUnlock: true });
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer(ALL_READY);
    let s = await state();
    expect(s.played).toEqual([]);
    expect(s.status).toBe("blocked");
    await strict({ refuseUnlock: false });
    await tap("resume"); // the second tap, with links already fetched
    expect((await state()).played).toEqual(["https://signed.example/1/stem"]);
  });

  it("never starts audio when any part is still being prepared", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ opt0: [202, { queued: true }], "*": [200, "url"] });
    const s = await state();
    expect(s.played).toEqual([]);
    expect(s.status).toBe("preparing");
  });

  it("reports the real failure, not 'being prepared', when some parts were queued and others refused", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ stem: [202, { queued: true }], "*": [429, { error: "Daily voice limit reached" }] });
    const s = await state();
    expect(s.played).toEqual([]);
    expect(s.status).toBe("unavailable");
  });

  it("says the voice will be prepared after midnight when today's budget is spent", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ "*": [202, { queued: true, after: "tomorrow" }] });
    const s = await state();
    expect(s.played).toEqual([]);
    expect(s.status).toBe("preparing-tomorrow");
    const bar = await T(() => window.T.barText());
    expect(bar.text).toContain(bar.notes["preparing-tomorrow"]);
  });

  it("never starts audio when the voice is unavailable", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ "*": [429, { error: "Daily voice limit reached" }] });
    const s = await state();
    expect(s.played).toEqual([]);
    expect(s.status).toBe("unavailable");
  });

  it("shows a part refused by the check without voicing it, then plays the rest", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ opt0: [422, { error: "Voice check failed" }], "*": [200, "url"] });
    await end();
    await gap();
    const s = await state();
    expect(s.active).toBe("opt0");
    expect(s.silent).toBe(true);
    expect(s.played).toEqual(["https://signed.example/1/stem"]); // nothing voiced for the refused part
    await gap(2500);
    expect((await state()).played).toEqual(["https://signed.example/1/stem", "https://signed.example/1/opt1"]);
  });

  it("never asks the server for a part whose signs could be read two ways; shows it on screen in turn", async () => {
    const segs = [SEGS[0], { id: "opt0", text: "0.1 milligrams per kilogram · 70 kg." }, SEGS[2]];
    await render({ segments: segs, itemKey: "q:2", itemRef: REF(2) });
    await tap("play");
    expect((await pending()).map((b) => b.seg)).toEqual(["stem", "opt1"]);
    await answer(ALL_READY);
    await end();
    await gap();
    const s = await state();
    expect(s.active).toBe("opt0");
    expect(s.silent).toBe(true);
    await gap(3500); // its reading time on screen
    expect((await state()).played).toEqual(["https://signed.example/2/stem", "https://signed.example/2/opt1"]);
  });

  it("shows a one-part card whose voice failed the check on screen, instead of 'try again later'", async () => {
    await render({ segments: [{ id: "card-front", text: "Potassium 2.9 milliequivalents per liter." }], itemKey: "c:4", itemRef: { kind: "card", id: 4, part: "front" } });
    await tap("play");
    await answer({ "*": [422, { error: "Voice check failed" }] });
    const s = await state();
    expect(s.status).toBe("playing");
    expect(s.active).toBe("card-front");
    expect(s.silent).toBe(true);
    expect(s.played).toEqual([]);
    const bar = await T(() => window.T.barText());
    expect(bar.text).toContain(bar.notes.silent);
    await gap(2500);
    expect((await state()).status).toBe("idle");
  });

  it("does not start the old item's audio when its answer arrives after the item changed", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await T(() => window.T.hold());
    await render({ segments: SEGS, itemKey: "q:2", itemRef: REF(2) }); // the student moved on
    await T(() => window.T.releaseHeld());
    const s = await state();
    expect(s.played).toEqual([]);
    expect(s.status).toBe("idle");
  });

  it("does not start audio when its answer arrives after the reader closed", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await T(() => window.T.hold());
    await T(() => window.T.unmount());
    await T(() => window.T.releaseHeld());
    expect((await state()).played).toEqual([]);
  });

  it("stops the question's audio when the explanation (or the next item) takes over", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer(ALL_READY);
    expect((await state()).paused).toBe(false);
    await render({ segments: [], itemKey: "off", itemRef: REF(1) }); // answered: the question reader switches off
    const s = await state();
    expect(s.paused).toBe(true);
    expect(s.status).toBe("idle");
    expect(s.played).toHaveLength(1);
  });

  it("with read-each-new-one ON, reads a new item by itself but never a reader switched off", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await T(() => window.T.setPrefs({ auto: true }));
    expect((await state()).prefs.auto).toBe(true);
    // switched off, with something it could read: it must not start
    await render({ segments: SEGS, itemKey: "off", itemRef: REF(1) });
    expect(await pending()).toEqual([]);
    // a new item: it starts by itself
    await render({ segments: SEGS, itemKey: "q:2", itemRef: REF(2) });
    expect((await pending()).map((b) => b.ref.id)).toEqual([2, 2, 2]);
  });

  it("has no voice at all for an item outside the bank", async () => {
    await render({ segments: SEGS, itemKey: "q:local", itemRef: null });
    expect((await state()).available).toBe(false);
    await tap("play");
    expect(await pending()).toEqual([]);
    expect((await state()).played).toEqual([]);
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
