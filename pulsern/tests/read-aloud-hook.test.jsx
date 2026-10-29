// @vitest-environment jsdom
/* The real playback hook, mounted: when audio may start, and when it must
   stop. Students must only ever hear checked audio for the item on screen:
   - an item with any part not yet voiced (202) or refused never starts;
   - a response that arrives after the item changed or the reader closed
     never starts the old item's audio;
   - moving from the question to its explanation (or to the next item)
     stops what was playing;
   - a part refused by the check is shown, not voiced, and the rest plays;
   - on a strict-autoplay browser, every passage still plays after one tap. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("../src/supabase.js", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const SILENT_PREFIX = "data:audio/wav";

/* Audio that records what it was asked to play. With strict = true it
   behaves like Safari/iOS: an element may make sound only if it was first
   played during a user gesture. A test ends a clip by hand. */
const env = { gesture: false, strict: false, played: [], elements: [] };
class FakeAudio {
  constructor(src) { this.src = src ?? ""; this.paused = true; this.dataset = {}; this.playbackRate = 1; this.unlocked = false; env.elements.push(this); }
  play() {
    // Like a real decoder: a WAV with no samples cannot be played.
    if (String(this.src).startsWith(SILENT_PREFIX) && wavSamples(this.src) === 0) return Promise.reject(Object.assign(new Error("no samples"), { name: "NotSupportedError" }));
    if (env.strict && env.refuseUnlock && String(this.src).startsWith(SILENT_PREFIX)) return Promise.reject(Object.assign(new Error("not allowed"), { name: "NotAllowedError" }));
    if (env.strict && !this.unlocked && !env.gesture) return Promise.reject(Object.assign(new Error("not allowed"), { name: "NotAllowedError" }));
    this.unlocked = true;
    this.paused = false;
    if (!String(this.src).startsWith(SILENT_PREFIX)) env.played.push(this.src);
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  end() { this.paused = true; this.onended?.(); }
}
const player = () => env.elements.at(-1);
/* The number of samples in a base64 WAV data URL (its data chunk length). */
function wavSamples(url) {
  const bin = atob(String(url).split(",")[1] ?? "");
  const at = bin.indexOf("data");
  if (at < 0) return 0;
  return (bin.charCodeAt(at + 4) | (bin.charCodeAt(at + 5) << 8) | (bin.charCodeAt(at + 6) << 16) | (bin.charCodeAt(at + 7) << 24)) >>> 0;
}

/* The voice route, answered by the test: each request waits until the
   test resolves it, so timing is in the test's hands. */
let pending;
function fetchStub(url, init) {
  const body = JSON.parse(init.body);
  return new Promise((resolve) => pending.push({ body, reply: (status, data) => resolve({ ok: status >= 200 && status < 300, status, json: async () => data }) }));
}
const answerAll = async (fn) => { const now = pending.splice(0); await act(async () => { for (const p of now) fn(p); }); };
const urlFor = (p) => `https://signed.example/${p.body.ref.id}/${p.body.seg}`;
const SEGS = [{ id: "stem", text: "Which value is the priority?" }, { id: "opt0", text: "Potassium 2.9." }, { id: "opt1", text: "Sodium 138." }];
const REF = (id) => ({ kind: "question", id, part: "question" });

/* A fresh copy of the module per test: its link cache, preferences and
   shared player start empty, as on a fresh page. */
let mod, host, root, reader;
function Harness({ segments, itemKey, itemRef }) {
  reader = mod.useReadAloud(segments, itemKey, itemRef);
  return null;
}
const render = async (props) => { await act(async () => root.render(<Harness {...props} />)); };
const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const tap = async (fn) => { await act(async () => { env.gesture = true; try { fn(); } finally { env.gesture = false; } }); };
const gap = async (ms = 400) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };

beforeEach(async () => {
  Object.assign(env, { gesture: false, strict: false, refuseUnlock: false, played: [], elements: [] });
  pending = [];
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", vi.fn(fetchStub));
  try { localStorage.clear(); } catch { /* ignore */ }
  vi.resetModules();
  mod = await import("../src/read-aloud.jsx");
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("useReadAloud, mounted", () => {
  it("plays every checked part in order, highlighting each, through one shared player", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap(() => reader.play());
    await flush();
    expect(pending.map((p) => p.body.seg)).toEqual(["stem", "opt0", "opt1"]); // the whole item is asked for at once
    await answerAll((p) => p.reply(200, { url: urlFor(p) }));
    await flush();
    expect(env.played).toEqual(["https://signed.example/1/stem"]);
    expect(reader.active).toBe("stem");
    expect(reader.status).toBe("playing");
    await act(async () => player().end());
    await gap();
    expect(env.played).toEqual(["https://signed.example/1/stem", "https://signed.example/1/opt0"]);
    expect(reader.active).toBe("opt0");
    expect(env.elements).toHaveLength(1);
  });

  it("plays every passage on a strict-autoplay browser after one tap, even when the voice was not cached", async () => {
    env.strict = true;
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap(() => reader.play());
    await flush();
    await answerAll((p) => p.reply(200, { url: urlFor(p) })); // arrives after the tap is over
    await flush();
    expect(env.played).toEqual(["https://signed.example/1/stem"]);
    await act(async () => player().end());
    await gap();
    await act(async () => player().end());
    await gap();
    expect(env.played).toEqual(["https://signed.example/1/stem", "https://signed.example/1/opt0", "https://signed.example/1/opt1"]);
  });

  it("unlocks with a real, decodable silent clip", () => {
    expect(mod.SILENT.startsWith("data:audio/wav;base64,")).toBe(true);
    expect(wavSamples(mod.SILENT)).toBe(800); // 100 ms at 8 kHz
    // an empty WAV (no samples) is what a decoder may refuse
    expect(wavSamples("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=")).toBe(0);
  });

  it("asks for one more tap when the browser holds the sound back, and then plays", async () => {
    env.strict = true; env.refuseUnlock = true;
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap(() => reader.play());
    await flush();
    await answerAll((p) => p.reply(200, { url: urlFor(p) }));
    await flush();
    expect(env.played).toEqual([]);
    expect(reader.status).toBe("blocked");
    env.refuseUnlock = false;
    await tap(() => reader.resume()); // the second tap, with links already fetched
    await flush();
    expect(env.played).toEqual(["https://signed.example/1/stem"]);
  });

  it("never starts audio when any part is still being prepared", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap(() => reader.play());
    await flush();
    await answerAll((p) => (p.body.seg === "opt0" ? p.reply(202, { queued: true }) : p.reply(200, { url: urlFor(p) })));
    await flush();
    expect(env.played).toEqual([]);
    expect(reader.status).toBe("preparing");
  });

  it("reports the real failure, not 'being prepared', when some parts were queued and others refused", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap(() => reader.play());
    await flush();
    await answerAll((p) => (p.body.seg === "stem" ? p.reply(202, { queued: true }) : p.reply(429, { error: "Daily voice limit reached" })));
    await flush();
    expect(env.played).toEqual([]);
    expect(reader.status).toBe("unavailable");
  });

  it("says the voice will be prepared after midnight when today's budget is spent", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap(() => reader.play());
    await flush();
    await answerAll((p) => p.reply(202, { queued: true, after: "tomorrow" }));
    await flush();
    expect(env.played).toEqual([]);
    expect(reader.status).toBe("preparing-tomorrow");
    const { ReadAloudBar, NOTES } = mod;
    host.innerHTML = "";
    const r2 = createRoot(host);
    await act(async () => r2.render(<ReadAloudBar reader={reader} />));
    expect(host.textContent).toContain(NOTES["preparing-tomorrow"]);
    await act(async () => r2.unmount());
  });

  it("never starts audio when the voice is unavailable", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap(() => reader.play());
    await flush();
    await answerAll((p) => p.reply(429, { error: "Daily voice limit reached" }));
    await flush();
    expect(env.played).toEqual([]);
    expect(reader.status).toBe("unavailable");
  });

  it("shows a part refused by the check without voicing it, then plays the rest", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap(() => reader.play());
    await flush();
    await answerAll((p) => (p.body.seg === "opt0" ? p.reply(422, { error: "Voice check failed" }) : p.reply(200, { url: urlFor(p) })));
    await flush();
    await act(async () => player().end());
    await gap();
    expect(reader.active).toBe("opt0");
    expect(reader.silent).toBe(true);
    expect(env.played).toEqual(["https://signed.example/1/stem"]); // nothing voiced for the refused part
    await gap(2500);
    expect(env.played).toEqual(["https://signed.example/1/stem", "https://signed.example/1/opt1"]);
  });

  it("never asks the server for a part whose signs could be read two ways; shows it on screen in turn", async () => {
    const segs = [SEGS[0], { id: "opt0", text: "0.1 milligrams per kilogram · 70 kg." }, SEGS[2]];
    await render({ segments: segs, itemKey: "q:2", itemRef: REF(2) });
    await tap(() => reader.play());
    await flush();
    expect(pending.map((p) => p.body.seg)).toEqual(["stem", "opt1"]);
    await answerAll((p) => p.reply(200, { url: urlFor(p) }));
    await flush();
    await act(async () => player().end());
    await gap();
    expect(reader.active).toBe("opt0");
    expect(reader.silent).toBe(true);
    await gap(3500); // its reading time on screen
    expect(env.played).toEqual(["https://signed.example/2/stem", "https://signed.example/2/opt1"]);
  });

  it("does not start the old item's audio when its answer arrives after the item changed", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap(() => reader.play());
    await flush();
    const late = pending.splice(0);
    await render({ segments: SEGS, itemKey: "q:2", itemRef: REF(2) }); // the student moved on
    await act(async () => { for (const p of late) p.reply(200, { url: urlFor(p) }); });
    await flush();
    expect(env.played).toEqual([]);
    expect(reader.status).toBe("idle");
  });

  it("does not start audio when its answer arrives after the reader closed", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap(() => reader.play());
    await flush();
    const late = pending.splice(0);
    await act(async () => root.unmount());
    await act(async () => { for (const p of late) p.reply(200, { url: urlFor(p) }); });
    await flush();
    expect(env.played).toEqual([]);
    root = createRoot(host); // for afterEach
  });

  it("stops the question's audio when the explanation (or the next item) takes over", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await tap(() => reader.play());
    await flush();
    await answerAll((p) => p.reply(200, { url: urlFor(p) }));
    await flush();
    expect(player().paused).toBe(false);
    await render({ segments: [], itemKey: "off", itemRef: REF(1) }); // answered: the question reader switches off
    expect(player().paused).toBe(true);
    expect(reader.status).toBe("idle");
    expect(env.played).toHaveLength(1);
  });

  it("with read-each-new-one ON, reads a new item by itself but never a reader switched off", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await act(async () => reader.setPrefs({ auto: true }));
    expect(reader.prefs.auto).toBe(true);
    // switched off, with something it could read: it must not start
    await render({ segments: SEGS, itemKey: "off", itemRef: REF(1) });
    await flush();
    expect(pending).toEqual([]);
    // a new item: it starts by itself
    await render({ segments: SEGS, itemKey: "q:2", itemRef: REF(2) });
    await flush();
    expect(pending.map((p) => p.body.ref.id)).toEqual([2, 2, 2]);
  });

  it("has no voice at all for an item outside the bank", async () => {
    await render({ segments: SEGS, itemKey: "q:local", itemRef: null });
    expect(reader.available).toBe(false);
    await tap(() => reader.play());
    await flush();
    expect(pending).toEqual([]);
    expect(env.played).toEqual([]);
  });
});

describe("exhibits while being read", () => {
  it("opens the exhibit being read, leaves the student's own choices alone otherwise", async () => {
    const { ExhibitTabs } = await import("../src/exhibit-tabs.jsx");
    const tabs = [{ label: "Vitals", content: "BP 90/60" }, { label: "Labs", content: "K 2.9" }];
    const r = (active) => ({ status: active ? "playing" : "idle", active, isOn: (id) => id === active });
    await act(async () => root.render(<ExhibitTabs tabs={tabs} reader={r(null)} />));
    const panels = host.querySelectorAll("details");
    expect([...panels].map((d) => d.open)).toEqual([true, false]);
    // the student closes the first panel themselves
    panels[0].open = false;
    // read aloud reaches the second exhibit (say, shown on screen only): it opens and is highlighted
    await act(async () => root.render(<ExhibitTabs tabs={tabs} reader={r("exhibit1")} />));
    expect(panels[1].open).toBe(true);
    expect(panels[1].className).toContain("ra-now");
    expect(panels[0].open).toBe(false); // their choice stands
  });
});
