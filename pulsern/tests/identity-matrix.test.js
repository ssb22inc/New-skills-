/* Question identity is one key: builtin:7 is not bank:7.
   Legacy numbers are named only when exactly one catalog contains
   them. Import and a live answer share applyAnswer. */
import { describe, it, expect } from "vitest";
import { applyAnswer } from "../src/answer-apply.js";
import { emptyGuest, guestAnswer, mergeGuestIntoBlob, holdGuestTrial, peekHeldGuest, releaseHeldGuest, GUEST_KEY, GUEST_HOLD_KEY } from "../src/guest.js";
import { classifyLog, resolveLegacyRow, canonicalKey } from "../src/question-key.js";
import { stampCatalogQuestion, questionIdentity } from "../src/question-identity.js";
import { reviewPools, todayPool, sessionPool, unseenQuestions, questionByIdentity, latestResults, expandTrialQuestions } from "../src/question-review.js";
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

  it("an older trial miss does not replace today's count or today's correct answer", () => {
    const account = live(blank(), builtin, true);
    account.daily = { day: TODAY, answered: 8 };
    account.run = 4;
    const yesterday = "2026-11-23";
    const guest = {
      ...emptyGuest(Date.now() - 86400000, yesterday),
      lastAt: Date.now(),
      log: [{
        id: 7, key: "builtin:7", source: "builtin", cat: "Pharmacology", diff: 2, correct: false,
        day: yesterday, attempt: `${Date.now() - 86400000}:0`,
      }],
    };
    const merged = mergeGuestIntoBlob(account, guest, { today: TODAY, now: Date.now() }).blob;
    expect(merged.daily).toEqual({ day: TODAY, answered: 8 });
    expect(merged.log.map((row) => row.correct)).toEqual([false, true]);
    expect(latestResults(merged.log)["builtin:7"]).toBe(true);
    expect(merged.missSchedule["builtin:7"]).toBeUndefined();
    expect(merged.rewards.days[TODAY]).toMatchObject({ q: 1, xp: account.xp });
    expect(merged.xp).toBe(account.xp);
    expect(merged.run).toBe(4);
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
