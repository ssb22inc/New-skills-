/* Spaced review for missed QBank questions.

   missSchedule: { [questionId]: { interval, due: "YYYY-MM-DD", seen } } —
   persisted under its own optional key (PULSERN_BUILD.md §4). It reuses the
   flashcard ladder in srs.js so a missed question returns on a real LOCAL
   calendar date:
     • a miss (first or repeat) → "hard": back tomorrow, ladder reset to 1 day;
     • a correct review of a scheduled question → "good": 3 → 7 → 15 → 31 → 60 days.
   A question answered correctly that was never missed gets no entry.
   Deterministic plain code (CLAUDE.md rule 6); dates LOCAL (rule 4). */
import { nextSchedule } from "./srs.js";
import { todayStr } from "./dates.js";

/* Next schedule after one answer. Returns a NEW map (React-state safe). */
export function updateMissSchedule(schedule, id, correct) {
  const map = schedule ?? {};
  const entry = map[id];
  if (correct && !entry) return map; // never missed — nothing to schedule
  return { ...map, [id]: nextSchedule(entry, correct ? "good" : "hard") };
}

/* Latest result per question id from the answer log. */
export function latestResults(log) {
  const latest = {};
  for (const l of log ?? []) if (l && l.id != null) latest[l.id] = !!l.correct;
  return latest;
}

/* Legacy saves predate the schedule. Every question whose latest logged
   answer is wrong and has no entry yet is scheduled as due today — the log
   carries no dates, so "overdue now" is the honest starting point. Existing
   entries are never overwritten. */
export function deriveMissSchedule(log, existing) {
  const map = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  const today = todayStr();
  for (const [id, ok] of Object.entries(latestResults(log))) {
    if (!ok && map[id] === undefined) map[id] = { interval: 1, due: today };
  }
  return map;
}

export const isDue = (schedule, id, today = todayStr()) => {
  const e = schedule?.[id];
  return !!e && typeof e.due === "string" && e.due <= today;
};

/* Split a question list into the review pools.
   due      — scheduled reviews whose date has arrived (oldest due first);
   misses   — every current miss (latest answer wrong), due or not, for
              on-demand Review Misses;
   review   — due ∪ misses, due ones first: what Review Misses serves. */
export function reviewPools(questions, log, schedule, today = todayStr()) {
  const latest = latestResults(log);
  const due = questions.filter((q) => isDue(schedule, q.id, today))
    .sort((a, b) => (schedule[a.id].due < schedule[b.id].due ? -1 : schedule[a.id].due > schedule[b.id].due ? 1 : 0));
  const dueIds = new Set(due.map((q) => q.id));
  const misses = questions.filter((q) => latest[q.id] === false);
  const review = [...due, ...misses.filter((q) => !dueIds.has(q.id))];
  return { due, misses, review };
}

/* What the Today round draws from: due reviews come first; once none are due,
   new questions plus any current miss that has no future date yet. Misses
   scheduled for a later day wait for that day (they stay available on demand
   in Review Misses). */
export function todayPool(questions, log, schedule, freshPool, today = todayStr()) {
  const { due, misses } = reviewPools(questions, log, schedule, today);
  if (due.length) return due;
  const waiting = (q) => !!schedule?.[q.id] && !isDue(schedule, q.id, today);
  return [...misses.filter((q) => !waiting(q)), ...freshPool];
}
