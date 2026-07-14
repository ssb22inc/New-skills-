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
    expect(nextSchedule({ interval: 15, due: "2026-07-13" }, "again")).toEqual({ interval: 0, due: "2026-07-13" });
    expect(nextSchedule(undefined, "hard")).toEqual({ interval: 1, due: "2026-07-14" });
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
  it("folds the fixed-position array into srsMap under built-in ids", () => {
    const legacy = [{ interval: 3, due: "2026-07-20" }, { interval: 0, due: "2026-07-13" }];
    const map = migrateLegacySrs(legacy, {});
    expect(map.b0).toEqual({ interval: 3, due: "2026-07-20" });
    expect(map.b1).toEqual({ interval: 0, due: "2026-07-13" });
  });
  it("never overwrites existing srsMap entries", () => {
    const map = migrateLegacySrs([{ interval: 3, due: "2026-07-20" }], { b0: { interval: 15, due: "2026-08-01" } });
    expect(map.b0).toEqual({ interval: 15, due: "2026-08-01" });
  });
});
