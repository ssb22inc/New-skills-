/* Persisted-state contract per PULSERN_BUILD.md §10.3:
   legacy blob without ability/plan loads with defaults;
   full blob round-trips unchanged. The §4 contract is frozen. */
import { describe, it, expect } from "vitest";
import { migrateBlob } from "../src/state.js";
import { emptyAbility } from "../src/ability-engine.js";

const CATS = [
  "Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance",
  "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology",
  "Reduction of Risk", "Physiological Adaptation",
];

/* A v5.1-era save: everything the old app persisted, no ability/plan. */
const legacyBlob = {
  theme: "dim",
  xp: 230, bestRun: 7,
  log: [{ id: 1, cat: CATS[0], diff: 2, correct: true }, { id: 2, cat: CATS[2], diff: 1, correct: false }],
  flagged: [2],
  streak: { count: 4, lastDay: "2026-07-08", shield: false },
  daily: { day: "2026-07-08", answered: 3 },
  srs: [{ interval: 2, due: "2026-07-10" }],
  customQs: [],
  provider: "deepseek",
};

describe("state migration", () => {
  it("loads a legacy blob with ability/plan defaults, preserving every existing key", () => {
    const s = migrateBlob(legacyBlob, CATS);
    expect(s.ability).toEqual(emptyAbility(CATS));
    expect(s.plan).toBeNull();
    expect(s.examDate).toBeNull();
    for (const k of Object.keys(legacyBlob)) expect(s[k]).toEqual(legacyBlob[k]);
  });

  it("round-trips a full current blob unchanged", () => {
    const full = {
      ...legacyBlob,
      ability: { ...emptyAbility(CATS), [CATS[2]]: { theta: 1345.5, n: 17 } },
      plan: { week: "2026-07-06", days: [{ day: "2026-07-06", focusCat: CATS[2], items: 10, note: "drill pharm" }] },
      examDate: "2026-09-15",
      tourSeen: true,
      srsMap: { b0: { interval: 3, due: "2026-07-12" }, c17: { interval: 0, due: "2026-07-09" } },
      examResults: { 1: { pct: 71, verdict: "HIGH", date: "2026-07-14", attempts: 1 } },
      profileCardDismissed: true,
      fcFlips: 7,
    };
    expect(migrateBlob(full, CATS)).toEqual(full);
  });

  it("gives a completely empty save full defaults", () => {
    const s = migrateBlob({}, CATS);
    expect(s).toEqual({
      theme: "light", xp: 0, bestRun: 0, log: [], flagged: [],
      streak: { count: 0, lastDay: null, shield: true },
      daily: null, srs: [], customQs: [], provider: "claude",
      ability: emptyAbility(CATS), plan: null, examDate: null, tourSeen: false, srsMap: {}, examResults: {}, profileCardDismissed: false, fcFlips: 0,
    });
  });

  it("keeps new categories at defaults when a save predates them", () => {
    const s = migrateBlob({ ...legacyBlob, ability: { [CATS[0]]: { theta: 1400, n: 9 } } }, CATS);
    expect(s.ability[CATS[0]]).toEqual({ theta: 1400, n: 9 });
    expect(s.ability[CATS[5]]).toEqual({ theta: 1200, n: 0 });
  });

  it("moves ability history from the retired merged category to Psychosocial Integrity", () => {
    const s = migrateBlob({ ability: { "Psychosocial & Health Promotion": { theta: 1380, n: 12 } } }, CATS);
    expect(s.ability["Psychosocial Integrity"]).toEqual({ theta: 1380, n: 12 });
    expect(s.ability["Psychosocial & Health Promotion"]).toBeUndefined();
  });
});
