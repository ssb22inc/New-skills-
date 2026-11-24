/* The four failures from the 14401f1 review. Each test describes the
   broken path: a lost write, a reset that races a save, a storage getter
   that throws, and an unresolved card whose catalog arrives late. */
import { describe, it, expect } from "vitest";
import { applyAnswer } from "../src/answer-apply.js";
import { recoverProgressWrite, storageOrNull, createProgressEpoch } from "../src/guest.js";
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
