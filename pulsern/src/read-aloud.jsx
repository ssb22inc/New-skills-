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

   The voice: one natural AI voice, and only audio that passed the
   word-for-word accuracy check (api/_speak.js). Nothing unchecked is ever
   spoken: no device voice stands in.
   - Every part ready: it plays.
   - Any part not voiced yet: nothing plays; the whole item is moved up
     the voice job's queue and the bar says it is being prepared.
   - A part that could not be voiced accurately: it is highlighted for the
     time it takes to read, with "read this part on screen", and the rest
     plays.
   Only bank items carry a voice; built-in sample items show no button.

   Not used in readiness exams (src/exam.jsx): they stay exam conditions. */
import React from "react";
import { supabase } from "./supabase.js";
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

/* ---------- the voice (server) ---------- */
async function accessToken() {
  try { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token || ""; } catch { return ""; }
}
/* Signed links last an hour on the server; reuse one for less than that. */
export const URL_TTL_MS = 50 * 60 * 1000;

export function makeVoiceClient({ fetchImpl = (...a) => fetch(...a), now = () => Date.now(), token = accessToken } = {}) {
  const cache = new Map(); // [ref, seg, text] -> { at, p }
  return {
    url(ref, seg, text, { fresh = false } = {}) {
      const k = JSON.stringify([ref, seg, text]);
      const hit = cache.get(k);
      if (!fresh && hit && now() - hit.at < URL_TTL_MS) return hit.p;
      const p = (async () => {
        const t = await token();
        const r = await fetchImpl("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
          body: JSON.stringify({ action: "speak", ref, seg, text, token: t }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || r.status !== 200 || typeof data.url !== "string") { const e = new Error(data.error || "VOICE"); e.status = r.status; e.after = data.after; throw e; }
        return data.url;
      })();
      cache.set(k, { at: now(), p });
      p.catch(() => { if (cache.get(k)?.p === p) cache.delete(k); });
      return p;
    },
  };
}
const voice = makeVoiceClient();

/* What to do with an item, from what the server said about each part:
   { kind: "play", steps: [{ id, url } | { id, silent: true }] }
   { kind: "preparing" }   some part is not voiced yet (202)
   { kind: "unavailable" } signed out, offline, over the daily limit, no
                           voice service, or no part could be voiced */
/* Failures that mean the item cannot be voiced now, whatever else came back. */
const UNAVAILABLE = (status) => !status || status === 401 || status === 429 || status === 503 || status >= 500;
export function planReading(segments, outcomes) {
  // A real failure is reported before "being prepared", which is only
  // promised when every part is either ready, decided, or on its way.
  if (outcomes.some((o) => !o.url && UNAVAILABLE(o.status))) return { kind: "unavailable" };
  if (outcomes.some((o) => o.status === 202)) return { kind: outcomes.some((o) => o.status === 202 && o.after === "tomorrow") ? "preparing-tomorrow" : "preparing" };
  const steps = segments.map((s, i) => {
    const o = outcomes[i];
    if (o.url) return { id: s.id, url: o.url };
    // Checked and refused (422), or no longer readable (404/409): show it, do not voice it.
    if ([422, 404, 409].includes(o.status)) return { id: s.id, silent: true, text: s.text };
    return null;
  });
  if (steps.some((x) => x === null) || !steps.some((x) => x.url)) return { kind: "unavailable" };
  return { kind: "play", steps };
}

/* How long a silent part stays highlighted: a calm reading pace (about
   3 words a second at 1x), at least two seconds. */
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

/* One audio element for every passage, made and started inside the
   student's tap on Listen. Strict browsers (Safari, iOS) allow sound only
   from an element first played during a user gesture; a fresh element per
   passage, created after network waits, could be blocked. Reusing this one
   keeps every later passage, and auto-read, allowed. */
/* A real, decodable clip of silence (8 kHz, 8-bit mono PCM, 100 ms): a
   file with no samples can be refused by a decoder, which would leave the
   player locked. */
export function silentWav(ms = 100) {
  const n = Math.round(8 * ms), b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  const tag = (at, str) => { for (let i = 0; i < str.length; i++) b[at + i] = str.charCodeAt(i); };
  tag(0, "RIFF"); v.setUint32(4, 36 + n, true); tag(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  tag(36, "data"); v.setUint32(40, n, true); b.fill(128, 44);
  let bin = ""; for (const x of b) bin += String.fromCharCode(x);
  return `data:audio/wav;base64,${btoa(bin)}`;
}
export const SILENT = silentWav();
let player = null;
export function unlockPlayer() {
  if (typeof Audio === "undefined") return null;
  if (!player) { player = new Audio(); player.dataset.readAloud = "1"; player.preload = "auto"; }
  if (!player.dataset.unlocked) {
    player.src = SILENT;
    const p = player.play();
    if (p?.then) p.then(() => { player.dataset.unlocked = "1"; }, () => {});
  }
  return player;
}

/* ---------- the hook ---------- */
/* segments: [{ id, text }]. key: changes when the item changes, which
   stops reading and, with "Read each new one" on, reads the new one.
   ref: the bank item this is ({ kind, id, part, ... }); null for items
   that are not in the bank, which have no voice. */
export function useReadAloud(segments, key, ref = null) {
  const prefs = React.useSyncExternalStore(prefsStore.subscribe, prefsStore.get, prefsStore.get);
  // idle | loading | playing | paused | preparing | preparing-tomorrow | unavailable | blocked
  const [status, setStatus] = React.useState("idle");
  const [active, setActive] = React.useState(null);
  const [silent, setSilent] = React.useState(false); // the active part is shown, not voiced
  const run = React.useRef(null);   // { ctrl, audio }
  const resumeAt = React.useRef(0);
  const segsRef = React.useRef(segments);
  segsRef.current = segments;
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;
  const refRef = React.useRef(ref);
  refRef.current = ref;
  const self = React.useRef({});
  const stopRef = React.useRef(() => {});

  const halt = React.useCallback(() => {
    const r = run.current;
    run.current = null;
    if (r) { r.ctrl.abort(); r.audio?.pause(); }
  }, []);

  const playFrom = React.useCallback(async (start) => {
    halt();
    const segs = segsRef.current, itemRef = refRef.current;
    if (!segs.length || !itemRef) return;
    if (speaking && speaking.owner !== self.current) speaking.stop();
    speaking = { owner: self.current, stop: () => stopRef.current() };
    const ctrl = new AbortController();
    const me = { ctrl, audio: null };
    run.current = me;
    const { signal } = ctrl;
    /* One voice at a time: a diagram's narration stops while this reads. */
    document.querySelectorAll("audio").forEach((a) => { if (!a.paused) a.pause(); });
    setStatus("loading"); setSilent(false);

    /* Ask for every part at once: either the whole item is ready, or the
       whole item goes to the voice job together (never half a question). */
    const ask = (s, fresh = false) => !voiceable(s.text) ? Promise.resolve({ status: 422 }) : voice.url(itemRef, s.id, s.text, { fresh }).then((url) => ({ url }), (e) => ({ status: e?.status ?? 0, after: e?.after }));
    const outcomes = await Promise.all(segs.map((s) => ask(s)));
    if (signal.aborted) return;
    const plan = planReading(segs, outcomes);
    if (plan.kind !== "play") { run.current = null; setActive(null); setStatus(plan.kind); return; }

    for (let i = start; i < plan.steps.length && !signal.aborted; i++) {
      resumeAt.current = i;
      const step = plan.steps[i];
      setActive(step.id); setStatus("playing"); setSilent(!!step.silent);
      if (step.silent) {
        await wait(readingMs(step.text, prefsRef.current.rate), signal);
      } else {
        const playUrl = (url) => new Promise((resolve, reject) => {
          const audio = unlockPlayer();
          if (!audio) { reject(new Error("NO_AUDIO")); return; }
          audio.src = url;
          audio.playbackRate = prefsRef.current.rate;
          audio.preservesPitch = true;
          me.audio = audio;
          audio.onended = resolve; audio.onerror = () => reject(new Error("PLAYBACK"));
          signal.addEventListener("abort", resolve, { once: true });
          audio.play().catch(reject);
        });
        try {
          await playUrl(step.url);
        } catch (e) {
          if (signal.aborted) return;
          /* The browser would not start sound without a tap (auto-read on
             some phones): wait for the student to press Listen. */
          if (e?.name === "NotAllowedError") { run.current = null; setActive(null); setStatus("blocked"); return; }
          /* The link may have expired while the page stayed open: ask once
             for a fresh one. */
          const again = await ask(segs[i], true);
          if (signal.aborted) return;
          try { if (!again.url) throw new Error("NO_URL"); await playUrl(again.url); } catch (e2) {
            if (signal.aborted) return;
            if (e2?.name === "NotAllowedError") { run.current = null; setActive(null); setStatus("blocked"); return; }
            run.current = null; setActive(null); setStatus("unavailable"); return;
          }
        }
      }
      if (!signal.aborted && i < plan.steps.length - 1) await wait(GAP_MS, signal);
    }
    if (!signal.aborted && run.current === me) { run.current = null; resumeAt.current = 0; setActive(null); setSilent(false); setStatus("idle"); }
  }, [halt]);

  /* Listen and Resume are taps: unlock the shared player inside them,
     before any waiting, so the audio that follows is allowed. */
  const play = React.useCallback(() => { unlockPlayer(); return playFrom(0); }, [playFrom]);
  /* Pause stops at the current part; resume repeats that part from its
     start, so no sentence is heard in two halves. */
  const pause = React.useCallback(() => { halt(); setStatus("paused"); }, [halt]);
  const resume = React.useCallback(() => { unlockPlayer(); return playFrom(resumeAt.current); }, [playFrom]);
  const stop = React.useCallback(() => { halt(); resumeAt.current = 0; setActive(null); setSilent(false); setStatus("idle"); }, [halt]);
  stopRef.current = stop;

  const setPrefs = React.useCallback((patch) => {
    prefsStore.set(patch);
    if (patch.rate && run.current?.audio) run.current.audio.playbackRate = patch.rate;
  }, []);

  /* A new item: stop, and read it if the student asked for every one. */
  React.useEffect(() => {
    stop();
    if (shouldAutoRead(key, prefsRef.current.auto, segsRef.current.length)) playFrom(0);
    return () => { halt(); if (speaking?.owner === self.current) speaking = null; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Another voice starting (a diagram's narration) stops this one. */
  React.useEffect(() => {
    const onPlay = (e) => { if (run.current && e.target?.dataset?.readAloud !== "1") stop(); };
    document.addEventListener("play", onPlay, true);
    return () => document.removeEventListener("play", onPlay, true);
  }, [stop]);

  return { status, active, silent, prefs, setPrefs, play, pause, resume, stop, available: !!ref, isOn: (id) => partOf(active) === id && status === "playing" };
}

/* Highlight helper: adds the follow-along class to whatever is being read. */
export const ra = (reader, id, cls = "") => (reader?.isOn(id) ? `${cls} ra-now`.trim() : cls);

export const NOTES = {
  preparing: "The AI voice for this is being prepared. Try Listen again in a little while.",
  "preparing-tomorrow": "The AI voice for this is queued. Today's voice limit has been reached, so it will be prepared after midnight (Eastern time).",
  unavailable: "The voice isn't available right now. Please try again later.",
  silent: "Read this part on screen.",
  blocked: "Your browser held back the sound. Tap the button once more to start the voice.",
};

export function ReadAloudBar({ reader, label = "Listen", hint }) {
  if (!reader?.available) return null;
  const { status, prefs, setPrefs, play, pause, resume, stop, silent } = reader;
  const main = status === "playing" ? { text: "⏸ Pause", on: pause, aria: "Pause reading" }
    : status === "paused" ? { text: "▶ Resume", on: resume, aria: "Resume reading" }
    : status === "blocked" ? { text: "🔊 Tap to start the voice", on: resume, aria: "Start the voice" }
    : status === "loading" ? { text: "Getting the voice ready…", on: stop, aria: "Stop reading" }
    : { text: `🔊 ${label}`, on: play, aria: `${label}: read this aloud` };
  const nextRate = RATES[(RATES.indexOf(prefs.rate) + 1) % RATES.length];
  const note = status === "preparing" || status === "preparing-tomorrow" ? NOTES[status] : status === "unavailable" ? NOTES.unavailable
    : status === "blocked" ? NOTES.blocked : status === "playing" && silent ? NOTES.silent : null;
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
      {(status === "playing" || status === "paused") && <span className="ra-src small">AI voice</span>}
      {note && <p className="ra-note small" role="status">{note}</p>}
    </div>
  );
}
