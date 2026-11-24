/* Try before sign-up. A visitor answers a few real built-in questions,
   gets full rationales and the lab toolkit, then saves the work into a new
   account. Everything here is plain code and LOCAL dates.

   Content boundary: the guest pool is the built-in practice set that
   already ships inside the app bundle as the offline fallback. Shared-bank
   items (RLS: signed-in with access, migration 018), AI items, readiness
   exam items, and case studies are never used here.

   Handoff: the guest's answers live in localStorage on this device. A
   brand-new account imports them through the live answer function. An
   account that already has answer history does not take the trial.
   Each trial answer is stored as builtin:<id>. A shared-bank question
   with the same number is bank:<id> and is a different question. */
import { answerXp, answerCountsForRun } from "./rewards.js";
import { applyAnswer, stampedQuestion } from "./answer-apply.js";
import { canonicalKey } from "./question-key.js";

export const GUEST_KEY = "pulsern-guest-v1";
export const GUEST_HOLD_KEY = "pulsern-guest-hold-v1";
export const GUEST_LIMIT = 5;
export const GUEST_TTL_DAYS = 7;
export const GUEST_TYPES = ["mc", "sata"];

export function guestPool(questions = []) {
  return questions.filter((q) =>
    q && GUEST_TYPES.includes(q.type) && !q.ai && q.exam_form == null && !q.premium &&
    typeof q.stem === "string" && Array.isArray(q.options) && typeof q.rationale === "string");
}

export function emptyGuest(now = Date.now(), today) {
  return { v: 1, startedAt: now, day: today, log: [], xp: 0, run: 0, bestRun: 0, ability: null, missSchedule: {}, savedPrompt: false };
}

export function loadGuest(storage) {
  try {
    const raw = storage?.getItem(GUEST_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (!g || g.v !== 1 || !Array.isArray(g.log)) return null;
    return g;
  } catch { return null; }
}

export function saveGuest(storage, guest) {
  try { storage?.setItem(GUEST_KEY, JSON.stringify(guest)); return true; } catch { return false; }
}

export function clearGuest(storage) {
  try { storage?.removeItem(GUEST_KEY); } catch { /* private mode */ }
}

/* The sign-up screen unmounts the trial. If the device copy could not be
   written, this hold is the copy that still exists: in memory for this tab,
   and in the passed store (sessionStorage) when that write works. It is
   released only after the account write is confirmed, or when the student
   discards the trial. */
let heldTrial = null;

export function holdGuestTrial(guest, storage) {
  heldTrial = guest && Array.isArray(guest.log) ? guest : null;
  if (!heldTrial) return false;
  try { storage?.setItem(GUEST_HOLD_KEY, JSON.stringify(heldTrial)); return true; }
  catch { return false; }
}

export function clearHeldMemory() {
  heldTrial = null;
}

export function peekHeldGuest(storage) {
  if (heldTrial && Array.isArray(heldTrial.log) && heldTrial.log.length) return heldTrial;
  try {
    const raw = storage?.getItem(GUEST_HOLD_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (!g || g.v !== 1 || !Array.isArray(g.log)) return null;
    heldTrial = g;
    return g;
  } catch { return null; }
}

export function releaseHeldGuest(...stores) {
  heldTrial = null;
  for (const storage of stores) {
    try { storage?.removeItem(GUEST_HOLD_KEY); } catch { /* blocked */ }
  }
}

/* One copy. A longer or later hold wins over a short device copy, so the
   answers that could not be stored are not thrown away. The two copies are
   never concatenated. */
export function readGuestForHandoff(storage, holdStorage) {
  const saved = loadGuest(storage);
  const held = peekHeldGuest(holdStorage);
  const stamp = (g) => Number(g?.lastAt ?? g?.startedAt ?? 0);
  const n = (g) => g?.log?.length ?? 0;
  if (!n(saved)) return n(held) ? held : null;
  if (!n(held)) return saved;
  if (stamp(held) !== stamp(saved)) return stamp(held) > stamp(saved) ? held : saved;
  return n(held) > n(saved) ? held : saved;
}

/* The device copy is removed only by the save that was already carrying
   the merged answers when it started. A save that began earlier must not
   delete the copy if Add flips the mark while that save is still in flight. */
export function guestClearOnSave(pendingAtStart) {
  return pendingAtStart === true;
}

/* Saved confirmation is shown only after the write that carries the trial
   answers succeeds. A rejected write stays an error until a later try. */
export function handoffAfterSave({ ok, pending }) {
  if (!pending) return "none";
  return ok ? "saved" : "error";
}

/* A missing session is not a successful write. Callers must keep the device
   copy and must not tell the student the answers are in the account. */
export function persistDecision(session, expectedUserId) {
  if (!session?.user?.id) return "signed-out";
  if (expectedUserId && session.user.id !== expectedUserId) return "account-changed";
  return "write";
}

/* One account, one write at a time, newest payload wins. A save that was
   scheduled earlier never runs once a later one exists, so it cannot land
   after the merged trial and erase those answers. */
export const SIGN_OUT_FLUSH_MS = 3000;

/* Sign-out waits for the newest save, but only briefly. A write that
   never settles must not trap the student on a shared device. */
export function waitForFlush(flush, ms = SIGN_OUT_FLUSH_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, timedOut: true });
    }, ms);
    Promise.resolve()
      .then(flush)
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result?.ok === false ? { ...result, timedOut: false } : { ok: true, ...(result ?? {}), timedOut: false });
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, timedOut: false });
      });
  });
}

export const SAVE_ATTEMPT_MS = 8000;

/* One account, one write at a time, newest payload wins. A save that
   does not finish is aborted so a later snapshot can be written. An
   older request is not allowed to land after that. */
export function createSaveQueue({ attemptMs = SAVE_ATTEMPT_MS } = {}) {
  let chain = Promise.resolve();
  let latest = 0;
  let settled = 0;
  let active = null;
  return {
    next() { latest += 1; return latest; },
    pending() { return settled !== latest; },
    invalidate() {
      latest += 1;
      settled = latest;
      active?.abort();
    },
    enqueue(seq, task) {
      const run = chain.catch(() => {}).then(async () => {
        if (seq !== latest) return { stale: true };
        const ctrl = new AbortController();
        active = ctrl;
        const isCurrent = () => seq === latest && !ctrl.signal.aborted;
        let timer;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            ctrl.abort();
            reject(Object.assign(new Error("save-timeout"), { code: "save-timeout" }));
          }, attemptMs);
        });
        try {
          await Promise.race([
            Promise.resolve().then(() => task({ signal: ctrl.signal, isCurrent })),
            timeout,
          ]);
          if (!isCurrent()) return { stale: true };
          if (seq === latest) settled = seq;
          return { ok: true };
        } catch (error) {
          if (seq !== latest) return { stale: true };
          return { ok: false, error };
        } finally {
          clearTimeout(timer);
          if (active === ctrl) active = null;
        }
      });
      chain = run;
      return run;
    },
    /* Wait until the newest payload has finished. Sign-out uses this so a
       save that is only queued cannot be dropped on the floor. */
    async flush() {
      let result = { ok: true };
      let seen = null;
      while (chain !== seen) {
        seen = chain;
        result = await seen;
      }
      if (!result || result.ok) return { ok: true };
      return { ok: false, ...result };
    },
  };
}

/* A merged trial stores guest-<built-in id>. That alias belongs only to the
   bundled question with the same stem, never to a shared-bank item that
   happens to use the same number. */
export function linkBuiltInGuest(q, registry = []) {
  if (!q) return q;
  const bundled = registry.find((item) => item && item.id === q.id && item.stem === q.stem);
  if (!bundled) return q;
  const alias = `guest-${bundled.id}`;
  if ((q.aliases ?? []).map(String).includes(alias)) return q;
  return { ...q, aliases: [...(q.aliases ?? []), alias] };
}

/* Kept for GUEST_TTL_DAYS after the LAST answer (the save screen says so),
   so answers the student just gave are never the ones that expire. */
export function guestFresh(guest, now = Date.now()) {
  if (!guest || !Array.isArray(guest.log) || guest.log.length === 0) return false;
  const last = Number(guest.lastAt ?? guest.startedAt ?? 0);
  return now - last <= GUEST_TTL_DAYS * 86400000;
}

export const guestRemaining = (guest) => Math.max(0, GUEST_LIMIT - (guest?.log?.length ?? 0));

/* One scored guest answer. Same XP rules as an account (rewards.js). */
export function guestAnswer(guest, q, correct, { ms = Infinity, today } = {}) {
  if (guestRemaining(guest) === 0) return { guest, res: { xp: 0, reason: "limit" }, accepted: false };
  const item = stampedQuestion({ ...q, source: "builtin" });
  const res = answerXp({ q: item, correct, ms, log: guest.log });
  const run = answerCountsForRun({ correct, q: item, ms }) ? guest.run + 1 : 0;
  const words = String(q?.stem ?? "").trim().split(/\s+/).filter(Boolean).length;
  const studyDay = today ?? guest.day;
  /* Stable for this trial, unique per answer. A later trial has a new
     startedAt, so the same question is a new attempt. A retried merge of
     this trial repeats these ids and adds nothing. */
  const attempt = `${guest.startedAt}:${guest.log.length}`;
  const at = Date.now();
  const entry = {
    id: q.id, key: item.key, source: "builtin", cat: q.cat, diff: q.diff, correct, attempt, at,
    ...(studyDay ? { day: studyDay } : {}),
    ...(Number.isFinite(ms) ? { ms } : {}),
    ...(words ? { words } : {}),
    ...(q.population ? { pop: q.population } : {}),
  };
  /* The trial clock starts at the FIRST answer, not when the page was
     opened. Each answer keeps its own local day so a trial that crosses
     midnight is credited to the days it was actually taken. */
  const first = guest.log.length === 0;
  return {
    guest: { ...guest, ...(first ? { startedAt: Date.now(), day: today ?? guest.day } : {}), lastAt: Date.now(), day: first ? (today ?? guest.day) : (guest.day ?? today), log: [...guest.log, entry], xp: guest.xp + res.xp, run, bestRun: Math.max(guest.bestRun, run) },
    res: { ...res, run },
    accepted: true,
  };
}

export function guestSummary(guest) {
  const n = guest?.log?.length ?? 0;
  const ok = (guest?.log ?? []).filter((l) => l.correct).length;
  return { n, ok, acc: n ? Math.round((ok / n) * 100) : 0, xp: guest?.xp ?? 0, bestRun: guest?.bestRun ?? 0, cats: [...new Set((guest?.log ?? []).map((l) => l.cat))] };
}

/* Fold a guest's work into a migrated account blob. `s` is the output of
   migrateBlob. Returns the new blob and a summary (null when nothing was
   merged). Idempotent: a merged entry is never added twice. */
/* The trial only serves built-in questions, and it records that source
   on the row. A row that already names bank or case keeps that source.
   A missing source is builtin, because this log cannot contain anything else. */
export function guestImportIdentity(entry) {
  const source = entry?.source === "bank" || entry?.source === "case" ? entry.source : "builtin";
  const id = entry?.id;
  return stampedQuestion({ ...entry, id, source, key: entry?.key ?? canonicalKey(source, id) });
}

function trialEntries(s, guest, today) {
  const have = new Set();
  for (const row of s.log ?? []) if (row?.attempt != null) have.add(String(row.attempt));
  return guest.log
    .filter((l) => l && (typeof l.id === "number" || typeof l.id === "string") && typeof l.cat === "string" && typeof l.correct === "boolean")
    .slice(0, GUEST_LIMIT)
    .map((l, index) => ({
      id: l.id, cat: l.cat, diff: Math.max(1, Math.min(3, Number(l.diff) || 1)), correct: l.correct,
      attempt: l.attempt != null ? String(l.attempt) : `${guest.startedAt}:${index}`,
      ...(l.pop ? { pop: l.pop } : {}),
      ...(Number.isFinite(l.ms) ? { ms: l.ms } : {}),
      ...(Number.isFinite(l.words) && l.words > 0 ? { words: l.words } : {}),
      ...(l.source ? { source: l.source } : {}),
      ...(l.key ? { key: l.key } : {}),
      day: typeof l.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.day) ? l.day : (guest.day ?? today),
    }))
    .map((l) => ({ ...guestImportIdentity(l), ...l, key: guestImportIdentity(l).key, source: guestImportIdentity(l).source }))
    .filter((l) => !have.has(String(l.attempt)));
}

export function accountHasAnswers(log) {
  return (log ?? []).some((row) => row && typeof row.correct === "boolean");
}

/* A brand-new account has nothing to merge with, so the trial is scored
   by the live answer function, in the order it was taken. An account that
   already has answer history is left untouched: no XP, no reviews, no markers. */
export function mergeGuestIntoBlob(s, guest, { today, now = Date.now(), calibration = {} } = {}) {
  if (!guestFresh(guest, now)) return { blob: s, summary: null };
  if (accountHasAnswers(s.log)) return { blob: s, summary: null };
  const entries = trialEntries(s, guest, today);
  if (!entries.length) return { blob: s, summary: null };
  return importTrialLive(s, entries, { today, calibration });
}

function importTrialLive(s, entries, { today, calibration }) {
  let state = {
    log: s.log ?? [], xp: s.xp ?? 0, ability: s.ability, streak: s.streak, rewards: s.rewards,
    daily: s.daily, missSchedule: s.missSchedule, run: s.run ?? 0, bestRun: s.bestRun ?? 0,
  };
  const beforeDay = s.streak?.lastDay ?? null;
  let xpGain = 0;
  let accepted = 0;
  let correct = 0;
  for (const e of entries) {
    const stem = e.words ? Array.from({ length: e.words }, () => "w").join(" ") : "";
    const applied = applyAnswer(state, {
      q: { id: e.id, key: e.key, source: e.source, cat: e.cat, diff: e.diff, stem, population: e.pop },
      correct: e.correct,
      ms: Number.isFinite(e.ms) ? e.ms : Infinity,
      today: e.day ?? today,
      attempt: e.attempt,
      calibration,
    });
    if (applied.duplicate) continue;
    xpGain += applied.result?.xp ?? 0;
    accepted += 1;
    if (e.correct) correct += 1;
    state = applied.state;
  }
  if (!accepted) return { blob: s, summary: null };
  return {
    blob: { ...s, log: state.log, xp: state.xp, bestRun: state.bestRun, ability: state.ability, streak: state.streak, rewards: state.rewards, daily: state.daily, missSchedule: state.missSchedule, run: state.run },
    summary: { answers: accepted, correct, xp: xpGain, streak: state.streak?.count ?? 0, streakStarted: state.streak?.lastDay !== beforeDay, recorded: true },
  };
}
