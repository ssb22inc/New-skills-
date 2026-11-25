/* One regression test (or more) for every REVIEW-2 blocker and major.
   Browser-level checks for M2 and M6 live in progress-load-browser.test.js;
   the guest flow in guest-browser.test.js. */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  answerXp, bumpDay, emptyRewards, questionsOn, shiftStatus, weekRounds, maybeGrantCover, careerStatus, CAREER,
  cardXp, CARD_MIN_GRADE_MS, advanceStreak, comboFor, SHORT_CAT,
} from "../src/rewards.js";
import { emptyGuest, guestAnswer, guestFresh, GUEST_TTL_DAYS } from "../src/guest.js";
import { readProgress, guestHandoff, sessionReadDecision } from "../src/progress-load.js";
import { migrateBlob } from "../src/state.js";
import { hapticsAllowed, GUEST_PREFS, buzz } from "../src/effects.js";

const CATS = ["Management of Care", "Safety & Infection Control", "Health Promotion & Maintenance", "Psychosocial Integrity", "Basic Care & Comfort", "Pharmacology", "Reduction of Risk", "Physiological Adaptation"];
const q = { id: 7, source: "builtin", key: "builtin:7", cat: "Pharmacology", diff: 2, stem: "word ".repeat(30) };
const SLOW = 1e5;

describe("B1: product capture expects the shipped Today screen", () => {
  it("asserts the shift card text, not the replaced 'Today's goal' card", () => {
    const capture = fs.readFileSync("ops/capture-product-screenshots.mjs", "utf8");
    const line = capture.split("\n").find((l) => l.includes("pulsern-today-dashboard.png"));
    expect(line).toContain("Today's shift");
    expect(line).toContain("Clinical career");
    expect(line).toContain("Student Nurse");
    expect(line).toContain("Day 0 of 7");
    expect(line).not.toContain("Today's goal");
    expect(fs.readFileSync("src/rewards-ui.jsx", "utf8")).toContain('<p className="eyebrow">Today\'s shift</p>');
  });
});

describe("M1: missing on purpose never pays", () => {
  const play = (pattern) => {
    let log = [], xp = 0;
    for (const c of pattern) { xp += answerXp({ q, correct: c, ms: SLOW, log }).xp; log.push({ id: q.id, key: q.key, source: q.source, cat: q.cat, correct: c }); }
    return xp;
  };
  const firstTry = answerXp({ q, correct: true, ms: SLOW, log: [] }).xp;
  it("wrong then right pays less than right the first time", () => {
    expect(firstTry).toBe(20);
    expect(play([false, true])).toBeLessThan(firstTry);
    expect(play([false, false, false, true])).toBeLessThan(firstTry);
  });
  it("repeated wrong/right cycles on one question cannot farm XP", () => {
    expect(play([false, true, false, true, false, true, false, true, false, true])).toBe(5);
    expect(play([true, false, true, false, true])).toBe(firstTry);
    expect(play([true, true, true])).toBe(firstTry);
  });
  it("string and number ids are the same question", () => {
    expect(answerXp({ q, correct: true, ms: SLOW, log: [{ id: "7", source: "builtin", key: "builtin:7", correct: false }, { id: 7, source: "builtin", key: "builtin:7", correct: true }] }).xp).toBe(0);
  });
});

describe("M2: trial answers never merge silently into an existing account", () => {
  const started = Date.parse("2026-11-23T15:00:00Z");
  const g = { ...emptyGuest(started, "2026-11-23"), startedAt: started, lastAt: started + 60_000, log: [{ id: 1, cat: "Pharmacology", diff: 1, correct: true }] };
  const now = started + 3600_000;
  it("imports whenever the account has no saved answers, including an older account", () => {
    expect(guestHandoff({ guest: g, hasAnswers: false, now })).toBe("merge");
  });
  it("keeps the trial when the account already has answer history", () => {
    expect(guestHandoff({ guest: g, hasAnswers: true, now })).toBe("keep");
  });
  it("does nothing without trial answers, and drops an expired trial", () => {
    expect(guestHandoff({ guest: null, now })).toBe("none");
    expect(guestHandoff({ guest: { ...g, log: [] }, now })).toBe("none");
    expect(guestHandoff({ guest: g, accountCreatedAt: null, now: started + (GUEST_TTL_DAYS + 1) * 86400000 })).toBe("expired");
  });
});

describe("M3: shift Assessments count questions only", () => {
  const day = "2026-11-23";
  it("flashcard grades do not count as questions; undo does not double count", () => {
    let r = emptyRewards();
    for (let i = 0; i < 8; i++) r = bumpDay(r, day, { cards: 1 });
    expect(questionsOn(r, day)).toBe(0);
    expect(shiftStatus({ day: r.days[day], answeredToday: questionsOn(r, day) }).tasks[0].done).toBe(false);
    r = bumpDay(r, day, { cards: -1 }); r = bumpDay(r, day, { cards: 1 }); // grade → undo → grade
    expect(r.days[day].cards).toBe(8);
  });
  it("the shift, the weekly rounds and the cover grant read the same number", () => {
    let r = emptyRewards();
    const mon = "2026-11-16";
    for (let i = 0; i < 5; i++) for (let k = 0; k < 8; k++) r = bumpDay(r, `2026-11-${16 + i}`, { q: 1, ok: 1 });
    const fri = "2026-11-20";
    expect(shiftStatus({ day: r.days[fri], answeredToday: questionsOn(r, fri) }).tasks[0].done).toBe(true);
    expect(weekRounds(r, fri).shifts).toBe(5);
    expect(maybeGrantCover(r, fri).granted).toBe(true);
    expect(weekRounds(r, fri).monday).toBe(mon);
  });
});

describe("M4: idle trials never lose answers the student just gave", () => {
  it("an old tab answered today is fresh, and the clock starts at the first answer", () => {
    let g = emptyGuest(Date.now() - 30 * 86400000, "2026-10-24");
    g = guestAnswer(g, { id: 1, cat: "Pharmacology", diff: 1, stem: "a b c" }, true, { ms: 9000, today: "2026-11-23" }).guest;
    expect(guestFresh(g)).toBe(true);
    expect(g.day).toBe("2026-11-23");
  });
  it("expiry counts from the last answer, matching the save-screen copy", () => {
    const now = Date.now();
    const g = { ...emptyGuest(now - 20 * 86400000), log: [{ id: 1, cat: "Pharmacology", diff: 1, correct: true }], lastAt: now - 6 * 86400000 };
    expect(guestFresh(g, now)).toBe(true);
    expect(guestFresh({ ...g, lastAt: now - 8 * 86400000 }, now)).toBe(false);
    expect(fs.readFileSync("src/guest.jsx", "utf8")).toContain("7 days after your last answer");
  });
});

describe("M5: existing students keep their title (what the screenshots must show)", () => {
  it("1180 XP with no stored rank migrates to Nurse Educator, never Preceptor", () => {
    const s = migrateBlob({ xp: 1180, log: [], rewards: { rankHigh: null } }, CATS);
    const c = careerStatus({ xp: s.xp, log: s.log, cats: CATS, rankHigh: s.rewards.rankHigh });
    expect(CAREER[c.index].name).toBe("Nurse Educator");
  });
  it("a blob with no rewards key at all also keeps the legacy title", () => {
    const s = migrateBlob({ xp: 950, log: [] }, CATS);
    expect(CAREER[careerStatus({ xp: s.xp, log: s.log, cats: CATS, rankHigh: s.rewards.rankHigh }).index].name).toBe("Nurse Educator");
  });
});

describe("M6: a failed read is never a new account", () => {
  it("readProgress separates error, new and ok", async () => {
    expect(sessionReadDecision({ data: { session: null }, error: { message: "refresh failed" } })).toBe("auth-error");
    expect(sessionReadDecision({ data: { session: null }, error: null })).toBe("signed-out");
    expect(sessionReadDecision({ data: { session: { user: { id: "user-1" } } }, error: null })).toBe("read");
    const get = fs.readFileSync("src/App.jsx", "utf8");
    const reader = get.slice(get.indexOf("async get(key)"), get.indexOf("async set(key"));
    expect(reader).toContain('decision !== "read"');
    expect(reader).not.toMatch(/if \(!session\) return null/);
    expect((await readProgress(async () => { throw new Error("auth-error"); })).status).toBe("error");
    expect((await readProgress(async () => { throw new Error("network"); })).status).toBe("error");
    expect((await readProgress(async () => null)).status).toBe("new");
    expect((await readProgress(async () => "{}")).status).toBe("ok");
  });
  it("the store adapter throws on a Supabase read error instead of returning null", () => {
    const app = fs.readFileSync("src/App.jsx", "utf8");
    const get = app.slice(app.indexOf("async get(key)"), app.indexOf("async set(key"));
    expect(get).toMatch(/if \(error\) throw/);
    expect(get).not.toMatch(/error \|\| !data\) return null/);
  });
});

describe("minors with logic", () => {
  it("m2: flashcard XP needs time after the flip", () => {
    expect(cardXp("easy", 200)).toBe(0);
    expect(cardXp("good", CARD_MIN_GRADE_MS - 1)).toBe(0);
    expect(cardXp("good", CARD_MIN_GRADE_MS)).toBe(5);
    expect(cardXp("easy", 4000)).toBe(8);
    expect(cardXp("again", 4000)).toBe(0);
  });
  it("m8: a future lastDay keeps the streak", () => {
    const r = advanceStreak({ count: 12, lastDay: "2026-11-24", shield: true }, emptyRewards(), "2026-11-23");
    expect(r.streak.count).toBe(12);
    expect(r.event).toBe("same");
  });
  it("m9: guests get no haptics, and OS reduced motion turns haptics off", () => {
    const nav = { vibrate: () => true };
    const reduced = { matchMedia: () => ({ matches: true }) };
    const normal = { matchMedia: () => ({ matches: false }) };
    expect(hapticsAllowed(GUEST_PREFS, nav, normal)).toBe(false);
    expect(hapticsAllowed({ haptics: true }, nav, reduced)).toBe(false);
    expect(hapticsAllowed({ haptics: true }, nav, normal)).toBe(true);
    expect(buzz("correct", { haptics: true, reduceFx: true }, nav, normal)).toBe(false);
  });
  it("m12: no overclaiming combo label; 2026 category name on badges", () => {
    expect(comboFor(10).label).not.toMatch(/clinical judgment|locked in/i);
    expect(SHORT_CAT["Safety & Infection Control"]).toBe("Safety and Infection Prevention and Control");
  });
});

describe("m3: case-study steps", () => {
  it("log string ids outside the numeric bank id space and pass answer time", () => {
    const app = fs.readFileSync("src/App.jsx", "utf8");
    expect(app).toContain("caseStepIds({ dbId: cs.dbId ?? null, key: cs.key ?? null");
    expect(app).toMatch(/record\(\{ id: stepId[^\n]*ms: Date\.now\(\) - stepShownAt\.current/);
    expect(answerXp({ q: { id: "case-Sepsis-0", diff: 3, stem: "Which findings require immediate follow-up? Select all that apply." }, correct: true, ms: 400, log: [] }).reason).toBe("too-fast");
  });
});
