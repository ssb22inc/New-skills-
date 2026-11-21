/* Back, Next, and Skip. A skip must not become a wrong answer: the log,
   the miss schedule, ability, XP, the correct streak, and the daily count
   stay as they were. The timed exam is a different screen and stays
   forward-only (one question at a time, no going back). */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  emptyNav, appendQuestion, saveDraft, markAnswered, canGoBack, goBack, present,
  forward, fallbackSkip, jumpToSkipped, skippedCount, currentEntry, nextUnvisited,
  heldIds, checkpointAfter, REQUEUE_GAP,
} from "../src/question-nav.js";
import { updateMissSchedule } from "../src/question-review.js";
import { emptyAbility, updateAbility } from "../src/ability-engine.js";

const CAT = "Pharmacology";
const q = (id) => ({ id, cat: CAT, diff: 2 });

function freshProgress() {
  return { log: [], schedule: {}, ability: emptyAbility([CAT]), xp: 0, run: 0, daily: 0 };
}

/* The same door App.record uses. Navigation may commit only when
   markAnswered says this is the first grade for the question. */
function commit(progress, question, correct) {
  return {
    log: [...progress.log, { id: question.id, cat: question.cat, diff: question.diff, correct }],
    schedule: updateMissSchedule(progress.schedule, question.id, correct),
    ability: updateAbility(progress.ability, question, correct).ability,
    xp: progress.xp + (correct ? 10 * question.diff : 0),
    run: correct ? progress.run + 1 : 0,
    daily: progress.daily + 1,
  };
}

function answer(nav, progress, correct) {
  const question = q(currentEntry(nav).id);
  const marked = markAnswered(nav, {
    sel: [correct ? 0 : 1], order: [], wasCorrect: correct,
    credit: { points: correct ? 1 : 0, max: 1 }, nextReview: null,
  });
  return {
    nav: marked.nav,
    progress: marked.recorded ? commit(progress, question, correct) : progress,
    recorded: marked.recorded,
  };
}

describe("back, next, and skip", () => {
  it("starts with nowhere to go back to", () => {
    const nav = appendQuestion(emptyNav(), 1);
    expect(canGoBack(nav)).toBe(false);
    expect(present(nav)).toMatchObject({ id: 1, mode: "answer", readOnly: false, skipped: false });
    expect(skippedCount(nav)).toBe(0);
  });

  it("Next on an unanswered question skips it and does not score it", () => {
    const before = freshProgress();
    const opened = appendQuestion(emptyNav(), 7);
    const moved = forward(opened);
    expect(moved.effect.type).toBe("need-question");
    expect(currentEntry(moved.nav).status).toBe("skipped");
    expect(skippedCount(moved.nav)).toBe(1);
    expect(heldIds(moved.nav)).toEqual([7]);
    expect(moved.effect.excludeIds).toEqual([7]);
    expect(moved.nav.entries[0].requeueAfter).toBe(1 + REQUEUE_GAP);
    const after = answer(moved.nav, before, false);
    expect(after.recorded).toBe(true); // answering it later is the first grade
    expect(before).toEqual(freshProgress());
  });

  it("a skip leaves the log, schedule, ability, XP, streak, and daily count untouched", () => {
    let nav = appendQuestion(emptyNav(), 1);
    let progress = freshProgress();
    const graded = answer(nav, progress, false);
    nav = graded.nav;
    progress = graded.progress;
    const wrongTheta = progress.ability[CAT].theta;
    expect(progress.log).toEqual([{ id: 1, cat: CAT, diff: 2, correct: false }]);
    expect(progress.schedule[1].interval).toBe(1);
    expect(progress.xp).toBe(0);
    expect(progress.run).toBe(0);
    expect(progress.daily).toBe(1);
    expect(wrongTheta).not.toBe(1200);

    const skipped = forward(appendQuestion(nav, 2));
    nav = skipped.nav;
    expect(currentEntry(nav).id).toBe(2);
    expect(currentEntry(nav).status).toBe("skipped");
    expect(progress.ability[CAT].theta).toBe(wrongTheta);
    expect(progress.schedule[2]).toBeUndefined();
    expect(progress.log.map((l) => l.id)).toEqual([1]);
    expect(progress.daily).toBe(1);
    expect(progress.run).toBe(0);
    expect(progress.xp).toBe(0);

    const again = forward(nav);
    expect(again.effect.type).toBe("need-question");
    expect(progress.schedule[2]).toBeUndefined();
    expect(Object.keys(progress.schedule)).toEqual(["1"]);
  });

  it("a correct answer is recorded once, and a later skip does not add a miss or break the streak", () => {
    let nav = appendQuestion(emptyNav(), 4);
    let progress = freshProgress();
    const graded = answer(nav, progress, true);
    nav = graded.nav;
    progress = graded.progress;
    expect(progress.log).toEqual([{ id: 4, cat: CAT, diff: 2, correct: true }]);
    expect(progress.schedule).toEqual({});
    expect(progress.xp).toBe(20);
    expect(progress.run).toBe(1);
    const theta = progress.ability[CAT].theta;

    nav = forward(appendQuestion(nav, 5)).nav;
    expect(currentEntry(nav).status).toBe("skipped");
    expect(progress.run).toBe(1);
    expect(progress.xp).toBe(20);
    expect(progress.daily).toBe(1);
    expect(progress.ability[CAT].theta).toBe(theta);
    expect(progress.schedule).toEqual({});
    expect(progress.log).toHaveLength(1);
  });

  it("Back shows the earlier answer read-only and does not score it again", () => {
    let nav = appendQuestion(emptyNav(), 3);
    nav = saveDraft(nav, { sel: [1], order: [] });
    const later = appendQuestion(nav, 8);
    expect(present(goBack(later))).toMatchObject({ id: 3, mode: "answer", sel: [1], readOnly: false });

    const graded = answer(nav, freshProgress(), true);
    expect(graded.recorded).toBe(true);
    nav = goBack(appendQuestion(graded.nav, 8));
    const view = present(nav);
    expect(view).toMatchObject({
      id: 3, mode: "review", readOnly: true, wasCorrect: true, sel: [0],
    });
    const again = markAnswered(nav, { sel: [2], order: [], wasCorrect: false, credit: { points: 0, max: 1 } });
    expect(again.recorded).toBe(false);
    expect(again.nav).toBe(nav);
    expect(present(again.nav).wasCorrect).toBe(true);
  });

  it("brings a skip back after other questions, and a second skip waits for a future session", () => {
    let nav = appendQuestion(emptyNav(), 1);
    for (let id = 2; id <= REQUEUE_GAP + 1; id++) {
      const moved = forward(nav);
      expect(moved.effect.type).toBe("need-question");
      nav = appendQuestion(moved.nav, id);
    }
    const due = forward(nav);
    expect(due.effect.type).toBe("requeue");
    expect(currentEntry(due.nav).id).toBe(1);
    expect(currentEntry(due.nav).status).toBe("skipped");

    const passed = forward(due.nav);
    expect(passed.effect.type).toBe("restore");
    expect(passed.nav.entries[0].skipPasses).toBe(2);
    expect(passed.nav.entries[0].requeueAfter).toBeNull();
    expect(fallbackSkip(passed.nav)).toBeNull();
  });

  it("jumps back to skipped questions, wrapping after the last one", () => {
    let nav = appendQuestion(emptyNav(), 1);
    nav = forward(nav).nav;
    nav = appendQuestion(nav, 2);
    nav = forward(nav).nav;
    nav = appendQuestion(nav, 3);
    expect(skippedCount(nav)).toBe(2);
    nav = jumpToSkipped(nav);
    expect(currentEntry(nav).id).toBe(1);
    nav = jumpToSkipped(nav);
    expect(currentEntry(nav).id).toBe(2);
    nav = jumpToSkipped(nav);
    expect(currentEntry(nav).id).toBe(1);
    expect(jumpToSkipped(appendQuestion(emptyNav(), 5))).toEqual(appendQuestion(emptyNav(), 5));
  });

  it("keeps case-study steps in order and does not treat a skip as a visited answer", () => {
    let nav = appendQuestion(emptyNav(), 0);
    nav = forward(nav).nav;
    expect(nextUnvisited(nav, [0, 1, 2])).toBe(1);
    nav = appendQuestion(nav, 1);
    nav = forward(nav).nav;
    expect(nextUnvisited(nav, [0, 1, 2])).toBe(2);
    expect(skippedCount(nav)).toBe(2);
    expect(heldIds(nav)).toEqual([0, 1]);
  });

  it("ends the Today round once the answer limit is met, even if the question on screen was skipped", () => {
    expect(checkpointAfter(0, { answered: false, atEnd: true, roundLimit: 1, auto: true })).toBeNull();
    expect(checkpointAfter(1, { answered: false, atEnd: true, roundLimit: 1, auto: true })).toBe("done");
    expect(checkpointAfter(1, { answered: false, atEnd: false, roundLimit: 1, auto: true })).toBeNull();
    expect(checkpointAfter(8, { answered: true, atEnd: true, roundLimit: 8, auto: true })).toBe("done");
    expect(checkpointAfter(1, { answered: true, atEnd: true, roundLimit: 1, auto: true })).toBe("done");
    expect(checkpointAfter(8, { answered: true, atEnd: true, auto: false })).toBe("break");
    expect(checkpointAfter(8, { answered: true, atEnd: true, auto: false, fromBreak: true })).toBeNull();
    expect(checkpointAfter(8, { answered: true, atEnd: false, auto: false })).toBeNull();
    expect(checkpointAfter(3, { answered: true, atEnd: true, auto: false })).toBeNull();
  });
});

describe("the timed exam stays forward-only", () => {
  const exam = readFileSync(new URL("../src/exam.jsx", import.meta.url), "utf8");

  it("still requires an answer to move on and does not take practice navigation", () => {
    expect(exam).toMatch(/No going back/);
    expect(exam).toMatch(/You must answer to move on/);
    expect(exam).not.toMatch(/question-nav/);
    expect(exam).not.toMatch(/QuestionNav/);
  });
});
