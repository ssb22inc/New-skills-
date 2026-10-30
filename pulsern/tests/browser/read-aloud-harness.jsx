/* The real read-aloud hook, mounted in a real browser (driven by
   tests/read-aloud-hook.test.js). Only the speech engine is stood in for
   (./speech-fake.js, imported first so the app's code finds it); every
   other line is the shipped code. window.T is the test's handle. */
import { env, speech } from "./speech-fake.js";
import React from "react";
import { createRoot } from "react-dom/client";
import * as mod from "../../src/read-aloud.jsx";
import { ExhibitTabs } from "../../src/exhibit-tabs.jsx";

/* Let React and every pending promise and timer settle. */
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 10)); };

let reader = null;
function Harness({ segments, itemKey }) {
  reader = mod.useReadAloud(segments, itemKey);
  return null;
}
let root = createRoot(document.getElementById("host"));

window.T = {
  env,
  async render(props) { root.render(<Harness {...props} />); await settle(); },
  /* A tap: the reader's method called inside a user gesture. */
  async tap(method) { env.gesture = true; try { reader[method](); } finally { env.gesture = false; } await settle(); },
  async setPrefs(patch) { reader.setPrefs(patch); await settle(); },
  /* The current utterance has been spoken to the end. */
  async finish() { speech.finish(); await settle(); },
  async gap(ms = 400) { await new Promise((r) => setTimeout(r, ms)); await settle(); },
  async unmount() { root.unmount(); await settle(); root = createRoot(document.getElementById("host")); },
  /* Another voice on the page (a diagram's narration) starts. */
  async otherAudioPlays() {
    const a = document.createElement("audio");
    document.body.appendChild(a);
    a.dispatchEvent(new Event("play"));
    a.remove();
    await settle();
  },
  state: () => ({
    status: reader?.status, active: reader?.active, silent: reader?.silent, available: reader?.available, prefs: reader?.prefs,
    spoken: env.spoken.map((u) => u.text), utterances: [...env.spoken], speaking: !!env.current,
  }),
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
