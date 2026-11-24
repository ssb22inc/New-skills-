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
import { questionIdentity } from "./question-identity.js";

/* Next schedule after one answer. Returns a NEW map (React-state safe).
   `day` is the local day the answer was taken. Omit it and the review
   is counted from the clock, which is what a live answer wants. */
export function updateMissSchedule(schedule, id, correct, day = null) {
  if (id == null) return schedule ?? {};
  const map = schedule ?? {};
  const entry = map[id];
  if (correct && !entry) return map; // never missed — nothing to schedule
  return { ...map, [id]: nextSchedule(entry, correct ? "good" : "hard", day) };
}

/* Lookup key. The canonical key wins. A row that was never stamped
   still groups by its raw id so older fixtures keep their pools. */
export function answerIdentity(row) {
  return questionIdentity(row) ?? (row && !row.unclassified && row.id != null ? String(row.id) : null);
}

export function latestResults(log) {
  const latest = {};
  for (const l of log ?? []) {
    const id = answerIdentity(l);
    if (id != null) latest[id] = !!l.correct;
  }
  return latest;
}

/* A canonical row wins. An old save that only has the number counts
   when this catalog has exactly one question with that number. When
   several share it, the old row stays unresolved: it is not treated
   as a new question, and it is not pinned on any of them. */
export function historyIndex(log) {
  const latest = Object.create(null);
  const unscoped = new Map();
  const unresolved = new Map();
  for (const row of log ?? []) {
    if (!row) continue;
    if (row.unclassified && row.id != null) {
      unresolved.set(String(row.id), !!row.correct);
      continue;
    }
    const id = questionIdentity(row);
    if (id != null) latest[id] = !!row.correct;
    else if (row.id != null) unscoped.set(String(row.id), !!row.correct);
  }
  return { latest, unscoped, unresolved };
}

function peerCounts(questions) {
  const counts = new Map();
  for (const q of questions ?? []) {
    if (q?.id == null) continue;
    const id = String(q.id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function settledResult(question, log, questions = null, index = null, peers = null) {
  const idx = index ?? historyIndex(log);
  const counts = peers ?? peerCounts(questions ?? [question]);
  const id = answerIdentity(question);
  if (id != null && Object.prototype.hasOwnProperty.call(idx.latest, id)) return { state: "known", correct: !!idx.latest[id] };
  const num = question?.id != null ? String(question.id) : null;
  /* An unscoped number counts only when this catalog has exactly one
     question with it. An unclassified row is deliberately neither, so
     it is not painted onto a bank or bundled question that shares the number. */
  if (num && idx.unscoped.has(num) && (counts.get(num) ?? 0) === 1) return { state: "known", correct: idx.unscoped.get(num) };
  return { state: "none" };
}

/* Review date for this question. A date stored under the old number
   is used only when the number identifies one question in the catalog. */
export function scheduleEntry(question, schedule, questions = null, log = null, index = null, peers = null) {
  if (!schedule || !question) return null;
  const id = answerIdentity(question);
  if (id != null && schedule[id]) return schedule[id];
  const raw = schedule[question.id] ?? schedule[String(question.id)];
  if (!raw) return null;
  if (!questionIdentity(question)) return raw;
  const counts = peers ?? peerCounts(questions ?? [question]);
  if ((counts.get(String(question.id)) ?? 0) !== 1) return null;
  const idx = index ?? historyIndex(log);
  if (idx.unresolved.has(String(question.id))) return null;
  return raw;
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
export function questionByIdentity(questions, id) {
  if (id == null) return null;
  const want = String(id);
  return (questions ?? []).find((q) => String(answerIdentity(q) ?? "") === want) ?? null;
}

/* Questions whose canonical key is not already in the log. A built-in
   answer does not hide the bank question that shares its number.
   A number that is a miss in more than one catalog is not offered as
   new: the miss stays in the unresolved review until the student says
   which question it was. A single unrelated question stays new. */
export function unseenQuestions(questions, log) {
  const index = historyIndex(log);
  const peers = peerCounts(questions);
  const blocked = new Set();
  for (const [num, correct] of index.unresolved) {
    if (correct === false && (peers.get(num) ?? 0) > 1) blocked.add(num);
  }
  for (const [num, correct] of index.unscoped) {
    if (correct === false && (peers.get(num) ?? 0) > 1) blocked.add(num);
  }
  return (questions ?? []).filter((q) => q && !blocked.has(String(q.id)) && settledResult(q, log, questions, index, peers).state === "none");
}

/* A merged trial answer keeps the built-in stem. Its navigation id is
   the canonical key, so a bank row with the same number is a different
   question. Legacy guest- prefixed rows still resolve to the built-in. */
export function expandTrialQuestions(questions, log, registry = null, schedule = null) {
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
  for (const key of Object.keys(schedule ?? {})) {
    if (!key.startsWith("builtin:") || have.has(key)) continue;
    const src = bySource.get(key.slice("builtin:".length));
    if (!src) continue;
    have.add(key);
    extra.push({ ...src, id: src.id, key, source: "builtin" });
  }
  return extra.length ? [...list, ...extra] : list;
}

/* A legacy number that still belongs to more than one question. The miss
   stays reviewable here, and neither catalog question inherits it. */
function unresolvedCards(log, questions, index, peers) {
  const cards = [];
  const seen = new Set();
  const add = (num) => {
    if (seen.has(num)) return;
    seen.add(num);
    const candidates = (questions ?? []).filter((q) => q && !q.unresolved && String(q.id) === num);
    const row = (log ?? []).find((item) => item && String(item.id) === num && (item.unclassified || !questionIdentity(item)));
    cards.push({
      unresolved: true,
      id: `unresolved:${num}`,
      legacyId: num,
      cat: typeof row?.cat === "string" && row.cat ? row.cat : (candidates[0]?.cat ?? "Management of Care"),
      diff: 1,
      type: "mc",
      stem: candidates.length > 1
        ? `An older save recorded a miss on question ${num}. That number matches more than one question, so it is not counted as any of them until you say which one it was.`
        : `An older save recorded a miss on question ${num}. It could not be matched to one question, so it stays here until you identify it.`,
      candidates,
    });
  };
  for (const [num, correct] of index.unresolved) if (correct === false) add(num);
  for (const [num, correct] of index.unscoped) {
    if (correct === false && (peers.get(num) ?? 0) > 1) add(num);
  }
  return cards;
}

export function reviewPools(questions, log, schedule, today = todayStr()) {
  const index = historyIndex(log);
  const peers = peerCounts(questions);
  const idOf = (q) => answerIdentity(q) ?? String(q.id);
  const dueOf = (q) => {
    if (q?.unresolved) {
      const raw = schedule?.[q.legacyId] ?? schedule?.[Number(q.legacyId)];
      return raw && typeof raw.due === "string" ? raw : null;
    }
    return scheduleEntry(q, schedule, questions, log, index, peers);
  };
  const cards = unresolvedCards(log, questions, index, peers);
  const pool = [...(questions ?? []).filter((q) => q && !q.unresolved), ...cards];
  const due = pool.filter((q) => {
    const entry = dueOf(q);
    return !!entry && typeof entry.due === "string" && entry.due <= today;
  }).sort((a, b) => (dueOf(a).due < dueOf(b).due ? -1 : dueOf(a).due > dueOf(b).due ? 1 : 0));
  const dueIds = new Set(due.map(idOf));
  const misses = pool.filter((q) => {
    if (q.unresolved) return true;
    const settled = settledResult(q, log, questions, index, peers);
    if (settled.state === "known") return settled.correct === false;
    const entry = dueOf(q);
    return !!entry && typeof entry.due === "string";
  });
  const review = [...due, ...misses.filter((q) => !dueIds.has(idOf(q)))];
  return { due, misses, review };
}

/* What the Today round draws from: due reviews come first; once none are due,
   new questions plus any current miss that has no future date yet. Misses
   scheduled for a later day wait for that day (they stay available on demand
   in Review Misses). */
export function todayPool(questions, log, schedule, freshPool, today = todayStr()) {
  const index = historyIndex(log);
  const peers = peerCounts(questions);
  const { due, misses } = reviewPools(questions, log, schedule, today);
  if (due.length) return due;
  const waiting = (q) => {
    const entry = scheduleEntry(q, schedule, questions, log, index, peers);
    return !!entry && !(typeof entry.due === "string" && entry.due <= today);
  };
  return [...misses.filter((q) => !waiting(q)), ...freshPool];
}

/* The questions a sitting may draw next. Ids already opened this sitting
   (including a skip) are removed BEFORE the due-only shortcut. Skipping the
   only due review must fall through to other misses and new questions,
   and Review misses must still reach a miss that is not due yet. */
function heldKeys(held) {
  return new Set((held ?? []).map((id) => String(id)));
}

function stillOpen(q, skip) {
  return q && !skip.has(String(answerIdentity(q) ?? q.id));
}

export function sessionPool(questions, { log, schedule, fresh, mode, held = [], today = todayStr() } = {}) {
  const skip = heldKeys(held);
  const visible = (questions ?? []).filter((q) => stillOpen(q, skip));
  if (mode === "review") {
    const { due, review } = reviewPools(visible, log, schedule, today);
    return due.length ? due : review;
  }
  if (mode === "today") {
    const visibleFresh = (fresh ?? []).filter((q) => stillOpen(q, skip));
    return todayPool(visible, log, schedule, visibleFresh, today);
  }
  return (fresh ?? []).filter((q) => stillOpen(q, skip));
}
