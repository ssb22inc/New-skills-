/* One answer, whether it was just tapped or folded in from a trial.
   Ability, the day's XP ledger, the streak, and the review date all
   move here. Import does not keep a second copy of these rules. */
import { answerXp, answerCountsForRun, bumpDay, advanceStreak, streakDayCounted, sameAnswer, shiftDay, STREAK_MILESTONES } from "./rewards.js";
import { updateAbility, itemRating } from "./ability-engine.js";
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

/* Replay one category from its stored ratings. A row without a rating,
   or one that was left unclassified, contributed to the saved theta in
   a way this replay cannot rebuild, so the caller keeps that theta. */
function replayCategory(log, cat) {
  const rows = [];
  for (const row of log ?? []) {
    if (!row || row.cat !== cat) continue;
    if (row.unclassified || !questionIdentity(row) || !Number.isFinite(row.rating)) return null;
    rows.push(row);
  }
  if (!rows.length) return null;
  let ability = { [cat]: { theta: 1200, n: 0 } };
  for (const row of rows) ability = updateAbility(ability, row, !!row.correct, {}).ability;
  return ability[cat];
}

/* The streak is the run of studied days ending at lastDay. Importing
   several earlier days extends that run across the whole set, including
   a day that only becomes adjacent after a later import fills the gap.
   Days already inside the streak, including a shielded gap, stay. */
function reconcileStreak(streak, log) {
  if (!streak?.lastDay || !(streak.count > 0)) return streak;
  /* Count is studied days, not a calendar span. A shield bridges a gap
     without adding that day, so walking lastDay-(count-1) would treat
     the bridge as a study day and count the real one twice. Walk the
     studied dates instead, and never shrink a streak the shield built. */
  const studied = new Set([streak.lastDay]);
  for (const row of log ?? []) {
    if (typeof row?.day === "string" && row.day <= streak.lastDay) studied.add(row.day);
  }
  let count = 0;
  let day = streak.lastDay;
  while (studied.has(day)) {
    count += 1;
    day = shiftDay(day, -1);
    if (count > 10000) break;
  }
  if (count <= streak.count) return streak;
  let shield = streak.shield;
  for (let n = streak.count + 1; n <= count; n += 1) if (n % 7 === 0) shield = true;
  return { ...streak, count, shield };
}

function crossedMilestones(rewards, count) {
  const had = new Set(rewards?.milestones ?? []);
  return STREAK_MILESTONES.filter((m) => m <= count && !had.has(m));
}

function adoptRawSchedule(schedule, q, log) {
  if (!q?.key) return schedule ?? {};
  const map = { ...(schedule ?? {}) };
  if (map[q.key]) return map;
  const raw = map[q.id] ?? map[String(q.id)];
  if (!raw) return map;
  const id = String(q.id);
  const claimed = Object.keys(map).some((key) => key !== q.key && key.endsWith(`:${id}`));
  const otherSource = (log ?? []).some((row) => String(row?.id) === id && ((row.source && row.source !== q.source) || row.unclassified));
  if (claimed || otherSource) return map;
  map[q.key] = raw;
  delete map[q.id];
  delete map[String(q.id)];
  return map;
}

/* One question's review date, in log order. Rows that are not this
   question, including unkeyed and unclassified ones, are skipped.
   They do not stop the keyed answers from being replayed. */
function replayKeySchedule(log, key, schedule) {
  let next = { ...(schedule ?? {}) };
  delete next[key];
  for (const row of log ?? []) {
    if (questionIdentity(row) !== key || row.unclassified) continue;
    if (typeof row.day !== "string") continue;
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
  const calibration = input.calibration ?? {};
  const rating = q.unclassified ? null : itemRating(q, calibration);
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
    ...(Number.isFinite(rating) ? { rating } : {}),
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
  const replayed = insertedBehind ? replayCategory(placed, q.cat) : null;
  const ability = replayed
    ? { ...(state.ability ?? {}), [q.cat]: replayed }
    : updateAbility(state.ability, { ...q, rating }, correct, calibration).ability;
  let rewards = bumpDay(state.rewards, today, { q: 1, ok: correct ? 1 : 0, xp: res.xp, fixes: correct && prior && prior.correct === false ? 1 : 0 });
  let streak = state.streak;
  let streakNote = null;
  if (!streakDayCounted(streak, null, today)) {
    const adv = advanceStreak(streak, rewards, today);
    streak = historical ? reconcileStreak(adv.streak, placed) : adv.streak;
    rewards = { ...adv.rewards, best: { ...adv.rewards.best, streak: Math.max(adv.rewards.best?.streak ?? 0, streak.count), run: Math.max(adv.rewards.best?.run ?? 0, run) } };
    const crossed = crossedMilestones(rewards, streak.count);
    if (crossed.length) rewards = { ...rewards, milestones: [...(rewards.milestones ?? []), ...crossed] };
    streakNote = adv;
  } else if (run > (rewards.best?.run ?? 0)) {
    rewards = { ...rewards, best: { ...rewards.best, run } };
  }
  const daily = dailyAfter(state.daily, today);
  const baseSchedule = adoptRawSchedule(state.missSchedule, q, state.log);
  const missSchedule = input.schedule === false
    ? state.missSchedule
    : (insertedBehind
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

/* The screen can score two answers before React renders again. Each
   call has to read the progress the previous call just wrote. */
export function commitLiveAnswer(holder, input) {
  const applied = applyAnswer(holder.current, input);
  holder.current = applied.state;
  return applied;
}
