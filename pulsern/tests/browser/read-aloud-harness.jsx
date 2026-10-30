/* The real read-aloud hook, mounted in a real browser (driven by
   tests/read-aloud-hook.test.js). The page stands in for the two things a
   test must control:
   - the voice route: every request waits until the test answers it;
   - the audio element: it records what it was asked to play. With
     strict = true it behaves like Safari/iOS, where an element may make
     sound only if it was first played during a user gesture. A test ends a
     clip by hand.
   Everything else is the shipped code. window.T is the test's handle. */
import React from "react";
import { createRoot } from "react-dom/client";
import * as mod from "../../src/read-aloud.jsx";
import { ExhibitTabs } from "../../src/exhibit-tabs.jsx";

const SILENT_PREFIX = "data:audio/wav";
const env = { gesture: false, strict: false, refuseUnlock: false, played: [], elements: [] };

/* The number of samples in a base64 WAV data URL (its data chunk length). */
function wavSamples(url) {
  const bin = atob(String(url).split(",")[1] ?? "");
  const at = bin.indexOf("data");
  if (at < 0) return 0;
  return (bin.charCodeAt(at + 4) | (bin.charCodeAt(at + 5) << 8) | (bin.charCodeAt(at + 6) << 16) | (bin.charCodeAt(at + 7) << 24)) >>> 0;
}

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
window.Audio = FakeAudio;

/* The voice route, answered by the test. */
let pending = [];
window.fetch = (url, init) => {
  const body = JSON.parse(init.body);
  return new Promise((resolve) => pending.push({ body, reply: (status, data) => resolve({ ok: status >= 200 && status < 300, status, json: async () => data }) }));
};
const urlFor = (p) => `https://signed.example/${p.body.ref.id}/${p.body.seg}`;

/* Let React and every pending promise settle. */
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 10)); };

let reader = null;
function Harness({ segments, itemKey, itemRef }) {
  reader = mod.useReadAloud(segments, itemKey, itemRef);
  return null;
}
let root = createRoot(document.getElementById("host"));
const player = () => env.elements.at(-1);

window.T = {
  env,
  async render(props) { root.render(<Harness {...props} />); await settle(); },
  /* A tap: the reader's method called inside a user gesture. */
  async tap(method) { env.gesture = true; try { reader[method](); } finally { env.gesture = false; } await settle(); },
  async setPrefs(patch) { reader.setPrefs(patch); await settle(); },
  pending: () => pending.map((p) => p.body),
  /* Answer every waiting request. replies: { [seg]: [status, data] }, with
     "*" for the rest; data "url" means a signed link for that part. With
     hold: true the requests are kept back (answered later by release). */
  async answer(replies) {
    const now = pending.splice(0);
    for (const p of now) {
      const [status, data] = replies[p.body.seg] ?? replies["*"];
      p.reply(status, data === "url" ? { url: urlFor(p) } : data);
    }
    await settle();
  },
  held: [],
  hold() { this.held = pending.splice(0); },
  async releaseHeld() { for (const p of this.held.splice(0)) p.reply(200, { url: urlFor(p) }); await settle(); },
  async end() { player().end(); await settle(); },
  async gap(ms = 400) { await new Promise((r) => setTimeout(r, ms)); await settle(); },
  async unmount() { root.unmount(); await settle(); root = createRoot(document.getElementById("host")); },
  state: () => ({
    status: reader?.status, active: reader?.active, silent: reader?.silent, available: reader?.available, prefs: reader?.prefs,
    played: [...env.played], elements: env.elements.length, paused: player()?.paused ?? null,
  }),
  silent: () => ({ prefix: mod.SILENT.slice(0, 22), samples: wavSamples(mod.SILENT), emptySamples: wavSamples("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=") }),
  /* The bar a student sees for the reader as it is now. */
  async barText() {
    const bar = createRoot(document.getElementById("bar"));
    bar.render(<mod.ReadAloudBar reader={reader} />);
    await settle();
    const text = document.getElementById("bar").textContent;
    bar.unmount();
    return { text, notes: mod.NOTES };
  },
  /* Exhibits as rendered for a reader that is (or is not) on one of them. */
  async exhibits(active) {
    const tabs = [{ label: "Vitals", content: "BP 90/60" }, { label: "Labs", content: "K 2.9" }];
    const r = { status: active ? "playing" : "idle", active, isOn: (id) => id === active };
    root.render(<ExhibitTabs tabs={tabs} reader={r} />);
    await settle();
    return [...document.querySelectorAll("#host details")].map((d) => ({ open: d.open, className: d.className }));
  },
  closePanel(i) { document.querySelectorAll("#host details")[i].open = false; },
};
window.T.ready = true;
