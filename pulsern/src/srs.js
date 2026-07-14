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
  return { interval: next, due: addDays(Math.max(0, next)) };
}

/* One-time migration: the legacy blob stored srs as an array aligned to the
   built-in card list. Fold it into srsMap under the built-ins' stable ids. */
export function migrateLegacySrs(srsArray, srsMap) {
  const map = { ...srsMap };
  if (Array.isArray(srsArray)) {
    srsArray.forEach((e, i) => {
      if (e && typeof e.due === "string" && map[`b${i}`] === undefined) {
        map[`b${i}`] = { interval: e.interval ?? 0, due: e.due };
      }
    });
  }
  return map;
}
