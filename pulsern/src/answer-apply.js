/* One answer, whether it was just tapped or folded in from a trial.
   Ability, the day's XP ledger, the streak, and the review date all
   move here. Import does not keep a second copy of these rules. */
import { answerXp, answerCountsForRun, bumpDay, advanceStreak, streakDayCounted, sameAnswer } from "./rewards.js";
import { updateAbility } from "./ability-engine.js";
import { updateMissSchedule } from "./question-review.js";
import { canonicalKey, questionIdentity } from "./question-identity.js";

/* A row with a timestamp sorts by that instant. A row that only has a
   local day sits at the end of that day, so a morning import lands
   before an account answer that was already on the book for the day. */
export function answerTime(row) {
  if (Number.isFinite(row?.at)) return row.at;
  if (typeof row?.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.day)) {
    const [y, m, d] = row.day.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }
  return Number.POSITIVE_INFINITY;
}

function laterResult(log, key, at) {
  if (!key || !Number.isFinite(at)) return false;
  return (log ?? []).some((row) => questionIdentity(row) === key && answerTime(row) > at);
}

function insertByTime(log, row) {
  if (!Number.isFinite(row?.at)) return [...log, row];
  const next = log.slice();
  let i = next.length;
  while (i > 0 && answerTime(next[i - 1]) > row.at) i -= 1;
  next.splice(i, 0, row);
  return next;
}

/* An older day never replaces a newer day's counter. The same day
   increments. A newer day starts that day's count. */
function dailyAfter(daily, day) {
  if (!day) return daily ?? null;
  if (!daily?.day || day > daily.day) return { day, answered: 1 };
  if (day < daily.day) return daily;
  return { ...daily, answered: (daily.answered ?? 0) + 1 };
}

export function stampedQuestion(q) {
  if (!q) return { unclassified: true, key: null };
  const source = q.source;
  const key = q.key ?? canonicalKey(source, q.id);
  if (!key) return { ...q, key: null, unclassified: true };
  return { ...q, source, key, unclassified: false };
}

/* `state` is the plain progress object (log, xp, ability, streak,
   rewards, daily, missSchedule, run, bestRun). A repeated attempt id
   is ignored. An unclassified question is stored and then left out of
   XP, ability, streak, and the ledger. */
export function applyAnswer(state, input) {
  const q = stampedQuestion(input.q);
  const log = state.log ?? [];
  if (input.attempt != null && log.some((row) => String(row?.attempt) === String(input.attempt))) {
    return { state, result: null, duplicate: true, streakNote: null };
  }
  const today = input.today;
  const ms = input.ms ?? Infinity;
  const correct = !!input.correct;
  const historical = Number.isFinite(input.at);
  const at = historical ? input.at : Date.now();
  const newer = historical && laterResult(log, q.key, at);
  const res = q.unclassified
    ? { xp: 0, reason: "unclassified", base: 0, bonus: 0, fix: false }
    : answerXp({ q, correct, ms, log });
  const counts = !q.unclassified && answerCountsForRun({ correct, q, ms });
  const run = newer ? (state.run ?? 0) : (counts ? (state.run ?? 0) + 1 : 0);
  const row = {
    id: q.id,
    key: q.key,
    ...(q.source ? { source: q.source } : {}),
    ...(q.unclassified ? { unclassified: true } : {}),
    cat: q.cat,
    diff: q.diff,
    correct,
    ...(input.attempt != null ? { attempt: String(input.attempt) } : {}),
    ...(today ? { day: today } : {}),
    ...(q.population ? { pop: q.population } : {}),
    at,
    origin: "recorded",
  };
  const placed = historical ? insertByTime(log, row) : [...log, row];
  if (q.unclassified) {
    return {
      state: { ...state, log: placed },
      result: { ...res, run: state.run ?? 0 },
      duplicate: false,
      streakNote: null,
    };
  }
  const prior = [...log].reverse().find((r) => sameAnswer(q, r));
  const ability = updateAbility(state.ability, q, correct, input.calibration ?? {}).ability;
  let rewards = bumpDay(state.rewards, today, { q: 1, ok: correct ? 1 : 0, xp: res.xp, fixes: correct && prior && prior.correct === false ? 1 : 0 });
  let streak = state.streak;
  let streakNote = null;
  if (!streakDayCounted(streak, null, today)) {
    const adv = advanceStreak(streak, rewards, today);
    streak = adv.streak;
    rewards = { ...adv.rewards, best: { ...adv.rewards.best, streak: Math.max(adv.rewards.best?.streak ?? 0, adv.streak.count), run: Math.max(adv.rewards.best?.run ?? 0, run) } };
    streakNote = adv;
  } else if (run > (rewards.best?.run ?? 0)) {
    rewards = { ...rewards, best: { ...rewards.best, run } };
  }
  const daily = dailyAfter(state.daily, today);
  const missSchedule = input.schedule === false || newer ? state.missSchedule : updateMissSchedule(state.missSchedule, q.key, correct, today);
  return {
    state: {
      ...state,
      log: placed,
      xp: (state.xp ?? 0) + (res.xp || 0),
      ability,
      rewards,
      streak,
      daily,
      missSchedule,
      run,
      bestRun: Math.max(state.bestRun ?? 0, run),
    },
    result: { ...res, run },
    duplicate: false,
    streakNote,
  };
}
