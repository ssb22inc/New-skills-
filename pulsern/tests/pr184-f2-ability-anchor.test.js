/* Astra's review of PR #184 at 1ec9cd5 found four defects in how progress
   is saved and folded. Each has a test here that fails without its fix. */
import { describe, it, expect } from "vitest";
import { reconcileProgress, foldPendingProgress } from "../src/guest.js";
import { emptyAbility, ABILITY_CATS, updateAbility } from "../src/ability-engine.js";
import { emptyRewards } from "../src/rewards.js";

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("finding 2: a rated answer does not discard an old client's calibrated ability", () => {
  const base = { log: [], xp: 0, ability: emptyAbility(ABILITY_CATS), rewards: emptyRewards() };
  /* The old client answered Pharmacology difficulty 1 correctly against a
     question calibrated at 1700 and ended at theta 1237.9, n = 1. Its log
     row carries no rating, so a replay can only guess from the difficulty. */
  const oldRow = { id: 1, cat: "Pharmacology", diff: 1, correct: true, day: "2026-11-24", ms: 9000, words: 8 };
  const newRow = { id: 2, key: "bank:2", source: "bank", cat: "Pharmacology", diff: 1, correct: false, attempt: "new-1", at: 5, seq: 1, day: "2026-11-24", ms: 9000, words: 8, rating: 1300 };
  const oldClient = { ...base, log: [oldRow], xp: 10, ability: { ...base.ability, Pharmacology: { theta: 1237.9, n: 1 } } };
  const calibration = { 2: { rating: 1300 } };
  const newAbility = updateAbility(base.ability, newRow, false, calibration).ability;
  const newClient = { ...base, log: [newRow], xp: 5, ability: newAbility };

  /* Independent expectation: the anchor first, then only the rated answer. */
  const expected = updateAbility({ ...base.ability, Pharmacology: { theta: 1237.9, n: 1 } }, newRow, false, calibration).ability.Pharmacology;

  it("keeps the anchor and applies the rated answer on top (reconcile)", () => {
    const merged = reconcileProgress(newClient, oldClient, base);
    expect(merged.ability.Pharmacology.n).toBe(2);
    expect(merged.ability.Pharmacology.theta).toBeCloseTo(expected.theta, 6);
    /* and it is not the difficulty-seed replay the old rule fell back to */
    const seedReplay = updateAbility(updateAbility(base.ability, oldRow, true, {}).ability, newRow, false, calibration).ability.Pharmacology;
    expect(Math.abs(merged.ability.Pharmacology.theta - seedReplay.theta)).toBeGreaterThan(1);
  });

  it("keeps the anchor when the old client is the one folded in later", () => {
    const folded = foldPendingProgress(newClient, [oldClient]);
    expect(folded.ability.Pharmacology.n).toBe(2);
    expect(folded.log).toHaveLength(2);
  });

  it("still replays when no device recorded an anchor for its own answers", () => {
    const stale = { ...oldClient, ability: base.ability };
    const merged = reconcileProgress(newClient, stale, base);
    expect(merged.ability.Pharmacology.n).toBe(2);
  });

  it("does not let an anchor in one category touch another", () => {
    const other = { id: 3, key: "bank:3", source: "bank", cat: "Management of Care", diff: 1, correct: true, attempt: "new-2", at: 6, seq: 2, day: "2026-11-24", ms: 9000, words: 8, rating: 1400 };
    const client = { ...newClient, log: [newRow, other], ability: updateAbility(newAbility, other, true, { 3: { rating: 1400 } }).ability };
    const merged = reconcileProgress(client, oldClient, base);
    expect(merged.ability["Management of Care"]).toEqual(client.ability["Management of Care"]);
    expect(merged.ability.Pharmacology.theta).toBeCloseTo(expected.theta, 6);
  });
});

