/* Question identity is one key: builtin:7 is not bank:7.
   Legacy numbers are named only when exactly one catalog contains
   them. Import and a live answer share applyAnswer. */
import { describe, it, expect } from "vitest";
import { applyAnswer, commitLiveAnswer } from "../src/answer-apply.js";
import { emptyGuest, guestAnswer, mergeGuestIntoBlob, holdGuestTrial, peekHeldGuest, releaseHeldGuest, GUEST_KEY, GUEST_HOLD_KEY } from "../src/guest.js";
import { classifyLog, resolveLegacyRow, canonicalKey, rekeySchedule, claimLegacyRow, claimLegacyAt } from "../src/question-key.js";
import { stampCatalogQuestion, stampLoadedCatalog, questionIdentity } from "../src/question-identity.js";
import { reviewPools, todayPool, sessionPool, unseenQuestions, questionByIdentity, latestResults, expandTrialQuestions, settledResult, legacyCandidates, scheduleEntry } from "../src/question-review.js";
import { emptyNav, appendQuestion, goBack, present } from "../src/question-nav.js";
import { itemRating } from "../src/ability-engine.js";
import { emptyRewards, REVIEW_FIX_BONUS, caseStepIds } from "../src/rewards.js";
import { emptyAbility } from "../src/ability-engine.js";
import { readProgress, sessionReadDecision } from "../src/progress-load.js";
import { forgetTrialOnRemoteSignOut } from "../src/sign-out.js";

const CATS = ["Pharmacology", "Physiological Adaptation"];
const TODAY = "2026-11-24";
const STEM = "Which action should the nurse take first for this client on this unit?";
const blank = () => ({
  log: [], xp: 0, ability: emptyAbility(CATS), streak: { count: 0, lastDay: null, shield: true },
  rewards: emptyRewards(), daily: { day: TODAY, answered: 0 }, missSchedule: {}, run: 0, bestRun: 0,
});
const live = (state, q, correct, extra = {}) => applyAnswer(state, { q, correct, ms: 9000, today: TODAY, ...extra }).state;
const builtin = { id: 7, source: "builtin", cat: "Pharmacology", diff: 2, stem: STEM };
const bank = { id: 7, source: "bank", cat: "Pharmacology", diff: 2, stem: "A shared-bank stem that is a different question entirely from the bundled one." };
const step = caseStepIds({ key: "sepsis", index: 0, step: 1 });
const caseQ = { id: step.id, source: "case", cat: "Physiological Adaptation", diff: 3, stem: "Which findings require immediate follow-up? Select all that apply." };
const questions = { builtin, bank, case: caseQ };

function expectFirst(state, q) {
  expect(state.log).toHaveLength(1);
  expect(state.log[0].key).toBe(canonicalKey(q.source, q.id));
  expect(state.xp).toBe(10 * q.diff);
  expect(state.ability[q.cat].n).toBe(1);
  expect(state.rewards.days[TODAY]).toMatchObject({ q: 1, xp: 10 * q.diff });
  expect(state.streak.count).toBe(1);
}

describe("canonical keys", () => {
  it("a bank 7 is not a builtin 7", () => {
    const after = live(live(blank(), builtin, true), bank, true);
    expect(after.xp).toBe(20 + 20);
    expect(after.log.map((row) => row.key)).toEqual(["builtin:7", "bank:7"]);
    expect(after.ability.Pharmacology.n).toBe(2);
  });
});

describe.each(Object.entries(questions))("%s", (name, q) => {
  it("first try correct pays, updates ability, and writes the ledger", () => {
    expectFirst(live(blank(), q, true), q);
  });
  it("a miss then a correction pays the fix bonus once and updates ability twice", () => {
    const missed = live(blank(), q, false);
    const fixed = live(missed, q, true);
    expect(fixed.log).toHaveLength(2);
    expect(fixed.xp).toBe(REVIEW_FIX_BONUS);
    expect(fixed.ability[q.cat].n).toBe(2);
    expect(fixed.rewards.days[TODAY].xp).toBe(REVIEW_FIX_BONUS);
    expect(fixed.rewards.days[TODAY].q).toBe(2);
    const imported = mergeGuestIntoBlob(blank(), trialOf(q, [false, true]), { today: TODAY, now: Date.now() }).blob;
    expect(imported.xp).toBe(fixed.xp);
    expect(imported.ability[q.cat].n).toBe(fixed.ability[q.cat].n);
    expect(imported.rewards.days[TODAY].xp).toBe(fixed.rewards.days[TODAY].xp);
    expect(imported.log.map((row) => row.key)).toEqual(fixed.log.map((row) => row.key));
  });
  it("a repeat pays nothing more and still updates ability", () => {
    const twice = live(live(blank(), q, true), q, true);
    expect(twice.xp).toBe(10 * q.diff);
    expect(twice.ability[q.cat].n).toBe(2);
    expect(twice.log).toHaveLength(2);
  });
  it("an answer already on the account is not a new first try", () => {
    const had = live(blank(), q, true);
    const again = live(had, q, true);
    expect(again.xp).toBe(had.xp);
    expect(again.ability[q.cat].n).toBe(2);
    expect(again.rewards.days[TODAY].q).toBe(2);
    expect(again.rewards.days[TODAY].xp).toBe(had.xp);
  });
  it("a sign-out in another tab clears the held trial", () => {
    releaseHeldGuest();
    const local = mem();
    const session = mem();
    holdGuestTrial(trialOf(q, [true]), session);
    local.setItem(GUEST_KEY, JSON.stringify(trialOf(q, [true])));
    expect(forgetTrialOnRemoteSignOut("SIGNED_OUT", { storage: local, holdStorage: session })).toBe(true);
    expect(peekHeldGuest(session)).toBeNull();
    expect(local.getItem(GUEST_KEY)).toBeNull();
  });
  it("a failed session read is not a new account", async () => {
    expect(sessionReadDecision({ data: { session: null }, error: { message: "refresh failed" } })).toBe("auth-error");
    expect((await readProgress(async () => { throw new Error("auth-error"); })).status).toBe("error");
    expect(name).toBeTruthy();
  });
});

describe("legacy rows", () => {
  const catalogs = {
    bankKnown: true,
    builtinIds: [7],
    bankIds: [],
    dbCases: [{ id: 7, cat: "Physiological Adaptation", steps: [{}, {}, {}] }],
  };
  it("names a bundled case step and a database case step when each id is in one catalog", () => {
    const bundled = classifyLog([{ id: 101, cat: "Physiological Adaptation", diff: 3, correct: true }], catalogs)[0];
    expect(bundled.key).toBe("case:case-sepsis-1");
    expect(bundled.unclassified).toBe(false);
    const db = classifyLog([{ id: 50072, cat: "Physiological Adaptation", diff: 3, correct: true }], catalogs)[0];
    expect(db.key).toBe("case:case-db7-2");
    const dbQuestion = { id: "case-db7-2", source: "case", cat: "Physiological Adaptation", diff: 3, stem: STEM };
    expect(live({ ...blank(), log: [db] }, dbQuestion, true).xp).toBe(0);
    expect(live({ ...blank(), log: [bundled] }, caseQ, true).xp).toBe(0);
  });
  it("leaves an id unclassified when it is in two catalogs or in none", () => {
    const both = resolveLegacyRow({ id: 7 }, { ...catalogs, bankIds: [7] });
    expect(both).toBeNull();
    const tagged = classifyLog([{ id: 7, cat: "Pharmacology", diff: 2, correct: true }], { ...catalogs, bankIds: [7] })[0];
    expect(tagged.unclassified).toBe(true);
    const named = classifyLog([{ id: 7, cat: "Pharmacology", diff: 2, correct: false }], {
      ...catalogs,
      bankIds: [7],
      builtinCats: { 7: "Pharmacology" },
      bankCats: { 7: "Safety and Infection Control" },
    })[0];
    expect(named.key).toBe("builtin:7");
    expect(named.unclassified).toBe(false);
    expect(tagged.key).toBeNull();
    const none = classifyLog([{ id: 404, cat: "Pharmacology", diff: 3, correct: true }], catalogs)[0];
    expect(none.unclassified).toBe(true);
    const collided = classifyLog([{ id: 101, cat: "Physiological Adaptation", diff: 3, correct: true }], { ...catalogs, bankIds: [101] })[0];
    expect(collided.unclassified).toBe(true);
    const fresh = live({ ...blank(), log: [tagged] }, builtin, true);
    expect(fresh.xp).toBe(20);
    expect(fresh.log).toHaveLength(2);
  });
  it("does not rename an answer that was recorded with its source", () => {
    const row = { id: 7, source: "builtin", key: "builtin:7", origin: "recorded", correct: true };
    const out = classifyLog([row], { ...catalogs, bankIds: [7] })[0];
    expect(out).toBe(row);
    expect(out.key).toBe("builtin:7");
  });
  it("does not name anything before the bank catalog has been read", () => {
    const early = classifyLog([{ id: 101, cat: "Physiological Adaptation", correct: true }], { ...catalogs, bankKnown: false })[0];
    expect(early.unclassified).toBe(true);
  });
});

describe("review, restore, and import use the canonical key", () => {
  it("a missed loaded bank question is in Review Misses and then in Today", () => {
    const raw = { id: 42, cat: "Pharmacology", diff: 2, stem: "Which lab value does the nurse report for this bank item?" };
    const q = stampCatalogQuestion(raw, []);
    expect(questionIdentity(q)).toBe("bank:42");
    const missed = applyAnswer(blank(), { q, correct: false, ms: 9000, today: "2026-01-15" }).state;
    expect(missed.missSchedule["bank:42"].due).toBe("2026-01-16");
    expect(missed.daily).toEqual({ day: TODAY, answered: 0 });
    const review = reviewPools([q], missed.log, missed.missSchedule, "2026-01-15");
    expect(review.misses.map(questionIdentity)).toEqual(["bank:42"]);
    expect(review.review.map(questionIdentity)).toEqual(["bank:42"]);
    expect(sessionPool([q], {
      log: missed.log, schedule: missed.missSchedule, fresh: [], mode: "review", today: "2026-01-15",
    }).map(questionIdentity)).toEqual(["bank:42"]);
    expect(todayPool([q], missed.log, missed.missSchedule, [], "2026-01-15").map(questionIdentity)).toEqual([]);
    const dueToday = todayPool([q], missed.log, missed.missSchedule, [], "2026-01-16");
    expect(dueToday.map(questionIdentity)).toEqual(["bank:42"]);
    expect(sessionPool([q], {
      log: missed.log, schedule: missed.missSchedule, fresh: [], mode: "today", today: "2026-01-16",
    }).map(questionIdentity)).toEqual(["bank:42"]);
    expect(reviewPools([raw], missed.log, missed.missSchedule, "2026-01-16").review).toEqual([]);
  });

  it("Back restores the bundled stem when a bank question shares the number", () => {
    const bundled = { id: 7, stem: "BUNDLED STEM about the bundled client.", cat: "Pharmacology", diff: 2, type: "mc" };
    const stamped = stampCatalogQuestion(bundled, [bundled]);
    const bankQ = stampCatalogQuestion({ id: 7, stem: "BANK STEM about a different client.", cat: "Pharmacology", diff: 2, type: "mc" }, [bundled]);
    expect(questionIdentity(stamped)).toBe("builtin:7");
    expect(questionIdentity(bankQ)).toBe("bank:7");
    const log = [{ id: 7, key: "builtin:7", source: "builtin", correct: false }];
    const list = expandTrialQuestions([bankQ], log, [stamped]);
    const nav = goBack(appendQuestion(appendQuestion(emptyNav(), questionIdentity(stamped)), questionIdentity(bankQ)));
    expect(present(nav).id).toBe("builtin:7");
    expect(questionByIdentity(list, present(nav).id).stem).toBe(stamped.stem);
    expect(questionByIdentity(list, "bank:7").stem).toBe(bankQ.stem);
    expect(unseenQuestions(list, [{ id: 7, key: "builtin:7", source: "builtin", correct: true }]).map(questionIdentity)).toEqual(["bank:7"]);
    expect(sessionPool(list, {
      log: [], schedule: {}, fresh: list, mode: "new", held: ["builtin:7"],
    }).map(questionIdentity)).toEqual(["bank:7"]);
    expect(itemRating(stamped, { 7: { rating: 2000 } })).toBe(1300);
    expect(itemRating(bankQ, { 7: { rating: 2000 } })).toBe(2000);
  });

  it("a new account imports the trial through the live answer function, in order", () => {
    const guest = trialOf(builtin, [false, true]);
    const merged = mergeGuestIntoBlob(blank(), guest, { today: TODAY, now: Date.now() }).blob;
    const liveOrder = live(live(blank(), builtin, false), builtin, true);
    expect(merged.log.map((row) => row.key)).toEqual(["builtin:7", "builtin:7"]);
    expect(merged.xp).toBe(liveOrder.xp);
    expect(merged.ability.Pharmacology.n).toBe(liveOrder.ability.Pharmacology.n);
    expect(merged.ability.Pharmacology.theta).toBe(liveOrder.ability.Pharmacology.theta);
    expect(merged.streak.count).toBe(liveOrder.streak.count);
    expect(merged.missSchedule["builtin:7"].interval).toBe(liveOrder.missSchedule["builtin:7"].interval);
  });

  it("an account with history keeps its rows, ability, and streak", () => {
    const account = live(blank(), builtin, true);
    account.daily = { day: TODAY, answered: 8 };
    const ability = account.ability;
    const streak = account.streak;
    const yesterday = "2026-11-23";
    const guest = {
      ...emptyGuest(Date.now() - 86400000, yesterday),
      lastAt: Date.now(),
      log: [
        { id: 7, key: "builtin:7", source: "builtin", cat: "Pharmacology", diff: 2, correct: false, day: yesterday, attempt: "old-7" },
        { id: 8, key: "builtin:8", source: "builtin", cat: "Pharmacology", diff: 2, correct: false, day: yesterday, attempt: "old-8" },
        { id: 9, key: "builtin:9", source: "builtin", cat: "Pharmacology", diff: 1, correct: true, day: yesterday, attempt: "old-9" },
      ],
    };
    const merged = mergeGuestIntoBlob(account, guest, { today: TODAY, now: Date.now() });
    expect(merged.summary).toBeNull();
    expect(merged.blob).toBe(account);
    expect(merged.blob.ability).toEqual(ability);
    expect(merged.blob.streak).toEqual(streak);
    expect(merged.blob.daily).toEqual({ day: TODAY, answered: 8 });
    expect(merged.blob.log).toEqual(account.log);
    expect(merged.blob.missSchedule["builtin:8"]).toBeUndefined();
    expect(merged.blob.xp).toBe(account.xp);
  });

  it("a legacy miss waits for classification, then a correction pays 5 and a repeat pays nothing", () => {
    const q = stampCatalogQuestion({ id: 42, cat: "Pharmacology", diff: 2, stem: "Loaded bank stem." }, []);
    const log = [{ id: 42, cat: "Pharmacology", diff: 2, correct: false }];
    const schedule = { 42: { interval: 1, due: "2026-01-16" } };
    expect(settledResult(q, log, [q]).state).toBe("pending");
    expect(reviewPools([q], log, schedule, "2026-01-16").review.map((item) => item.id)).toEqual(["unresolved:42"]);
    expect(unseenQuestions([q], log)).toEqual([]);
    expect(schedule[42]).toEqual({ interval: 1, due: "2026-01-16" });
    expect(schedule["bank:42"]).toBeUndefined();
    const catalogs = { bankKnown: true, builtinIds: [], bankIds: [42], bankCats: { 42: "Pharmacology" }, dbCases: [] };
    const named = classifyLog(log, catalogs);
    expect(named[0].key).toBe("bank:42");
    const moved = rekeySchedule(schedule, log, named);
    expect(moved["bank:42"]).toEqual(schedule[42]);
    expect(moved[42]).toBeUndefined();
    const fixed = applyAnswer({ ...blank(), log: named, missSchedule: moved, ability: emptyAbility(["Pharmacology"]) }, {
      q, correct: true, ms: 9000, today: "2026-01-16", attempt: "fix-42",
    });
    expect(fixed.result.xp).toBe(REVIEW_FIX_BONUS);
    const again = applyAnswer(fixed.state, { q, correct: true, ms: 9000, today: "2026-01-16", attempt: "repeat-42" });
    expect(again.result.xp).toBe(0);
    const caseRow = { id: 101, source: "case", key: "case:case-sepsis-1", cat: "Physiological Adaptation", correct: false };
    const bank101 = stampCatalogQuestion({ id: 101, stem: "Bank 101.", cat: "Pharmacology", diff: 2 }, []);
    const caseSchedule = { 101: { interval: 1, due: "2026-01-16" } };
    expect(scheduleEntry(bank101, caseSchedule, [bank101], [caseRow])).toBeNull();
    expect(reviewPools([bank101], [caseRow], caseSchedule, "2026-01-16").review).toEqual([]);
  });

  it("does not rebuild ability over legacy rows that have no key", () => {
    const account = {
      ...blank(),
      ability: { ...blank().ability, "Management of Care": { theta: 1450, n: 100 } },
      log: [{ id: 3, cat: "Management of Care", diff: 2, correct: true }],
    };
    const imported = applyAnswer(account, {
      q: builtin, correct: false, ms: 9000, today: "2026-11-23", at: 1_000, attempt: "older",
    }).state;
    expect(imported.ability["Management of Care"]).toEqual({ theta: 1450, n: 100 });
    expect(imported.ability.Pharmacology.n).toBe(1);
  });

  it("does not treat an unclassified case row as the bank question with the same number", () => {
    const bankQ = stampCatalogQuestion({ id: 101, stem: "Bank stem.", cat: "Pharmacology", diff: 2 }, []);
    const log = [{ id: 101, cat: "Physiological Adaptation", correct: false, unclassified: true, key: null }];
    expect(settledResult(bankQ, log, [bankQ]).state).toBe("none");
    expect(reviewPools([bankQ], log, { 101: { interval: 1, due: "2026-01-16" } }, "2026-01-16").review.map((item) => item.id)).toEqual(["unresolved:101"]);
    expect(unseenQuestions([bankQ], log)).toEqual([bankQ]);
    const bundled = stampCatalogQuestion({ id: 101, stem: "Bundled 101.", cat: "Pharmacology", diff: 2 }, [{ id: 101, stem: "Bundled 101." }]);
    expect(reviewPools([bankQ, bundled], log, { 101: { interval: 1, due: "2026-01-16" } }, "2026-01-16").review.map((item) => item.id)).toEqual(["unresolved:101"]);
    expect(unseenQuestions([bankQ, bundled], log)).toEqual([]);
  });

  it("a correct review of an ambiguous miss advances that question's schedule", () => {
    const q = stampCatalogQuestion({ id: 7, stem: "Bank stem.", cat: "Pharmacology", diff: 2 }, []);
    const state = {
      ...blank(),
      log: [{ id: 7, unclassified: true, key: null, cat: "Pharmacology", diff: 2, correct: false }],
      missSchedule: { 7: { interval: 1, due: TODAY } },
    };
    const next = applyAnswer(state, { q, correct: true, ms: 9000, today: TODAY, attempt: "review-bank" }).state;
    expect(next.missSchedule[7]).toEqual({ interval: 1, due: TODAY });
    expect(next.missSchedule["bank:7"]).toBeUndefined();
    expect(reviewPools([q], next.log, next.missSchedule, TODAY).review.map((item) => item.id)).toEqual(["unresolved:7"]);
  });

  it("builds review pools from one pass over a large bank and history", () => {
    const questions = Array.from({ length: 3000 }, (_, i) => ({ id: i + 1, source: "bank", key: `bank:${i + 1}`, cat: "Pharmacology", diff: 1, stem: `stem ${i}` }));
    const log = questions.map((q, i) => ({ id: q.id, key: q.key, source: "bank", cat: q.cat, correct: i !== 10, day: TODAY }));
    const started = performance.now();
    const pools = reviewPools(questions, log, {}, TODAY);
    unseenQuestions(questions, log);
    todayPool(questions, log, {}, [], TODAY);
    expect(performance.now() - started).toBeLessThan(250);
    expect(pools.misses.map(questionIdentity)).toEqual(["bank:11"]);
  });

  it("a numeric review date follows the latest built-in or bank answer, and stays put when that answer has no single home", () => {
    const before = [
      { id: 7, cat: "Pharmacology", correct: true },
      { id: 7, cat: "Management of Care", correct: false },
    ];
    const after = [
      { id: 7, source: "builtin", key: "builtin:7", cat: "Pharmacology", correct: true },
      { id: 7, source: "bank", key: "bank:7", cat: "Management of Care", correct: false },
    ];
    const schedule = { 7: { interval: 1, due: "2026-11-25" } };
    const moved = rekeySchedule(schedule, before, after);
    expect(moved["bank:7"]).toEqual(schedule[7]);
    expect(moved[7]).toBeUndefined();
    expect(moved["builtin:7"]).toBeUndefined();
    const ambiguous = rekeySchedule(schedule, before, [
      { id: 7, source: "builtin", key: "builtin:7", cat: "Pharmacology", correct: true },
      { id: 7, unclassified: true, key: null, cat: "Management of Care", correct: false },
    ]);
    expect(ambiguous[7]).toEqual(schedule[7]);
    expect(ambiguous["builtin:7"]).toBeUndefined();
    expect(ambiguous["bank:7"]).toBeUndefined();
  });

  it("naming an unscoped legacy miss gives it a key and a later correction pays the fix bonus", () => {
    const unscoped = { id: 7, cat: "Pharmacology", diff: 2, correct: false };
    const claimed = claimLegacyRow(unscoped, 7, { source: "builtin", key: "builtin:7" });
    expect(claimed).toMatchObject({ source: "builtin", key: "builtin:7", unclassified: false });
    expect(claimLegacyRow({ id: 7, source: "bank", key: "bank:7", correct: true }, 7, { source: "builtin", key: "builtin:7" }).key).toBe("bank:7");
    const shared = [
      { id: 7, cat: "Pharmacology", correct: true },
      { id: 7, cat: "Pharmacology", correct: false, unclassified: true },
    ];
    const namedOne = claimLegacyAt(shared, 1, { source: "builtin", key: "builtin:7" });
    expect(namedOne[0]).toEqual(shared[0]);
    expect(namedOne[1].key).toBe("builtin:7");
    const state = { ...blank(), log: [claimed], missSchedule: { "builtin:7": { interval: 1, due: TODAY } } };
    const next = applyAnswer(state, { q: builtin, correct: true, ms: 9000, today: TODAY, attempt: "fix-claimed" });
    expect(next.result.xp).toBe(REVIEW_FIX_BONUS);
    expect(reviewPools([builtin], next.state.log, next.state.missSchedule, TODAY).review.some((item) => item.unresolved)).toBe(false);
  });

  it("a correct review moves a legacy numeric schedule onto the canonical key", () => {
    const q = stampCatalogQuestion({ id: 42, cat: "Pharmacology", diff: 2, stem: "Loaded bank stem." }, []);
    const state = {
      ...blank(),
      log: [{ id: 42, cat: "Pharmacology", diff: 2, correct: false }],
      missSchedule: { 42: { interval: 1, due: TODAY } },
    };
    const next = applyAnswer(state, { q, correct: true, ms: 9000, today: TODAY, attempt: "fix" }).state;
    expect(next.missSchedule[42]).toBeUndefined();
    expect(next.missSchedule["bank:42"].interval).toBe(3);
    expect(next.missSchedule["bank:42"].due > TODAY).toBe(true);
  });

  it("does not move a bank review date onto the built-in question with the same number", () => {
    const state = {
      ...blank(),
      log: [{ id: 7, source: "bank", key: "bank:7", cat: "Pharmacology", diff: 2, correct: false }],
      missSchedule: { 7: { interval: 1, due: "2026-11-20" }, "bank:7": { interval: 1, due: "2026-11-20" } },
    };
    const next = applyAnswer(state, { q: builtin, correct: true, ms: 9000, today: TODAY, attempt: "builtin-correct" }).state;
    expect(next.missSchedule["builtin:7"]).toBeUndefined();
    expect(next.missSchedule["bank:7"].due).toBe("2026-11-20");
    expect(next.missSchedule[7].due).toBe("2026-11-20");
  });

  it("a shielded gap is not counted as another studied day", () => {
    const monday = applyAnswer(blank(), {
      q: { ...builtin, id: 1 }, correct: true, ms: 9000, today: "2026-11-23", attempt: "mon",
    }).state;
    expect(monday.streak).toMatchObject({ count: 1, lastDay: "2026-11-23" });
    const wednesday = applyAnswer(monday, {
      q: { ...builtin, id: 2 }, correct: true, ms: 9000, today: "2026-11-25", attempt: "wed",
    }).state;
    expect(wednesday.streak).toMatchObject({ count: 2, lastDay: "2026-11-25", shield: false });
  });

  it("two answers scored before the next render both stay on the book", () => {
    const holder = { current: blank() };
    const first = { id: 1, source: "builtin", cat: "Pharmacology", diff: 2, stem: STEM };
    const second = { id: 2, source: "builtin", cat: "Pharmacology", diff: 1, stem: `${STEM} second` };
    commitLiveAnswer(holder, { q: first, correct: true, ms: 9000, today: TODAY, attempt: "a" });
    commitLiveAnswer(holder, { q: second, correct: true, ms: 9000, today: TODAY, attempt: "b" });
    expect(holder.current.log.map((row) => row.key)).toEqual(["builtin:1", "builtin:2"]);
    expect(holder.current.xp).toBe(30);
    expect(holder.current.ability.Pharmacology.n).toBe(2);
    expect(holder.current.daily).toEqual({ day: TODAY, answered: 2 });
  });

  it("a bank row keeps its calibration when its stem matches a bundled question", () => {
    const bundled = { id: 7, stem: STEM, cat: "Pharmacology", diff: 2 };
    const loaded = stampLoadedCatalog([{ ...bundled, elo: 1600 }], "bank");
    expect(loaded[0].source).toBe("bank");
    expect(loaded[0].key).toBe("bank:7");
    expect(itemRating(loaded[0], { 7: { rating: 1600 } })).toBe(1600);
    const fallback = stampLoadedCatalog([bundled], "builtin");
    expect(fallback[0].source).toBe("builtin");
    expect(itemRating(fallback[0], { 7: { rating: 1600 } })).toBe(1300);
  });

  it("Today and Review Misses both restore a bundled calculation miss after the bank loads", async () => {
    const { CALC_SAMPLES } = await import("../src/ngn-samples.js");
    const { expandTrialQuestions } = await import("../src/question-review.js");
    const calc = CALC_SAMPLES[0];
    const stamped = stampCatalogQuestion({ ...calc, source: "builtin" });
    const log = [{ id: calc.id, key: stamped.key, source: "builtin", cat: calc.cat, diff: calc.diff, correct: false, day: TODAY }];
    const bank = stampLoadedCatalog([{ id: 50, stem: "A different bank stem.", cat: "Pharmacology", diff: 1 }], "bank");
    const review = reviewPools(expandTrialQuestions(bank, log, [calc, ...bank]), log, {}, TODAY);
    const narrow = reviewPools(expandTrialQuestions(bank, log, bank), log, {}, TODAY);
    expect(review.misses.map(questionIdentity)).toContain(stamped.key);
    expect(narrow.misses.map(questionIdentity)).not.toContain(stamped.key);
  });
});

function trialOf(q, outcomes) {
  let guest = emptyGuest(Date.now(), TODAY);
  for (const correct of outcomes) {
    const answered = guestAnswer(guest, q, correct, { ms: 9000, today: TODAY });
    guest = { ...answered.guest, source: q.source };
  }
  if (q.source !== "builtin") {
    guest = { ...guest, log: guest.log.map((row) => ({ ...row, source: q.source, key: canonicalKey(q.source, q.id) })) };
  }
  return guest;
}

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
