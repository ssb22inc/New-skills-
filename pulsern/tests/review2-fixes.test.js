import { describe, it, expect } from "vitest";
import { answerXp, emptyRewards } from "../src/rewards.js";
import { mergeGuestIntoBlob, emptyGuest, guestAnswer, guestFresh } from "../src/guest.js";
import { migrateBlob } from "../src/state.js";
const CATS = ["Management of Care", "Pharmacology"];
const q = { id: 7, cat: "Pharmacology", diff: 2, stem: "x ".repeat(30) };
describe("REVIEW-2 proofs", () => {
  it("wrong-then-right never pays more than right-first-time", () => {
    let log = [], xp = 0;
    for (let i = 0; i < 5; i++) for (const c of [false, true]) { xp += answerXp({ q, correct: c, ms: 1e4, log }).xp; log.push({ id: q.id, correct: c }); }
    expect(xp).toBeLessThan(answerXp({ q, correct: true, ms: 1e4, log: [] }).xp * 5 + 1);
    expect(answerXp({ q, correct: true, ms: 1e4, log: [{ id: 7, correct: false }] }).xp).toBeLessThan(20);
  });
  it("repeat detection survives a string/number id mismatch", () => {
    expect(answerXp({ q, correct: true, ms: 1e4, log: [{ id: "7", correct: true }] }).reason).toBe("repeat");
  });
  it("a tampered localStorage guest cannot inject XP or more than 5 answers", () => {
    const now = Date.now();
    const fake = { ...emptyGuest(now, "2026-11-23"), log: Array.from({ length: 500 }, (_, i) => ({ id: i, cat: "Pharmacology", diff: 3, correct: true })), xp: 99999, bestRun: 500 };
    const m = mergeGuestIntoBlob(migrateBlob({}, CATS), fake, { today: "2026-11-23", now });
    expect(m.blob.log.length).toBe(5);
    expect(m.blob.xp).toBe(150);
    expect(m.blob.bestRun).toBeLessThanOrEqual(5);
  });
  it("an idle trial tab opened 8 days ago does not lose answers given today", () => {
    let g = emptyGuest(Date.now() - 8 * 86400000, "2026-11-15");
    for (let i = 0; i < 5; i++) g = guestAnswer(g, { id: i, cat: "Pharmacology", diff: 1, stem: "a b c" }, true, { ms: 9000, today: "2026-11-23" }).guest;
    expect(guestFresh(g)).toBe(true);
    expect(g.day).toBe("2026-11-23");
  });
});
