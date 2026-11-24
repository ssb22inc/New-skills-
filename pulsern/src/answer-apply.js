/* One answer, whether it was just tapped or folded in from a trial.
   Ability, the day's XP ledger, the streak, and the review date all
   move here. Import does not keep a second copy of these rules. */
import { answerXp, answerCountsForRun, bumpDay, advanceStreak, streakDayCounted, sameAnswer } from "./rewards.js";
import { updateAbility } from "./ability-engine.js";
import { updateMissSchedule } from "./question-review.js";
import { canonicalKey } from "./question-key.js";

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
  const daily = today
    ? (state.daily?.day === today ? { ...state.daily, answered: (state.daily.answered ?? 0) + 1 } : { day: today, answered: 1 })
    : state.daily;
  const missSchedule = input.schedule === false ? state.missSchedule : updateMissSchedule(state.missSchedule, q.key, correct);
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
