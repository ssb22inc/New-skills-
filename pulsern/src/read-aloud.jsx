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

   The voice. The AI voice (Amazon Polly Neural, Joanna) is played when
   it is ready. The page asks for it as soon as the item is shown (the
   server speaks a missing passage on the spot when it can), and Listen
   starts the first ready part without waiting for the rest. Listen is
   never silent: when no clip is cached, the device's own voice starts
   inside the Listen tap, from the same spelled-out words, and later parts
   switch to the AI clip once it is ready. A part the bank
   refuses — the item is gone, the words no longer match, or the part
   must be read on screen — is shown, never spoken by the device. Only
   bank items carry a voice; built-in sample items show no button.

   Not used in readiness exams (src/exam.jsx): they stay exam conditions. */
import React from "react";
import { supabase } from "./supabase.js";
import { partOf, voiceable } from "./read-aloud-script.js";

const PREFS_KEY = "pulsern.readAloud.v1";
export const RATES = [0.8, 1, 1.25];
const GAP_MS = 350; // a breath between parts: the stem, then each choice
/* How long Listen waits for a part's checked audio before showing that
   part on screen and moving on. Applies to every part, not only the first. */
export const FIRST_BUDGET_MS = 900;
/* How long a later part waits for an AI clip that is already on the way.
   The first sound does not wait: with no clip cached, the device speaks
   inside the Listen tap, and a ready clip plays at once. */
export const LATER_AI_WAIT_MS = 400;
/* Requests to the voice route at once, per page: a case study has 30 or
   more parts, and asking for all of them together only makes them race
   for the same daily counters. They go in reading order. */
export const MAX_IN_FLIGHT = 6;

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
   show that part on screen without asking again. */
export const URL_TTL_MS = 50 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 1000;
const REMEMBER_MISS = new Set([202, 422, 404, 409, 429]);
/* A request may not hold one of the shared slots forever. This matches
   the voice route's own limit, so a live synthesis can finish and a
   stalled connection still gives the slot back. */
export const VOICE_FETCH_MS = 60_000;

export function makeVoiceClient({ fetchImpl = (...a) => fetch(...a), now = () => Date.now(), token = accessToken, fetchMs = VOICE_FETCH_MS } = {}) {
  const cache = new Map(); // [ref, seg, text] -> { at, ttl, p, settled }
  /* At most MAX_IN_FLIGHT requests out at once. Waiting requests for the
     item asked about most recently go first, so moving on to a new item
     never waits behind the parts of the one left behind. Leaving an item
     cancels the requests it still has out. */
  let inFlight = 0, latest = "";
  const waiters = [];
  const jobs = new Set();
  const release = () => {
    const at = waiters.findIndex((w) => w.item === latest);
    const next = waiters.splice(at >= 0 ? at : 0, 1)[0];
    if (next) next.resolve(); else inFlight--;
  };
  const missed = () => Object.assign(new Error("VOICE"), { status: 0 });
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
      const item = JSON.stringify(ref);
      latest = item;
      for (const job of jobs) if (job.item !== item) job.abort();
      const p = (async () => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), fetchMs);
        const job = { item, abort: () => ac.abort() };
        jobs.add(job);
        let held = false, r, data;
        try {
          await new Promise((resolve, reject) => {
            const giveUp = () => reject(missed());
            const take = () => { held = true; if (ac.signal.aborted) giveUp(); else resolve(); };
            if (ac.signal.aborted) { giveUp(); return; }
            if (inFlight < MAX_IN_FLIGHT) { inFlight++; take(); return; }
            const waiter = { item, resolve: take };
            waiters.push(waiter);
            ac.signal.addEventListener("abort", () => {
              const at = waiters.indexOf(waiter);
              if (at >= 0) waiters.splice(at, 1);
              giveUp();
            }, { once: true });
          });
          const t = await new Promise((resolve, reject) => {
            if (ac.signal.aborted) { reject(missed()); return; }
            const onAbort = () => reject(missed());
            ac.signal.addEventListener("abort", onAbort, { once: true });
            Promise.resolve(token()).then(
              (v) => { ac.signal.removeEventListener("abort", onAbort); resolve(v); },
              (e) => { ac.signal.removeEventListener("abort", onAbort); reject(e); },
            );
          });
          r = await fetchImpl("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
            body: JSON.stringify({ action: "speak", ref, seg, text, token: t }),
            signal: ac.signal,
          });
          data = await r.json().catch(() => ({}));
        } catch (e) {
          if (e?.status) throw e;
          throw missed();
        } finally {
          clearTimeout(timer);
          jobs.delete(job);
          if (held) release();
        }
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

/* A few clips kept in memory so Listen does not download them again.
   Older ones are dropped, and a download that finishes after its clip was
   dropped is not put back. The clip being played is kept. */
export const WARM_MAX = 8;
export function createWarmCache({ max = WARM_MAX, revoke = (objectUrl) => { try { URL.revokeObjectURL(objectUrl); } catch { /* already gone */ } } } = {}) {
  const map = new Map(); // signed url -> object url, or null while downloading
  const gen = new Map();
  let playing = "";
  function evict() {
    for (const key of [...map.keys()]) {
      if (map.size <= max) break;
      const value = map.get(key);
      if (typeof value === "string" && value === playing) continue;
      gen.set(key, (gen.get(key) || 0) + 1);
      map.delete(key);
      if (typeof value === "string") revoke(value);
    }
  }
  return {
    /* 0 means this url is already tracked. Otherwise the token for finish. */
    start(url) {
      if (!url || map.has(url)) return 0;
      const token = (gen.get(url) || 0) + 1;
      gen.set(url, token);
      map.set(url, null);
      evict();
      return map.has(url) ? token : 0;
    },
    /* "kept", "stale" (caller must revoke), or "evicted" (already revoked). */
    finish(url, token, objectUrl) {
      if (!token || gen.get(url) !== token) return "stale";
      map.delete(url);
      map.set(url, objectUrl);
      evict();
      return map.get(url) === objectUrl ? "kept" : "evicted";
    },
    get(url) {
      const value = map.get(url);
      if (typeof value !== "string") return url;
      map.delete(url);
      map.set(url, value);
      return value;
    },
    /* Only the clip in the player is protected, and only until release. */
    hold(objectUrl) { playing = objectUrl || ""; evict(); },
    release() { playing = ""; evict(); },
    size() { return [...map.values()].filter((value) => typeof value === "string").length; },
  };
}
const clips = createWarmCache();
function warmClip(url) {
  const token = clips.start(url);
  if (!token || typeof fetch !== "function") return;
  fetch(url).then(async (r) => {
    if (!r?.ok || typeof r.blob !== "function") return;
    const b = await r.blob();
    if (!(b?.size > 200) || typeof URL === "undefined" || !URL.createObjectURL) return;
    const objectUrl = URL.createObjectURL(b);
    if (clips.finish(url, token, objectUrl) === "stale") {
      try { URL.revokeObjectURL(objectUrl); } catch { /* already gone */ }
    }
  }).catch(() => {});
}
const clipSrc = (url) => clips.get(url);

/* What to do with one part. A checked clip is played. A part the bank
   refuses (gone, words that no longer match, or not safe to guess) is
   shown and never spoken. Anything else with no clip yet is read with
   the device's voice. One part not ready does not silence the parts
   that are. */
function silentNote(o) {
  if (o.unvoiceable || o.status === 422 || o.status === 404 || o.status === 409) return "silent";
  if (o.after === "tomorrow") return "preparing-tomorrow";
  if (o.status === 202) return "preparing";
  return "unavailable";
}
export function planReading(segments, outcomes) {
  const steps = segments.map((s, i) => {
    const o = outcomes[i] ?? {};
    if (o.url) return { id: s.id, url: o.url };
    return { id: s.id, silent: true, text: s.text, note: silentNote(o) };
  });
  const note = steps.some((s) => s.url) ? null
    : steps.some((s) => s.note === "unavailable") ? "unavailable"
    : steps.some((s) => s.note === "preparing-tomorrow") ? "preparing-tomorrow"
    : steps.some((s) => s.note === "preparing") ? "preparing"
    : steps.length ? "silent" : null;
  return { kind: "play", steps, note };
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
export function unlockPlayer({ gesture = false } = {}) {
  if (typeof Audio === "undefined") return null;
  if (!player) { player = new Audio(); player.dataset.readAloud = "1"; player.preload = "auto"; }
  if (player.dataset.unlocked) return player;
  /* A Listen tap retries the unlock even if an earlier attempt failed and
     left a src behind. Playback of a real passage does not, so it is not
     put back to silence. */
  if (!gesture && player.src) return player;
  player.src = SILENT;
  const p = player.play();
  if (p?.then) p.then(() => { player.dataset.unlocked = "1"; }, () => {});
  return player;
}

/* ---------- the device's voice (last resort) ---------- */
/* Used only for a part whose AI voice is not ready in time, so Listen is
   never silent. It reads the same normalised words the AI voice reads.
   Long parts are read sentence by sentence: some engines (Chrome) stop a
   long utterance part-way, and a short one keeps Pause responsive. */
const synth = () => (typeof window !== "undefined" && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function" ? window.speechSynthesis : null);
export function speechChunks(text, max = 220) {
  const out = [];
  /* A sentence ends at . ! ? ; or : followed by a space or the end, so
     "2.9" and "1:2" stay whole. */
  for (const sentence of String(text).match(/[\s\S]+?(?:[.!?;:](?=\s|$)|$)/g) ?? []) {
    let rest = sentence.trim();
    while (rest.length > max) {
      const cut = rest.lastIndexOf(" ", max) > 40 ? rest.lastIndexOf(" ", max) : max;
      out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}
function englishVoice(s) {
  try {
    const voices = s.getVoices() || [];
    return voices.find((v) => /^en[-_]US$/i.test(v.lang) && v.localService) || voices.find((v) => /^en[-_]US$/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  } catch { return null; }
}
/* Inside the Listen tap, before any wait. Android Chrome only speaks if
   speak() runs in the tap itself, and its voice list is often empty until
   getVoices() has been called from that same tap. An empty priming
   utterance is not used: cancelling it drops the unlock. */
export function primeDeviceVoice() {
  const s = synth();
  if (!s) return;
  try { s.getVoices(); s.resume?.(); } catch { /* the language on the utterance is enough */ }
}
/* Resolves true when the part was read (or the reading was stopped),
   false when this device has no voice to read it with. */
export function deviceSpeak(text, rate = 1, signal) {
  const s = synth();
  if (!s || signal?.aborted) return Promise.resolve(!s ? false : true);
  const chunks = speechChunks(text);
  if (!chunks.length) return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false, i = 0, watchdog = null, current = 0;
    const finish = (ok, cancel) => {
      if (done) return;
      done = true;
      current++;
      clearTimeout(watchdog);
      signal?.removeEventListener("abort", onAbort);
      if (cancel) { try { s.cancel(); } catch { /* already quiet */ } }
      resolve(ok);
    };
    const onAbort = () => finish(true, true);
    signal?.addEventListener("abort", onAbort, { once: true });
    const voice = englishVoice(s);
    const next = () => {
      if (done) return;
      if (i >= chunks.length) { finish(true, false); return; }
      const chunk = chunks[i++];
      const mine = ++current;
      let started = false;
      const u = new window.SpeechSynthesisUtterance(chunk);
      u.lang = voice?.lang || "en-US";
      try { if (voice) u.voice = voice; } catch { /* the language is enough */ }
      u.rate = rate;
      const live = () => !done && mine === current;
      u.onstart = () => { if (live()) started = true; };
      u.onend = () => { if (!live()) return; clearTimeout(watchdog); next(); };
      u.onerror = (e) => {
        if (!live()) return;
        clearTimeout(watchdog);
        if (e?.error === "interrupted" || e?.error === "canceled") { finish(true, false); return; }
        finish(false, true);
      };
      /* Some engines never fire onend. Cancel that utterance before moving
         on, and do not treat a chunk that never started as spoken. */
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (!live()) return;
        const heard = started;
        current++;
        clearTimeout(watchdog);
        try { s.cancel(); } catch { /* already quiet */ }
        if (!heard) finish(false, false);
        else next();
      }, readingMs(chunk, rate) * 2 + 3000);
      try { s.speak(u); } catch { finish(false, true); }
    };
    try { if (s.speaking || s.pending) s.cancel(); s.resume?.(); } catch { /* fine */ }
    next();
  });
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
    clips.release();
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
    /* No cached clip: speak the first readable part in this tap, before
       any wait, so Android Chrome accepts it. Later parts use the AI clip
       once it is ready. A part that must stay on screen is skipped. */
    primeDeviceVoice();
    /* The first part we may read. A cached refusal (gone, mismatched, or
       the check failed) is not a missing clip: it stays on screen, and the
       device voice starts at the next part that can be read. A cached clip
       plays as audio, so it is not a device lead either. */
    const refused = (o) => !!(o && (o.unvoiceable || o.status === 404 || o.status === 409 || o.status === 422));
    let first = null;
    for (const s of segs.slice(start)) {
      if (!voiceable(s.text)) continue;
      const known = voice.peek(itemRef, s.id, s.text);
      if (refused(known)) continue;
      if (!known?.url) first = s;
      break;
    }
    const speechCtrl = new AbortController();
    signal.addEventListener("abort", () => speechCtrl.abort(), { once: true });
    let lead = null;
    if (first) {
      const at = segs.findIndex((s) => s.id === first.id);
      tasks[at]?.then((o) => {
        if (o && (o.status === 404 || o.status === 409 || o.status === 422 || o.unvoiceable)) speechCtrl.abort();
      });
      lead = { id: first.id, done: deviceSpeak(first.text, prefsRef.current.rate, speechCtrl.signal) };
    }
    let heard = false;

    for (let i = start; i < segs.length && !signal.aborted; i++) {
      resumeAt.current = i;
      if (lead && segs[i].id === lead.id) {
        setActive(segs[i].id); setSilent(false); setSource("device"); setNote(null); setStatus("playing");
        const ok = await lead.done;
        lead = null;
        if (signal.aborted || run.current !== me) return;
        const settled = voice.peek(itemRef, segs[i].id, segs[i].text);
        if (settled && (settled.status === 404 || settled.status === 409 || settled.status === 422 || settled.unvoiceable)) {
          setSilent(true); setSource("screen"); setNote("silent");
          if (i === segs.length - 1) await wait(readingMs(segs[i].text, prefsRef.current.rate), signal);
          else if (!signal.aborted && run.current === me) await wait(GAP_MS, signal);
          continue;
        }
        if (ok) { heard = true; if (i < segs.length - 1) await wait(GAP_MS, signal); continue; }
        const missed = voice.peek(itemRef, segs[i].id, segs[i].text) ?? (await Promise.race([
          tasks[i],
          wait(LATER_AI_WAIT_MS, signal).then(() => voice.peek(itemRef, segs[i].id, segs[i].text) || { status: 0 }),
        ]));
        if (missed?.url) { /* a clip arrived as the device gave up: play it below */ }
        else {
          const note = planReading([segs[i]], [missed || { status: 0 }]).steps[0].note || "unavailable";
          setSilent(true); setSource("screen"); setNote(note);
          if (i === segs.length - 1) await wait(readingMs(segs[i].text, prefsRef.current.rate), signal);
          continue;
        }
      }
      let outcome = voice.peek(itemRef, segs[i].id, segs[i].text);
      if (!outcome) {
        const raced = await Promise.race([
          tasks[i].then((o) => ({ outcome: o })),
          wait(LATER_AI_WAIT_MS, signal).then(() => ({ slow: true })),
        ]);
        if (signal.aborted || run.current !== me) return;
        /* A part that has not answered yet is read with the device's voice,
           not waited on. The request keeps going and is ready the next
           time Listen is pressed. */
        outcome = raced.slow ? (voice.peek(itemRef, segs[i].id, segs[i].text) || { status: 0 }) : raced.outcome;
        if (signal.aborted || run.current !== me) return;
      }
      const step = planReading([segs[i]], [outcome]).steps[0];
      setActive(step.id);
      setSilent(!!step.silent);
      setSource(step.url ? "ai" : "screen");
      setNote(step.note || null);
      setStatus("playing");

      /* No AI voice for this part right now: the device reads it, so the
         student always hears something. Only when the device has no voice
         (or the part could be read two ways) is it shown on screen. */
      const readOnDevice = async (text, note) => {
        if (voiceable(text)) {
          setSilent(false); setSource("device"); setNote(null);
          if (await deviceSpeak(text, prefsRef.current.rate, signal)) return;
          if (signal.aborted || run.current !== me) return;
        }
        setSilent(true); setSource("screen"); setNote(note);
        await wait(readingMs(text, prefsRef.current.rate), signal);
      };
      const showPart = () => readOnDevice(segs[i].text, "unavailable");
      /* The budget covers getting the sound started, not how long a clip
         that has already started is allowed to play. */
      const playUrl = (url) => new Promise((resolve, reject) => {
        const audio = unlockPlayer();
        if (!audio) { reject(new Error("NO_AUDIO")); return; }
        audio.src = url;
        audio.playbackRate = prefsRef.current.rate;
        audio.preservesPitch = true;
        me.audio = audio;
        let began = false;
        const begin = () => { if (began) return; began = true; clearTimeout(timer); audio.dataset.unlocked = "1"; };
        const timer = setTimeout(() => {
          if (began) return;
          audio.onended = null; audio.onerror = null;
          try { audio.pause(); } catch { /* already stopped */ }
          reject(Object.assign(new Error("slow media"), { code: "SLOW" }));
        }, FIRST_BUDGET_MS);
        audio.onended = () => { begin(); resolve(); };
        audio.onerror = () => { begin(); reject(new Error("PLAYBACK")); };
        signal.addEventListener("abort", () => { begin(); resolve(); }, { once: true });
        clips.hold(String(url).startsWith("blob:") ? url : "");
        const started = audio.play();
        if (started?.then) started.then(begin, (err) => { if (!began) { began = true; clearTimeout(timer); } reject(err); });
        else begin();
      });

      if (step.silent) {
        /* "silent" is a bank refusal (gone, mismatched, or not safe to
           guess). Those words stay on screen. Every other miss is a clip
           that is not ready, which the device reads. */
        if (step.note === "silent") {
          setSilent(true); setSource("screen"); setNote("silent");
          if (heard) await wait(300, signal);
          else if (i === segs.length - 1) await wait(readingMs(segs[i].text, prefsRef.current.rate), signal);
        } else {
          await readOnDevice(step.text, step.note || null);
          if (signal.aborted || run.current !== me) return;
          heard = true;
        }
      } else if (step.url) {
        try {
          await playUrl(clipSrc(step.url));
          heard = true;
        } catch (e) {
          if (signal.aborted || run.current !== me) return;
          if (e?.name === "NotAllowedError") { run.current = null; setActive(null); setStatus("blocked"); return; }
          if (e?.code === "SLOW") { await showPart(); }
          else {
            const raced = await Promise.race([
              ask(segs[i], true).then((o) => ({ outcome: o })),
              wait(FIRST_BUDGET_MS, signal).then(() => ({ slow: true })),
            ]);
            if (signal.aborted || run.current !== me) return;
            if (raced.slow || !raced.outcome?.url) { await showPart(); }
            else {
              try { await playUrl(raced.outcome.url); }
              catch (e2) {
                if (signal.aborted || run.current !== me) return;
                if (e2?.name === "NotAllowedError") { run.current = null; setActive(null); setStatus("blocked"); return; }
                await showPart();
              }
            }
          }
        }
      } else {
        await wait(readingMs(step.text, prefsRef.current.rate), signal);
      }
      if (!signal.aborted && run.current === me && heard && i < segs.length - 1) await wait(GAP_MS, signal);
    }
    if (!signal.aborted && run.current === me) { run.current = null; resumeAt.current = 0; setActive(null); setSilent(false); setSource(null); setNote(null); setStatus("idle"); }
  }, [halt]);

  /* Listen and Resume are taps: unlock the shared player inside them,
     before any waiting, so the audio that follows is allowed. */
  const play = React.useCallback(() => { unlockPlayer({ gesture: true }); primeDeviceVoice(); return playFrom(0); }, [playFrom]);
  /* Pause stops at the current part; resume repeats that part from its
     start, so no sentence is heard in two halves. */
  const pause = React.useCallback(() => { halt(); setStatus("paused"); }, [halt]);
  const resume = React.useCallback(() => { unlockPlayer({ gesture: true }); primeDeviceVoice(); return playFrom(resumeAt.current); }, [playFrom]);
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

  return { status, active, silent, source, note, prefs, setPrefs, play, pause, resume, stop, available: !!ref, isOn: (id) => partOf(active) === id && status === "playing" };
}

/* Highlight helper: adds the follow-along class to whatever is being read. */
export const ra = (reader, id, cls = "") => (reader?.isOn(id) ? `${cls} ra-now`.trim() : cls);

export const NOTES = {
  preparing: "The AI voice for this is being prepared. Try Listen again in a little while.",
  device: "Reading with your device's voice while the AI voice is prepared.",
  "preparing-tomorrow": "The AI voice for this is queued. Today's voice limit has been reached, so it will be prepared after midnight (Eastern time).",
  unavailable: "The voice isn't available right now. Please try again later.",
  silent: "Read this part on screen.",
  blocked: "Your browser held back the sound. Tap the button once more to start the voice.",
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
  const shown = status === "playing" && source === "device" ? "device"
    : status === "playing" && silent ? (NOTES[noteKey] ? noteKey : "silent")
    : status === "blocked" ? "blocked"
    : status === "preparing" || status === "preparing-tomorrow" ? status
    : status === "unavailable" ? "unavailable"
    : null;
  const note = shown ? NOTES[shown] : null;
  const voiceLabel = source === "screen" ? "On screen" : source === "device" ? "Device voice" : "AI voice";
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
