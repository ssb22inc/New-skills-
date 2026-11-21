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

   The voice. Checked AI audio plays when this passage is already saved.
   The page asks for it as soon as the item is shown, and Listen starts
   the first part without waiting for the rest. Anything not ready yet
   (still queued, over the limit, the voice service down) is read at once
   by this device's own voice, from the same words on screen, and the bar
   says so. A part whose signs could be read two ways is not guessed: it
   is highlighted with "read this part on screen", and the rest still plays.
   Only bank items carry a voice; built-in sample items show no button.

   Not used in readiness exams (src/exam.jsx): they stay exam conditions. */
import React from "react";
import { supabase } from "./supabase.js";
import { partOf, voiceable } from "./read-aloud-script.js";

const PREFS_KEY = "pulsern.readAloud.v1";
export const RATES = [0.8, 1, 1.25];
const GAP_MS = 350; // a breath between parts: the stem, then each choice
/* How long Listen waits for the first part's AI audio before this device
   starts reading. Later parts have the whole previous part to arrive. */
export const FIRST_BUDGET_MS = 900;

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
/* Signed links last an hour on the server; reuse one for less than that.
   A definite "not ready" answer is remembered for a minute, so Listen can
   start the device voice immediately instead of asking again. */
export const URL_TTL_MS = 50 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 1000;
const REMEMBER_MISS = new Set([202, 422, 404, 409, 429]);

export function makeVoiceClient({ fetchImpl = (...a) => fetch(...a), now = () => Date.now(), token = accessToken } = {}) {
  const cache = new Map(); // [ref, seg, text] -> { at, ttl, p, settled }
  return {
    /* What we already know, or null while the request is still out. */
    peek(ref, seg, text) {
      const hit = cache.get(JSON.stringify([ref, seg, text]));
      if (!hit || now() - hit.at >= hit.ttl) return null;
      return hit.settled ?? null;
    },
    url(ref, seg, text, { fresh = false } = {}) {
      const k = JSON.stringify([ref, seg, text]);
      const hit = cache.get(k);
      if (!fresh && hit && now() - hit.at < hit.ttl) return hit.p;
      const p = (async () => {
        const t = await token();
        const r = await fetchImpl("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
          body: JSON.stringify({ action: "speak", ref, seg, text, token: t }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || r.status !== 200 || typeof data.url !== "string") {
          const e = new Error(data.error || "VOICE");
          e.status = r.status;
          e.after = data.after;
          throw e;
        }
        return data.url;
      })();
      const entry = { at: now(), ttl: URL_TTL_MS, p, settled: null };
      cache.set(k, entry);
      p.then(
        (url) => { entry.settled = { url }; },
        (e) => {
          const status = e?.status ?? 0;
          entry.settled = { status, after: e?.after };
          if (REMEMBER_MISS.has(status)) { entry.ttl = NEGATIVE_TTL_MS; entry.at = now(); }
          else if (cache.get(k)?.p === p) cache.delete(k);
        },
      );
      return p;
    },
  };
}
const voice = makeVoiceClient();

/* A clip we have already downloaded, so Listen does not wait on the
   network a second time. A failed download leaves the signed link, which
   the audio element can still stream. */
const warmed = new Map();
function warmClip(url) {
  if (!url || warmed.has(url) || typeof fetch !== "function") return;
  warmed.set(url, null);
  fetch(url).then(async (r) => {
    if (!r?.ok || typeof r.blob !== "function") return;
    const b = await r.blob();
    if (b?.size > 200 && typeof URL !== "undefined" && URL.createObjectURL) warmed.set(url, URL.createObjectURL(b));
  }).catch(() => {});
}
const clipSrc = (url) => (typeof warmed.get(url) === "string" ? warmed.get(url) : url);

/* What to do with one part.
   { url }                         checked AI audio
   { device, text, status, after } this device reads the words on screen
   { silent, text }                shown, not spoken (a sign with two
                                   readings, or words that are not the item's)
   The whole item is always a plan: one part not ready does not silence
   the parts that are. */
export function planReading(segments, outcomes) {
  const steps = segments.map((s, i) => {
    const o = outcomes[i] ?? {};
    if (o.url) return { id: s.id, url: o.url };
    if (o.unvoiceable) return { id: s.id, silent: true, text: s.text };
    if (o.status === 404 || o.status === 409) return { id: s.id, silent: true, text: s.text };
    return { id: s.id, device: true, text: s.text, status: o.status ?? 0, after: o.after };
  });
  const device = steps.filter((s) => s.device);
  const note = !device.length ? null
    : device.some((s) => s.after === "tomorrow") ? "deviceTomorrow"
    : device.some((s) => s.status !== 202) ? "deviceDown"
    : "device";
  return { kind: "play", steps, note };
}

/* The device voice reads a sentence at a time. A single long utterance
   is cut off after about fifteen seconds on Chrome, including Android. */
export function speechChunks(text, max = 180) {
  const src = String(text ?? "").trim();
  if (!src) return [];
  /* Sentence ends only. A decimal point ("2.9", "0.5 mL") stays in the
     sentence: splitting there would read the number as two sentences. */
  const sentences = [];
  let cur = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    cur += ch;
    if (".!?;".includes(ch)) {
      const prev = src[i - 1] ?? "";
      const next = src[i + 1];
      const decimal = ch === "." && /\d/.test(prev) && /\d/.test(next ?? "");
      if (!decimal && (next === undefined || /\s/.test(next))) {
        sentences.push(cur.trim());
        cur = "";
        while (src[i + 1] === " ") i += 1;
      }
    }
  }
  if (cur.trim()) sentences.push(cur.trim());
  const out = [];
  let line = "";
  const push = (s) => { const t = s.trim(); if (t) out.push(t); };
  for (const sentence of sentences.length ? sentences : [src]) {
    const words = sentence.split(/\s+/);
    for (const w of words) {
      if (line && (line + " " + w).length > max) { push(line); line = ""; }
      line = line ? `${line} ${w}` : w;
    }
    if (line.length > max) { push(line); line = ""; }
  }
  push(line);
  return out;
}

/* Speak `text` with the device voice. Resolves "done", "aborted",
   "blocked" (the browser held the sound back), "unsupported", or "error".
   The first utterance is started before this function awaits, so a call
   made inside the Listen tap is still the student's gesture. */
export function deviceSpeak(text, { rate = 1, signal, synth = currentSynth() } = {}) {
  if (!synth || typeof synth.speak !== "function" || typeof SpeechSynthesisUtterance === "undefined") return Promise.resolve("unsupported");
  if (signal?.aborted) return Promise.resolve("aborted");
  const chunks = speechChunks(text);
  if (!chunks.length) return Promise.resolve("done");
  return new Promise((resolve) => {
    let i = 0, settled = false, started = false, timer = 0;
    const finish = (why) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(why);
    };
    const onAbort = () => { try { synth.cancel(); } catch { /* already stopped */ } finish("aborted"); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const next = () => {
      if (settled || signal?.aborted) return finish("aborted");
      if (i >= chunks.length) return finish("done");
      const u = new SpeechSynthesisUtterance(chunks[i]);
      i += 1;
      u.rate = rate;
      u.onstart = () => { started = true; };
      u.onend = () => next();
      u.onerror = (e) => {
        const err = e?.error || "";
        if (err === "canceled" || err === "interrupted") finish("aborted");
        else finish("error");
      };
      try { synth.speak(u); } catch { finish("error"); return; }
      if (i === 1) {
        timer = setTimeout(() => { if (!started) { try { synth.cancel(); } catch { /* ignore */ } finish("blocked"); } }, 800);
      }
    };
    next();
  });
}

/* How long a silent part stays highlighted: a calm reading pace (about
   3 words a second at 1x), at least two seconds. */
export const readingMs = (text, rate = 1) => Math.max(2000, Math.round((String(text).split(/\s+/).length / (3 * rate)) * 1000));

const wait = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) { resolve(); return; }
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
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
  /* Prime once, while src is still empty. A later part must not be put back
     to silence: that happens if the first play() was interrupted and the
     unlocked flag never landed, and a strict browser would then refuse it. */
  if (!player.dataset.unlocked && !player.src) {
    player.src = SILENT;
    const p = player.play();
    if (p?.then) p.then(() => { player.dataset.unlocked = "1"; }, () => {});
  }
  return player;
}

/* The browser's speechSynthesis is a getter with no setter, so a test
   cannot replace it. The harness installs its own through here. */
let synthProvider = () => globalThis.speechSynthesis;
export function setSpeechSynth(provider) { synthProvider = typeof provider === "function" ? provider : () => provider; }
const currentSynth = () => { try { return synthProvider(); } catch { return null; } };

function stopDeviceVoice() {
  try { currentSynth()?.cancel(); } catch { /* no device voice here */ }
}

/* ---------- the hook ---------- */
/* segments: [{ id, text }]. key: changes when the item changes, which
   stops reading and, with "Read each new one" on, reads the new one.
   ref: the bank item this is ({ kind, id, part, ... }); null for items
   that are not in the bank, which have no voice. */
export function useReadAloud(segments, key, ref = null) {
  const prefs = React.useSyncExternalStore(prefsStore.subscribe, prefsStore.get, prefsStore.get);
  // idle | loading | playing | paused | blocked
  const [status, setStatus] = React.useState("idle");
  const [active, setActive] = React.useState(null);
  const [silent, setSilent] = React.useState(false); // the active part is shown, not voiced
  const [source, setSource] = React.useState(null); // "ai" | "device" | "screen"
  const [note, setNote] = React.useState(null);
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
    if (r) {
      r.ctrl.abort();
      if (r.audio) { r.audio.onended = null; r.audio.onerror = null; r.audio.pause(); }
    }
    stopDeviceVoice();
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
    document.querySelectorAll("audio").forEach((a) => { if (!a.paused && a !== player) a.pause(); });
    setStatus("loading"); setSilent(false); setSource(null);

    const ask = (s, fresh = false) => {
      if (!voiceable(s.text)) return Promise.resolve({ status: 422, unvoiceable: true });
      const once = (retry) => voice.url(itemRef, s.id, s.text, { fresh: retry }).then(
        (url) => ({ url }),
        (e) => ({ status: e?.status ?? 0, after: e?.after, failed: true }),
      );
      return once(fresh).then((o) => {
        if (o.url) { warmClip(o.url); return o; }
        // One more try for a dropped connection or a 5xx. A queued part (202)
        // and a refused part are already an answer.
        if (o.failed && (o.status === 0 || o.status >= 500)) return once(true).then((o2) => (o2.url ? (warmClip(o2.url), o2) : { status: o2.status ?? 0, after: o2.after }));
        return { status: o.status, after: o.after };
      });
    };
    const tasks = segs.map((s) => ask(s));

    for (let i = start; i < segs.length && !signal.aborted; i++) {
      resumeAt.current = i;
      let outcome = voice.peek(itemRef, segs[i].id, segs[i].text);
      if (!outcome) {
        if (i === start) {
          const raced = await Promise.race([
            tasks[i].then((o) => ({ outcome: o })),
            wait(FIRST_BUDGET_MS, signal).then(() => ({ slow: true })),
          ]);
          if (signal.aborted || run.current !== me) return;
          outcome = raced.slow ? (voice.peek(itemRef, segs[i].id, segs[i].text) || { status: 0 }) : raced.outcome;
        } else {
          outcome = await tasks[i];
          if (signal.aborted || run.current !== me) return;
        }
      }
      const step = planReading([segs[i]], [outcome]).steps[0];
      const stepNote = step.device ? (step.after === "tomorrow" ? "deviceTomorrow" : step.status === 202 ? "device" : "deviceDown") : null;
      setActive(step.id);
      setSilent(!!step.silent);
      setSource(step.url ? "ai" : step.device ? "device" : "screen");
      setNote(step.silent ? "silent" : stepNote);
      setStatus("playing");

      if (step.silent) {
        await wait(readingMs(step.text, prefsRef.current.rate), signal);
      } else if (step.url) {
        const playUrl = (url) => new Promise((resolve, reject) => {
          const audio = unlockPlayer();
          if (!audio) { reject(new Error("NO_AUDIO")); return; }
          audio.src = url;
          audio.playbackRate = prefsRef.current.rate;
          audio.preservesPitch = true;
          me.audio = audio;
          audio.onended = resolve;
          audio.onerror = () => reject(new Error("PLAYBACK"));
          signal.addEventListener("abort", resolve, { once: true });
          const started = audio.play();
          if (started?.then) started.then(() => { audio.dataset.unlocked = "1"; }, reject);
          else audio.dataset.unlocked = "1";
        });
        try {
          await playUrl(clipSrc(step.url));
        } catch (e) {
          if (signal.aborted || run.current !== me) return;
          if (e?.name === "NotAllowedError") { run.current = null; setActive(null); setStatus("blocked"); return; }
          const again = await ask(segs[i], true);
          if (signal.aborted || run.current !== me) return;
          try {
            if (!again.url) throw new Error("NO_URL");
            await playUrl(again.url);
          } catch (e2) {
            if (signal.aborted || run.current !== me) return;
            if (e2?.name === "NotAllowedError") { run.current = null; setActive(null); setStatus("blocked"); return; }
            setSource("device"); setNote("deviceDown");
            const why = await deviceSpeak(segs[i].text, { rate: prefsRef.current.rate, signal });
            if (why === "blocked") { run.current = null; setActive(null); setStatus("blocked"); return; }
            if (why === "aborted") return;
            if (why === "unsupported" || why === "error") { setSilent(true); setSource("screen"); setNote("silent"); await wait(readingMs(segs[i].text, prefsRef.current.rate), signal); }
          }
        }
      } else {
        /* A first speak() on Chrome often fails before the voice list has
           loaded (Android included). One short retry catches that. */
        let why = await deviceSpeak(step.text, { rate: prefsRef.current.rate, signal });
        if (why === "error" && !signal.aborted && run.current === me) {
          await wait(300, signal);
          if (!signal.aborted && run.current === me) why = await deviceSpeak(step.text, { rate: prefsRef.current.rate, signal });
        }
        if (signal.aborted || run.current !== me || why === "aborted") return;
        if (why === "blocked") { run.current = null; setActive(null); setStatus("blocked"); return; }
        if (why === "unsupported" || why === "error") {
          setSilent(true); setSource("screen"); setNote("silent");
          await wait(readingMs(step.text, prefsRef.current.rate), signal);
        }
      }
      if (!signal.aborted && run.current === me && i < segs.length - 1) await wait(GAP_MS, signal);
    }
    if (!signal.aborted && run.current === me) { run.current = null; resumeAt.current = 0; setActive(null); setSilent(false); setSource(null); setNote(null); setStatus("idle"); }
  }, [halt]);

  /* Listen and Resume are taps: unlock the shared player inside them,
     before any waiting, so the audio that follows is allowed. */
  const play = React.useCallback(() => { unlockPlayer(); return playFrom(0); }, [playFrom]);
  /* Pause stops at the current part; resume repeats that part from its
     start, so no sentence is heard in two halves. */
  const pause = React.useCallback(() => { halt(); setStatus("paused"); }, [halt]);
  const resume = React.useCallback(() => { unlockPlayer(); return playFrom(resumeAt.current); }, [playFrom]);
  const stop = React.useCallback(() => { halt(); resumeAt.current = 0; setActive(null); setSilent(false); setSource(null); setNote(null); setStatus("idle"); }, [halt]);
  stopRef.current = stop;

  const setPrefs = React.useCallback((patch) => {
    prefsStore.set(patch);
    if (patch.rate && run.current?.audio) run.current.audio.playbackRate = patch.rate;
  }, []);

  /* A new item: stop, warm whatever is already voiced, and read it if the
     student asked for every one. */
  React.useEffect(() => {
    stop();
    const segs = segsRef.current, itemRef = refRef.current;
    if (itemRef && key !== "off") {
      try { currentSynth()?.getVoices?.(); } catch { /* voices load asynchronously */ }
      for (const s of segs) {
        if (!voiceable(s.text)) continue;
        voice.url(itemRef, s.id, s.text).then((url) => warmClip(url), () => {});
      }
    }
    if (shouldAutoRead(key, prefsRef.current.auto, segs.length)) playFrom(0);
    return () => { halt(); if (speaking?.owner === self.current) speaking = null; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Another voice starting (a diagram's narration) stops this one. */
  React.useEffect(() => {
    const onPlay = (e) => { if (run.current && e.target?.dataset?.readAloud !== "1") stop(); };
    document.addEventListener("play", onPlay, true);
    return () => document.removeEventListener("play", onPlay, true);
  }, [stop]);

  /* Chrome (including Android) stops the device voice after about fifteen
     seconds unless it is nudged. The nudge is a no-op while it is idle. */
  React.useEffect(() => {
    if (source !== "device" || status !== "playing") return undefined;
    const synth = currentSynth();
    if (!synth?.pause || !synth?.resume) return undefined;
    const id = setInterval(() => {
      if (!synth.speaking) return;
      try { synth.pause(); synth.resume(); } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(id);
  }, [source, status]);

  return { status, active, silent, source, note, prefs, setPrefs, play, pause, resume, stop, available: !!ref, isOn: (id) => partOf(active) === id && status === "playing" };
}

/* Highlight helper: adds the follow-along class to whatever is being read. */
export const ra = (reader, id, cls = "") => (reader?.isOn(id) ? `${cls} ra-now`.trim() : cls);

export const NOTES = {
  preparing: "The AI voice for this is being prepared. Try Listen again in a little while.",
  "preparing-tomorrow": "The AI voice for this is queued. Today's voice limit has been reached, so it will be prepared after midnight (Eastern time).",
  unavailable: "The voice isn't available right now. Please try again later.",
  silent: "Read this part on screen.",
  blocked: "Your browser held back the sound. Tap the button once more to start the voice.",
  device: "Playing with this device's voice while the AI voice is prepared.",
  deviceTomorrow: "Playing with this device's voice. Today's AI voice limit is reached, so the AI voice will be prepared after midnight (Eastern time).",
  deviceDown: "The AI voice isn't available right now, so this device is reading.",
};

export function ReadAloudBar({ reader, label = "Listen", hint }) {
  if (!reader?.available) return null;
  const { status, prefs, setPrefs, play, pause, resume, stop, silent, source, note: noteKey } = reader;
  const main = status === "playing" ? { text: "⏸ Pause", on: pause, aria: "Pause reading" }
    : status === "paused" ? { text: "▶ Resume", on: resume, aria: "Resume reading" }
    : status === "blocked" ? { text: "🔊 Tap to start the voice", on: resume, aria: "Start the voice" }
    : status === "loading" ? { text: "Getting the voice ready…", on: stop, aria: "Stop reading" }
    : { text: `🔊 ${label}`, on: play, aria: `${label}: read this aloud` };
  const nextRate = RATES[(RATES.indexOf(prefs.rate) + 1) % RATES.length];
  const shown = status === "playing" && silent ? "silent"
    : status === "playing" && source === "device" ? (NOTES[noteKey] ? noteKey : "device")
    : status === "blocked" ? "blocked"
    : status === "preparing" || status === "preparing-tomorrow" ? status
    : status === "unavailable" ? "unavailable"
    : null;
  const note = shown ? NOTES[shown] : null;
  const voiceLabel = source === "device" ? "Device voice" : "AI voice";
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
      {(status === "playing" || status === "paused") && <span className="ra-src small">{voiceLabel}</span>}
      {note && <p className="ra-note small" role="status">{note}</p>}
    </div>
  );
}
