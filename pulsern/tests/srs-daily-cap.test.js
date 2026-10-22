/* The 20-a-day new-card cap holds for the whole LOCAL day — across queue
   rebuilds (remounts, focus changes) and reloads — not per queue build. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dueQueue, nextSchedule, NEW_PER_DAY, newCardAllowance, noteNewCard } from "../src/srs.js";
import { migrateBlob } from "../src/state.js";

const card = (id) => ({ id, cat: "Pharmacology", topic: "t", front: "f", back: "b" });
const deck = Array.from({ length: 200 }, (_, i) => card(`c${i}`));

/* Study every card in a freshly built queue, the way Flashcards does:
   the first grade of a never-seen card is noted against today's budget. */
function studySession(map, fcNew, grade = "good") {
  const q = dueQueue(deck, map, newCardAllowance(fcNew));
  const newServed = q.filter((id) => !map[id]).length;
  for (const id of q) {
    if (!map[id]) fcNew = noteNewCard(fcNew);
    map = { ...map, [id]: nextSchedule(map[id], grade) };
  }
  return { map, fcNew, newServed };
}

describe("daily new-card limit", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 13, 22, 0, 0)); }); // 10 PM local
  afterEach(() => vi.useRealTimers());

  it("rebuilding the queue the same day never exceeds NEW_PER_DAY", () => {
    let map = {}, fcNew = { day: null, count: 0 }, total = 0;
    for (let rebuild = 0; rebuild < 5; rebuild++) {
      const r = studySession(map, fcNew);
      total += r.newServed;
      ({ map, fcNew } = r);
    }
    expect(total).toBe(NEW_PER_DAY);
    expect(fcNew).toEqual({ day: "2026-07-13", count: NEW_PER_DAY });
    expect(dueQueue(deck, map, newCardAllowance(fcNew))).toEqual([]);
  });

  it("a card failed with 'again' counts once, and stays as a review", () => {
    const { map, fcNew } = studySession({}, { day: null, count: 0 }, "again");
    expect(fcNew.count).toBe(NEW_PER_DAY);
    const q = dueQueue(deck, map, newCardAllowance(fcNew));
    expect(q.length).toBe(NEW_PER_DAY);          // the 20 failed cards, due again today
    expect(q.every((id) => map[id])).toBe(true); // …and no new ones on top
  });

  it("partial study then a rebuild only tops up to the cap", () => {
    let fcNew = { day: null, count: 0 };
    for (let i = 0; i < 12; i++) fcNew = noteNewCard(fcNew);
    expect(newCardAllowance(fcNew)).toBe(NEW_PER_DAY - 12);
    expect(dueQueue(deck, {}, newCardAllowance(fcNew)).length).toBe(NEW_PER_DAY - 12);
  });

  it("the next local day allows NEW_PER_DAY more", () => {
    let { map, fcNew } = studySession({}, { day: null, count: 0 });
    expect(newCardAllowance(fcNew)).toBe(0);
    vi.setSystemTime(new Date(2026, 6, 14, 0, 1, 0)); // just past local midnight
    expect(newCardAllowance(fcNew)).toBe(NEW_PER_DAY);
    const fresh = dueQueue(deck, map, newCardAllowance(fcNew)).filter((id) => !map[id]);
    expect(fresh.length).toBe(NEW_PER_DAY);
    expect(noteNewCard(fcNew)).toEqual({ day: "2026-07-14", count: 1 });
  });

  it("survives a save/reload round-trip; legacy saves without the key get a full day", () => {
    let fcNew = { day: null, count: 0 };
    for (let i = 0; i < NEW_PER_DAY; i++) fcNew = noteNewCard(fcNew);
    const reloaded = migrateBlob(JSON.parse(JSON.stringify({ fcNew })), []);
    expect(newCardAllowance(reloaded.fcNew)).toBe(0);
    expect(migrateBlob({}, []).fcNew).toEqual({ day: null, count: 0 });
    expect(newCardAllowance(migrateBlob({}, []).fcNew)).toBe(NEW_PER_DAY);
    expect(migrateBlob({ fcNew: "junk" }, []).fcNew).toEqual({ day: null, count: 0 });
  });

  it("the default limit keeps the single-build behaviour, and never exceeds NEW_PER_DAY", () => {
    expect(dueQueue(deck, {}).length).toBe(NEW_PER_DAY);
    expect(dueQueue(deck, {}, 0).length).toBe(0);
    expect(dueQueue(deck, {}, 500).length).toBe(NEW_PER_DAY);
  });
});
