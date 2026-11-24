/* Card-session navigation (Back, Next, Skip).

   Same sitting rules as practice questions (question-nav.js): Back walks
   the cards already opened, Next moves forward through that history, and
   at the live card Next skips it. Skip never writes a grade. The schedule
   (srsMap / nextSchedule) changes only when the screen grades a card that
   has not been graded on this visit. A skipped card is offered again after
   REQUEUE_GAP other cards. Skipping it a second time leaves it ungraded
   for the next time this deck is opened.
   Deterministic plain code (CLAUDE.md rule 6). */

import { REQUEUE_GAP } from "./question-nav.js";

/* "Again" has always come back after two other cards in this sitting.
   Skip uses the longer practice gap so it does not feel like a fail. */
export const AGAIN_GAP = 2;
export { REQUEUE_GAP };

export function startSession(ids) {
  const list = [];
  const seen = new Set();
  for (const id of ids ?? []) {
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    list.push(id);
  }
  if (!list.length) return { entries: [], index: -1, queue: [], skipPasses: {} };
  return {
    entries: [blank(list[0])],
    index: 0,
    queue: list.slice(1),
    skipPasses: {},
  };
}

function blank(id) {
  return { id, show: false, typed: "", skippedVisit: false, grade: null };
}

export function currentCard(nav) {
  if (!nav || nav.index < 0 || nav.index >= (nav.entries?.length ?? 0)) return null;
  return nav.entries[nav.index];
}

export function atFrontier(nav) {
  return !!nav && nav.index >= 0 && nav.index === nav.entries.length - 1;
}

export function canGoBack(nav) {
  return !!nav && nav.index > 0;
}

/* Next is on when there is a later card in this sitting, or the live card
   can still be skipped / advanced. It is off once the queue is finished. */
export function canGoForward(nav) {
  if (!nav || nav.index < 0) return false;
  if (nav.index < nav.entries.length - 1) return true;
  return nav.index < nav.entries.length;
}

export function canSkip(nav) {
  return !!currentCard(nav);
}

/* Cards still ahead in this sitting: the live ungraded card plus anything
   waiting in the queue (including a first skip and an "again"). */
export function cardsLeft(nav) {
  if (!nav) return 0;
  const ids = new Set(nav.queue ?? []);
  const cur = currentCard(nav);
  if (cur && !cur.grade) ids.add(cur.id);
  return ids.size;
}

export function skippedCount(nav) {
  if (!nav) return 0;
  const ids = new Set();
  for (const e of nav.entries ?? []) {
    if (e.skippedVisit && !e.grade) ids.add(e.id);
  }
  return ids.size;
}

/* "studying" has a card on screen. "skipped" means the sitting ended with
   at least one card never graded. "clear" means nothing left ungraded. */
export function sessionOutcome(nav) {
  if (currentCard(nav)) return "studying";
  if (skippedCount(nav) > 0) return "skipped";
  return "clear";
}

export function saveCardView(nav, { show, typed } = {}) {
  const e = currentCard(nav);
  if (!e) return nav;
  const nextShow = !!show;
  const nextTyped = typed ?? "";
  if (e.show === nextShow && e.typed === nextTyped) return nav;
  const entries = nav.entries.slice();
  entries[nav.index] = { ...e, show: nextShow, typed: nextTyped };
  return { ...nav, entries };
}

export function goBack(nav) {
  if (!canGoBack(nav)) return nav;
  return { ...nav, index: nav.index - 1 };
}

function insertGap(queue, id, gap) {
  const rest = queue.filter((x) => x !== id);
  const at = Math.min(gap, rest.length);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

function finishMove(nav) {
  if (nav.index < nav.entries.length - 1) {
    return { nav: { ...nav, index: nav.index + 1 }, effect: "restore" };
  }
  if (!nav.queue.length) {
    return { nav: { ...nav, index: nav.entries.length }, effect: "done" };
  }
  const [id, ...queue] = nav.queue;
  const entries = nav.entries.map((entry) => (
    entry.id === id ? { ...entry, skippedVisit: false } : entry
  ));
  entries.push(blank(id));
  return {
    nav: { ...nav, entries, queue, index: entries.length - 1 },
    effect: "advance",
  };
}

/* Leave the current card ungraded. The first skip comes back after other
   cards. A second skip stays out of this sitting and is not scheduled. */
export function skipCurrent(nav) {
  const e = currentCard(nav);
  if (!e) return { nav, effect: "none" };
  if (e.grade) return finishMove(nav);
  const passes = (nav.skipPasses[e.id] ?? 0) + 1;
  const entries = nav.entries.slice();
  entries[nav.index] = { ...e, skippedVisit: true };
  let queue = passes >= 2
    ? nav.queue.filter((id) => id !== e.id)
    : insertGap(nav.queue, e.id, REQUEUE_GAP);
  /* Nothing else left to show first: don't put this card straight back
     on screen. It stays ungraded, and Back can still open it. */
  if (queue.length === 1 && queue[0] === e.id) queue = [];
  return finishMove({
    ...nav,
    entries,
    queue,
    skipPasses: { ...nav.skipPasses, [e.id]: passes },
  });
}

/* In history, Next only restores the next opened card. On the live
   ungraded card, Next skips it (no grade), same as Skip. */
export function goForward(nav) {
  if (!nav || nav.index < 0) return { nav: nav ?? startSession([]), effect: "none" };
  if (nav.index < nav.entries.length - 1) {
    return { nav: { ...nav, index: nav.index + 1 }, effect: "restore" };
  }
  if (nav.index >= nav.entries.length) return { nav, effect: "done" };
  return skipCurrent(nav);
}

/* Grade this visit at most once. "again" comes back later in the queue and
   may be graded on that later visit. The caller writes the schedule only
   when recorded is true. */
export function gradeCurrent(nav, grade) {
  const e = currentCard(nav);
  if (!e || e.grade) return { nav, recorded: false };
  const entries = nav.entries.map((entry, i) => {
    if (entry.id !== e.id) return entry;
    /* An earlier visit left ungraded by Undo is the same card. Lock it
       with this grade so walking back cannot record a second schedule
       change or a second XP award. */
    if (i === nav.index || !entry.grade) return { ...entry, skippedVisit: false, grade, show: false, typed: i === nav.index ? "" : entry.typed };
    return { ...entry, skippedVisit: false };
  });
  let queue = nav.queue.filter((id) => id !== e.id);
  if (grade === "again") queue = insertGap(queue, e.id, AGAIN_GAP);
  const moved = finishMove({ ...nav, entries, queue });
  return { ...moved, recorded: true };
}

export function jumpToSkipped(nav) {
  if (!nav) return nav;
  const skips = nav.entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.skippedVisit && !e.grade);
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

const FIELD = /^(INPUT|TEXTAREA|SELECT)$/;

/* Left / Right move between cards. Enter stays with the answer field
   (flip) and the grade buttons. Nothing here runs while typing, or while
   a dialog, the lab drawer, or the labs menu has focus. */
export function cardNavAction(event) {
  const key = typeof event === "string" ? event : event?.key;
  const target = typeof event === "string" ? null : event?.target;
  if (event && typeof event === "object" && (event.altKey || event.ctrlKey || event.metaKey)) return null;
  if (target?.isContentEditable) return null;
  const tag = target?.tagName?.toUpperCase?.() ?? "";
  if (FIELD.test(tag)) return null;
  if (typeof target?.closest === "function" && target.closest("[role='dialog'], .lab-drawer, .fab-menu")) return null;
  if (key === "ArrowLeft") return "back";
  if (key === "ArrowRight") return "next";
  return null;
}

/* Where the student is in this sitting, for the "3 / 12" indicator.
   total  = every distinct card offered in this sitting
   done   = distinct cards whose latest grade is not "again"
   position = distinct cards opened up to and including the one on screen */
export function sessionProgress(nav) {
  if (!nav) return { position: 0, total: 0, done: 0 };
  const ids = new Set([...(nav.entries ?? []).map((e) => e.id), ...(nav.queue ?? [])]);
  const latest = new Map();
  for (const e of nav.entries ?? []) if (e.grade) latest.set(e.id, e.grade);
  let done = 0;
  for (const g of latest.values()) if (g !== "again") done += 1;
  const upto = new Set((nav.entries ?? []).slice(0, Math.max(0, Math.min(nav.index, nav.entries.length - 1)) + 1).map((e) => e.id));
  const total = ids.size;
  const position = nav.index >= (nav.entries?.length ?? 0) ? total : Math.min(upto.size, total);
  return { position, total, done: Math.min(done, total) };
}

/* Undo is offered on a graded card the student walked Back to, as long as
   that card has not been opened again later in the sitting. */
export function canUndoGrade(nav) {
  const e = currentCard(nav);
  if (!e || !e.grade) return false;
  return !nav.entries.slice(nav.index + 1).some((later) => later.id === e.id);
}

/* Clear this visit's grade and show the answer again so it can be
   re-graded. An "again" re-queue for this card is withdrawn. The caller
   restores the card's previous schedule. */
export function undoGrade(nav) {
  if (!canUndoGrade(nav)) return nav;
  const e = currentCard(nav);
  const entries = nav.entries.slice();
  entries[nav.index] = { ...e, grade: null, show: true };
  /* The grade is gone, so the card is unfinished again. Next from this
     history entry only restores the next opened card; without a queue
     entry the undone card would vanish from the sitting. */
  const queue = nav.queue.includes(e.id) ? nav.queue : [...nav.queue, e.id];
  return { ...nav, entries, queue };
}
