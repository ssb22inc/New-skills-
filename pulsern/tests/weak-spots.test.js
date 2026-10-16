/* Weak-spot targeting: weaker categories are picked more, interleaving holds,
   no category starves, and the picks are deterministic for a given seed. */
import { describe, it, expect } from "vitest";
import {
  pickCategory, weakness, categoryWeight, seededRandom, seedFrom,
  MIN_EVIDENCE, FLOOR, STARVE_WINDOW,
} from "../src/weak-spots.js";
import { emptyAbility } from "../src/ability-engine.js";

const CATS = [
  "Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance",
  "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology",
  "Reduction of Risk", "Physiological Adaptation",
];

/* Pharmacology is weak, Management of Care is strong, the rest borderline-proven. */
const ability = {
  ...Object.fromEntries(CATS.map((c) => [c, { theta: 1300, n: 20 }])),
  Pharmacology: { theta: 1050, n: 25 },
  "Management of Care": { theta: 1600, n: 25 },
};

/* Simulate a session: each pick becomes the next lastCat and joins history. */
function simulate(n, seed, ab = ability, available = CATS) {
  const rand = seededRandom(seed);
  const picks = [];
  let lastCat = null;
  for (let i = 0; i < n; i++) {
    const c = pickCategory({ available, ability: ab, lastCat, recent: picks.slice(-STARVE_WINDOW * 2), rand: rand() });
    picks.push(c);
    lastCat = c;
  }
  return picks;
}
const count = (picks, c) => picks.filter((p) => p === c).length;

describe("weakness / weights", () => {
  it("lower theta means more weakness", () => {
    expect(weakness({ theta: 1000, n: 30 })).toBeGreaterThan(weakness({ theta: 1300, n: 30 }));
    expect(weakness({ theta: 1300, n: 30 })).toBeCloseTo(0.5, 5);
    expect(weakness({ theta: 1600, n: 30 })).toBeLessThan(0.2);
  });
  it("unseen or low-evidence categories count as needing work", () => {
    expect(weakness(undefined)).toBeGreaterThanOrEqual(0.5);
    // a lucky streak of MIN_EVIDENCE-1 answers is not yet trusted
    expect(weakness({ theta: 1500, n: MIN_EVIDENCE - 1 })).toBe(0.5);
    expect(weakness({ theta: 1500, n: MIN_EVIDENCE })).toBeLessThan(0.5);
  });
  it("every category keeps a floor weight", () => {
    expect(categoryWeight({ X: { theta: 2400, n: 200 } }, "X")).toBeGreaterThanOrEqual(FLOOR);
  });
});

describe("pickCategory", () => {
  it("picks weak categories more often than strong ones", () => {
    const picks = simulate(800, 42);
    const weak = count(picks, "Pharmacology");
    const strong = count(picks, "Management of Care");
    const mid = count(picks, "Basic Care & Comfort");
    expect(weak).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(strong);
    expect(weak).toBeGreaterThan(strong * 2);
  });

  it("treats an unseen category as needing work", () => {
    const ab = { ...ability, Pharmacology: { theta: 1200, n: 0 } };
    const picks = simulate(800, 7, ab);
    expect(count(picks, "Pharmacology")).toBeGreaterThan(count(picks, "Management of Care"));
  });

  it("never serves the same category twice in a row when another is available", () => {
    const picks = simulate(1000, 99);
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
  });

  it("still serves the only category left", () => {
    expect(pickCategory({ available: ["Pharmacology"], ability, lastCat: "Pharmacology", rand: 0.5 })).toBe("Pharmacology");
  });

  it("never starves a category: all eight appear, the strongest within every window", () => {
    // extreme profile: one category massively stronger than the rest
    const ab = { ...Object.fromEntries(CATS.map((c) => [c, { theta: 1000, n: 50 }])), "Management of Care": { theta: 2000, n: 50 } };
    const picks = simulate(400, 3, ab);
    for (const c of CATS) expect(count(picks, c)).toBeGreaterThan(0);
    // starvation guard: once history fills, no category is absent from any
    // STARVE_WINDOW+1 consecutive picks
    for (let i = STARVE_WINDOW; i + STARVE_WINDOW + 1 <= picks.length; i++) {
      expect(picks.slice(i, i + STARVE_WINDOW + 1)).toContain("Management of Care");
    }
  });

  it("is deterministic for the same inputs and seed", () => {
    expect(simulate(200, 1234)).toEqual(simulate(200, 1234));
    expect(simulate(200, 1234)).not.toEqual(simulate(200, 4321));
    const args = { available: CATS, ability, lastCat: "Pharmacology", recent: [], rand: 0.37 };
    expect(pickCategory(args)).toBe(pickCategory({ ...args, available: [...CATS].reverse() }));
  });

  it("only returns categories that are available", () => {
    const avail = ["Pharmacology", "Psychosocial Integrity"];
    for (const c of simulate(50, 5, ability, avail)) expect(avail).toContain(c);
    expect(pickCategory({ available: [], ability, rand: 0.2 })).toBeNull();
  });

  it("works for a brand-new student (all categories at defaults)", () => {
    const picks = simulate(400, 11, emptyAbility(CATS));
    for (const c of CATS) expect(count(picks, c)).toBeGreaterThan(20);
  });

  it("seedFrom is stable", () => {
    expect(seedFrom("2026-10-16|12|3")).toBe(seedFrom("2026-10-16|12|3"));
    expect(seedFrom("a")).not.toBe(seedFrom("b"));
  });
});
