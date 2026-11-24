/* The four failures from the 14401f1 review. Each test describes the
   broken path: a lost write, a reset that races a save, a storage getter
   that throws, and an unresolved card whose catalog arrives late. */
import { describe, it, expect } from "vitest";
import { applyAnswer } from "../src/answer-apply.js";
import { emptyRewards } from "../src/rewards.js";
import { recoverProgressWrite, blobForSave, storageOrNull, createProgressEpoch } from "../src/guest.js";
import { refreshedUnresolved } from "../src/question-review.js";

const answer = (attempt, id = 1) => ({ id, key: `bank:${id}`, source: "bank", cat: "Pharmacology", diff: 1, correct: true, attempt });

describe("a revision conflict keeps both devices' answers", () => {
  it("refetches the latest row and appends only the answers the server does not have", () => {
    const shared = { userId: "u", key: "pulsern-v1", blob: { log: [], xp: 0 }, revision: 1 };
    const other = recoverProgressWrite(shared, { log: [answer("other")], xp: 0 }, 1);
    expect(other.conflict).toBeUndefined();
    const lost = { log: [answer("mine")], xp: 0 };
    const recovered = recoverProgressWrite(shared, lost, 1);
    expect(recovered.conflict).toBeUndefined();
    expect(shared.blob.log.map((row) => row.attempt)).toEqual(["other", "mine"]);
    expect(shared.revision).toBe(3);
    expect(applyAnswer({ log: shared.blob.log }, { q: { id: 1, key: "bank:1", source: "bank" }, correct: true, attempt: "mine" }).duplicate).toBe(true);
    const again = blobForSave(shared.blob, lost);
    expect(again.log.map((row) => row.attempt)).toEqual(["other", "mine"]);
  });

  it("keeps a flashcard grade that has no new question answer", () => {
    const baseline = { log: [], xp: 0, srsMap: {} };
    const server = { log: [answer("other")], xp: 10, srsMap: {} };
    const local = { log: [], xp: 0, srsMap: { c17: { interval: 3, due: "2026-12-01" } } };
    const merged = blobForSave(server, { ...local, log: [] });
    const kept = recoverProgressWrite({ blob: server, revision: 2 }, local, 1);
    expect(kept.blob.srsMap.c17.due).toBe("2026-12-01");
    expect(kept.blob.log.map((row) => row.attempt)).toEqual(["other"]);
    expect(merged.srsMap.c17.due).toBe("2026-12-01");
    expect(baseline.log).toEqual([]);
  });

  it("replays a fast long answer at 0 XP and the calibrated rating", () => {
    const stem = "word ".repeat(50).trim();
    const q = { id: 9, key: "bank:9", source: "bank", cat: "Pharmacology", diff: 2, stem };
    const blank = { log: [], xp: 0, ability: {}, rewards: emptyRewards(), run: 0, bestRun: 0 };
    const live = applyAnswer(blank, { q, correct: true, ms: 3000, today: "2026-11-24", attempt: "fast", words: 50, rating: 1600, calibration: { 9: { rating: 1600 } } });
    expect(live.result.xp).toBe(0);
    const replayed = blobForSave({ ...blank, log: [] }, { ...blank, log: live.state.log });
    expect(replayed.xp).toBe(0);
    expect(replayed.ability.Pharmacology.theta).toBeCloseTo(live.state.ability.Pharmacology.theta);
    expect(replayed.log[0].words).toBe(50);
    expect(replayed.log[0].rating).toBe(1600);
  });
});

describe("reset ignores a save that finishes afterward", () => {
  it("does not restore a revision from a write that started before the reset", () => {
    const gate = createProgressEpoch();
    const seen = gate.epoch();
    gate.note(4, seen);
    expect(gate.revision()).toBe(4);
    gate.abandon();
    expect(gate.note(4, seen)).toBe(false);
    expect(gate.revision()).toBe(0);
    expect(gate.note(1, gate.epoch())).toBe(true);
    expect(gate.revision()).toBe(1);
  });
});

describe("a throwing storage getter", () => {
  it("returns null instead of crashing the trial", () => {
    const host = {};
    Object.defineProperty(host, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
    expect(storageOrNull(() => host.localStorage)).toBeNull();
    expect(storageOrNull(() => null)).toBeNull();
  });
});

describe("an open unresolved card", () => {
  it("picks up a candidate that arrives with the catalog", () => {
    const open = { unresolved: true, legacyId: 7, id: "unresolved:7", candidates: [{ id: 7, source: "builtin", key: "builtin:7", stem: "Built in" }] };
    const bank = { id: 7, source: "bank", key: "bank:7", stem: "From the bank" };
    const next = refreshedUnresolved(open, [{ ...open, candidates: [...open.candidates, bank] }]);
    expect(next.candidates.map((item) => item.key)).toEqual(["builtin:7", "bank:7"]);
  });
});
