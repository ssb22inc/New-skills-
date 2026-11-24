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

/* Latest result per canonical key. A row with no key falls back to its
   id so older fixtures still group. An unclassified row is skipped. */
export function answerIdentity(row) {
  if (!row || row.unclassified) return null;
  if (typeof row.key === "string" && row.key) return row.key;
  if (row.source === "builtin" || row.source === "bank" || row.source === "case") return `${row.source}:${row.id}`;
  return row.id != null ? String(row.id) : null;
}

export function latestResults(log) {
  const latest = {};
  for (const l of log ?? []) {
    const id = answerIdentity(l);
    if (id != null) latest[id] = !!l.correct;
  }
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
/* A merged trial answer is stored as guest-<built-in id> so it cannot
   collide with a shared-bank item. Review still needs the original stem. */
export function expandTrialQuestions(questions, log, registry = null) {
  const list = questions ?? [];
  const have = new Set(list.map((q) => answerIdentity(q) ?? String(q.id)));
  const bySource = new Map((registry ?? list).map((q) => [String(q.id), q]));
  const extra = [];
  for (const row of log ?? []) {
    const ident = answerIdentity(row) ?? String(row?.id ?? "");
    if (!ident || have.has(ident)) continue;
    const fromKey = ident.startsWith("builtin:") ? ident.slice("builtin:".length) : (ident.startsWith("guest-") ? ident.slice("guest-".length) : null);
    const src = fromKey != null ? bySource.get(fromKey) : null;
    if (!src) continue;
    have.add(ident);
    extra.push({ ...src, id: row.id, ...(row.key ? { key: row.key, source: row.source ?? "builtin" } : {}) });
  }
  return extra.length ? [...list, ...extra] : list;
}

export function reviewPools(questions, log, schedule, today = todayStr()) {
  const latest = latestResults(log);
  const idOf = (q) => answerIdentity(q) ?? String(q.id);
  const due = questions.filter((q) => isDue(schedule, idOf(q), today))
    .sort((a, b) => (schedule[idOf(a)].due < schedule[idOf(b)].due ? -1 : schedule[idOf(a)].due > schedule[idOf(b)].due ? 1 : 0));
  const dueIds = new Set(due.map(idOf));
  const misses = questions.filter((q) => latest[idOf(q)] === false);
  const review = [...due, ...misses.filter((q) => !dueIds.has(idOf(q)))];
  return { due, misses, review };
}

/* What the Today round draws from: due reviews come first; once none are due,
   new questions plus any current miss that has no future date yet. Misses
   scheduled for a later day wait for that day (they stay available on demand
   in Review Misses). */
export function todayPool(questions, log, schedule, freshPool, today = todayStr()) {
  const { due, misses } = reviewPools(questions, log, schedule, today);
  if (due.length) return due;
  const waiting = (q) => {
    const id = answerIdentity(q) ?? String(q.id);
    return !!schedule?.[id] && !isDue(schedule, id, today);
  };
  return [...misses.filter((q) => !waiting(q)), ...freshPool];
}

/* The questions a sitting may draw next. Ids already opened this sitting
   (including a skip) are removed BEFORE the due-only shortcut. Skipping the
   only due review must fall through to other misses and new questions,
   and Review misses must still reach a miss that is not due yet. */
export function sessionPool(questions, { log, schedule, fresh, mode, held = [], today = todayStr() } = {}) {
  const skip = new Set(held);
  const visible = (questions ?? []).filter((q) => q && !skip.has(q.id));
  if (mode === "review") {
    const { due, review } = reviewPools(visible, log, schedule, today);
    return due.length ? due : review;
  }
  if (mode === "today") {
    const visibleFresh = (fresh ?? []).filter((q) => q && !skip.has(q.id));
    return todayPool(visible, log, schedule, visibleFresh, today);
  }
  return (fresh ?? []).filter((q) => q && !skip.has(q.id));
}
