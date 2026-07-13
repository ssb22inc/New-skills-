/* Ability engine — simulation tests ported per PULSERN_BUILD.md §10.1:
   strong student > 60, weak < 40, refusal < 12 answers, band narrows,
   coverage weighting, itemHealth flags. */
import { describe, it, expect } from "vitest";
import {
  emptyAbility, updateAbility, itemRating, readinessFrom,
  overallTheta, pickTargetRating, itemHealth,
} from "../src/ability-engine.js";

const CATS = [
  "Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance",
  "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology",
  "Reduction of Risk", "Physiological Adaptation",
];

/* Deterministic PRNG so the simulation never flakes. */
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Simulate a student of true ability trueTheta answering `total` items
   spread across all categories, honoring the same Elo response model. */
function simulate(trueTheta, total, seed) {
  const rand = mulberry32(seed);
  let ability = emptyAbility(CATS);
  const log = [];
  for (let i = 0; i < total; i++) {
    const q = { id: i + 1, cat: CATS[i % CATS.length], diff: (i % 3) + 1 };
    const R = itemRating(q);
    const pCorrect = 1 / (1 + Math.pow(10, (R - trueTheta) / 400));
    const correct = rand() < pCorrect;
    const res = updateAbility(ability, q, correct);
    ability = res.ability;
    expect(Math.abs(res.itemDelta)).toBeLessThanOrEqual(8);
    log.push({ id: q.id, cat: q.cat, diff: q.diff, correct });
  }
  return { ability, log };
}

describe("readiness simulation", () => {
  it("scores a strong student above 60", () => {
    // 20 answers per category — same evidence density as the shipped test
    const { ability, log } = simulate(1550, CATS.length * 20, 42);
    const r = readinessFrom(ability, log);
    expect(r).not.toBeNull();
    expect(r.pct).toBeGreaterThan(60);
  });

  it("scores a weak student below 40", () => {
    const { ability, log } = simulate(1050, CATS.length * 20, 42);
    const r = readinessFrom(ability, log);
    expect(r).not.toBeNull();
    expect(r.pct).toBeLessThan(40);
  });

  it("refuses to estimate below 12 answers", () => {
    const { ability, log } = simulate(1400, 11, 7);
    expect(readinessFrom(ability, log)).toBeNull();
    expect(readinessFrom(ability, log.concat({ id: 12, cat: CATS[0], diff: 1, correct: true }))).not.toBeNull();
  });

  it("narrows the confidence band as evidence accumulates", () => {
    const { ability } = simulate(1300, 150, 3);
    const few = readinessFrom(ability, Array.from({ length: 12 }, (_, i) => ({ id: i, correct: true })));
    const many = readinessFrom(ability, Array.from({ length: 150 }, (_, i) => ({ id: i, correct: true })));
    expect(few.high - few.low).toBeGreaterThan(many.high - many.low);
    expect(many.high - many.low).toBeGreaterThanOrEqual(10); // floor is ±5
  });
});

describe("coverage weighting", () => {
  it("drags untested categories toward the base rating", () => {
    const partial = emptyAbility(CATS);
    partial[CATS[0]] = { theta: 1600, n: 100 };
    const full = Object.fromEntries(CATS.map((c) => [c, { theta: 1600, n: 100 }]));
    expect(overallTheta(partial)).toBeLessThan(overallTheta(full));
    expect(overallTheta(partial)).toBeCloseTo((1600 + (CATS.length - 1) * 1200) / CATS.length, 5);
    expect(overallTheta(full)).toBeCloseTo(1600, 5);
  });

  it("gives partial weight below 5 answers in a category", () => {
    const ab = emptyAbility(CATS);
    ab[CATS[0]] = { theta: 1600, n: 2 }; // weight 0.4
    const expected = ((0.4 * 1600 + 0.6 * 1200) + (CATS.length - 1) * 1200) / CATS.length;
    expect(overallTheta(ab)).toBeCloseTo(expected, 5);
  });
});

describe("adaptive targeting", () => {
  it("targets ~70% success: rating θ − 147", () => {
    const ab = emptyAbility(CATS);
    ab[CATS[0]] = { theta: 1400, n: 20 };
    expect(pickTargetRating(ab, CATS[0])).toBe(1400 - 147);
    expect(pickTargetRating(ab, "unseen-cat")).toBe(1200 - 147);
  });
});

describe("itemHealth flags", () => {
  it("keeps collecting below 20 answers", () => {
    expect(itemHealth({ timesAnswered: 19, timesCorrect: 19, rating: 1300 })).toEqual({ status: "collecting", flag: false });
  });
  it("flags too-easy items (p > 0.95)", () => {
    expect(itemHealth({ timesAnswered: 100, timesCorrect: 96, rating: 1300 }).flag).toBe(true);
  });
  it("flags too-hard or miskeyed items (p < 0.15)", () => {
    expect(itemHealth({ timesAnswered: 100, timesCorrect: 14, rating: 1300 }).flag).toBe(true);
  });
  it("flags drifted ratings", () => {
    expect(itemHealth({ timesAnswered: 50, timesCorrect: 30, rating: 1800 }).flag).toBe(true);
    expect(itemHealth({ timesAnswered: 50, timesCorrect: 30, rating: 850 }).flag).toBe(true);
  });
  it("passes healthy items", () => {
    expect(itemHealth({ timesAnswered: 50, timesCorrect: 30, rating: 1300 })).toEqual({ status: "healthy", flag: false });
  });
});
