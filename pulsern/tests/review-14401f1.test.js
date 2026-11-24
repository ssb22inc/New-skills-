/* The four failures from the 14401f1 review. Each test describes the
   broken path: a lost write, a reset that races a save, a storage getter
   that throws, and an unresolved card whose catalog arrives late. */
import { describe, it, expect } from "vitest";
import { applyAnswer } from "../src/answer-apply.js";
import { emptyAbility, ABILITY_CATS, undoAbility, updateAbility } from "../src/ability-engine.js";
import { emptyRewards, bumpDay, reverseCardDay, recordCardGrade } from "../src/rewards.js";
import { migrateBlob } from "../src/state.js";
import { signOutAndForgetTrial } from "../src/sign-out.js";
import { readProgress } from "../src/progress-load.js";
import fs from "node:fs";
import { recoverProgressWrite, blobForSave, reconcileProgress, storageOrNull, createProgressEpoch, noteAccountRead, saveGuest, holdGuestTrial, mergeGuestIntoBlob, bindCommittedProgress, readGuestForHandoff, releaseHeldGuest, progressRevisionOnUpdate } from "../src/guest.js";
import { refreshedUnresolved, latestResults } from "../src/question-review.js";

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

  it("copies a scored answer instead of grading it again", () => {
    const stem = "word ".repeat(50).trim();
    const q = { id: 9, key: "bank:9", source: "bank", cat: "Pharmacology", diff: 2, stem };
    const blank = { log: [], xp: 0, ability: {}, rewards: emptyRewards(), run: 0, bestRun: 0 };
    const live = applyAnswer(blank, { q, correct: true, ms: 3000, today: "2026-11-24", attempt: "fast", words: 50, rating: 1600, calibration: { 9: { rating: 1600 } } });
    expect(live.result.xp).toBe(0);
    const local = { ...blank, log: live.state.log, xp: 0, ability: live.state.ability };
    const merged = blobForSave({ ...blank }, local, blank);
    expect(merged.log).toEqual(live.state.log);
    expect(merged.xp).toBe(0);
    expect(merged.ability.Pharmacology.theta).toBe(live.state.ability.Pharmacology.theta);
    expect(merged.log).toHaveLength(1);
  });

  it("updates a legacy row in place when the student names it", () => {
    const original = { id: 7, correct: false, day: "2026-11-20" };
    const named = { ...original, source: "builtin", key: "builtin:7" };
    const server = { log: [original], xp: 10, ability: { Pharmacology: { n: 1, theta: 1100 } } };
    const local = { log: [named], xp: 10, ability: server.ability };
    const merged = blobForSave(server, local, server);
    expect(merged.log).toHaveLength(1);
    expect(merged.log[0].key).toBe("builtin:7");
    expect(merged.ability).toEqual(server.ability);
  });

  it("does not let a late read from account A replace account B", () => {
    const bound = noteAccountRead({ user: null, blob: null, revision: 0, epoch: 0 }, { user: "B", blob: { log: ["B"] }, revision: 2, epoch: 1 });
    const late = noteAccountRead(bound, { user: "A", blob: { log: ["A"] }, revision: 4, epoch: 0 });
    expect(late.user).toBe("B");
    expect(late.blob.log).toEqual(["B"]);
    const signedIn = noteAccountRead(bound, { user: "B", blob: { log: [] }, revision: 0, epoch: 2 });
    expect(signedIn.user).toBe("B");
    expect(signedIn.blob.log).toEqual([]);
  });

  it("reports a missing storage adapter as a failed device save", () => {
    expect(saveGuest(null, { log: [] })).toBe(false);
    expect(holdGuestTrial({ log: [{ id: 1 }] }, null)).toBe(false);
  });

  it("does not award XP twice when the committed write's response was lost", () => {
    const baseline = { log: [], xp: 100, ability: {}, rewards: emptyRewards(), bestRun: 0 };
    const once = applyAnswer(baseline, {
      q: { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1 },
      correct: true, ms: 9000, today: "2026-11-24", attempt: "once",
    }).state;
    const retry = blobForSave(once, once, baseline);
    expect(retry.log).toHaveLength(1);
    expect(retry.xp).toBe(once.xp);
  });

  it("scores both devices' new answers from the shared baseline", () => {
    const baseline = { log: [], xp: 0, ability: {}, rewards: emptyRewards(), daily: null, bestRun: 0 };
    const a = { ...answer("a", 1), day: "2026-11-24", ms: 9000, words: 8, rating: 1300, diff: 1 };
    const b = { ...answer("b", 2), day: "2026-11-24", ms: 9000, words: 8, rating: 1300, diff: 1, cat: "Management of Care" };
    const server = { ...baseline, log: [a], xp: 10, ability: { Pharmacology: { n: 1, theta: 1200 } } };
    const local = { ...baseline, log: [b], xp: 10, ability: { "Management of Care": { n: 1, theta: 1200 } } };
    const merged = blobForSave(server, local, baseline);
    expect(merged.log.map((row) => row.attempt)).toEqual(["a", "b"]);
    expect(merged.ability.Pharmacology.n).toBe(1);
    expect(merged.ability["Management of Care"].n).toBe(1);
    expect(merged.xp).toBe(20);
  });

  it("does not add XP again on the save after the answer was acknowledged", () => {
    const baseline = { log: [], xp: 0, bestRun: 0 };
    const saved = { log: [answer("a")], xp: 10, bestRun: 1, theme: "light" };
    const themed = blobForSave(saved, { ...saved, theme: "dim" }, saved);
    expect(themed.xp).toBe(10);
    expect(themed.bestRun).toBe(1);
    const again = blobForSave(themed, { ...themed, theme: "light" }, themed);
    expect(again.xp).toBe(10);
    expect(again.bestRun).toBe(1);
    expect(baseline.xp).toBe(0);
  });

  it("keeps two legacy answers that share a number", () => {
    const bank = { id: 7, key: "bank:7", source: "bank", correct: false };
    const builtin = { id: 7, key: "builtin:7", source: "builtin", correct: false };
    const named = { ...builtin, key: "builtin:7", unclassified: false };
    const merged = blobForSave({ log: [bank, builtin], xp: 0 }, { log: [bank, named], xp: 0 }, { log: [bank, builtin], xp: 0 });
    expect(merged.log).toHaveLength(2);
    expect(merged.log[0].key).toBe("bank:7");
    expect(merged.log[1].key).toBe("builtin:7");
  });

  it("leaves an unchanged snapshot untouched so an idle save does not rewrite it", () => {
    const local = { log: [answer("mine")], xp: 10, theme: "light" };
    expect(blobForSave(local, local, local)).toBe(local);
  });

  it("keeps flashcard XP earned beside a question the other device saved", () => {
    const baseline = { log: [], xp: 0, ability: {}, rewards: emptyRewards(), srsMap: {}, bestRun: 0 };
    const q = { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const answered = applyAnswer(baseline, {
      q, correct: true, ms: 9000, today: "2026-11-24", attempt: "q", words: 8, rating: 1300, calibration: { 1: { rating: 1300 } },
    }).state;
    const local = {
      ...baseline,
      xp: 5,
      rewards: bumpDay(emptyRewards(), "2026-11-24", { cards: 1, xp: 5 }),
      srsMap: { c17: { interval: 3, due: "2026-12-01", seen: "2026-11-24" } },
    };
    const merged = blobForSave(answered, local, baseline);
    expect(merged.xp).toBe(answered.xp + 5);
    expect(merged.log.map((row) => row.attempt)).toEqual(["q"]);
    expect(merged.rewards.days["2026-11-24"]).toMatchObject({ q: 1, cards: 1, xp: answered.rewards.days["2026-11-24"].xp + 5 });
    expect(merged.srsMap.c17.due).toBe("2026-12-01");
  });

  it("keeps a card undo when the other device saved a question", () => {
    const card = bumpDay(emptyRewards(), "2026-11-24", { cards: 1, xp: 5 });
    const baseline = { log: [], xp: 5, ability: {}, rewards: card, srsMap: { c17: { interval: 3, due: "2026-12-01", seen: "2026-11-24" } }, bestRun: 0 };
    const q = { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const server = applyAnswer(baseline, {
      q, correct: true, ms: 9000, today: "2026-11-24", attempt: "q", words: 8, rating: 1300, calibration: { 1: { rating: 1300 } },
    }).state;
    const local = { ...baseline, xp: 0, rewards: reverseCardDay(card, "2026-11-24", 5), srsMap: {} };
    const merged = blobForSave(server, local, baseline);
    expect(merged.xp).toBe(server.xp - 5);
    expect(merged.rewards.days["2026-11-24"].cards).toBe(0);
    expect(merged.rewards.days["2026-11-24"].q).toBe(1);
    expect(merged.srsMap.c17).toBeUndefined();
  });

  it("does not count one saved card grade a second time when the acknowledgement was lost", () => {
    const rewards = bumpDay(emptyRewards(), "2026-11-24", { cards: 1, xp: 5 });
    const baseline = { log: [], xp: 0, rewards: emptyRewards(), srsMap: {} };
    const saved = { log: [], xp: 5, rewards, srsMap: { c17: { interval: 3, due: "2026-12-01", seen: "2026-11-24" } } };
    const merged = blobForSave(saved, saved, baseline);
    expect(merged.xp).toBe(5);
    expect(merged.rewards.days["2026-11-24"].cards).toBe(1);
  });

  it("keeps an exam finished on the other device when this device changes a setting", () => {
    const baseline = { log: [], xp: 0, theme: "light", examResults: {}, rewards: emptyRewards(), fcNew: { day: null, count: 0 }, customQs: [] };
    const server = {
      ...baseline,
      xp: 5,
      examResults: { readiness: { pct: 80, verdict: "pass", attempts: 1 } },
      rewards: bumpDay(emptyRewards(), "2026-11-24", { cards: 1, xp: 5 }),
      fcNew: { day: "2026-11-24", count: 1, ids: ["c9"] },
      customQs: [{ id: "cq1", stem: "Remote custom" }],
    };
    const local = { ...baseline, theme: "dim", examResults: { pharm: { pct: 70, verdict: "pass", attempts: 1 } } };
    const merged = blobForSave(server, local, baseline);
    expect(merged.theme).toBe("dim");
    expect(merged.examResults.readiness.pct).toBe(80);
    expect(merged.examResults.pharm.pct).toBe(70);
    expect(merged.xp).toBe(5);
    expect(merged.rewards.days["2026-11-24"].cards).toBe(1);
    expect(merged.fcNew).toEqual({ day: "2026-11-24", count: 1, ids: ["c9"] });
    expect(merged.customQs).toEqual([{ id: "cq1", stem: "Remote custom" }]);
  });

  it("replays a newer remote miss after an older local correct answer", () => {
    const baseline = { log: [], xp: 0, ability: {}, rewards: emptyRewards(), daily: null, bestRun: 0, missSchedule: {} };
    const q = { id: 3, key: "bank:3", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const taken = { ms: 9000, today: "2026-11-24", words: 8, rating: 1300, calibration: { 3: { rating: 1300 } } };
    const older = applyAnswer(baseline, { q, correct: true, attempt: "older", at: 1000, ...taken }).state;
    const newer = applyAnswer(baseline, { q, correct: false, attempt: "newer", at: 2000, ...taken }).state;
    expect(older.log[0].at).toBe(1000);
    expect(newer.log[0].at).toBe(2000);
    const merged = blobForSave(newer, older, baseline);
    expect(merged.log.map((row) => row.attempt)).toEqual(["older", "newer"]);
    expect(latestResults(merged.log)["bank:3"]).toBe(false);
    expect(merged.missSchedule["bank:3"]).toMatchObject({ interval: 1, due: "2026-11-25" });
    const inOrder = applyAnswer(older, { q, correct: false, attempt: "newer", at: 2000, ...taken }).state;
    expect(merged.xp).toBe(inOrder.xp);
    expect(merged.ability.Pharmacology.theta).toBe(inOrder.ability.Pharmacology.theta);
  });

  it("counts one saved card operation once when a later question changes the reward ledger", () => {
    const op = { id: "card:c17:1", day: "2026-11-24", xp: 5, cards: 1 };
    const card = { ...bumpDay(emptyRewards(), "2026-11-24", { cards: 1, xp: 5 }), cardOps: [op] };
    const baseline = { log: [], xp: 0, ability: {}, rewards: emptyRewards(), srsMap: {}, bestRun: 0 };
    const server = { ...baseline, xp: 5, rewards: card, srsMap: { c17: { interval: 3, due: "2026-12-01", seen: "2026-11-24" } } };
    const q = { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const local = applyAnswer({ ...server }, {
      q, correct: true, ms: 9000, today: "2026-11-24", attempt: "q", words: 8, rating: 1300, calibration: { 1: { rating: 1300 } },
    }).state;
    const merged = blobForSave(server, local, baseline);
    expect(merged.rewards.cardOps.map((item) => item.id)).toEqual(["card:c17:1"]);
    expect(merged.xp).toBe(15);
    expect(merged.rewards.days["2026-11-24"].cards).toBe(1);
  });

  it("counts a card grade once when its acknowledgement was lost and a question was answered afterward", () => {
    const baseline = { log: [], xp: 0, ability: {}, rewards: emptyRewards(), srsMap: {}, bestRun: 0 };
    const grade = { interval: 3, due: "2026-12-01", seen: "2026-11-24" };
    const card = bumpDay(emptyRewards(), "2026-11-24", { cards: 1, xp: 5 });
    const server = { ...baseline, xp: 5, rewards: card, srsMap: { c17: grade } };
    const q = { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const local = applyAnswer({ ...server }, {
      q, correct: true, ms: 9000, today: "2026-11-24", attempt: "q", words: 8, rating: 1300, calibration: { 1: { rating: 1300 } },
    }).state;
    const merged = blobForSave(server, local, baseline);
    expect(merged.xp).toBe(15);
    expect(merged.rewards.days["2026-11-24"].cards).toBe(1);
    expect(merged.rewards.days["2026-11-24"].q).toBe(1);
    expect(merged.log).toHaveLength(1);
  });

  it("keeps a remote resolution of an old answer when this device only changes a setting", () => {
    const original = { id: 7, correct: false, day: "2026-11-20" };
    const named = { ...original, source: "builtin", key: "builtin:7" };
    const baseline = { log: [original], xp: 0, theme: "light" };
    const server = { ...baseline, log: [named] };
    const local = { ...baseline, theme: "dim" };
    const merged = blobForSave(server, local, baseline);
    expect(merged.log).toHaveLength(1);
    expect(merged.log[0].key).toBe("builtin:7");
    expect(merged.log[0].source).toBe("builtin");
    expect(merged.theme).toBe("dim");
  });

  it("does not move the baseline to a conflict write the screen never applied", () => {
    const baseline = { log: [], xp: 0, ability: {}, rewards: emptyRewards(), bestRun: 0 };
    const q = { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const taken = { ms: 9000, today: "2026-11-24", words: 8, rating: 1300, calibration: { 1: { rating: 1300 } } };
    const a = applyAnswer(baseline, { q: { ...q, id: 1, key: "bank:1" }, correct: true, attempt: "a", ...taken }).state;
    const b = applyAnswer(baseline, { q: { ...q, id: 2, key: "bank:2", cat: "Management of Care" }, correct: true, attempt: "b", ...taken, calibration: { 2: { rating: 1300 } } }).state;
    const held = { accepted: baseline, baseline, revision: 1 };
    const stale = bindCommittedProgress(held, { blob: { ...a, log: [...a.log, ...b.log], xp: 20 }, revision: 2, current: false, epoch: 1, seenEpoch: 1 });
    expect(stale).toBe(held);
    const bc = applyAnswer(b, { q: { ...q, id: 3, key: "bank:3", cat: "Safety" }, correct: true, attempt: "c", ...taken, calibration: { 3: { rating: 1300 } } }).state;
    const saved = blobForSave({ ...a, log: [a.log[0], b.log[0]], xp: 20 }, bc, stale.baseline);
    expect(saved.log.map((row) => row.attempt)).toEqual(["a", "b", "c"]);
    expect(saved.xp).toBe(30);
    const live = bindCommittedProgress(held, { blob: saved, revision: 3, current: true, epoch: 1, seenEpoch: 1 });
    expect(live.baseline).toBe(saved);
    expect(live.revision).toBe(3);
  });

  it("keeps a card grade after the saved progress is loaded again", () => {
    const stored = {
      log: [], xp: 5, srsMap: { c17: { interval: 3, due: "2026-12-01", seen: "2026-11-24" } },
      rewards: recordCardGrade(emptyRewards(), { id: "card:c17:1", day: "2026-11-24", xp: 5 }),
    };
    const migrated = migrateBlob(JSON.parse(JSON.stringify(stored)), ["Pharmacology"]);
    const saved = blobForSave(stored, migrated, stored);
    expect(saved.xp).toBe(5);
    expect(saved.rewards.cardOps.map((op) => op.id)).toEqual(["card:c17:1"]);
    expect(saved.rewards.days["2026-11-24"].cards).toBe(1);
    expect(saved.srsMap.c17.due).toBe("2026-12-01");
  });

  it("keeps the other device's first answer when this device still has an empty baseline", () => {
    const blank = { log: [], xp: 0, ability: {}, rewards: emptyRewards(), bestRun: 0 };
    const q = { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const server = applyAnswer(blank, {
      q, correct: true, ms: 9000, today: "2026-11-24", attempt: "a", words: 8, rating: 1300, calibration: { 1: { rating: 1300 } },
    }).state;
    const merged = reconcileProgress(server, blank, null);
    expect(merged.log.map((row) => row.attempt)).toEqual(["a"]);
    expect(merged.xp).toBe(server.xp);
    expect(merged.ability.Pharmacology.n).toBe(server.ability.Pharmacology.n);
    expect(merged.ability.Pharmacology.theta).toBe(server.ability.Pharmacology.theta);
  });

  it("keeps legacy ability when a delayed older answer is replayed", () => {
    const legacy = { id: 3, correct: false, cat: "Pharmacology", diff: 2 };
    const ability = { ...emptyAbility(ABILITY_CATS), Pharmacology: { theta: 1400, n: 12 } };
    const baseline = { log: [legacy], xp: 40, ability, rewards: emptyRewards(), missSchedule: {}, daily: null, streak: null, bestRun: 0 };
    const q = { id: 4, key: "bank:4", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const taken = { ms: 9000, today: "2026-11-24", words: 8, rating: 1300, calibration: { 4: { rating: 1300 } } };
    const newer = applyAnswer(baseline, { q, correct: true, attempt: "newer", at: 2000, ...taken }).state;
    const older = applyAnswer(baseline, { q, correct: false, attempt: "older", at: 1000, ...taken }).state;
    const inOrder = applyAnswer(older, { q, correct: true, attempt: "newer", at: 2000, ...taken }).state;
    const merged = blobForSave(inOrder, { ...newer, theme: "dim" }, newer);
    expect(merged.ability["Management of Care"].n).toBe(0);
    expect(merged.ability.Pharmacology.n).toBe(inOrder.ability.Pharmacology.n);
    expect(merged.ability.Pharmacology.theta).toBeCloseTo(inOrder.ability.Pharmacology.theta, 4);
    expect(merged.missSchedule["bank:4"].interval).toBe(inOrder.missSchedule["bank:4"].interval);
    expect(merged.xp).toBe(inOrder.xp);
    const round = updateAbility(ability, q, true, taken.calibration);
    expect(undoAbility(round.ability, q, true, taken.calibration).Pharmacology.theta).toBeCloseTo(1400, 4);
    expect(undoAbility(round.ability, q, true, taken.calibration).Pharmacology.n).toBe(12);
  });

  it("keeps every category when the first save's acknowledgement was lost", () => {
    const blank = { log: [], xp: 0, ability: emptyAbility(ABILITY_CATS), rewards: emptyRewards(), bestRun: 0 };
    const q = { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const saved = applyAnswer(blank, {
      q, correct: true, ms: 9000, today: "2026-11-24", attempt: "a", words: 8, rating: 1300, calibration: { 1: { rating: 1300 } },
    }).state;
    const merged = reconcileProgress(saved, { ...blank, ability: {} }, {});
    expect(Object.keys(merged.ability).sort()).toEqual([...ABILITY_CATS].sort());
    expect(merged.ability.Pharmacology.n).toBe(1);
    expect(merged.xp).toBe(saved.xp);
    for (const cat of ABILITY_CATS) if (cat !== "Pharmacology") expect(merged.ability[cat]).toEqual({ theta: 1200, n: 0 });
  });

  it("keeps a corrected miss on its review ladder when an older answer arrives", () => {
    const blank = { log: [], xp: 0, ability: emptyAbility(ABILITY_CATS), rewards: emptyRewards(), missSchedule: {}, daily: null, streak: null, bestRun: 0 };
    const missedQ = { id: 4, key: "bank:4", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const other = { id: 5, key: "bank:5", source: "bank", cat: "Safety & Infection Control", diff: 1, stem: "eight words are enough here now" };
    const taken = { ms: 9000, words: 8, rating: 1300 };
    const missed = applyAnswer(blank, { q: missedQ, correct: false, attempt: "miss", at: 1000, today: "2026-11-20", ...taken, calibration: { 4: { rating: 1300 } } }).state;
    const corrected = applyAnswer(missed, { q: missedQ, correct: true, attempt: "fix", at: 3000, today: "2026-11-22", ...taken, calibration: { 4: { rating: 1300 } } }).state;
    expect(corrected.missSchedule["bank:4"].interval).toBe(3);
    const between = applyAnswer(blank, { q: other, correct: true, attempt: "between", at: 2000, today: "2026-11-21", ...taken, calibration: { 5: { rating: 1300 } } }).state;
    const inOrder = applyAnswer(applyAnswer(missed, { q: other, correct: true, attempt: "between", at: 2000, today: "2026-11-21", ...taken, calibration: { 5: { rating: 1300 } } }).state, {
      q: missedQ, correct: true, attempt: "fix", at: 3000, today: "2026-11-22", ...taken, calibration: { 4: { rating: 1300 } },
    }).state;
    const merged = blobForSave(inOrder, { ...corrected, theme: "dim" }, corrected);
    expect(merged.missSchedule["bank:4"].interval).toBe(3);
    expect(merged.log.map((row) => row.attempt)).toEqual(["miss", "between", "fix"]);
    expect(between.log).toHaveLength(1);
  });

  it("keeps the corrected streak when this device only changes a setting", () => {
    const answerRow = (attempt, at, day) => ({ id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, correct: true, attempt, at, day, ms: 9000, words: 8, rating: 1300 });
    const tuesday = {
      log: [answerRow("tue", 2000, "2026-11-24")], xp: 10, ability: {}, rewards: emptyRewards(),
      streak: { count: 6, lastDay: "2026-11-24", shield: false }, daily: { day: "2026-11-24", answered: 1 }, theme: "light",
    };
    const corrected = {
      ...tuesday,
      log: [answerRow("mon", 1000, "2026-11-23"), answerRow("tue", 2000, "2026-11-24")],
      streak: { count: 7, lastDay: "2026-11-24", shield: true },
    };
    const merged = blobForSave(corrected, { ...tuesday, theme: "dim" }, tuesday);
    expect(merged.streak).toMatchObject({ count: 7, lastDay: "2026-11-24", shield: true });
    expect(merged.theme).toBe("dim");
  });

  it("does not count a saved answer twice when an older answer arrives", () => {
    const baseline = { log: [], xp: 0, ability: emptyAbility(ABILITY_CATS), rewards: emptyRewards(), daily: null, missSchedule: {}, streak: null, bestRun: 0 };
    const taken = { ms: 9000, today: "2026-11-24", words: 8, rating: 1300 };
    const first = { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const second = { id: 2, key: "bank:2", source: "bank", cat: "Management of Care", diff: 1, stem: "eight words are enough here now" };
    const newer = applyAnswer(baseline, { q: first, correct: true, attempt: "newer", at: 2000, ...taken, calibration: { 1: { rating: 1300 } } }).state;
    const older = applyAnswer(baseline, { q: second, correct: true, attempt: "older", at: 1000, ...taken, calibration: { 2: { rating: 1300 } } }).state;
    const inOrder = applyAnswer(older, { q: first, correct: true, attempt: "newer", at: 2000, ...taken, calibration: { 1: { rating: 1300 } } }).state;
    const merged = blobForSave(inOrder, newer, newer);
    expect(merged.log.map((row) => row.attempt)).toEqual(["older", "newer"]);
    expect(merged.daily).toMatchObject({ day: "2026-11-24", answered: 2 });
    expect(merged.rewards.days["2026-11-24"].q).toBe(2);
    expect(merged.xp).toBe(inOrder.xp);
  });

  it("combines card days from two devices into one streak", () => {
    const baseline = {
      log: [], xp: 0, ability: {}, rewards: emptyRewards(), srsMap: {}, bestRun: 0,
      streak: { count: 5, lastDay: "2026-11-22", shield: true },
      daily: { day: "2026-11-22", answered: 4 },
    };
    const monday = {
      ...baseline, xp: 5,
      rewards: { ...bumpDay(emptyRewards(), "2026-11-23", { cards: 1, xp: 5 }), cardOps: [{ id: "mon", day: "2026-11-23", xp: 5, cards: 1 }] },
      streak: { count: 6, lastDay: "2026-11-23", shield: true },
      srsMap: { c1: { interval: 3, due: "2026-11-26", seen: "2026-11-23" } },
    };
    const tuesday = {
      ...baseline, xp: 5,
      rewards: { ...bumpDay(emptyRewards(), "2026-11-24", { cards: 1, xp: 5 }), cardOps: [{ id: "tue", day: "2026-11-24", xp: 5, cards: 1 }] },
      streak: { count: 6, lastDay: "2026-11-24", shield: false },
      srsMap: { c2: { interval: 3, due: "2026-11-27", seen: "2026-11-24" } },
    };
    const merged = blobForSave(monday, tuesday, baseline);
    expect(merged.streak).toMatchObject({ count: 7, lastDay: "2026-11-24", shield: true });
    expect(merged.rewards.cardOps.map((op) => op.id).sort()).toEqual(["mon", "tue"]);
  });

  it("rejects a progress update that does not advance the revision", () => {
    const sql = fs.readFileSync(new URL("../supabase/migrations/022_progress_revision_guard.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/before update on public\.progress/i);
    expect(sql).toMatch(/new\.revision < old\.revision/);
    expect(progressRevisionOnUpdate(4, undefined)).toEqual({ revision: 5, legacy: true });
    expect(progressRevisionOnUpdate(4, 5)).toEqual({ revision: 5, legacy: false });
    expect(() => progressRevisionOnUpdate(4, 3)).toThrow(/revision conflict/);
    const rollback = fs.readFileSync(new URL("../supabase/rollback/rollback_relabel_legacy_progress_20261124.sql", import.meta.url), "utf8");
    expect(rollback).toMatch(/revision = live\.revision \+ 1/);
  });

  it("a cancelled progress read is not an empty account", async () => {
    const error = new Error("cancelled");
    error.code = "cancelled";
    const read = await readProgress(async () => { throw error; });
    expect(read.status).toBe("cancelled");
    expect(read.status).not.toBe("new");
  });

  it("keeps a save that does not send a revision and rejects one that sends an older revision", () => {
    const sql = fs.readFileSync(new URL("../supabase/migrations/022_progress_revision_guard.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/new\.revision := old\.revision \+ 1/);
    expect(sql).toMatch(/jsonb_array_elements/);
    expect(sql).toMatch(/old\.revision > 0/);
    expect(sql).not.toMatch(/new\.revision is null or new\.revision <= old\.revision then/);
    expect(progressRevisionOnUpdate(4, undefined)).toEqual({ revision: 5, legacy: true });
    expect(progressRevisionOnUpdate(4, 4)).toEqual({ revision: 5, legacy: true });
    expect(progressRevisionOnUpdate(4, 6).revision).toBe(6);
    expect(() => progressRevisionOnUpdate(4, 3)).toThrow(/revision conflict/);
  });

  it("undoes two answers from the same millisecond in the order they were applied", () => {
    const blank = { log: [], xp: 0, ability: emptyAbility(ABILITY_CATS), rewards: emptyRewards(), missSchedule: {}, daily: null, streak: null, bestRun: 0 };
    const taken = { ms: 9000, today: "2026-11-24", words: 8, rating: 1300 };
    const correct = { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const wrong = { id: 2, key: "bank:2", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const earlyQ = { id: 3, key: "bank:3", source: "bank", cat: "Management of Care", diff: 1, stem: "eight words are enough here now" };
    const stamp = (state, seq) => ({ ...state, log: state.log.map((row, index) => index === state.log.length - 1 ? { ...row, seq } : row) });
    const step = (state, q, correctAnswer, attempt, at, seq) => stamp(applyAnswer(state, {
      q, correct: correctAnswer, attempt, at, ms: taken.ms, today: taken.today, words: taken.words, rating: taken.rating,
      calibration: { [q.id]: { rating: 1300 } },
    }).state, seq);
    const saved = step(step(blank, correct, true, "a", 5000, 1), wrong, false, "b", 5000, 2);
    let inOrder = step(blank, earlyQ, true, "e", 1000, 1);
    inOrder = step(inOrder, correct, true, "a", 5000, 1);
    inOrder = step(inOrder, wrong, false, "b", 5000, 2);
    const merged = blobForSave(inOrder, saved, saved);
    expect(merged.ability.Pharmacology.theta).toBeCloseTo(inOrder.ability.Pharmacology.theta, 4);
    expect(merged.ability.Pharmacology.n).toBe(inOrder.ability.Pharmacology.n);
  });

  it("keeps a shift cover earned on the other device when this device only changes a setting", () => {
    const week = "2026-11-23";
    const baseline = { log: [], xp: 0, ability: emptyAbility(ABILITY_CATS), rewards: emptyRewards(), theme: "light", srsMap: {} };
    const q = { id: 6, key: "bank:6", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const answered = applyAnswer(baseline, {
      q, correct: true, ms: 9000, today: "2026-11-27", attempt: "cover", words: 8, rating: 1300, calibration: { 6: { rating: 1300 } },
    }).state;
    const server = {
      ...answered,
      rewards: { ...answered.rewards, covers: 1, coverWeeks: [week] },
    };
    const merged = blobForSave(server, { ...baseline, theme: "dim" }, baseline);
    expect(merged.theme).toBe("dim");
    expect(merged.rewards.covers).toBe(1);
    expect(merged.rewards.coverWeeks).toEqual([week]);
  });

  it("keeps the ability update from an answer the older app saved without an attempt id", () => {
    const blank = { log: [], xp: 0, ability: emptyAbility(ABILITY_CATS), rewards: emptyRewards(), missSchedule: {}, daily: null, streak: null, bestRun: 0 };
    const pharm = { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const care = { id: 2, key: "bank:2", source: "bank", cat: "Management of Care", diff: 1, stem: "eight words are enough here now" };
    const taken = { ms: 9000, today: "2026-11-24", words: 8, rating: 1300 };
    const legacyRow = { id: 1, cat: "Pharmacology", diff: 1, correct: true };
    const legacyAbility = updateAbility(blank.ability, { id: 1, cat: "Pharmacology", diff: 1 }, true).ability;
    const legacy = { ...blank, log: [legacyRow], xp: 10, ability: legacyAbility };
    const local = applyAnswer(blank, { q: care, correct: true, attempt: "local", ...taken, calibration: { 2: { rating: 1300 } } }).state;
    const scored = { ...blank, ability: legacyAbility };
    const inOrder = applyAnswer(scored, { q: care, correct: true, attempt: "local", ...taken, calibration: { 2: { rating: 1300 } } }).state;
    const merged = blobForSave(legacy, local, blank);
    expect(merged.log.some((row) => row.cat === "Pharmacology" && !row.attempt)).toBe(true);
    expect(merged.ability.Pharmacology.n).toBe(1);
    expect(merged.ability["Management of Care"].n).toBe(1);
    expect(merged.ability.Pharmacology.theta).toBeCloseTo(inOrder.ability.Pharmacology.theta, 4);
  });

  it("refunds a cover when the other device studied the day that cover was bridging", () => {
    const friday = "2026-11-27";
    const saturday = "2026-11-28";
    const monday = "2026-11-30";
    const baseline = {
      log: [{ id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, correct: true, attempt: "fri", at: 1, day: friday, ms: 9000, words: 8, rating: 1300 }],
      xp: 10,
      ability: emptyAbility(ABILITY_CATS),
      rewards: { ...emptyRewards(), covers: 1 },
      streak: { count: 1, lastDay: friday, shield: true },
      daily: { day: friday, answered: 1 },
      bestRun: 1,
    };
    const mondayQ = { id: 2, key: "bank:2", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const saturdayQ = { id: 3, key: "bank:3", source: "bank", cat: "Safety & Infection Control", diff: 1, stem: "eight words are enough here now" };
    const taken = { ms: 9000, words: 8, rating: 1300 };
    const afterMonday = applyAnswer(baseline, { q: mondayQ, correct: true, attempt: "mon", at: 3, today: monday, ...taken, calibration: { 2: { rating: 1300 } } }).state;
    const afterSaturday = applyAnswer(baseline, { q: saturdayQ, correct: true, attempt: "sat", at: 2, today: saturday, ...taken, calibration: { 3: { rating: 1300 } } }).state;
    expect(afterMonday.rewards.covers).toBe(0);
    expect(afterSaturday.rewards.covers).toBe(1);
    const merged = blobForSave(afterMonday, afterSaturday, baseline);
    expect(merged.rewards.covers).toBe(1);
    expect(merged.rewards.coverDays).not.toContain(saturday);
    expect(merged.streak.lastDay).toBe(monday);
  });

  it("keeps a cover-protected streak when the next answer is the next day", () => {
    const baseline = {
      log: [
        { id: 1, key: "bank:1", source: "bank", cat: "Pharmacology", diff: 1, correct: true, attempt: "mon", at: 1, day: "2026-11-23", ms: 9000, words: 8, rating: 1300 },
        { id: 2, key: "bank:2", source: "bank", cat: "Pharmacology", diff: 1, correct: true, attempt: "thu", at: 2, day: "2026-11-26", ms: 9000, words: 8, rating: 1300 },
      ],
      xp: 20,
      ability: emptyAbility(ABILITY_CATS),
      rewards: { ...emptyRewards(), covers: 0, coverWeeks: ["2026-11-23"] },
      streak: { count: 2, lastDay: "2026-11-26", shield: false },
      daily: { day: "2026-11-26", answered: 1 },
      bestRun: 1,
    };
    const friday = { id: 3, key: "bank:3", source: "bank", cat: "Safety & Infection Control", diff: 1, stem: "eight words are enough here now" };
    const local = applyAnswer(baseline, {
      q: friday, correct: true, attempt: "fri", at: 3, today: "2026-11-27", ms: 9000, words: 8, rating: 1300, calibration: { 3: { rating: 1300 } },
    }).state;
    const merged = blobForSave(baseline, local, baseline);
    expect(local.streak.count).toBe(3);
    expect(merged.streak).toMatchObject({ count: local.streak.count, lastDay: "2026-11-27", shield: local.streak.shield });
  });

  it("counts Monday, Tuesday, and Wednesday when Monday arrives after Wednesday was answered", () => {
    const blank = { log: [], xp: 0, ability: emptyAbility(ABILITY_CATS), rewards: emptyRewards(), missSchedule: {}, daily: null, streak: null, bestRun: 0 };
    const q = { id: 7, key: "bank:7", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const taken = { ms: 9000, words: 8, rating: 1300, calibration: { 7: { rating: 1300 } } };
    const tuesday = applyAnswer(blank, { q, correct: true, attempt: "tue", at: 2000, today: "2026-11-24", ...taken }).state;
    const monday = applyAnswer(blank, { q: { ...q, id: 8, key: "bank:8" }, correct: true, attempt: "mon", at: 1000, today: "2026-11-23", ...taken, calibration: { 8: { rating: 1300 } } }).state;
    const server = applyAnswer(monday, { q, correct: true, attempt: "tue", at: 2000, today: "2026-11-24", ...taken }).state;
    const local = applyAnswer(tuesday, { q: { ...q, id: 9, key: "bank:9", cat: "Safety & Infection Control" }, correct: true, attempt: "wed", at: 3000, today: "2026-11-25", ...taken, calibration: { 9: { rating: 1300 } } }).state;
    const merged = blobForSave(server, local, tuesday);
    expect(merged.log.map((row) => row.day)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(merged.streak).toMatchObject({ count: 3, lastDay: "2026-11-25" });
  });

  it("does not carry yesterday's new-card count into today", () => {
    const baseline = { log: [], xp: 0, rewards: emptyRewards(), fcNew: { day: "2026-11-23", count: 20 } };
    const server = { ...baseline, fcNew: { day: "2026-11-24", count: 1, ids: ["cA"] } };
    const local = { ...baseline, fcNew: { day: "2026-11-24", count: 1, ids: ["cB"] } };
    const merged = blobForSave(server, local, baseline);
    expect(merged.fcNew.day).toBe("2026-11-24");
    expect(merged.fcNew.ids.sort()).toEqual(["cA", "cB"]);
    expect(merged.fcNew.count).toBe(2);
  });

  it("keeps a legacy new-card count that has no ids when each device adds a different card", () => {
    const today = "2026-11-24";
    const baseline = { log: [], xp: 0, rewards: emptyRewards(), fcNew: { day: today, count: 12 } };
    const server = { ...baseline, fcNew: { day: today, count: 13, ids: ["cA"] } };
    const local = { ...baseline, fcNew: { day: today, count: 13, ids: ["cB"] } };
    const merged = blobForSave(server, local, baseline);
    expect(merged.fcNew.day).toBe(today);
    expect(merged.fcNew.ids.sort()).toEqual(["cA", "cB"]);
    expect(merged.fcNew.count).toBe(14);
  });

  it("scores a delayed older miss before the newer answer already saved", () => {
    const baseline = { log: [], xp: 0, ability: {}, rewards: emptyRewards(), missSchedule: {}, daily: null, bestRun: 0, streak: null };
    const q = { id: 4, key: "bank:4", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const taken = { ms: 9000, today: "2026-11-24", words: 8, rating: 1300, calibration: { 4: { rating: 1300 } } };
    const newer = applyAnswer(baseline, { q, correct: true, attempt: "newer", at: 2000, ...taken }).state;
    const older = applyAnswer(baseline, { q, correct: false, attempt: "older", at: 1000, ...taken }).state;
    const inOrder = applyAnswer(older, { q, correct: true, attempt: "newer", at: 2000, ...taken }).state;
    const server = { ...inOrder, theme: "light" };
    const local = { ...newer, theme: "dim" };
    const merged = blobForSave(server, local, newer);
    expect(merged.log.map((row) => row.attempt)).toEqual(["older", "newer"]);
    expect(merged.missSchedule["bank:4"].interval).toBe(inOrder.missSchedule["bank:4"].interval);
    expect(merged.xp).toBe(inOrder.xp);
    expect(merged.ability.Pharmacology.theta).toBeCloseTo(inOrder.ability.Pharmacology.theta, 6);
    expect(merged.theme).toBe("dim");
  });

  it("keeps a card-only day in the streak when the next day's question is saved with it", () => {
    const baseline = {
      log: [], xp: 0, ability: {}, rewards: emptyRewards(), srsMap: {}, bestRun: 0,
      streak: { count: 5, lastDay: "2026-11-22", shield: true },
      daily: { day: "2026-11-22", answered: 8 },
    };
    const op = { id: "card:c1", day: "2026-11-23", xp: 5, cards: 1 };
    const withCard = {
      ...baseline,
      xp: 5,
      rewards: { ...bumpDay(emptyRewards(), "2026-11-23", { cards: 1, xp: 5 }), cardOps: [op] },
      streak: { count: 6, lastDay: "2026-11-23", shield: true },
      daily: { day: "2026-11-23", answered: 1 },
      srsMap: { c1: { interval: 3, due: "2026-11-26", seen: "2026-11-23" } },
    };
    const q = { id: 8, key: "bank:8", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const local = applyAnswer(withCard, {
      q, correct: true, ms: 9000, today: "2026-11-24", attempt: "next-day", words: 8, rating: 1300, calibration: { 8: { rating: 1300 } },
    }).state;
    const merged = blobForSave(baseline, local, baseline);
    expect(merged.streak).toMatchObject({ count: 7, lastDay: "2026-11-24", shield: true });
    expect(merged.daily).toMatchObject({ day: "2026-11-24", answered: 1 });
    expect(merged.xp).toBe(local.xp);
  });

  it("counts a card and a question on the same day", () => {
    const baseline = { log: [], xp: 0, ability: {}, rewards: emptyRewards(), srsMap: {}, daily: null, streak: null, bestRun: 0 };
    const op = { id: "card:c2", day: "2026-11-24", xp: 5, cards: 1 };
    const withCard = {
      ...baseline,
      xp: 5,
      rewards: { ...bumpDay(emptyRewards(), "2026-11-24", { cards: 1, xp: 5 }), cardOps: [op] },
      daily: { day: "2026-11-24", answered: 1 },
      streak: { count: 1, lastDay: "2026-11-24", shield: true },
    };
    const q = { id: 9, key: "bank:9", source: "bank", cat: "Pharmacology", diff: 1, stem: "eight words are enough here now" };
    const local = applyAnswer(withCard, {
      q, correct: true, ms: 9000, today: "2026-11-24", attempt: "same-day", words: 8, rating: 1300, calibration: { 9: { rating: 1300 } },
    }).state;
    const merged = blobForSave(baseline, local, baseline);
    expect(merged.daily).toMatchObject({ day: "2026-11-24", answered: 2 });
    expect(merged.xp).toBe(local.xp);
  });

  it("reads a trial held in memory when storage cannot be opened", () => {
    const guest = {
      v: 1, startedAt: Date.now(), lastAt: Date.now(), day: "2026-11-24", xp: 0, run: 0, bestRun: 0,
      log: [{ id: 1, source: "builtin", correct: true, attempt: "mem", day: "2026-11-24", ms: 9000 }],
    };
    holdGuestTrial(guest, null);
    expect(readGuestForHandoff(null, null).log).toHaveLength(1);
    releaseHeldGuest();
    const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    expect(app).toContain("readGuestForHandoff(storageOrNull(() => window.localStorage), storageOrNull(() => window.sessionStorage))");
  });

  it("still signs out when the browser refuses storage", async () => {
    const calls = [];
    await signOutAndForgetTrial({ auth: { signOut: () => { calls.push("out"); return Promise.resolve(); } }, storage: null, holdStorage: null });
    expect(calls).toEqual(["out"]);
  });

  it("keeps the time a trial answer was taken", () => {
    const catalog = [{ id: 1, cat: "Pharmacology", diff: 1, stem: "eight words are enough here now", type: "mc" }];
    const guest = {
      v: 1, startedAt: 1700000000000, lastAt: Date.now(), day: "2026-11-24", xp: 0, run: 0, bestRun: 0,
      log: [{ id: 1, source: "builtin", correct: true, attempt: "1700000000000:0", day: "2026-11-24", at: 1700000000100, ms: 9000 }],
    };
    const imported = mergeGuestIntoBlob({ log: [], xp: 0, rewards: emptyRewards(), ability: {}, streak: null }, guest, {
      today: "2026-11-24", now: Date.now(), catalog,
    });
    expect(imported.blob.log[0].at).toBe(1700000000100);
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
