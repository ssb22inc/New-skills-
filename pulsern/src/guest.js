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
import { answerXp, advanceStreak, bumpDay, daysBetween } from "./rewards.js";

export const GUEST_KEY = "pulsern-guest-v1";
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

export function guestFresh(guest, now = Date.now()) {
  return !!guest && Array.isArray(guest.log) && guest.log.length > 0 && now - (guest.startedAt ?? 0) <= GUEST_TTL_DAYS * 86400000;
}

export const guestRemaining = (guest) => Math.max(0, GUEST_LIMIT - (guest?.log?.length ?? 0));

/* One scored guest answer. Same XP rules as an account (rewards.js). */
export function guestAnswer(guest, q, correct, { ms = Infinity, today } = {}) {
  if (guestRemaining(guest) === 0) return { guest, res: { xp: 0, reason: "limit" }, accepted: false };
  const res = answerXp({ q, correct, ms, log: guest.log });
  const run = correct && res.reason !== "too-fast" ? guest.run + 1 : 0;
  const entry = { id: q.id, cat: q.cat, diff: q.diff, correct, ...(q.population ? { pop: q.population } : {}) };
  return {
    guest: { ...guest, day: guest.day ?? today, log: [...guest.log, entry], xp: guest.xp + res.xp, run, bestRun: Math.max(guest.bestRun, run) },
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
  const have = new Set((s.log ?? []).map((l) => String(l.id)));
  const entries = guest.log
    .map((l) => ({ ...l, id: `guest-${l.id}` }))
    .filter((l) => !have.has(String(l.id)));
  if (!entries.length) return { blob: s, summary: null };
  const ok = entries.filter((e) => e.correct).length;
  let ability = s.ability;
  if (typeof updateAbility === "function") {
    for (const e of entries) ability = updateAbility(ability, { id: e.id, cat: e.cat, diff: e.diff }, e.correct, calibration).ability;
  }
  const day = guest.day ?? today;
  let streak = s.streak;
  let rewards = s.rewards;
  let streakStarted = false;
  if (!streak.lastDay || daysBetween(streak.lastDay, day) >= 1) {
    const adv = advanceStreak(streak, rewards, day);
    streak = adv.streak; rewards = adv.rewards; streakStarted = true;
  }
  rewards = bumpDay(rewards, day, { q: entries.length, ok, xp: guest.xp });
  rewards = { ...rewards, best: { ...rewards.best, run: Math.max(rewards.best.run, guest.bestRun ?? 0) } };
  const daily = day === today
    ? (s.daily?.day === today ? { ...s.daily, answered: s.daily.answered + entries.length } : { day: today, answered: entries.length })
    : s.daily;
  return {
    blob: { ...s, log: [...s.log, ...entries], xp: s.xp + (guest.xp ?? 0), bestRun: Math.max(s.bestRun ?? 0, guest.bestRun ?? 0), ability, streak, rewards, daily },
    summary: { answers: entries.length, correct: ok, xp: guest.xp ?? 0, streak: streak.count, streakStarted },
  };
}
