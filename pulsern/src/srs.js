/* Scalable spaced repetition over a dynamic card bank (PULSERN round 8).
   srsMap: { [cardId]: { interval, due } } — replaces the fixed-position
   array now that the bank grows past the built-in dozen. Deterministic
   plain code (CLAUDE.md rule 6); dates LOCAL (rule 4). */
import { todayStr, addDays } from "./dates.js";

export const NEW_PER_DAY = 20; // Anki-style cap so a 1,000-card bank isn't due on day one

/* Queue = every review that has come due, plus up to NEW_PER_DAY unseen
   cards. Returns card ids in study order (reviews first). */
export function dueQueue(cards, srsMap) {
  const reviews = [], fresh = [];
  const today = todayStr();
  for (const c of cards) {
    const e = srsMap[c.id];
    if (!e) fresh.push(c.id);
    else if (e.due <= today) reviews.push(c.id);
  }
  /* Oldest due first, then least-recently-seen. The second key matters: a card
     graded "again" stays due today, and with reviews emitted in bank order an
     early card would sit at position 0 on every reload — the same card greeting
     the student every time they refreshed. Sorting by last seen sends a card
     you just graded to the back of today's reviews instead. */
  reviews.sort((a, b) => {
    const ea = srsMap[a], eb = srsMap[b];
    if (ea.due !== eb.due) return ea.due < eb.due ? -1 : 1;
    const sa = ea.seen ?? "", sb = eb.seen ?? "";
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return [...reviews, ...fresh.slice(0, NEW_PER_DAY)];
}

/* Grade → next {interval, due}. Same ladder the app has always used:
   again = later today · hard = tomorrow · good = 3→7→15→31…60d · easy = 7→22…90d */
export function nextSchedule(entry, grade) {
  const interval = entry?.interval ?? 0;
  let next;
  if (grade === "again") next = 0;
  else if (grade === "hard") next = 1;
  else if (grade === "good") next = interval < 1 ? 3 : Math.min(interval * 2 + 1, 60);
  else next = interval < 1 ? 7 : Math.min(interval * 3 + 1, 90);
  // `seen` orders same-day reviews so a card just graded does not jump the queue.
  return { interval: next, due: addDays(Math.max(0, next)), seen: todayStr() };
}

/* Runs once on load. Two jobs: fold the legacy fixed-position array into
   srsMap under the built-ins' stable ids, and clean out placeholder entries a
   previous build had already written there. */
export function migrateLegacySrs(srsArray, srsMap) {
  const map = {};
  /* Sanitise what is already saved. An entry with interval 0 and no `seen`
     stamp came from the old placeholder seeding, not from a student grading a
     card, and it reads as a review that is due today — every day. Dropping it
     returns the card to the new-card pool, which is where an unstudied card
     belongs. Anything genuinely graded from now on carries `seen`, so real
     "again" grades survive this. */
  for (const [id, e] of Object.entries(srsMap ?? {})) {
    if (!e || typeof e.due !== "string") continue;
    if ((e.interval ?? 0) === 0 && !e.seen) continue;
    map[id] = e;
  }
  if (Array.isArray(srsArray)) {
    srsArray.forEach((e, i) => {
      /* Only entries carrying real progress are migrated. Early builds seeded
         the whole legacy array with {interval: 0, due: today} placeholders for
         every built-in card, and folding those in turned each one into a
         due-today *review* — permanently parked ahead of genuine reviews and
         exempt from the new-card cap. An interval of 0 encodes no schedule
         worth keeping, so those cards are left as new instead. */
      if (e && typeof e.due === "string" && (e.interval ?? 0) >= 1 && map[`b${i}`] === undefined) {
        map[`b${i}`] = { interval: e.interval, due: e.due };
      }
    });
  }
  return map;
}
