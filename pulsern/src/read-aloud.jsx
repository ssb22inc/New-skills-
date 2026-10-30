/* Read aloud: a voice for the item on screen, when the student asks.
   ------------------------------------------------------------------
   Built for how people learn from listening, not just to make sound:

   - Follow-along: the part being read is highlighted, so a student can
     read and hear the same words at once (the screen passes segment ids,
     see src/read-aloud-script.js).
   - Question first, then the choices as the screen shows them, a short
     pause between parts; the answer and rationale are never read before
     the student answers, so listening never gives away the retrieval
     attempt.
   - Their pace: 0.8x, 1x or 1.25x, remembered on this device.
   - Their choice: nothing plays until they press Listen. "Read each new
     one" keeps it hands-free once they turn it on.

   The voice is the device's own (the browser's speech synthesis): it
   starts at once, costs nothing, works offline and sends nothing anywhere.
   The best English voice the device offers is chosen (pickVoice). A part
   whose signs could be read two ways (src/read-aloud-script.js,
   voiceable) is highlighted for the time it takes to read, with "read
   this part on screen", and the rest plays.

   Not used in readiness exams (src/exam.jsx): they stay exam conditions. */
import React from "react";
import { partOf, voiceable } from "./read-aloud-script.js";

const PREFS_KEY = "pulsern.readAloud.v1";
export const RATES = [0.8, 1, 1.25];
const GAP_MS = 350; // a breath between parts: the stem, then each choice

export function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return { rate: RATES.includes(p.rate) ? p.rate : 1, auto: p.auto === true };
  } catch { return { rate: 1, auto: false }; }
}
function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode: in-memory only */ } }

/* One set of preferences for every reader on the page (question and
   explanation share the same speed and auto-read). */
let prefsNow = null;
const prefsSubs = new Set();
const prefsStore = {
  get: () => (prefsNow ??= loadPrefs()),
  set: (patch) => { prefsNow = { ...prefsStore.get(), ...patch }; savePrefs(prefsNow); prefsSubs.forEach((f) => f()); },
  subscribe: (f) => { prefsSubs.add(f); return () => prefsSubs.delete(f); },
};

/* ---------- the device's voice ---------- */
const speech = () => (typeof window !== "undefined" && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function" ? window.speechSynthesis : null);

/* How natural a voice is likely to sound, from what the device says about
   it. The higher-quality voices announce themselves (Edge's "Natural",
   Apple's "Enhanced" and "Premium", Siri, Chrome's Google voices); macOS's
   novelty voices are never chosen. */
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|eloquence|fred|good news|jester|junior|kathy|organ|ralph|superstar|trinoids|whisper|wobble|zarvox)\b/i;
export function voiceScore(v) {
  const lang = String(v?.lang ?? "").replace("_", "-").toLowerCase();
  if (!lang.startsWith("en") || NOVELTY.test(v.name)) return -1;
  let s = lang === "en-us" ? 3 : 1;
  if (/natural|neural/i.test(v.name)) s += 8;
  if (/premium|enhanced/i.test(v.name)) s += 6;
  if (/siri/i.test(v.name)) s += 5;
  if (/^google/i.test(v.name)) s += 4;
  if (/\b(samantha|ava|allison|susan|zoe|evan|aria|jenny|guy)\b/i.test(v.name)) s += 2;
  if (v.default) s += 1;
  return s;
}
export function pickVoice(voices) {
  let best = null, top = -1;
  for (const v of voices ?? []) { const s = voiceScore(v); if (s > top) { best = v; top = s; } }
  return best;
}
/* Voices arrive late on some browsers (Chrome lists none at first). */
let voices = [];
function loadVoices() {
  const s = speech();
  if (!s) return;
  voices = s.getVoices?.() ?? [];
  if (!voices.length && s.addEventListener) s.addEventListener("voiceschanged", () => { voices = s.getVoices(); }, { once: true });
}
loadVoices();

/* Some voices stop part-way through a long utterance (Chrome's online
   voices cut out after about 15 seconds), so a part is spoken in short
   pieces at sentence ends; the highlight stays on the part throughout. */
export function speechChunks(text, max = 200) {
  const out = [];
  // A sentence ends at ". ", "? ", "! " or "; " (never inside "2.9").
  for (const sentence of String(text).split(/(?<=[.!?;])\s+/)) {
    let rest = sentence.trim();
    while (rest.length > max) {
      const comma = rest.lastIndexOf(", ", max), space = rest.lastIndexOf(" ", max);
      const at = comma > max / 2 ? comma + 1 : space > 0 ? space : max;
      out.push(rest.slice(0, at).trim()); rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

/* Utterances are kept referenced while they play: some browsers drop the
   end event of an utterance that was garbage-collected. */
const live = new Set();
/* Speak one part. Resolves when it has been spoken (or reading stopped);
   rejects with NotAllowedError when the browser holds the sound back, or
   another error when the voice fails. */
function speakPart(text, { rate, signal }) {
  const s = speech();
  return (async () => {
    for (const chunk of speechChunks(text)) {
      if (signal.aborted) return;
      await new Promise((resolve, reject) => {
        const u = new window.SpeechSynthesisUtterance(chunk);
        const voice = pickVoice(voices);
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? "en-US";
        u.rate = rate();
        live.add(u);
        /* A browser that never reports the end (rare) cannot hang the
           reader: after well over the time the words need, move on. */
        const guard = setTimeout(() => done(), (chunk.split(/\s+/).length / (1.5 * u.rate)) * 1000 + 5000);
        const done = () => { clearTimeout(guard); live.delete(u); signal.removeEventListener("abort", done); resolve(); };
        u.onend = done;
        u.onerror = (e) => {
          clearTimeout(guard); live.delete(u); signal.removeEventListener("abort", done);
          if (signal.aborted || e.error === "interrupted" || e.error === "canceled") resolve();
          else reject(Object.assign(new Error(e.error || "speech"), { name: e.error === "not-allowed" ? "NotAllowedError" : "SpeechError" }));
        };
        signal.addEventListener("abort", done, { once: true });
        s.speak(u);
      });
    }
  })();
}

/* How long a part shown on screen stays highlighted: a calm reading pace
   (about 3 words a second at 1x), at least two seconds. */
export const readingMs = (text, rate = 1) => Math.max(2000, Math.round((String(text).split(/\s+/).length / (3 * rate)) * 1000));

const wait = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
});

/* A reader starts by itself only when it is switched on (a real key, not
   "off"), the student chose "Read each new one", and it has something to
   read. A reader that has just been switched off never restarts. */
export const shouldAutoRead = (key, auto, count) => key !== "off" && key != null && auto === true && count > 0;

/* One reader speaks at a time across the page. */
let speaking = null; // { owner, stop }

/* ---------- the hook ---------- */
/* segments: [{ id, text }]. key: changes when the item changes, which
   stops reading and, with "Read each new one" on, reads the new one. */
export function useReadAloud(segments, key) {
  const prefs = React.useSyncExternalStore(prefsStore.subscribe, prefsStore.get, prefsStore.get);
  // idle | playing | paused | blocked | error
  const [status, setStatus] = React.useState("idle");
  const [active, setActive] = React.useState(null);
  const [silent, setSilent] = React.useState(false); // the active part is shown, not voiced
  const run = React.useRef(null);   // { ctrl }
  const resumeAt = React.useRef(0);
  const segsRef = React.useRef(segments);
  segsRef.current = segments;
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;
  const self = React.useRef({});
  const stopRef = React.useRef(() => {});

  const halt = React.useCallback(() => {
    const r = run.current;
    run.current = null;
    if (r) { r.ctrl.abort(); speech()?.cancel(); }
  }, []);

  const playFrom = React.useCallback(async (start) => {
    halt();
    const segs = segsRef.current, s = speech();
    if (!segs.length || !s) return;
    if (speaking && speaking.owner !== self.current) speaking.stop();
    speaking = { owner: self.current, stop: () => stopRef.current() };
    const ctrl = new AbortController();
    const me = { ctrl };
    run.current = me;
    const { signal } = ctrl;
    /* One voice at a time: a diagram's narration stops while this reads. */
    document.querySelectorAll("audio").forEach((a) => { if (!a.paused) a.pause(); });
    if (s.speaking || s.pending) s.cancel(); // anything left queued from before
    setSilent(false);

    for (let i = start; i < segs.length && !signal.aborted; i++) {
      resumeAt.current = i;
      const step = segs[i];
      const shown = !voiceable(step.text);
      setActive(step.id); setStatus("playing"); setSilent(shown);
      try {
        if (shown) await wait(readingMs(step.text, prefsRef.current.rate), signal);
        else await speakPart(step.text, { rate: () => prefsRef.current.rate, signal });
      } catch (e) {
        if (signal.aborted) return;
        run.current = null; setActive(null);
        /* The browser would not start sound without a tap (auto-read on
           some phones): wait for the student to press Listen. */
        setStatus(e?.name === "NotAllowedError" ? "blocked" : "error");
        return;
      }
      if (!signal.aborted && i < segs.length - 1) await wait(GAP_MS, signal);
    }
    if (!signal.aborted && run.current === me) { run.current = null; resumeAt.current = 0; setActive(null); setSilent(false); setStatus("idle"); }
  }, [halt]);

  /* Pause stops at the current part; resume repeats that part from its
     start, so no sentence is heard in two halves (and the browsers' own
     pause, unreliable on several of them, is never needed). */
  const play = React.useCallback(() => playFrom(0), [playFrom]);
  const pause = React.useCallback(() => { halt(); setStatus("paused"); }, [halt]);
  const resume = React.useCallback(() => playFrom(resumeAt.current), [playFrom]);
  const stop = React.useCallback(() => { halt(); resumeAt.current = 0; setActive(null); setSilent(false); setStatus("idle"); }, [halt]);
  stopRef.current = stop;

  // A new speed applies from the next sentence.
  const setPrefs = React.useCallback((patch) => prefsStore.set(patch), []);

  /* A new item: stop, and read it if the student asked for every one. */
  React.useEffect(() => {
    stop();
    if (shouldAutoRead(key, prefsRef.current.auto, segsRef.current.length)) playFrom(0);
    return () => { halt(); if (speaking?.owner === self.current) speaking = null; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Another voice starting (a diagram's narration) stops this one. */
  React.useEffect(() => {
    const onPlay = () => { if (run.current) stop(); };
    document.addEventListener("play", onPlay, true);
    return () => document.removeEventListener("play", onPlay, true);
  }, [stop]);

  return { status, active, silent, prefs, setPrefs, play, pause, resume, stop, available: !!speech(), isOn: (id) => partOf(active) === id && status === "playing" };
}

/* Highlight helper: adds the follow-along class to whatever is being read. */
export const ra = (reader, id, cls = "") => (reader?.isOn(id) ? `${cls} ra-now`.trim() : cls);

export const NOTES = {
  silent: "Read this part on screen.",
  blocked: "Your browser held back the sound. Tap the button once more to start the voice.",
  error: "Your device's voice stopped unexpectedly. Tap Listen to try again.",
};

export function ReadAloudBar({ reader, label = "Listen", hint }) {
  if (!reader?.available) return null;
  const { status, prefs, setPrefs, play, pause, resume, stop, silent } = reader;
  const main = status === "playing" ? { text: "⏸ Pause", on: pause, aria: "Pause reading" }
    : status === "paused" ? { text: "▶ Resume", on: resume, aria: "Resume reading" }
    : status === "blocked" ? { text: "🔊 Tap to start the voice", on: resume, aria: "Start the voice" }
    : { text: `🔊 ${label}`, on: play, aria: `${label}: read this aloud` };
  const nextRate = RATES[(RATES.indexOf(prefs.rate) + 1) % RATES.length];
  const note = status === "blocked" ? NOTES.blocked : status === "error" ? NOTES.error : status === "playing" && silent ? NOTES.silent : null;
  return (
    <div className="ra-bar" role="group" aria-label="Read aloud">
      <button type="button" className="btn ra-main" onClick={main.on} aria-label={main.aria} aria-pressed={status === "playing"}>{main.text}</button>
      {(status === "playing" || status === "paused") && (
        <button type="button" className="ra-chip mono" onClick={stop} aria-label="Stop reading">■ Stop</button>
      )}
      <button type="button" className="ra-chip mono" onClick={() => setPrefs({ rate: nextRate })} aria-label={`Reading speed ${prefs.rate} times. Change to ${nextRate} times`}>{prefs.rate}×</button>
      <button type="button" className={prefs.auto ? "ra-chip mono on" : "ra-chip mono"} onClick={() => setPrefs({ auto: !prefs.auto })} aria-pressed={prefs.auto}>
        {prefs.auto ? "✓ " : ""}{hint ?? "Read each new one"}
      </button>
      {(status === "playing" || status === "paused") && <span className="ra-src small">Your device's voice</span>}
      {note && <p className="ra-note small" role="status">{note}</p>}
    </div>
  );
}
