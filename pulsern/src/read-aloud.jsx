/* Read aloud: a voice for the question on screen, when the student asks.
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
     question" keeps it hands-free once they turn it on.

   The voice: a natural AI voice from the PulseRN server (api/ai.js,
   action "speak"). The server voices only bank items the student may read,
   rebuilt from the bank, and only audio that passed its accuracy check
   (api/_speak.js). Anything else (a built-in item, a part that failed the
   check, no voice set up, over the daily limit) is read by the best
   natural-sounding voice on the device, and the label says which one is
   speaking.

   Not used in readiness exams (src/exam.jsx): they stay exam conditions. */
import React from "react";
import { supabase } from "./supabase.js";

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

/* ---------- the AI voice (server) ---------- */
async function accessToken() {
  try { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token || ""; } catch { return ""; }
}
/* Signed links last an hour on the server; reuse one for less than that. */
export const URL_TTL_MS = 50 * 60 * 1000;
/* Failures that mean no AI voice for the rest of this session (not set up,
   signed out, over the daily limit, offline). Others (an item the server
   cannot voice, a part that failed the accuracy check) affect that part
   only. */
export const endsSession = (status) => !status || status === 401 || status === 429 || status === 503;

export function makeVoiceClient({ fetchImpl = (...a) => fetch(...a), now = () => Date.now(), token = accessToken } = {}) {
  const cache = new Map(); // [ref, seg, text] -> { at, p }
  const client = {
    enabled: true,
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
        if (!r.ok || typeof data.url !== "string") { const e = new Error(data.error || "VOICE"); e.status = r.status; throw e; }
        return data.url;
      })();
      cache.set(k, { at: now(), p });
      p.catch(() => { if (cache.get(k)?.p === p) cache.delete(k); });
      return p;
    },
  };
  return client;
}
const voice = makeVoiceClient();

/* One reader speaks at a time across the page. */
let speaking = null; // { owner, stop }

/* ---------- the device voice (fallback) ---------- */
/* Prefer the natural/neural voices modern systems ship; an English voice in
   any case. Returns null when the device has no speech synthesis. */
const NATURAL = /natural|neural|premium|enhanced|siri|google us english|samantha|aria|jenny|ava|zoe|serena/i;
export function pickDeviceVoice(voices) {
  const en = (voices ?? []).filter((v) => /^en(-|_|$)/i.test(v.lang));
  return en.find((v) => NATURAL.test(v.name) && /en.US/i.test(v.lang)) ?? en.find((v) => NATURAL.test(v.name)) ??
    en.find((v) => /en.US/i.test(v.lang) && v.localService === false) ?? en.find((v) => /en.US/i.test(v.lang)) ?? en[0] ?? null;
}
const hasDeviceVoice = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
function deviceVoices() {
  return new Promise((resolve) => {
    const v = window.speechSynthesis.getVoices();
    if (v.length) return resolve(v);
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener?.("voiceschanged", done, { once: true });
    setTimeout(done, 1200);
  });
}

/* Split for the device voice at sentence ends (not inside numbers such as
   "2.9"), keeping each piece short enough to be spoken whole. */
export function sentences(text) {
  const out = String(text).split(/(?<=[.?!;:])\s+(?=\S)/).map((s) => s.trim()).filter(Boolean);
  return out.length ? out : [String(text)];
}
/* Longest a sentence may take before the next one starts anyway: well over
   a slow speaking pace (about 2.5 words a second at 1x). */
export const speakLimitMs = (text, rate = 1) =>
  Math.max(4000, Math.round((String(text).split(/\s+/).length / (2.5 * rate)) * 1000 * 2.5));

const wait = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
});

/* A reader starts by itself only when it is switched on (a real key, not
   "off"), the student chose "Read each new one", and it has something to
   read. A reader that has just been switched off never restarts. */
export const shouldAutoRead = (key, auto, count) => key !== "off" && key != null && auto === true && count > 0;

/* ---------- the hook ---------- */
/* segments: [{ id, text }]. key: changes when the item changes (a new
   question), which stops reading and, with "Read each new question" on,
   starts reading the new one. */
export function useReadAloud(segments, key, ref = null) {
  const prefs = React.useSyncExternalStore(prefsStore.subscribe, prefsStore.get, prefsStore.get);
  const [status, setStatus] = React.useState("idle"); // idle | loading | playing | paused
  const [active, setActive] = React.useState(null);
  const [source, setSource] = React.useState("ai");
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
    if (hasDeviceVoice()) window.speechSynthesis.cancel();
  }, []);

  const playFrom = React.useCallback(async (start) => {
    halt();
    const segs = segsRef.current;
    if (!segs.length) return;
    if (speaking && speaking.owner !== self.current) speaking.stop();
    speaking = { owner: self.current, stop: () => stopRef.current() };
    const ctrl = new AbortController();
    const me = { ctrl, audio: null };
    run.current = me;
    const { signal } = ctrl;
    /* One voice at a time: a diagram's narration stops while this reads. */
    document.querySelectorAll("audio").forEach((a) => { if (!a.paused) a.pause(); });
    setStatus("loading");
    for (let i = start; i < segs.length && !signal.aborted; i++) {
      resumeAt.current = i;
      const { id, text } = segs[i];
      let spoke = false;
      const itemRef = refRef.current;
      if (itemRef && voice.enabled) {
        const playUrl = (url) => new Promise((resolve, reject) => {
          const audio = new Audio(url);
          audio.playbackRate = prefsRef.current.rate;
          audio.preservesPitch = true;
          audio.dataset.readAloud = "1";
          me.audio = audio;
          setActive(id); setStatus("playing"); setSource("ai");
          audio.onended = resolve; audio.onerror = () => reject(new Error("PLAYBACK"));
          signal.addEventListener("abort", resolve, { once: true });
          audio.play().catch(reject);
        });
        try {
          for (let attempt = 0; attempt < 2 && !spoke; attempt++) {
            /* A second attempt asks for a fresh link: the first may have
               expired while the page stayed open. */
            const url = await voice.url(itemRef, id, text, { fresh: attempt > 0 });
            if (signal.aborted) return;
            if (segs[i + 1]) voice.url(itemRef, segs[i + 1].id, segs[i + 1].text).catch(() => {}); // the next part is ready when this one ends
            try { await playUrl(url); spoke = true; } catch (e) { if (e?.name === "NotAllowedError") throw e; }
          }
        } catch (e) {
          if (signal.aborted) return;
          /* The browser would not start sound without a tap (auto-read on
             some phones): wait for the student to press Listen. */
          if (e?.name === "NotAllowedError") { run.current = null; setActive(null); setStatus("idle"); return; }
          if (endsSession(e?.status)) voice.enabled = false;
          /* otherwise only this part is read by the device voice */
        }
        if (signal.aborted) return;
      }
      if (!spoke) {
        if (!hasDeviceVoice()) { setStatus("idle"); setActive(null); setSource("none"); run.current = null; return; }
        const voice = pickDeviceVoice(await deviceVoices());
        if (signal.aborted) return;
        setActive(id); setStatus("playing"); setSource("device");
        /* Sentence by sentence: some browsers cut a long utterance off
           mid-way, and some never report its end, so each sentence also has
           a generous time limit. */
        for (const part of sentences(text)) {
          if (signal.aborted) break;
          const rate = prefsRef.current.rate * 0.95; // device voices run a little fast at 1
          await new Promise((resolve) => {
            const u = new window.SpeechSynthesisUtterance(part);
            if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-US";
            u.rate = rate;
            const guard = setTimeout(resolve, speakLimitMs(part, rate));
            const done = () => { clearTimeout(guard); resolve(); };
            u.onend = done; u.onerror = done;
            signal.addEventListener("abort", done, { once: true });
            window.speechSynthesis.speak(u);
          });
        }
      }
      if (!signal.aborted && i < segs.length - 1) await wait(GAP_MS, signal);
    }
    if (!signal.aborted && run.current === me) { run.current = null; resumeAt.current = 0; setActive(null); setStatus("idle"); }
  }, [halt]);

  const play = React.useCallback(() => playFrom(0), [playFrom]);
  /* Pause stops at the current part; resume repeats that part from its
     start, so no sentence is heard in two halves. */
  const pause = React.useCallback(() => { halt(); setStatus("paused"); }, [halt]);
  const resume = React.useCallback(() => playFrom(resumeAt.current), [playFrom]);
  const stop = React.useCallback(() => { halt(); resumeAt.current = 0; setActive(null); setStatus("idle"); }, [halt]);
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

  const available = (voice.enabled && !!ref) || hasDeviceVoice();
  return { status, active, source, prefs, setPrefs, play, pause, resume, stop, available, isOn: (id) => active === id && status === "playing" };
}

/* Highlight helper: adds the follow-along class to whatever is being read. */
export const ra = (reader, id, cls = "") => (reader?.isOn(id) ? `${cls} ra-now`.trim() : cls);

export function ReadAloudBar({ reader, label = "Listen", hint }) {
  if (!reader?.available) return null;
  const { status, prefs, setPrefs, play, pause, resume, stop, source } = reader;
  const main = status === "playing" ? { text: "⏸ Pause", on: pause, aria: "Pause reading" }
    : status === "paused" ? { text: "▶ Resume", on: resume, aria: "Resume reading" }
    : status === "loading" ? { text: "Getting the voice ready…", on: stop, aria: "Stop reading" }
    : { text: `🔊 ${label}`, on: play, aria: `${label}: read this aloud` };
  const nextRate = RATES[(RATES.indexOf(prefs.rate) + 1) % RATES.length];
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
      {(status === "playing" || status === "paused") && <span className="ra-src small">{source === "device" ? "Your device's voice" : "AI voice"}</span>}
    </div>
  );
}
