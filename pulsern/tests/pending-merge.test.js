/* A parked old-app snapshot is merged by the same conflict path two
   devices already use. Doing it twice does not score the answer again. */
import { describe, it, expect } from "vitest";
import { reconcileProgress, foldPendingProgress } from "../src/guest.js";
import { migrateBlob } from "../src/state.js";
import { emptyAbility, ABILITY_CATS, updateAbility } from "../src/ability-engine.js";
import { emptyRewards } from "../src/rewards.js";

const answer = (attempt, id, cat, day) => ({
  id, key: `bank:${id}`, source: "bank", cat, diff: 1, correct: true, attempt, at: id, seq: 1, day, ms: 9000, words: 8, rating: 1300,
});

describe("a parked snapshot uses the device conflict merge", () => {
  const stored = {
    log: [answer("a", 1, "Pharmacology", "2026-11-24")],
    xp: 50,
    ability: emptyAbility(ABILITY_CATS),
    rewards: { ...emptyRewards(), covers: 1, cardOps: [{ id: "stored-card", day: "2026-11-24", xp: 5, cards: 1 }] },
    streak: { count: 5, lastDay: "2026-11-24", shield: false },
    examResults: { e1: { score: 70 } },
    theme: "dim",
  };
  const pending = {
    log: [answer("a", 1, "Pharmacology", "2026-11-24"), answer("b", 2, "Management of Care", "2026-11-25")],
    xp: 60,
    ability: emptyAbility(ABILITY_CATS),
    rewards: { ...emptyRewards(), covers: 0, cardOps: [{ id: "old-card", day: "2026-11-25", xp: 8, cards: 1 }] },
    streak: { count: 1, lastDay: "2026-11-20", shield: true },
    examResults: { e1: { score: 70 } },
    theme: "light",
  };

  it("keeps both answers, the spent shield, and the conflict-path XP", () => {
    const viaConflict = reconcileProgress(stored, pending, stored);
    const folded = foldPendingProgress(stored, [pending]);
    expect(folded.log.map((row) => row.attempt)).toEqual(["a", "b"]);
    expect(folded.xp).toBe(viaConflict.xp);
    expect(folded.rewards.cardOps.map((op) => op.id).sort()).toEqual(viaConflict.rewards.cardOps.map((op) => op.id).sort());
    expect(folded.streak.shield).toBe(false);
    expect(folded.ability["Management of Care"].n).toBe(1);
    expect(folded.theme).toBe("light");
  });

  it("scores an old-app answer that has no attempt id and keeps rewards", () => {
    const stored = {
      log: [answer("a", 1, "Pharmacology", "2026-11-24")],
      xp: 10,
      ability: updateAbility(emptyAbility(ABILITY_CATS), { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1 }, true).ability,
      rewards: emptyRewards(),
      streak: { count: 1, lastDay: "2026-11-24", shield: false },
    };
    const pending = {
      log: [{ id: 9, cat: "Pharmacology", diff: 1, correct: true }],
      xp: 10,
    };
    const folded = foldPendingProgress(stored, [pending]);
    expect(folded.log.map((row) => row.id)).toEqual([1, 9]);
    expect(folded.ability.Pharmacology.n).toBe(stored.ability.Pharmacology.n + 1);
    expect(folded.xp).toBe(20);
    expect(folded.rewards.badgesSeen).toEqual(emptyRewards().badgesSeen);
    expect(folded.streak.shield).toBe(false);
  });

  it("keeps a card grade from an old app that did not record a card operation", () => {
    const stored = {
      log: [],
      xp: 10,
      ability: emptyAbility(ABILITY_CATS),
      rewards: emptyRewards(),
      streak: { count: 1, lastDay: "2026-11-24", shield: false },
      srsMap: { c1: { interval: 1, due: "2026-11-25", seen: "2026-11-24" } },
    };
    const pending = {
      log: [],
      xp: 18,
      srsMap: { c1: { interval: 7, due: "2026-12-01", seen: "2026-11-25" } },
    };
    const folded = foldPendingProgress(stored, [pending]);
    expect(folded.srsMap.c1).toMatchObject({ interval: 7, due: "2026-12-01", seen: "2026-11-25" });
    expect(folded.xp).toBe(18);
    expect(folded.rewards.badgesSeen).toEqual(emptyRewards().badgesSeen);
    expect(folded.streak.shield).toBe(false);
    expect(foldPendingProgress(folded, [pending]).srsMap.c1.due).toBe("2026-12-01");
  });

  it("keeps a newer card when an older snapshot grades a different card", () => {
    const stored = {
      log: [],
      xp: 10,
      ability: emptyAbility(ABILITY_CATS),
      rewards: emptyRewards(),
      streak: { count: 1, lastDay: "2026-11-24", shield: false },
      srsMap: {
        c1: { interval: 1, due: "2026-11-24", seen: "2026-11-20" },
        c2: { interval: 7, due: "2026-12-01", seen: "2026-11-25", reviewedAt: 3000 },
      },
    };
    const pending = {
      log: [],
      xp: 15,
      srsMap: { c1: { interval: 3, due: "2026-11-27", seen: "2026-11-24", reviewedAt: 2000 } },
    };
    const folded = foldPendingProgress(stored, [pending]);
    expect(folded.srsMap.c1).toMatchObject({ interval: 3, seen: "2026-11-24" });
    expect(folded.srsMap.c2).toMatchObject({ interval: 7, due: "2026-12-01" });
  });

  it("does not treat a different category with the same number as the stored answer", () => {
    const stored = {
      log: [{ id: 7, key: "builtin:7", source: "builtin", cat: "Management of Care", diff: 1, correct: false }],
      xp: 0,
      ability: updateAbility(emptyAbility(ABILITY_CATS), { id: 7, key: "builtin:7", source: "builtin", cat: "Management of Care", diff: 1 }, false).ability,
      rewards: emptyRewards(),
      streak: { count: 1, lastDay: "2026-11-24", shield: true },
    };
    const pending = {
      log: [{ id: 7, cat: "Pharmacology", diff: 1, correct: false }],
      xp: 0,
      ability: updateAbility(emptyAbility(ABILITY_CATS), { id: 7, cat: "Pharmacology", diff: 1 }, false).ability,
    };
    const folded = foldPendingProgress(stored, [pending]);
    expect(folded.log.map((row) => row.cat)).toEqual(["Management of Care", "Pharmacology"]);
    expect(folded.ability.Pharmacology.n).toBe(1);
    expect(folded.ability["Management of Care"].n).toBe(1);
  });

  it("keeps a second identical undated miss in a parked snapshot", () => {
    const miss = { id: 9, cat: "Pharmacology", diff: 1, correct: false };
    const ability = updateAbility(emptyAbility(ABILITY_CATS), { id: 9, cat: "Pharmacology", diff: 1 }, false).ability;
    const stored = {
      log: [miss],
      xp: 0,
      ability,
      rewards: emptyRewards(),
      streak: { count: 1, lastDay: "2026-11-24", shield: false },
    };
    const pending = { log: [miss, { ...miss }], xp: 0, ability };
    const folded = foldPendingProgress(stored, [pending]);
    expect(folded.log.filter((row) => row.id === 9 && row.correct === false)).toHaveLength(2);
    expect(folded.ability.Pharmacology.n).toBe(ability.Pharmacology.n + 1);
    const again = foldPendingProgress(folded, [pending]);
    expect(again.log).toHaveLength(2);
    expect(again.ability.Pharmacology.n).toBe(folded.ability.Pharmacology.n);
  });

  it("uses the old client's ability when a parked answer has no item rating", () => {
    const start = emptyAbility(ABILITY_CATS);
    const calibrated = updateAbility(start, { id: 9, cat: "Pharmacology", diff: 1, source: "bank" }, true, { 9: { rating: 1700 } }).ability;
    const seeded = updateAbility(start, { id: 9, cat: "Pharmacology", diff: 1 }, true).ability;
    const stored = { log: [], xp: 0, ability: start, rewards: emptyRewards(), streak: { count: 0, lastDay: null, shield: true } };
    const pending = {
      log: [{ id: 9, cat: "Pharmacology", diff: 1, correct: true }],
      xp: 10,
      ability: calibrated,
    };
    const folded = foldPendingProgress(stored, [pending]);
    expect(folded.log).toHaveLength(1);
    expect(folded.ability.Pharmacology.n).toBe(1);
    expect(folded.ability.Pharmacology.theta).toBeCloseTo(calibrated.Pharmacology.theta, 4);
    expect(Math.abs(folded.ability.Pharmacology.theta - seeded.Pharmacology.theta)).toBeGreaterThan(1);
  });

  it("migrates a parked snapshot that has no rewards object", () => {
    const stored = { log: [answer("a", 1, "Pharmacology", "2026-11-24")], xp: 10 };
    const pending = { log: [{ id: 9, cat: "Pharmacology", diff: 1, correct: true }], xp: 10 };
    const ready = migrateBlob(foldPendingProgress(stored, [pending]), ABILITY_CATS);
    expect(ready.rewards.badgesSeen).toBeTruthy();
    expect(ready.log.map((row) => row.id)).toEqual([1, 9]);
  });

  it("does not score the parked snapshot again the second time", () => {
    const once = foldPendingProgress(stored, [pending]);
    const twice = foldPendingProgress(once, [pending]);
    expect(twice).toEqual(once);
  });
});
