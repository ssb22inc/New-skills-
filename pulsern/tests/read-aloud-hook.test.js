/* The real playback hook, mounted in a real browser: when audio may start,
   and when it must stop. Students must only ever hear checked audio for
   the item on screen:
   - a cached clip plays as soon as Listen is tapped;
   - with no clip cached, the device starts speaking inside that tap, and
     later parts switch to the AI clip once it is ready;
   - a part the bank refuses stays on screen and does not hold up the next one;
   - a response that arrives after the item changed or the reader closed
     never starts the old item's audio;
   - moving from the question to its explanation (or to the next item)
     stops what was playing;
   - a part refused by the check is shown, not voiced, and the rest plays;
   - a part whose signs could be read two ways is shown, not guessed;
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
  it("records a device-speech call, so an unchecked fallback cannot pass unnoticed", async () => {
    await T(() => { window.speechSynthesis.speak(new SpeechSynthesisUtterance("unchecked dose")); });
    expect((await state()).spoken).toContain("unchecked dose");
  });

  it("plays every checked part in order, highlighting each, through one shared player", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    expect((await pending()).map((b) => b.seg)).toEqual(["stem", "opt0", "opt1"]); // the whole item is asked for as soon as it is shown
    await answer(ALL_READY); // cached before the tap, so Listen plays the clip at once
    await tap("play");
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

  it("on a device with no voice of its own, shows a part whose audio never starts, then plays the next ready part", async () => {
    await strict({ noDeviceVoice: true });
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await strict({ hangPlay: true });
    await tap("play");
    await answer(ALL_READY);
    await gap(1200);
    let s = await state();
    expect(s.active).toBe("stem");
    expect(s.silent).toBe(true);
    expect(s.played).toEqual([]);
    await strict({ hangPlay: false });
    await gap(2500);
    expect((await state()).played).toEqual(["https://signed.example/1/opt0"]);
  });

  it("on a device with no voice of its own, does not wait out a fresh link that never arrives", async () => {
    await strict({ noDeviceVoice: true });
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await strict({ failPlay: true });
    await tap("play");
    await answer(ALL_READY);
    await gap(1200);
    let s = await state();
    expect(s.silent).toBe(true);
    expect(s.played).toEqual([]);
    await strict({ failPlay: false });
    await gap(2500);
    expect((await state()).played).toEqual(["https://signed.example/1/opt0"]);
  });

  it("on a device with no voice of its own, shows a later part whose audio never arrives, and does not play it when the answer comes late", async () => {
    await strict({ noDeviceVoice: true });
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await T(() => window.T.hold());
    await T((r) => window.T.answerHeld(r), { stem: [200, "url"] });
    expect((await state()).played).toEqual(["https://signed.example/1/stem"]);
    await end();
    await gap(1600); // the breath between parts, then the wait for the next one
    let s = await state();
    expect(s.active).toBe("opt0");
    expect(s.silent).toBe(true);
    expect(s.played).toEqual(["https://signed.example/1/stem"]);
    await T(() => window.T.releaseHeld());
    await gap(200);
    expect((await state()).played).toEqual(["https://signed.example/1/stem"]);
  });

  it("plays a cached clip on a strict-autoplay browser after one tap", async () => {
    await strict({ strict: true });
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await answer(ALL_READY);
    await tap("play");
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

  it("plays a cached clip inside the tap even when the silent unlock was refused", async () => {
    await strict({ strict: true, refuseUnlock: true });
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await answer(ALL_READY);
    await tap("play");
    expect((await state()).played).toContain("https://signed.example/1/stem");
    expect((await state()).status).toBe("playing");
  });

  it("plays the parts that are ready and reads a part still being prepared with the device voice", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await answer({ opt0: [202, { queued: true }], "*": [200, "url"] });
    await tap("play");
    expect((await state()).played).toEqual(["https://signed.example/1/stem"]);
    await end();
    await gap();
    const s = await state();
    expect(s.active).toBe("opt0");
    expect(s.silent).toBe(false);
    expect(s.source).toBe("device");
    expect(s.spoken).toEqual(["Potassium 2.9."]); // the whole number, never cut at its decimal point
    const bar = await T(() => window.T.barText());
    expect(bar.text).toContain("Device voice");
    expect(bar.text).toContain(bar.notes.device);
    await gap(800);
    expect((await state()).played).toEqual(["https://signed.example/1/stem", "https://signed.example/1/opt1"]);
  });

  it("starts the device voice inside the tap when no clip is cached, then uses the AI voice for the next part", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    let s = await state();
    expect(s.source).toBe("device");
    expect(s.spoken[0]).toBe("Which value is the priority?");
    expect(s.played).toEqual([]);
    await answer(ALL_READY);
    await gap(500);
    s = await state();
    expect(s.played).toContain("https://signed.example/1/opt0");
    expect(s.source).toBe("ai");
  });

  it("does not hold the first sound for a part that stays on screen", async () => {
    const segs = [{ id: "stem", text: "Give 2 mg/mL · volume" }, { id: "opt0", text: "Potassium 2.9." }];
    await render({ segments: segs, itemKey: "q:3", itemRef: REF(3) });
    await tap("play");
    const s = await state();
    expect(s.source).toBe("device");
    expect(s.spoken[0]).toBe("Potassium 2.9.");
    expect(s.active).toBe("opt0");
  });

  it("is never silent when no AI voice is ready yet: every part is read by the device, in order", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ "*": [202, { queued: true }] });
    await gap(1500);
    const s = await state();
    expect(s.played).toEqual([]);
    expect(s.spoken).toEqual(["Which value is the priority?", "Potassium 2.9.", "Sodium 138."]);
  });

  it("reads with the device voice while the AI voice is still being made, then uses the AI voice when it arrives", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    let s = await state();
    expect(s.source).toBe("device");
    expect(s.spoken).toEqual(["Which value is the priority?"]);
    await answer({ "*": [200, "url"] });
    await gap(600);
    s = await state();
    expect(s.played).toEqual(["https://signed.example/1/opt0"]);
    expect(s.source).toBe("ai");
  });

  it("stops the device voice on Stop", async () => {
    await T(() => Object.assign(window.T.env, { speechMs: 5000 }));
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ "*": [202, { queued: true }] });
    expect((await state()).source).toBe("device");
    await tap("stop");
    await gap(300);
    const s = await state();
    expect(s.status).toBe("idle");
    expect(s.spoken).toEqual(["Which value is the priority?"]);
  });

  it("on a device with no voice of its own, shows a part on screen when the voice is over the limit, and does not speak it", async () => {
    await strict({ noDeviceVoice: true });
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ stem: [202, { queued: true }], "*": [429, { error: "Daily voice limit reached" }] });
    const s = await state();
    expect(s.played).toEqual([]);
    expect(s.status).toBe("playing");
    expect(s.silent).toBe(true);
    expect(s.source).toBe("screen");
    expect(["preparing", "unavailable"]).toContain(s.note);
  });

  it("on a device with no voice of its own, says the voice will be prepared after midnight, and shows the part", async () => {
    await strict({ noDeviceVoice: true });
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ "*": [202, { queued: true, after: "tomorrow" }] });
    const s = await state();
    expect(s.played).toEqual([]);
    expect(s.status).toBe("playing");
    expect(s.note).toBe("preparing-tomorrow");
    const bar = await T(() => window.T.barText());
    expect(bar.text).toContain(bar.notes["preparing-tomorrow"]);
  });

  it("on a device with no voice of its own, shows the part when the voice is unavailable, instead of speaking it", async () => {
    await strict({ noDeviceVoice: true });
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ "*": [429, { error: "Daily voice limit reached" }] });
    const s = await state();
    expect(s.played).toEqual([]);
    expect(s.status).toBe("playing");
    expect(s.silent).toBe(true);
    expect(s.note).toBe("unavailable");
    const bar = await T(() => window.T.barText());
    expect(bar.text).toContain(bar.notes.unavailable);
  });

  it("does not read a part the bank refused, and shows it instead", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ opt0: [409, { error: "Text does not match the item" }], stem: [404, { error: "Not available" }], "*": [200, "url"] });
    await gap(600);
    const s = await state();
    expect(s.played).toEqual(["https://signed.example/1/opt1"]);
    expect(s.spoken.some((t) => t.startsWith("Potassium"))).toBe(false);
  });

  it("stops a device reading when a later sentence fails, instead of skipping it", async () => {
    const text = "First finding is clear. Second finding is the dose. Third finding is the plan.";
    await strict({ failUtterance: 2 });
    await render({ segments: [{ id: "stem", text }], itemKey: "q:9", itemRef: REF(9) });
    await tap("play");
    await answer({ "*": [202, { queued: true }] });
    await gap(400);
    const s = await state();
    expect(s.spoken).toEqual(["First finding is clear."]);
    expect(s.source).toBe("screen");
    expect(s.silent).toBe(true);
  });

  it("cancels a device utterance that never finishes, so it cannot keep speaking", async () => {
    await strict({ speechHang: true });
    await render({ segments: [SEGS[0]], itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ "*": [202, { queued: true }] });
    expect((await state()).source).toBe("device");
    await gap(8000);
    const s = await state();
    expect(s.spoken).toEqual(["Which value is the priority?"]);
    expect(s.status).toBe("idle");
    expect(s.source).toBe(null);
  }, 15_000);

  it("asks for a new item even when the previous item's voice requests never answered", async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, text: `Part ${i} of the first item.` }));
    await render({ segments: many, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    expect((await pending()).map((b) => b.ref.id)).toEqual([1, 1, 1, 1, 1, 1]);
    await render({ segments: SEGS, itemKey: "q:2", itemRef: REF(2) });
    await tap("play");
    await gap(100);
    const bodies = await pending();
    expect(bodies.map((b) => b.ref.id)).toContain(2);
    expect(bodies.some((b) => b.ref.id === 1)).toBe(false);
  });

  it("on a device with no voice of its own, shows a part refused by the check without voicing it, then plays the rest", async () => {
    await strict({ noDeviceVoice: true });
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap("play");
    await answer({ opt0: [422, { error: "Voice check failed" }], "*": [200, "url"] });
    await end();
    await gap();
    const s = await state();
    expect(s.active).toBe("opt0");
    expect(s.silent).toBe(true);
    expect(s.source).toBe("screen");
    expect(s.played).toEqual(["https://signed.example/1/stem"]);
    await gap(2500);
    expect((await state()).played).toEqual(["https://signed.example/1/stem", "https://signed.example/1/opt1"]);
  });

  it("never asks the server for a part whose signs could be read two ways; shows it on screen in turn", async () => {
    const segs = [SEGS[0], { id: "opt0", text: "0.1 milligrams per kilogram · 70 kg." }, SEGS[2]];
    await render({ segments: segs, itemKey: "q:2", itemRef: REF(2) });
    await tap("play");
    expect((await pending()).map((b) => b.seg)).toEqual(["stem", "opt1"]);
    await answer(ALL_READY);
    await gap(500);
    const s = await state();
    expect(s.active).toBe("opt0");
    expect(s.silent).toBe(true);
    await gap(800);
    expect((await state()).played).toEqual(["https://signed.example/2/opt1"]);
  });

  it("on a device with no voice of its own, shows a one-part card whose check failed on screen, instead of 'try again later'", async () => {
    await strict({ noDeviceVoice: true });
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
    await answer(ALL_READY);
    await tap("play");
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
    expect((await state()).status).toBe("idle"); // turning it on does not start the item already showing
    const warmed = (await pending()).length;
    // switched off, with something it could read: it must not start, and it asks for nothing new
    await render({ segments: SEGS, itemKey: "off", itemRef: REF(1) });
    expect((await state()).played).toEqual([]);
    expect((await state()).status).toBe("idle");
    expect(await pending()).toHaveLength(warmed);
    // a new item: it starts by itself
    await render({ segments: SEGS, itemKey: "q:2", itemRef: REF(2) });
    expect((await pending()).filter((b) => b.ref.id === 2).map((b) => b.ref.id)).toEqual([2, 2, 2]);
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
