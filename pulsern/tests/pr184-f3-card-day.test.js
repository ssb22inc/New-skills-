/* Astra's review of PR #184 at 1ec9cd5 found four defects in how progress
   is saved and folded. Each has a test here that fails without its fix. */
import { describe, it, expect } from "vitest";
import { reconcileProgress, foldPendingProgress } from "../src/guest.js";
import { emptyAbility, ABILITY_CATS, updateAbility } from "../src/ability-engine.js";
import { emptyRewards } from "../src/rewards.js";

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("finding 3: the later day wins; on the same day the timestamped grade stays", () => {
  const monday = { interval: 9, due: "2026-12-03", seen: "2026-11-23", reviewedAt: at(2026, 11, 23) };
  const tuesdayAgain = { interval: 0, due: "2026-11-24", seen: "2026-11-24" };
  const stored = (card) => ({ log: [], xp: 0, srsMap: { c1: card } });

  it("a later date-only Again from the old app beats an earlier timestamped grade", () => {
    const folded = foldPendingProgress(stored(monday), [{ log: [], xp: 0, srsMap: { c1: tuesdayAgain } }]);
    expect(folded.srsMap.c1).toEqual(tuesdayAgain);
  });

  it("an earlier date-only grade does not beat a later timestamped one", () => {
    const late = { interval: 3, due: "2026-11-27", seen: "2026-11-24", reviewedAt: at(2026, 11, 24) };
    const mondayAgain = { interval: 0, due: "2026-11-23", seen: "2026-11-23" };
    const folded = foldPendingProgress(stored(late), [{ log: [], xp: 0, srsMap: { c1: mondayAgain } }]);
    expect(folded.srsMap.c1).toEqual(late);
  });

  it("on the same day the timestamped grade stays", () => {
    const sameDayStamped = { interval: 3, due: "2026-11-27", seen: "2026-11-24", reviewedAt: at(2026, 11, 24, 15) };
    const folded = foldPendingProgress(stored(sameDayStamped), [{ log: [], xp: 0, srsMap: { c1: tuesdayAgain } }]);
    expect(folded.srsMap.c1).toEqual(sameDayStamped);
  });

  it("two timestamps on one day: the later one stays", () => {
    const morning = { interval: 0, due: "2026-11-24", seen: "2026-11-24", reviewedAt: at(2026, 11, 24, 8) };
    const evening = { interval: 3, due: "2026-11-27", seen: "2026-11-24", reviewedAt: at(2026, 11, 24, 20) };
    const folded = foldPendingProgress(stored(morning), [{ log: [], xp: 0, srsMap: { c1: evening } }]);
    expect(folded.srsMap.c1).toEqual(evening);
  });

  it("a device conflict (reconcile) decides the same way", () => {
    const base = { log: [], xp: 0, srsMap: { c1: { interval: 3, due: "2026-11-20", seen: "2026-11-17", reviewedAt: at(2026, 11, 17) } } };
    const merged = reconcileProgress({ ...base, srsMap: { c1: monday } }, { ...base, srsMap: { c1: tuesdayAgain } }, base);
    expect(merged.srsMap.c1).toEqual(tuesdayAgain);
  });
});

