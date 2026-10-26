/* NCSBN-style NGN partial credit: worked examples for every rule, the
   full-credit bridge to the ability engine, and case-study step totals. */
import { describe, it, expect } from "vitest";
import {
  partialMC, partialSATA, partialHighlight, partialSelectN, partialMatrix, partialCloze,
  partialOrder, partialBowtie, scoreItem, scoreCaseStep, isFullCredit, sumScores,
  scoreMatrix, scoreBowtie, scoreCloze, scoreHighlight,
} from "../src/ngn.js";
import { NGN_SAMPLES, COVERAGE_SAMPLES, CALC_SAMPLES } from "../src/ngn-samples.js";
import { CASE_STUDIES } from "../src/case-studies.js";

describe("0/1 — single-answer multiple choice", () => {
  it("1 point for the key, 0 otherwise", () => {
    expect(partialMC([2], 2)).toEqual({ points: 1, max: 1 });
    expect(partialMC([1], 2)).toEqual({ points: 0, max: 1 });
    expect(partialMC([], 2)).toEqual({ points: 0, max: 1 });
  });
});

describe("+/- — select all that apply", () => {
  const key = [0, 2, 4]; // 3 keyed options → max 3
  it("all keyed, nothing else: full credit", () => expect(partialSATA([4, 0, 2], key)).toEqual({ points: 3, max: 3 }));
  it("2 keyed + 0 wrong = 2", () => expect(partialSATA([0, 2], key)).toEqual({ points: 2, max: 3 }));
  it("3 keyed + 1 wrong = 3 − 1 = 2", () => expect(partialSATA([0, 2, 4, 1], key)).toEqual({ points: 2, max: 3 }));
  it("1 keyed + 2 wrong = 1 − 2 → floor 0", () => expect(partialSATA([0, 1, 3], key)).toEqual({ points: 0, max: 3 }));
  it("selecting every option cannot earn full credit: 3 − 2 = 1", () =>
    expect(partialSATA([0, 1, 2, 3, 4], key)).toEqual({ points: 1, max: 3 }));
  it("nothing selected = 0; duplicate taps count once", () => {
    expect(partialSATA([], key)).toEqual({ points: 0, max: 3 });
    expect(partialSATA([0, 0, 0], key)).toEqual({ points: 1, max: 3 });
  });
});

describe("+/- — highlight", () => {
  const key = [0, 1, 4];
  it("worked example: 2 right + 1 wrong = 1", () => expect(partialHighlight([0, 1, 5], key)).toEqual({ points: 1, max: 3 }));
  it("all right = full credit regardless of tap order", () => expect(partialHighlight([4, 1, 0], key)).toEqual({ points: 3, max: 3 }));
  it("only wrong tokens → floor 0", () => expect(partialHighlight([2, 3], key)).toEqual({ points: 0, max: 3 }));
});

describe("0/1 per keyed option — select N", () => {
  const key = [1, 3]; // "select 2"
  it("both keyed = 2", () => expect(partialSelectN([3, 1], key, 2)).toEqual({ points: 2, max: 2 }));
  it("one keyed, one not = 1 (no penalty)", () => expect(partialSelectN([1, 0], key, 2)).toEqual({ points: 1, max: 2 }));
  it("only the first N selections count", () => expect(partialSelectN([0, 2, 1, 3], key, 2)).toEqual({ points: 0, max: 2 }));
  it("scoreItem routes a sata item with selectN to select-N", () =>
    expect(scoreItem({ type: "sata", answer: [1, 3], extra: { selectN: 2 } }, [1, 0])).toEqual({ points: 1, max: 2 }));
});

describe("0/1 per row — matrix", () => {
  const key = [0, 0, 1];
  it("2 of 3 rows = 2", () => expect(partialMatrix([0, 1, 1], key)).toEqual({ points: 2, max: 3 }));
  it("all rows = full", () => expect(partialMatrix([0, 0, 1], key)).toEqual({ points: 3, max: 3 }));
  it("unanswered rows earn nothing", () => expect(partialMatrix([0], key)).toEqual({ points: 1, max: 3 }));
});

describe("0/1 per component — cloze, drag-and-drop ordering, bow-tie", () => {
  it("cloze: one point per dropdown", () => {
    expect(partialCloze([0, 1], [0, 0])).toEqual({ points: 1, max: 2 });
    expect(partialCloze([0, 0], [0, 0])).toEqual({ points: 2, max: 2 });
  });
  it("ordered drag-and-drop: one point per item in its keyed position", () => {
    expect(partialOrder([3, 1, 0, 2], [3, 1, 0, 2])).toEqual({ points: 4, max: 4 });
    expect(partialOrder([3, 1, 2, 0], [3, 1, 0, 2])).toEqual({ points: 2, max: 4 });
    expect(partialOrder([], [3, 1, 0, 2])).toEqual({ points: 0, max: 4 });
  });
  it("bow-tie: 2 actions + 1 condition + 2 parameters = 5 points", () => {
    const key = { actions: [0, 1], condition: 0, parameters: [0, 1] };
    expect(partialBowtie({ actions: [1, 0], condition: 0, parameters: [1, 0] }, key)).toEqual({ points: 5, max: 5 });
    expect(partialBowtie({ actions: [0, 2], condition: 2, parameters: [0, 1] }, key)).toEqual({ points: 3, max: 5 });
    expect(partialBowtie({ actions: [2, 3], condition: 1, parameters: [2, 3] }, key)).toEqual({ points: 0, max: 5 });
    // over-selecting a slot cannot add points: only as many picks as the slot holds count
    expect(partialBowtie({ actions: [2, 0, 1], condition: 0, parameters: [0, 1] }, key)).toEqual({ points: 4, max: 5 });
    expect(partialBowtie(null, key)).toEqual({ points: 0, max: 5 });
  });
});

describe("full credit is exactly the old all-or-nothing outcome", () => {
  it("agrees with the boolean scorers the engine and exams rely on", () => {
    const m = [0, 0, 1];
    for (const sel of [[0, 0, 1], [0, 1, 1], [1, 1, 0]]) expect(isFullCredit(partialMatrix(sel, m))).toBe(scoreMatrix(sel, m));
    const c = [0, 1];
    for (const sel of [[0, 1], [0, 0], [1, 1]]) expect(isFullCredit(partialCloze(sel, c))).toBe(scoreCloze(sel, c));
    const h = [0, 1, 4];
    for (const sel of [[4, 0, 1], [0, 1], [0, 1, 4, 5]]) expect(isFullCredit(partialHighlight(sel, h))).toBe(scoreHighlight(sel, h));
    const b = { actions: [0, 1], condition: 0, parameters: [0, 1] };
    for (const sel of [b, { ...b, condition: 1 }, { ...b, actions: [0, 2] }]) expect(isFullCredit(partialBowtie(sel, b))).toBe(scoreBowtie(sel, b));
  });
  it("every sample item scores full credit with its own key and has max ≥ 1", () => {
    for (const s of [...NGN_SAMPLES, ...COVERAGE_SAMPLES, ...CALC_SAMPLES]) {
      const sel = s.type === "mc" ? [s.answer] : s.type === "calc" ? String(s.answer) : s.answer;
      const r = scoreItem(s, sel);
      expect(r.max).toBeGreaterThanOrEqual(1);
      expect(isFullCredit(r)).toBe(true);
    }
  });
  it("calc stays 0/1", () => {
    const c = CALC_SAMPLES[0];
    expect(scoreItem(c, "999999")).toEqual({ points: 0, max: 1 });
  });
  it("zero-max is never full credit", () => expect(isFullCredit({ points: 0, max: 0 })).toBe(false));
});

describe("case-study steps and totals", () => {
  const steps = [
    { type: "mc", answer: 1, options: ["a", "b", "c", "d"] },
    { type: "sata", answer: [0, 2, 3], options: ["a", "b", "c", "d", "e"] },
    { type: "sata", answer: [1, 4], options: ["a", "b", "c", "d", "e"] },
  ];
  it("scores each step with NCSBN rules and sums the case", () => {
    const scores = [
      scoreCaseStep(steps[0], [1]),        // 1/1
      scoreCaseStep(steps[1], [0, 2, 1]),  // 2 right − 1 wrong = 1/3
      scoreCaseStep(steps[2], [0, 3]),     // 0 right − 2 wrong → 0/2
    ];
    expect(scores).toEqual([{ points: 1, max: 1 }, { points: 1, max: 3 }, { points: 0, max: 2 }]);
    expect(sumScores(scores)).toEqual({ points: 2, max: 6 });
    expect(isFullCredit(sumScores(scores))).toBe(false);
  });
  it("a flawless run of every bundled case scores max points", () => {
    for (const cs of CASE_STUDIES) {
      const total = sumScores(cs.steps.map((s) => scoreCaseStep(s, s.type === "mc" ? [s.answer] : s.answer)));
      const expectedMax = cs.steps.reduce((t, s) => t + (s.type === "mc" ? 1 : s.answer.length), 0);
      expect(total).toEqual({ points: expectedMax, max: expectedMax });
      expect(isFullCredit(total)).toBe(true);
    }
  });
  it("empty case totals to 0/0", () => expect(sumScores([])).toEqual({ points: 0, max: 0 }));
});
