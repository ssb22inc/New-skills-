/* Try before sign-up. A visitor answers a few real built-in questions,
   gets full rationales and the lab toolkit, then saves the work into a new
   account. Everything here is plain code and LOCAL dates.

   Content boundary: the guest pool is the built-in practice set that
   already ships inside the app bundle as the offline fallback. Shared-bank
   items (RLS: signed-in with access, migration 018), AI items, readiness
   exam items, and case studies are never used here.

   Handoff: the guest's answers live in localStorage on this device. When an
   account loads on the same device, mergeGuestIntoBlob folds them into the
   existing per-user progress blob (no new table, no migration). Merged log
   ids get a "guest-" prefix so a built-in id can never collide with a
   shared-bank id of the same number. */
import { answerXp, answerCountsForRun, advanceStreak, bumpDay, daysBetween } from "./rewards.js";

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
export function createSaveQueue() {
  let chain = Promise.resolve();
  let latest = 0;
  return {
    next() { latest += 1; return latest; },
    invalidate() { latest += 1; },
    enqueue(seq, task) {
      const run = chain.catch(() => {}).then(async () => {
        if (seq !== latest) return { stale: true };
        try {
          await task();
          if (seq !== latest) return { stale: true };
          return { ok: true };
        } catch (error) {
          if (seq !== latest) return { stale: true };
          return { ok: false, error };
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
  const res = answerXp({ q, correct, ms, log: guest.log });
  const run = answerCountsForRun({ correct, q, ms }) ? guest.run + 1 : 0;
  const words = String(q?.stem ?? "").trim().split(/\s+/).filter(Boolean).length;
  const studyDay = today ?? guest.day;
  /* Stable for this trial, unique per answer. A later trial has a new
     startedAt, so the same question is a new attempt. A retried merge of
     this trial repeats these ids and adds nothing. */
  const attempt = `${guest.startedAt}:${guest.log.length}`;
  const entry = {
    id: q.id, cat: q.cat, diff: q.diff, correct, attempt,
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
export function mergeGuestIntoBlob(s, guest, { today, now = Date.now(), updateAbility = null, calibration = {} } = {}) {
  if (!guestFresh(guest, now)) return { blob: s, summary: null };
  /* Import identity is the attempt, never the question id. guest-1 from a
     later trial is a new answer. The same attempt merged again is a no-op. */
  const have = new Set((s.log ?? []).map((l) => l?.attempt).filter((id) => id != null).map(String));
  /* localStorage is user-editable: never trust its totals. Keep at most
     GUEST_LIMIT well-formed rows and recompute XP from them. */
  const valid = guest.log
    .filter((l) => l && (typeof l.id === "number" || typeof l.id === "string") && typeof l.cat === "string" && typeof l.correct === "boolean")
    .slice(0, GUEST_LIMIT)
    .map((l, index) => ({
      id: l.id, cat: l.cat, diff: Math.max(1, Math.min(3, Number(l.diff) || 1)), correct: l.correct,
      attempt: l.attempt != null ? String(l.attempt) : `${guest.startedAt}:${index}`,
      ...(l.pop ? { pop: l.pop } : {}),
      ...(Number.isFinite(l.ms) ? { ms: l.ms } : {}),
      ...(Number.isFinite(l.words) && l.words > 0 ? { words: l.words } : {}),
      ...(typeof l.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.day) ? { day: l.day } : {}),
    }));
  const entries = valid
    .map((l) => ({ ...l, id: `guest-${l.id}` }))
    .filter((l) => !have.has(String(l.attempt)));
  if (!entries.length) return { blob: s, summary: null };
  const scored = [];
  let gxp = 0;
  {
    /* Score against answers already in the account, so a second attempt of
       guest-1 is a fix or a repeat, never another full payout. */
    const seen = [...(s.log ?? [])];
    for (const e of entries) {
      const stem = e.words ? Array.from({ length: e.words }, () => "w").join(" ") : "";
      const earned = answerXp({ q: { id: e.id, diff: e.diff, stem }, correct: e.correct, ms: Number.isFinite(e.ms) ? e.ms : Infinity, log: seen }).xp;
      gxp += earned;
      scored.push({ ...e, earned });
      seen.push(e);
    }
  }
  const logged = scored.map(({ ms, words, earned, day, ...row }) => row);
  guest = { ...guest, xp: gxp, bestRun: Math.min(guest.bestRun ?? 0, entries.length) };
  let ability = s.ability;
  if (typeof updateAbility === "function") {
    for (const e of entries) ability = updateAbility(ability, { id: e.id, cat: e.cat, diff: e.diff }, e.correct, calibration).ability;
  }
  const groups = new Map();
  for (const e of scored) {
    const day = e.day ?? guest.day ?? today;
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(e);
  }
  let streak = s.streak;
  let rewards = s.rewards;
  let streakStarted = false;
  for (const day of [...groups.keys()].sort()) {
    const rows = groups.get(day);
    if (!streak.lastDay || daysBetween(streak.lastDay, day) >= 1) {
      const adv = advanceStreak(streak, rewards, day);
      streak = adv.streak; rewards = adv.rewards; streakStarted = true;
    }
    rewards = bumpDay(rewards, day, { q: rows.length, ok: rows.filter((r) => r.correct).length, xp: rows.reduce((n, r) => n + r.earned, 0) });
  }
  rewards = { ...rewards, best: { ...rewards.best, run: Math.max(rewards.best.run, guest.bestRun ?? 0) } };
  const todayRows = groups.get(today) ?? [];
  const daily = todayRows.length
    ? (s.daily?.day === today ? { ...s.daily, answered: s.daily.answered + todayRows.length } : { day: today, answered: todayRows.length })
    : s.daily;
  const missSchedule = { ...(s.missSchedule ?? {}) };
  const lastAttempt = new Map();
  for (const e of scored) lastAttempt.set(String(e.id), e);
  for (const [id, e] of lastAttempt) {
    const src = id.replace(/^guest-/, "");
    const prev = guest.missSchedule?.[src] ?? guest.missSchedule?.[Number(src)];
    /* A corrected miss keeps the review date the trial already scheduled.
       Deleting it is how the next retrieval disappears. */
    if (prev && typeof prev.due === "string") missSchedule[id] = prev;
    else if (!e.correct && !missSchedule[id]) missSchedule[id] = { interval: 1, due: e.day ?? today };
  }
  return {
    blob: { ...s, log: [...s.log, ...logged], xp: s.xp + (guest.xp ?? 0), bestRun: Math.max(s.bestRun ?? 0, guest.bestRun ?? 0), ability, streak, rewards, daily, missSchedule },
    summary: { answers: entries.length, correct: entries.filter((e) => e.correct).length, xp: guest.xp ?? 0, streak: streak.count, streakStarted },
  };
}
