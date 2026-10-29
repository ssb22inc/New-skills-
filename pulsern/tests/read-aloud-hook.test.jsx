// @vitest-environment jsdom
/* The real playback hook, mounted: when audio may start, and when it must
   stop. Students must only ever hear checked audio for the item on screen:
   - an item with any part not yet voiced (202) or refused never starts;
   - a response that arrives after the item changed or the reader closed
     never starts the old item's audio;
   - moving from the question to its explanation (or to the next item)
     stops what was playing;
   - a part refused by the check is shown, not voiced, and the rest plays. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("../src/supabase.js", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } } }));

const { useReadAloud } = await import("../src/read-aloud.jsx");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* Audio that records what was asked of it; a test ends a clip by hand. */
let audios;
class FakeAudio {
  constructor(src) { this.src = src; this.paused = true; this.dataset = {}; this.playbackRate = 1; audios.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  end() { this.paused = true; this.onended?.(); }
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

let host, root, reader;
function Harness({ segments, itemKey, itemRef }) {
  reader = useReadAloud(segments, itemKey, itemRef);
  return null;
}
const render = async (props) => { await act(async () => root.render(<Harness {...props} />)); };
const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };

const SEGS = [{ id: "stem", text: "Which value is the priority?" }, { id: "opt0", text: "Potassium 2.9." }, { id: "opt1", text: "Sodium 138." }];
/* The voice client caches signed links for the page's life (as it should),
   so each test uses item ids of its own. */
let base = 0;
const REF = (n) => ({ kind: "question", id: base + n, part: "question" });

beforeEach(() => {
  base += 100;
  audios = []; pending = [];
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", vi.fn(fetchStub));
  try { localStorage.clear(); } catch { /* ignore */ }
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useReadAloud, mounted", () => {
  it("plays every checked part in order, highlighting each", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await act(async () => { reader.play(); });
    await flush();
    expect(pending.map((p) => p.body.seg)).toEqual(["stem", "opt0", "opt1"]); // the whole item is asked for at once
    await answerAll((p) => p.reply(200, { url: urlFor(p) }));
    await flush();
    expect(audios.map((a) => a.src)).toEqual([`https://signed.example/${base + 1}/stem`]);
    expect(reader.active).toBe("stem");
    expect(reader.status).toBe("playing");
    await act(async () => audios[0].end());
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(audios.map((a) => a.src)).toEqual([`https://signed.example/${base + 1}/stem`, `https://signed.example/${base + 1}/opt0`]);
    expect(reader.active).toBe("opt0");
  });

  it("never starts audio when any part is still being prepared", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await act(async () => { reader.play(); });
    await flush();
    await answerAll((p) => (p.body.seg === "opt0" ? p.reply(202, { queued: true }) : p.reply(200, { url: urlFor(p) })));
    await flush();
    expect(audios).toEqual([]);
    expect(reader.status).toBe("preparing");
  });

  it("never starts audio when the voice is unavailable", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await act(async () => { reader.play(); });
    await flush();
    await answerAll((p) => p.reply(429, { error: "Daily voice limit reached" }));
    await flush();
    expect(audios).toEqual([]);
    expect(reader.status).toBe("unavailable");
  });

  it("shows a part refused by the check without voicing it, then plays the rest", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await act(async () => { reader.play(); });
    await flush();
    await answerAll((p) => (p.body.seg === "opt0" ? p.reply(422, { error: "Voice check failed" }) : p.reply(200, { url: urlFor(p) })));
    await flush();
    await act(async () => audios[0].end());
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(reader.active).toBe("opt0");
    expect(reader.silent).toBe(true);
    expect(audios).toHaveLength(1); // nothing was voiced for the refused part
    await act(async () => { await new Promise((r) => setTimeout(r, 2500)); });
    expect(audios.map((a) => a.src)).toEqual([`https://signed.example/${base + 1}/stem`, `https://signed.example/${base + 1}/opt1`]);
  });

  it("does not start the old item's audio when its answer arrives after the item changed", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await act(async () => { reader.play(); });
    await flush();
    const late = pending.splice(0);
    await render({ segments: SEGS, itemKey: "q:2", itemRef: REF(2) }); // the student moved on
    await act(async () => { for (const p of late) p.reply(200, { url: urlFor(p) }); });
    await flush();
    expect(audios).toEqual([]);
    expect(reader.status).toBe("idle");
  });

  it("does not start audio when its answer arrives after the reader closed", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await act(async () => { reader.play(); });
    await flush();
    const late = pending.splice(0);
    await act(async () => root.unmount());
    await act(async () => { for (const p of late) p.reply(200, { url: urlFor(p) }); });
    await flush();
    expect(audios).toEqual([]);
    root = createRoot(host); // for afterEach
  });

  it("stops the question's audio when the explanation (or the next item) takes over", async () => {
    await render({ segments: SEGS, itemKey: "q:1", itemRef: REF(1) });
    await act(async () => { reader.play(); });
    await flush();
    await answerAll((p) => p.reply(200, { url: urlFor(p) }));
    await flush();
    expect(audios[0].paused).toBe(false);
    await render({ segments: [], itemKey: "off", itemRef: REF(1) }); // answered: the question reader switches off
    expect(audios[0].paused).toBe(true);
    expect(reader.status).toBe("idle");
    expect(audios).toHaveLength(1);
  });

  it("never auto-starts a reader that has been switched off, even with read-each-new-one on", async () => {
    localStorage.setItem("pulsern.readAloud.v1", JSON.stringify({ rate: 1, auto: true }));
    await render({ segments: SEGS, itemKey: "off", itemRef: REF(1) });
    await flush();
    expect(pending).toEqual([]);
    expect(audios).toEqual([]);
  });

  it("has no voice at all for an item outside the bank", async () => {
    await render({ segments: SEGS, itemKey: "q:local", itemRef: null });
    expect(reader.available).toBe(false);
    await act(async () => { reader.play(); });
    await flush();
    expect(pending).toEqual([]);
    expect(audios).toEqual([]);
  });
});
