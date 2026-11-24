/* One answer, whether it was just tapped or folded in from a trial.
   Ability, the day's XP ledger, the streak, and the review date all
   move here. Import does not keep a second copy of these rules. */
import { answerXp, answerCountsForRun, bumpDay, advanceStreak, streakDayCounted, sameAnswer, shiftDay } from "./rewards.js";
import { emptyAbility, updateAbility } from "./ability-engine.js";
import { updateMissSchedule } from "./question-review.js";
import { canonicalKey, questionIdentity } from "./question-identity.js";

function insertByTime(log, row) {
  if (!Number.isFinite(row?.at)) return [...log, row];
  const next = log.slice();
  let i = next.length;
  while (i > 0) {
    const prev = next[i - 1];
    if (Number.isFinite(prev?.at)) {
      if (prev.at <= row.at) break;
      i -= 1;
      continue;
    }
    /* A saved row with a day but no clock sits at the end of that day.
       A row with neither was already on the account and stays put. */
    if (typeof prev?.day === "string" && typeof row.day === "string" && prev.day > row.day) {
      i -= 1;
      continue;
    }
    break;
  }
  next.splice(i, 0, row);
  return next;
}

/* Elo's K depends on how many answers came before this one. An import
   that lands in the middle of the log has to be replayed from the start
   of the category, or a later answer keeps the K it earned too early. */
function canReplay(log) {
  return (log ?? []).every((row) => row && !row.unclassified && questionIdentity(row));
}

/* A day that sits immediately before a streak already on the books
   lengthens that streak. The live helper refuses any day before
   lastDay, which is right for a clock change and wrong for an import. */
function noteEarlierDay(streak, day) {
  if (!day || !streak?.lastDay || day >= streak.lastDay || !(streak.count > 0)) return streak;
  const start = shiftDay(streak.lastDay, 1 - streak.count);
  if (day >= start) return streak;
  if (day !== shiftDay(start, -1)) return streak;
  return { ...streak, count: streak.count + 1 };
}

function adoptRawSchedule(schedule, q, log) {
  if (!q?.key) return schedule ?? {};
  const map = { ...(schedule ?? {}) };
  if (map[q.key]) return map;
  const raw = map[q.id] ?? map[String(q.id)];
  if (!raw) return map;
  const id = String(q.id);
  const claimed = Object.keys(map).some((key) => key !== q.key && key.endsWith(`:${id}`));
  const otherSource = (log ?? []).some((row) => String(row?.id) === id && row.source && row.source !== q.source);
  if (claimed || otherSource) return map;
  map[q.key] = raw;
  delete map[q.id];
  delete map[String(q.id)];
  return map;
}

function replayAbility(log, ability, calibration) {
  let next = emptyAbility(Object.keys(ability ?? {}));
  for (const row of log) {
    if (!questionIdentity(row) || row.unclassified) continue;
    if (row.cat && !next[row.cat]) next = { ...next, [row.cat]: { theta: 1200, n: 0 } };
    next = updateAbility(next, row, !!row.correct, calibration).ability;
  }
  return next;
}

function replayKeySchedule(log, key, schedule) {
  let next = { ...(schedule ?? {}) };
  delete next[key];
  for (const row of log) {
    if (questionIdentity(row) !== key || row.unclassified) continue;
    next = updateMissSchedule(next, key, !!row.correct, row.day);
  }
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
  const res = q.unclassified
    ? { xp: 0, reason: "unclassified", base: 0, bonus: 0, fix: false }
    : answerXp({ q, correct, ms, log });
  const counts = !q.unclassified && answerCountsForRun({ correct, q, ms });
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
  const insertedBehind = placed[placed.length - 1] !== row;
  const run = insertedBehind ? (state.run ?? 0) : (counts ? (state.run ?? 0) + 1 : 0);
  if (q.unclassified) {
    return {
      state: { ...state, log: placed },
      result: { ...res, run: state.run ?? 0 },
      duplicate: false,
      streakNote: null,
    };
  }
  const prior = [...log].reverse().find((r) => sameAnswer(q, r));
  const calibration = input.calibration ?? {};
  const ability = insertedBehind && canReplay(placed)
    ? replayAbility(placed, state.ability, calibration)
    : updateAbility(state.ability, q, correct, calibration).ability;
  let rewards = bumpDay(state.rewards, today, { q: 1, ok: correct ? 1 : 0, xp: res.xp, fixes: correct && prior && prior.correct === false ? 1 : 0 });
  let streak = state.streak;
  let streakNote = null;
  if (!streakDayCounted(streak, null, today)) {
    const adv = advanceStreak(streak, rewards, today);
    streak = noteEarlierDay(adv.streak, today);
    rewards = { ...adv.rewards, best: { ...adv.rewards.best, streak: Math.max(adv.rewards.best?.streak ?? 0, streak.count), run: Math.max(adv.rewards.best?.run ?? 0, run) } };
    streakNote = adv;
  } else if (run > (rewards.best?.run ?? 0)) {
    rewards = { ...rewards, best: { ...rewards.best, run } };
  }
  const daily = dailyAfter(state.daily, today);
  const baseSchedule = adoptRawSchedule(state.missSchedule, q, state.log);
  const missSchedule = input.schedule === false
    ? state.missSchedule
    : (insertedBehind && canReplay(placed)
      ? replayKeySchedule(placed, q.key, baseSchedule)
      : updateMissSchedule(baseSchedule, q.key, correct, today));
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
