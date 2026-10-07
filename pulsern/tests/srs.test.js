/* Scalable SRS: queue building, the grade ladder, legacy migration. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dueQueue, nextSchedule, migrateLegacySrs, NEW_PER_DAY } from "../src/srs.js";

const card = (id, cat = "Pharmacology") => ({ id, cat, topic: "t", front: "f", back: "b" });

describe("dueQueue", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 13, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());

  it("caps brand-new cards at NEW_PER_DAY", () => {
    const cards = Array.from({ length: 1000 }, (_, i) => card(`c${i}`));
    expect(dueQueue(cards, {}).length).toBe(NEW_PER_DAY);
  });

  it("puts due reviews first and never caps them", () => {
    const cards = Array.from({ length: 50 }, (_, i) => card(`c${i}`));
    const srsMap = {};
    for (let i = 0; i < 30; i++) srsMap[`c${i}`] = { interval: 3, due: "2026-07-10" }; // overdue
    const q = dueQueue(cards, srsMap);
    expect(q.length).toBe(30 + NEW_PER_DAY);
    expect(q.slice(0, 30).every((id) => srsMap[id])).toBe(true);
  });

  it("excludes future-scheduled cards", () => {
    const srsMap = { a: { interval: 3, due: "2026-07-20" }, b: { interval: 0, due: "2026-07-13" } };
    expect(dueQueue([card("a"), card("b")], srsMap)).toEqual(["b"]);
  });
});

describe("nextSchedule ladder", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 13, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());

  it("again → later today, hard → tomorrow", () => {
    expect(nextSchedule({ interval: 15, due: "2026-07-13" }, "again")).toMatchObject({ interval: 0, due: "2026-07-13" });
    expect(nextSchedule(undefined, "hard")).toMatchObject({ interval: 1, due: "2026-07-14" });
  });
  it("good grows 3 → 7 → 15 and caps at 60", () => {
    expect(nextSchedule(undefined, "good").interval).toBe(3);
    expect(nextSchedule({ interval: 3 }, "good").interval).toBe(7);
    expect(nextSchedule({ interval: 7 }, "good").interval).toBe(15);
    expect(nextSchedule({ interval: 40 }, "good").interval).toBe(60);
  });
  it("easy grows 7 → 22 and caps at 90", () => {
    expect(nextSchedule(undefined, "easy").interval).toBe(7);
    expect(nextSchedule({ interval: 7 }, "easy").interval).toBe(22);
    expect(nextSchedule({ interval: 50 }, "easy").interval).toBe(90);
  });
});

describe("migrateLegacySrs", () => {
  it("folds real intervals from the fixed-position array into srsMap", () => {
    const legacy = [{ interval: 3, due: "2026-07-20" }, { interval: 0, due: "2026-07-13" }];
    const map = migrateLegacySrs(legacy, {});
    expect(map.b0).toEqual({ interval: 3, due: "2026-07-20" });
    // interval 0 was a placeholder the old app seeded for every built-in card,
    // not a real grading. Migrating it made the card a due-today review that
    // sat at the front of the queue forever, so it is deliberately skipped.
    expect(map.b1).toBeUndefined();
  });
  it("never overwrites existing srsMap entries", () => {
    const map = migrateLegacySrs([{ interval: 3, due: "2026-07-20" }], { b0: { interval: 15, due: "2026-08-01" } });
    expect(map.b0).toEqual({ interval: 15, due: "2026-08-01" });
  });
});

/* ---- regression: cards must not reappear unless they were failed ---- */
describe("cards do not repeat once graded", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 13, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());

  const deck = Array.from({ length: 5 }, (_, i) => card(`c${i}`));

  it("leaves the queue after good, hard or easy", () => {
    for (const g of ["good", "hard", "easy"]) {
      const map = { c0: nextSchedule(undefined, g) };
      expect(dueQueue(deck, map).includes("c0")).toBe(false);
    }
  });

  it("stays due after again, but does not park itself at the front", () => {
    // three cards already due today, none seen today; c0 is then failed
    const map = {
      c0: { interval: 2, due: "2026-07-13", seen: "2026-07-10" },
      c1: { interval: 2, due: "2026-07-13", seen: "2026-07-10" },
      c2: { interval: 2, due: "2026-07-13", seen: "2026-07-10" },
    };
    map.c0 = nextSchedule(map.c0, "again");
    const q = dueQueue(deck, map);
    expect(q.includes("c0")).toBe(true);        // still due — it was failed
    expect(q[0]).not.toBe("c0");                // but behind the cards not yet seen today
    expect(q.indexOf("c0")).toBeGreaterThan(q.indexOf("c1"));
  });

  it("drops placeholder entries that were never really studied", () => {
    // what an older build left behind: every built-in marked due today
    const poisoned = {};
    for (let i = 0; i < 5; i++) poisoned[`c${i}`] = { interval: 0, due: "2026-07-13" };
    poisoned.c9 = { interval: 15, due: "2026-07-13", seen: "2026-06-28" }; // genuine review
    const cleaned = migrateLegacySrs([], poisoned);
    expect(Object.keys(cleaned)).toEqual(["c9"]);
    // the placeholders come back as NEW cards, subject to the daily cap
    expect(dueQueue(deck, cleaned).length).toBe(5);
  });

  it("keeps a genuine again grade through the cleanup", () => {
    const map = migrateLegacySrs([], { c0: nextSchedule(undefined, "again") });
    expect(map.c0).toBeDefined();
    expect(dueQueue(deck, map).includes("c0")).toBe(true);
  });
});
