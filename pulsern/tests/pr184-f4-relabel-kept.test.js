/* Astra's review of PR #184 at 1ec9cd5 found four defects in how progress
   is saved and folded. Each has a test here that fails without its fix. */
import { describe, it, expect } from "vitest";
import { reconcileProgress, foldPendingProgress } from "../src/guest.js";
import { emptyAbility, ABILITY_CATS, updateAbility } from "../src/ability-engine.js";
import { emptyRewards } from "../src/rewards.js";

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("finding 4: an old snapshot never wipes migration 020's labels", () => {
  const labelled = { id: 42, key: "bank:42", source: "bank", cat: "Pharmacology", diff: 1, correct: false, day: "2026-11-20", ms: 9000 };
  const preMigration = { id: 42, cat: "Pharmacology", diff: 1, correct: false, day: "2026-11-20", ms: 9000 };

  it("keeps the established identity when the parked snapshot predates the relabel", () => {
    const stored = { log: [labelled], xp: 4, ability: emptyAbility(ABILITY_CATS), theme: "dim" };
    const folded = foldPendingProgress(stored, [{ log: [preMigration], xp: 4, theme: "light" }]);
    expect(folded.log).toHaveLength(1);
    expect(folded.log[0]).toMatchObject({ key: "bank:42", source: "bank" });
    expect(folded.theme).toBe("light");
  });

  it("an old answer made after the relabel is added, and the labelled one is kept", () => {
    const stored = { log: [labelled], xp: 4, ability: emptyAbility(ABILITY_CATS) };
    const later = { id: 43, cat: "Pharmacology", diff: 1, correct: true, day: "2026-11-24", ms: 9000 };
    const folded = foldPendingProgress(stored, [{ log: [preMigration, later], xp: 9 }]);
    expect(folded.log).toHaveLength(2);
    expect(folded.log.find((r) => r.id === 42)).toMatchObject({ key: "bank:42", source: "bank" });
  });
});
