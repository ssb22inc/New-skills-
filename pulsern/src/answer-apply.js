/* One live answer. A brand-new account imports a trial by calling this
   once per answer, in order. An account that already has history does
   not come through here for the trial: there is no replay. */
import { answerXp, answerCountsForRun, bumpDay, advanceStreak, streakDayCounted, sameAnswer } from "./rewards.js";
import { updateAbility } from "./ability-engine.js";
import { updateMissSchedule } from "./question-review.js";
import { canonicalKey } from "./question-identity.js";

function adoptRawSchedule(schedule, q, log) {
  if (!q?.key) return schedule ?? {};
  const map = { ...(schedule ?? {}) };
  if (map[q.key]) return map;
  const raw = map[q.id] ?? map[String(q.id)];
  if (!raw) return map;
  const id = String(q.id);
  const claimed = Object.keys(map).some((key) => key !== q.key && key.endsWith(`:${id}`));
  const otherSource = (log ?? []).some((row) => String(row?.id) === id && (row.unclassified || (row.source && row.source !== q.source)));
  if (claimed || otherSource) return map;
  map[q.key] = raw;
  delete map[q.id];
  delete map[String(q.id)];
  return map;
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

/* A new id on every answer. The counter used to restart at 1 after a
   reload and collide with answers already saved. The id is not the
   account id. */
export function newAttemptId() {
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `live:${nonce}`;
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
  const calibration = input.calibration ?? {};
  const res = q.unclassified
    ? { xp: 0, reason: "unclassified", base: 0, bonus: 0, fix: false }
    : answerXp({ q, correct, ms, log });
  const counts = !q.unclassified && answerCountsForRun({ correct, q, ms });
  const run = counts ? (state.run ?? 0) + 1 : 0;
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
    ...(Number.isFinite(ms) ? { ms } : {}),
    ...(Number.isFinite(input.words) ? { words: input.words } : {}),
    ...(Number.isFinite(input.rating) ? { rating: input.rating } : {}),
    ...(input.schedule === false ? { schedule: false } : {}),
    origin: "recorded",
  };
  if (q.unclassified) {
    return {
      state: { ...state, log: [...log, row] },
      result: { ...res, run: state.run ?? 0 },
      duplicate: false,
      streakNote: null,
    };
  }
  const prior = [...log].reverse().find((r) => sameAnswer(q, r));
  const ability = updateAbility(state.ability, q, correct, calibration).ability;
  let rewards = bumpDay(state.rewards, today, { q: 1, ok: correct ? 1 : 0, xp: res.xp, fixes: correct && prior && prior.correct === false ? 1 : 0 });
  let streak = state.streak;
  let streakNote = null;
  if (!streakDayCounted(streak, null, today)) {
    const adv = advanceStreak(streak, rewards, today);
    streak = adv.streak;
    rewards = { ...adv.rewards, best: { ...adv.rewards.best, streak: Math.max(adv.rewards.best?.streak ?? 0, streak.count), run: Math.max(adv.rewards.best?.run ?? 0, run) } };
    streakNote = adv;
  } else if (run > (rewards.best?.run ?? 0)) {
    rewards = { ...rewards, best: { ...rewards.best, run } };
  }
  const daily = dailyAfter(state.daily, today);
  const baseSchedule = adoptRawSchedule(state.missSchedule, q, log);
  const missSchedule = input.schedule === false
    ? state.missSchedule
    : updateMissSchedule(baseSchedule, q.key, correct, today);
  return {
    state: {
      ...state,
      log: [...log, row],
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

/* The screen can score two answers before React renders again. Each
   call has to read the progress the previous call just wrote. */
export function commitLiveAnswer(holder, input) {
  const applied = applyAnswer(holder.current, input);
  holder.current = applied.state;
  return applied;
}
