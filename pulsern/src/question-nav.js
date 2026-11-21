/* Practice-session navigation (Back, Next, Skip).

   A skip writes nothing. The only outcome that may touch the answer log,
   the miss schedule, ability, XP, the correct-answer streak, or the daily
   count is markAnswered() when it returns recorded: true. Going back to an
   answered question is read-only: a second markAnswered does not record.

   A skipped question is offered again after REQUEUE_GAP other questions in
   this session. Skipping it a second time leaves it unanswered for a future
   session (it was never logged, so the adaptive pool still contains it) and
   keeps it on the skipped list so the student can jump back.
   Deterministic plain code (CLAUDE.md rule 6). */

export const REQUEUE_GAP = 3;

export function emptyNav() {
  return { entries: [], index: -1 };
}

export function currentEntry(nav) {
  if (!nav || nav.index < 0) return null;
  return nav.entries[nav.index] ?? null;
}

export function skippedCount(nav) {
  return (nav?.entries ?? []).filter((e) => e.status === "skipped").length;
}

/* Every id already in this sitting. The adaptive picker must not draw
   these until navigation itself serves a skip again. */
export function heldIds(nav) {
  return (nav?.entries ?? []).map((e) => e.id);
}

export function appendQuestion(nav, id) {
  const base = nav ?? emptyNav();
  const existing = base.entries.findIndex((e) => e.id === id && e.status !== "answered");
  if (existing >= 0) return { entries: base.entries, index: existing };
  const entries = [...base.entries, {
    id,
    status: "open",
    draft: null,
    snapshot: null,
    requeueAfter: null,
    skipPasses: 0,
  }];
  return { entries, index: entries.length - 1 };
}

/* In-progress selection, kept so Back returns to the same taps.
   An answered question is frozen. */
export function saveDraft(nav, draft) {
  const e = currentEntry(nav);
  if (!e || e.status === "answered") return nav;
  const entries = nav.entries.slice();
  entries[nav.index] = { ...e, draft };
  return { ...nav, entries };
}

/* Score the current question at most once. */
export function markAnswered(nav, snapshot) {
  const e = currentEntry(nav);
  if (!e || e.status === "answered") return { nav, recorded: false };
  const entries = nav.entries.slice();
  entries[nav.index] = {
    ...e,
    status: "answered",
    snapshot,
    draft: null,
    requeueAfter: null,
  };
  return { nav: { ...nav, entries }, recorded: true };
}

export function canGoBack(nav) {
  return !!nav && nav.index > 0;
}

export function goBack(nav) {
  if (!canGoBack(nav)) return nav;
  return { ...nav, index: nav.index - 1 };
}

/* What the screen shows. "review" is read-only and must not be scored again. */
export function present(nav) {
  const e = currentEntry(nav);
  if (!e) return null;
  if (e.status === "answered" && e.snapshot) {
    return {
      id: e.id,
      mode: "review",
      readOnly: true,
      sel: e.snapshot.sel,
      order: e.snapshot.order ?? [],
      wasCorrect: !!e.snapshot.wasCorrect,
      credit: e.snapshot.credit,
      nextReview: e.snapshot.nextReview ?? null,
    };
  }
  return {
    id: e.id,
    mode: "answer",
    readOnly: false,
    skipped: e.status === "skipped",
    sel: e.draft?.sel,
    order: e.draft?.order ?? [],
  };
}

function markSkipped(entries, index) {
  const cur = entries[index];
  if (!cur || cur.status === "answered") return entries;
  const skipPasses = (cur.skipPasses ?? 0) + 1;
  const next = entries.slice();
  next[index] = {
    ...cur,
    status: "skipped",
    skipPasses,
    /* The first skip comes back after other questions. A second skip is
       left for a future session instead of looping. */
    requeueAfter: skipPasses === 1 ? entries.length + REQUEUE_GAP : null,
  };
  return next;
}

function dueSkipIndex(entries) {
  return entries.findIndex((e) => e.status === "skipped" && e.requeueAfter != null && e.requeueAfter <= entries.length);
}

/* Move forward. An unanswered question is skipped (no grade). A later
   entry is restored; otherwise a skip whose gap has elapsed is served;
   otherwise the caller picks a new question, excluding the trail. */
export function forward(nav, { skipIfOpen = true } = {}) {
  if (!nav || nav.index < 0 || !nav.entries.length) {
    return { nav: nav ?? emptyNav(), effect: { type: "need-question", excludeIds: [] } };
  }
  let entries = nav.entries.slice();
  const index = nav.index;
  if (skipIfOpen && entries[index]?.status !== "answered") entries = markSkipped(entries, index);
  if (index < entries.length - 1) {
    return { nav: { entries, index: index + 1 }, effect: { type: "restore" } };
  }
  const due = dueSkipIndex(entries);
  if (due >= 0 && due !== index) {
    return { nav: { entries, index: due }, effect: { type: "requeue" } };
  }
  return {
    nav: { entries, index },
    effect: { type: "need-question", excludeIds: entries.map((e) => e.id) },
  };
}

/* Nothing new left to draw: serve a once-skipped question now, because
   the gap cannot elapse. Null when the student is already on it, or every
   remaining skip was already passed over twice (those wait for a future
   session). */
export function fallbackSkip(nav) {
  if (!nav) return null;
  const idx = nav.entries.findIndex((e) => e.status === "skipped" && (e.skipPasses ?? 0) < 2);
  if (idx < 0 || idx === nav.index) return null;
  return { ...nav, index: idx };
}

/* Jump to a skipped question. From the last one, wrap to the first. */
export function jumpToSkipped(nav) {
  const skips = (nav?.entries ?? []).map((e, i) => ({ e, i })).filter(({ e }) => e.status === "skipped");
  if (!skips.length) return nav;
  const after = skips.find(({ i }) => i > nav.index);
  const target = after ?? skips[0];
  if (target.i === nav.index) {
    const wrap = skips.find(({ i }) => i !== nav.index);
    if (!wrap) return nav;
    return { ...nav, index: wrap.i };
  }
  return { ...nav, index: target.i };
}

/* Next id in `ids` that this sitting has not opened yet (case-study steps
   stay in clinical order). */
export function nextUnvisited(nav, ids) {
  const seen = new Set((nav?.entries ?? []).map((e) => e.id));
  for (const id of ids) if (!seen.has(id)) return id;
  return null;
}

/* Practice blocks pause every 8 answers. The Today round ends once that
   many answers are in, including when the question on screen was skipped
   after an earlier one was answered. A skip with the limit still unmet
   does not end it. fromBreak is "one more block", which must not pause again. */
export function checkpointAfter(sessionN, { auto = false, fromBreak = false, atEnd = false, answered = false, roundLimit = null } = {}) {
  if (atEnd && roundLimit != null && sessionN >= roundLimit) return "done";
  if (!answered || !atEnd) return null;
  if (!auto && !fromBreak && sessionN > 0 && sessionN % 8 === 0) return "break";
  return null;
}
