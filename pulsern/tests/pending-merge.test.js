/* A parked old-app snapshot is merged by the same conflict path two
   devices already use. Doing it twice does not score the answer again. */
import { describe, it, expect } from "vitest";
import { reconcileProgress, foldPendingProgress } from "../src/guest.js";
import { emptyAbility, ABILITY_CATS } from "../src/ability-engine.js";
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

  it("does not score the parked snapshot again the second time", () => {
    const once = foldPendingProgress(stored, [pending]);
    const twice = foldPendingProgress(once, [pending]);
    expect(twice).toEqual(once);
  });
});
