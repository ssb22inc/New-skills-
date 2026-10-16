/* Missed questions come back on a real LOCAL calendar date. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { updateMissSchedule, deriveMissSchedule, reviewPools, todayPool } from "../src/question-review.js";
import { migrateBlob } from "../src/state.js";

const CATS = [
  "Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance",
  "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology",
  "Reduction of Risk", "Physiological Adaptation",
];
const q = (id, cat = "Pharmacology") => ({ id, cat, diff: 2, type: "mc" });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 16, 21, 30, 0)); }); // 9:30 PM local
afterEach(() => vi.useRealTimers());

describe("schedule progression", () => {
  it("a miss schedules a review for the next local day", () => {
    const m = updateMissSchedule({}, 7, false);
    expect(m[7]).toMatchObject({ interval: 1, due: "2026-10-17" });
  });

  it("each correct review climbs the ladder: 3 → 7 → 15 days", () => {
    let m = updateMissSchedule({}, 7, false);
    m = updateMissSchedule(m, 7, true);
    expect(m[7]).toMatchObject({ interval: 3, due: "2026-10-19" });
    m = updateMissSchedule(m, 7, true);
    expect(m[7]).toMatchObject({ interval: 7, due: "2026-10-23" });
    m = updateMissSchedule(m, 7, true);
    expect(m[7]).toMatchObject({ interval: 15, due: "2026-10-31" });
  });

  it("a miss resets the ladder to tomorrow", () => {
    const m = updateMissSchedule({ 7: { interval: 15, due: "2026-10-16" } }, 7, false);
    expect(m[7]).toMatchObject({ interval: 1, due: "2026-10-17" });
  });

  it("a never-missed question answered correctly is not scheduled", () => {
    const before = { 3: { interval: 1, due: "2026-10-17" } };
    expect(updateMissSchedule(before, 9, true)).toBe(before);
  });

  it("returns a new object (React state safe)", () => {
    const before = {};
    expect(updateMissSchedule(before, 1, false)).not.toBe(before);
    expect(before).toEqual({});
  });
});

describe("legacy saves", () => {
  const legacy = {
    xp: 40,
    log: [
      { id: 1, cat: CATS[5], diff: 1, correct: false },
      { id: 2, cat: CATS[0], diff: 2, correct: false },
      { id: 2, cat: CATS[0], diff: 2, correct: true },   // corrected later
      { id: 3, cat: CATS[1], diff: 2, correct: true },
    ],
  };

  it("load without missSchedule and derive it from the answer log", () => {
    const s = migrateBlob(legacy, CATS);
    expect(s.missSchedule).toEqual({ 1: { interval: 1, due: "2026-10-16" } });
    expect(s.log).toEqual(legacy.log);
  });

  it("never overwrite an existing schedule entry, but add unscheduled misses", () => {
    const saved = { 1: { interval: 7, due: "2026-10-20", seen: "2026-10-13" } };
    expect(deriveMissSchedule(legacy.log, saved)).toEqual(saved);
    const m = deriveMissSchedule([...legacy.log, { id: 4, cat: CATS[2], diff: 1, correct: false }], saved);
    expect(m[4]).toEqual({ interval: 1, due: "2026-10-16" });
    expect(m[1]).toEqual(saved[1]);
  });

  it("tolerates garbage in the key", () => {
    expect(migrateBlob({ log: [], missSchedule: "nope" }, CATS).missSchedule).toEqual({});
    expect(migrateBlob({ log: [], missSchedule: [1, 2] }, CATS).missSchedule).toEqual({});
  });
});

describe("Today round and Review Misses pools", () => {
  const bank = [q(1), q(2, CATS[0]), q(3, CATS[1]), q(4, CATS[2]), q(5, CATS[3])];
  const log = [
    { id: 1, cat: CATS[5], correct: false },   // miss, due today
    { id: 2, cat: CATS[0], correct: false },   // miss, scheduled for tomorrow
    { id: 3, cat: CATS[1], correct: false },
    { id: 3, cat: CATS[1], correct: true },    // corrected; review due today
  ];
  const schedule = {
    1: { interval: 1, due: "2026-10-16" },
    2: { interval: 1, due: "2026-10-17" },
    3: { interval: 3, due: "2026-10-15" },
  };
  const fresh = [q(4, CATS[2]), q(5, CATS[3])];

  it("Today round serves due reviews before anything else", () => {
    const pool = todayPool(bank, log, schedule, fresh);
    expect(pool.map((x) => x.id).sort()).toEqual([1, 3]);
  });

  it("Today round falls back to new questions when nothing is due, and holds future misses back", () => {
    const later = { ...schedule, 1: { interval: 1, due: "2026-10-17" }, 3: { interval: 3, due: "2026-10-19" } };
    const ids = todayPool(bank, log, later, fresh).map((x) => x.id);
    expect(ids).toEqual([4, 5]);
    expect(ids).not.toContain(2);
  });

  it("an unscheduled current miss still joins the Today mix", () => {
    const ids = todayPool(bank, log, {}, fresh).map((x) => x.id);
    expect(ids).toEqual([1, 2, 4, 5]);
  });

  it("Review Misses lists every current miss on demand, due reviews first", () => {
    const { due, misses, review } = reviewPools(bank, log, schedule);
    expect(due.map((x) => x.id)).toEqual([3, 1]); // oldest due first
    expect(misses.map((x) => x.id)).toEqual([1, 2]);
    expect(review.map((x) => x.id)).toEqual([3, 1, 2]); // the not-yet-due miss is still reviewable
  });

  it("a due date arriving on the next local day brings the miss back", () => {
    vi.setSystemTime(new Date(2026, 9, 17, 0, 5, 0)); // just after local midnight
    expect(todayPool(bank, log, schedule, fresh).map((x) => x.id)).toContain(2);
  });
});
