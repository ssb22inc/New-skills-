/* Reward rules (src/rewards.js): XP follows learning, never clicking;
   badges and ranks need accuracy, not volume; the streak shield and shift
   covers protect missed days; milestones fire once. */
import { describe, it, expect } from "vitest";
import {
  answerXp, minThinkMs, answerCountsForRun, xpNote, comboFor, bumpDay, reverseCardDay, shiftStatus, shiftCompleteNote, todayQuestionCount, weekRounds, maybeGrantCover, advanceStreak, streakDayCounted, streakPillLabel,
  categoryMastery, badgeBoard, careerStatus, legacyRankIndex, detectMoments, markMomentsSeen, sessionRecap,
  emptyRewards, migrateRewards, daysBetween, shiftDay, mondayOf, TIERS, CAREER, REVIEW_FIX_BONUS, MAX_COVERS, TEST_PLAN,
} from "../src/rewards.js";

const CATS = ["Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance", "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology", "Reduction of Risk", "Physiological Adaptation"];
const q = { id: 7, source: "builtin", key: "builtin:7", cat: "Pharmacology", diff: 2, stem: "A client receiving digoxin reports nausea and yellow vision. Which action should the nurse take first?" };
// evenly spread, so any recent window has the same accuracy as the whole
const acc = (cat, n, pct) => Array.from({ length: n }, (_, i) => ({ id: `${cat}-${i}`, cat, diff: 2, correct: Math.floor(((i + 1) * pct) / 100) > Math.floor((i * pct) / 100) }));

describe("streak day", () => {
  it("lets the same calendar day count again once the session mark is cleared", () => {
    const today = "2026-11-24";
    expect(streakDayCounted({ lastDay: today }, today, today)).toBe(true);
    expect(streakDayCounted({ lastDay: null }, today, today)).toBe(true);
    expect(streakDayCounted({ lastDay: null }, null, today)).toBe(false);
  });
});

describe("answer XP", () => {
  it("pays 10 × difficulty for a considered first correct answer", () => {
    expect(answerXp({ q, correct: true, ms: 9000, log: [] })).toMatchObject({ xp: 20, reason: "correct" });
  });
  it("pays nothing for a skip or a wrong answer", () => {
    expect(answerXp({ q, correct: true, skipped: true }).xp).toBe(0);
    expect(answerXp({ q, correct: false, ms: 9000 }).xp).toBe(0);
  });
  it("pays nothing for a rapid tap faster than the stem can be read", () => {
    const min = minThinkMs(q);
    expect(min).toBeGreaterThanOrEqual(2500);
    expect(min).toBeLessThanOrEqual(6000);
    expect(answerXp({ q, correct: true, ms: min - 1, log: [] })).toMatchObject({ xp: 0, reason: "too-fast" });
    expect(answerXp({ q, correct: true, ms: min, log: [] }).xp).toBe(20);
    expect(xpNote({ reason: "too-fast", xp: 0 })).toMatch(/considered/);
  });
  it("pays nothing for repeating a question already answered correctly", () => {
    const log = [{ id: 7, source: "builtin", key: "builtin:7", cat: "Pharmacology", diff: 2, correct: true }];
    expect(answerXp({ q, correct: true, ms: 9000, log })).toMatchObject({ xp: 0, reason: "repeat" });
  });
  it("a rapid repeat still fails the reading-time floor for a run", () => {
    const log = [{ id: 7, source: "builtin", key: "builtin:7", cat: "Pharmacology", diff: 2, correct: true }];
    const ms = minThinkMs(q) - 1;
    expect(answerXp({ q, correct: true, ms, log }).reason).toBe("repeat");
    expect(answerCountsForRun({ correct: true, q, ms })).toBe(false);
    expect(answerCountsForRun({ correct: true, q, ms: minThinkMs(q) })).toBe(true);
  });
  it("adds a bonus for correcting an earlier miss", () => {
    const log = [{ id: 7, source: "builtin", key: "builtin:7", cat: "Pharmacology", diff: 2, correct: false }];
    expect(answerXp({ q, correct: true, ms: 9000, log })).toMatchObject({ xp: REVIEW_FIX_BONUS, reason: "fix", fix: true });
  });
  it("cannot be farmed: twenty rapid taps on known items earn 0", () => {
    let log = [{ id: 7, cat: "Pharmacology", diff: 2, correct: true }];
    let total = 0;
    for (let i = 0; i < 20; i++) { total += answerXp({ q, correct: true, ms: 400, log }).xp; log = [...log, { id: 7, cat: "Pharmacology", diff: 2, correct: true }]; }
    expect(total).toBe(0);
  });
});

describe("combos", () => {
  it("fires only at the step counts", () => {
    expect(comboFor(2)).toBeNull();
    expect(comboFor(3)).toMatchObject({ n: 3 });
    expect(comboFor(4)).toBeNull();
    expect(comboFor(10).label).toBe("Sustained focus");
    expect(comboFor(10).label).not.toMatch(/clinical judgment/i);
  });
});

describe("mastery badges (novice to expert)", () => {
  it("needs both volume and accuracy for each level", () => {
    expect(categoryMastery(acc("Pharmacology", 9, 100), "Pharmacology").tier).toBe(0); // 9 answers: not enough
    expect(categoryMastery(acc("Pharmacology", 10, 60), "Pharmacology").tier).toBe(1);
    expect(categoryMastery(acc("Pharmacology", 10, 50), "Pharmacology").tier).toBe(0); // accuracy too low
    expect(categoryMastery(acc("Pharmacology", 25, 72), "Pharmacology").tierName).toBe("Competent");
    expect(categoryMastery(acc("Pharmacology", 50, 80), "Pharmacology").tierName).toBe("Proficient");
    expect(categoryMastery(acc("Pharmacology", 120, 100), "Pharmacology").tierName).toBe("Expert");
  });
  it("uses the recent window, so volume with poor accuracy never reaches Expert", () => {
    const log = acc("Pharmacology", 400, 55);
    expect(categoryMastery(log, "Pharmacology").tier).toBe(0);
  });
  it("keeps an earned badge visible but flags it when recent accuracy slips", () => {
    const b = badgeBoard(acc("Pharmacology", 30, 40), CATS, { Pharmacology: 2 }).find((x) => x.cat === "Pharmacology");
    expect(b.earned).toBe(2);
    expect(b.slipping).toBe(true);
  });
  it("pins every badge to the NCLEX test plan", () => {
    for (const b of badgeBoard([], CATS)) expect(b.plan).toBe(TEST_PLAN[b.cat]);
    expect(TIERS.map((t) => t.name)).toEqual(["Novice", "Advanced Beginner", "Competent", "Proficient", "Expert"]);
  });
});

describe("career ladder", () => {
  it("starts at Student Nurse", () => {
    expect(careerStatus({ xp: 0, log: [], cats: CATS }).rank.name).toBe("Student Nurse");
  });
  it("does not promote on XP volume alone past New Grad RN", () => {
    const log = CATS.flatMap((c) => acc(c, 40, 50)); // 320 answers, 50% accuracy
    const st = careerStatus({ xp: 5000, log, cats: CATS });
    expect(st.index).toBeLessThanOrEqual(1);
    expect(st.reqs.find((r) => r.key === "acc").met).toBe(false);
  });
  it("promotes with accuracy and category mastery", () => {
    const log = CATS.flatMap((c) => acc(c, 30, 80)); // all 8 at Competent, 240 answers, 80%
    const st = careerStatus({ xp: 800, log, cats: CATS });
    expect(st.rank.name).toBe("Preceptor");
    expect(st.next.name).toBe("Charge Nurse");
  });
  it("never takes an earned rank away", () => {
    expect(careerStatus({ xp: 0, log: [], cats: CATS, rankHigh: 3 }).rank.name).toBe("Staff Nurse");
  });
  it("keeps a new account on the mastery ladder when rankHigh is 0", () => {
    const log = Array.from({ length: 5 }, (_, i) => ({ id: i, cat: "Pharmacology", diff: 2, correct: true }));
    const status = careerStatus({ xp: 100, log, cats: CATS, rankHigh: 0 });
    expect(status.rank.name).toBe("Student Nurse");
    expect(legacyRankIndex(100)).toBe(2);
  });
  it("maps old XP titles onto the ladder", () => {
    expect(CAREER[legacyRankIndex(80)].name).toBe("New Grad RN");
    expect(CAREER[legacyRankIndex(650)].name).toBe("Charge Nurse");
    expect(CAREER[legacyRankIndex(950)].name).toBe("Nurse Educator");
  });
  it("celebrates a promotion and a new badge once", () => {
    const log = acc("Pharmacology", 10, 100);
    const after = { career: careerStatus({ xp: 100, log: [...log, ...acc("Reduction of Risk", 10, 100)], cats: CATS }), board: badgeBoard(log, CATS) };
    const r = { ...emptyRewards(), rankHigh: 0 };
    const m = detectMoments({ before: after, after, rewards: r });
    expect(m.map((x) => x.kind).sort()).toEqual(["badge", "rank"]);
    const seen = markMomentsSeen(r, m);
    expect(detectMoments({ before: after, after, rewards: seen })).toEqual([]);
  });
});

describe("streak: shield, shift covers, milestones", () => {
  const r0 = emptyRewards();
  it("extends on consecutive days and ignores repeat days", () => {
    const a = advanceStreak({ count: 3, lastDay: "2026-11-22", shield: true }, r0, "2026-11-23");
    expect(a.streak.count).toBe(4);
    expect(advanceStreak(a.streak, a.rewards, "2026-11-23").event).toBe("same");
  });
  it("the shield absorbs one missed day, then is used", () => {
    const a = advanceStreak({ count: 5, lastDay: "2026-11-21", shield: true }, r0, "2026-11-23");
    expect(a).toMatchObject({ event: "shield" });
    expect(a.streak).toMatchObject({ count: 6, shield: false });
  });
  it("banked shift covers protect more missed days", () => {
    const r = { ...r0, covers: 2 };
    const a = advanceStreak({ count: 10, lastDay: "2026-11-19", shield: true }, r, "2026-11-23"); // 3 missed days
    expect(a.event).toBe("cover");
    expect(a.streak.count).toBe(11);
    expect(a.rewards.covers).toBe(0);
    expect(a.rewards.coverDays).toEqual(["2026-11-20", "2026-11-21", "2026-11-22"]);
  });
  it("restarts when the gap is bigger than shield + covers", () => {
    const a = advanceStreak({ count: 10, lastDay: "2026-11-18", shield: true }, { ...r0, covers: 1 }, "2026-11-23");
    expect(a.event).toBe("restart");
    expect(a.streak.count).toBe(1);
  });
  it("refills the shield every 7th day (existing rule)", () => {
    expect(advanceStreak({ count: 6, lastDay: "2026-11-22", shield: false }, r0, "2026-11-23").streak.shield).toBe(true);
  });
  it("fires the 7, 30 and 100 day milestones once each", () => {
    const a = advanceStreak({ count: 6, lastDay: "2026-11-22", shield: true }, r0, "2026-11-23");
    expect(a.milestone).toBe(7);
    const again = advanceStreak({ count: 6, lastDay: "2026-11-22", shield: true }, a.rewards, "2026-11-23");
    expect(again.milestone).toBeNull();
    expect(advanceStreak({ count: 29, lastDay: "2026-11-22", shield: true }, r0, "2026-11-23").milestone).toBe(30);
    expect(advanceStreak({ count: 99, lastDay: "2026-11-22", shield: true }, r0, "2026-11-23").milestone).toBe(100);
  });
  it("uses local calendar days across a DST change", () => {
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1);
    expect(daysBetween("2026-03-08", "2026-03-09")).toBe(1);
    expect(shiftDay("2026-11-30", 1)).toBe("2026-12-01");
    expect(mondayOf("2026-11-29")).toBe("2026-11-23");
  });
});

describe("Today's shift and weekly rounds", () => {
  it("has three learning tasks and needs real study to complete", () => {
    expect(shiftStatus({ day: null, answeredToday: 0, dueCount: 0, missesOpen: 0 }).complete).toBe(false);
    const s = shiftStatus({ day: { q: 8, cards: 3, fixes: 1 }, answeredToday: 8, dueCount: 0, missesOpen: 2 });
    expect(s.tasks.map((t) => t.key)).toEqual(["questions", "cards", "fix"]);
    expect(s.complete).toBe(true);
    expect(shiftStatus({ day: { q: 8, cards: 0, fixes: 0 }, answeredToday: 8, dueCount: 4, missesOpen: 2 }).done).toBe(1);
  });
  it("does not say every miss is corrected when more misses are still open", () => {
    const open = shiftCompleteNote({ missesOpen: 20 });
    expect(open).toMatch(/a miss was corrected/);
    expect(open).toMatch(/still waiting in review/);
    expect(open).not.toMatch(/your misses are corrected/);
    expect(shiftCompleteNote({ missesOpen: 0 })).toMatch(/your misses are corrected/);
  });
  it("does not report zero questions today for a legacy save that already studied", () => {
    const today = "2026-11-24";
    const legacy = todayQuestionCount({ rewards: emptyRewards(), daily: { day: today, answered: 8 }, today });
    expect(legacy).toEqual({ known: false, count: null });
    const shift = shiftStatus({ day: undefined, answeredToday: 0, questionsKnown: false, dueCount: 0, missesOpen: 2 });
    expect(shift.tasks[0].detail).toBe("Question count starts with this update");
    expect(shift.tasks[0].done).toBe(false);
    const after = todayQuestionCount({ rewards: bumpDay(emptyRewards(), today, { q: 1 }), daily: { day: today, answered: 8 }, today });
    expect(after).toEqual({ known: true, count: 1 });
  });
  it("earns one shift cover per week of 5 shifts, banked up to the cap", () => {
    let r = emptyRewards();
    for (const d of ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]) r = bumpDay(r, d, { q: 8, ok: 6 });
    expect(maybeGrantCover(r, "2026-11-26").granted).toBe(false);
    r = bumpDay(r, "2026-11-27", { q: 9, ok: 7 });
    const g = maybeGrantCover(r, "2026-11-27");
    expect(g.granted).toBe(true);
    expect(g.rewards.covers).toBe(1);
    expect(maybeGrantCover(g.rewards, "2026-11-28").rewards).toBe(g.rewards); // once per week
    const marked = markMomentsSeen(r, [{ kind: "rank", index: 2 }]);
    const both = maybeGrantCover(marked, "2026-11-27").rewards;
    expect(both.rankHigh).toBe(2);
    expect(both.covers).toBe(1);
    expect(both.coverWeeks).toContain("2026-11-23");
    const capped = maybeGrantCover({ ...r, covers: MAX_COVERS }, "2026-11-27");
    expect(capped.rewards.covers).toBe(MAX_COVERS);
    const wk = weekRounds(g.rewards, "2026-11-27");
    expect(wk.shifts).toBe(5);
    expect(wk.days[4].state).toBe("shift");
    expect(wk.days[6].state).toBe("future");
  });
  it("does not spend the week's cover grant while the bank is full, so a later spend can still bank it", () => {
    let r = emptyRewards();
    for (const d of ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]) r = bumpDay(r, d, { q: 8, ok: 6 });
    const monday = mondayOf("2026-11-27");
    const capped = maybeGrantCover({ ...r, covers: MAX_COVERS }, "2026-11-27");
    expect(capped.granted).toBe(false);
    expect(capped.rewards.covers).toBe(MAX_COVERS);
    expect(capped.rewards.coverWeeks).not.toContain(monday);
    const spent = { ...capped.rewards, covers: MAX_COVERS - 1 };
    const after = maybeGrantCover(spent, "2026-11-27");
    expect(after.granted).toBe(true);
    expect(after.rewards.covers).toBe(MAX_COVERS);
    expect(after.rewards.coverWeeks).toContain(monday);
  });
  it("labels the streak pill as the current day of the next milestone", () => {
    expect(streakPillLabel(0)).toBe("Day 0 of 7");
    expect(streakPillLabel(3)).toBe("Day 3 of 7");
    expect(streakPillLabel(7)).toBe("Day 7 of 30");
    expect(streakPillLabel(365)).toBe("Day 365");
  });
});

describe("session recap", () => {
  it("summarises accuracy, XP, improved categories and personal bests", () => {
    const before = acc("Pharmacology", 10, 50);
    const session = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, cat: "Pharmacology", diff: 2, correct: i < 7 }));
    const rc = sessionRecap({ start: { logLen: 10, xp: 100, at: 0, bestRun: 2, cards: 1 }, log: [...before, ...session], xp: 240, now: 9 * 60000, rewards: emptyRewards(), cardsToday: 6, dueCount: 0, nextDue: "2026-11-24", bestRun: 7 });
    expect(rc).toMatchObject({ n: 8, ok: 7, acc: 88, xp: 140, minutes: 9, cards: 5 });
    expect(rc.improved[0]).toMatchObject({ cat: "Pharmacology", before: 50 });
    expect(rc.bests.map((b) => b.key).sort()).toEqual(["run", "sessionAcc"]);
    expect(rc.nextBest.sessionAcc).toBe(88);
  });
  it("needs 8+ questions before a round accuracy can be a personal best", () => {
    const rc = sessionRecap({ start: { logLen: 0, xp: 0, at: 0, bestRun: 0 }, log: [{ id: 1, cat: "Pharmacology", correct: true }], xp: 10, now: 60000, rewards: emptyRewards(), bestRun: 1 });
    expect(rc.bests).toEqual([]);
  });
});

describe("persisted shape", () => {
  it("migrates junk and partial saves to safe defaults", () => {
    expect(migrateRewards(null)).toEqual(emptyRewards());
    const m = migrateRewards({ covers: 9, days: { bad: 1, "2026-11-23": { q: 3 } }, prefs: { sound: true } });
    expect(m.covers).toBe(MAX_COVERS);
    expect(Object.keys(m.days)).toEqual(["2026-11-23"]);
    expect(m.prefs).toEqual({ sound: true, haptics: true, reduceFx: false });
  });
  it("sound is off by default", () => {
    expect(emptyRewards().prefs.sound).toBe(false);
  });
  it("drops a rank or badge marker outside the real ladder", () => {
    const m = migrateRewards({ rankHigh: 99, badgesSeen: { Pharmacology: 5, Safety: 1, nope: "x" } });
    expect(m.rankHigh).toBeNull();
    expect(m.badgesSeen).toEqual({ Safety: 1 });
    expect(() => badgeBoard([], ["Pharmacology"], { Pharmacology: 5 })).not.toThrow();
    expect(badgeBoard([], ["Pharmacology"], { Pharmacology: 5 })[0].earnedName).toBe(TIERS[TIERS.length - 1].name);
    const career = careerStatus({ xp: 5000, log: [], cats: [], rankHigh: 99 });
    expect(career.rank).toBe(CAREER[0]);
    expect(career.rank.name).toBe("Student Nurse");
  });
  it("undo after midnight reverses the day the card was graded", () => {
    const graded = bumpDay(emptyRewards(), "2026-11-23", { cards: 1, xp: 5 });
    const undone = reverseCardDay(graded, "2026-11-23", 5);
    expect(undone.days["2026-11-23"]).toMatchObject({ cards: 0, xp: 0 });
    expect(undone.days["2026-11-24"]).toBeUndefined();
    expect(reverseCardDay(graded, "2026-11-24", 5)).toBe(graded);
  });
});
