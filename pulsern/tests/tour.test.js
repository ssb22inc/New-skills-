import { describe, expect, it } from "vitest";
import { TOUR_STEPS, isLastTourStep, tourMark, tourStepAt } from "../src/tour.js";

const BANNED = [
  /pass(?:ing)? the nclex/i,
  /guarantee/i,
  /might be wrong/i,
  /may be wrong/i,
  /as an ai/i,
  /could be incorrect/i,
  /we think/i,
  /not sure/i,
];

describe("guided tour", () => {
  it("walks the real study screens and can be read from either end", () => {
    expect(TOUR_STEPS.map((step) => step.tab)).toEqual([
      "today", "today", "today", "qbank", "qbank", "case", "cards", "stats", "today",
    ]);
    expect(new Set(TOUR_STEPS.map((step) => step.id)).size).toBe(TOUR_STEPS.length);
    expect(tourStepAt(0).id).toBe("welcome");
    expect(tourStepAt(-1)).toBe(null);
    expect(tourStepAt(TOUR_STEPS.length)).toBe(null);
    expect(isLastTourStep(TOUR_STEPS.length - 1)).toBe(true);
    expect(isLastTourStep(0)).toBe(false);
    expect(tourMark("monitor", "monitor")).toBe(" tour-target");
    expect(tourMark("monitor", "qbank")).toBe("");
  });

  it("describes the tools the app actually has, in a confident register", () => {
    const text = TOUR_STEPS.map((step) => `${step.title} ${step.body}`).join("\n");
    for (const pattern of BANNED) expect(text).not.toMatch(pattern);
    expect(text).toMatch(/working hospital RN/);
    expect(text).toMatch(/daily plan|8 adaptive questions/);
    expect(text).toMatch(/readiness range/);
    expect(text).toMatch(/estimate/);
    expect(text).toMatch(/client-needs/);
    expect(text).toMatch(/bow-tie/);
    expect(text).toMatch(/Misses come back|returns tomorrow/);
    expect(text).toMatch(/NCJMM/);
    expect(text).toMatch(/sepsis/i);
    expect(text).toMatch(/Flashcards/);
    expect(text).toMatch(/acid–base|potassium|insulin|isolation|pressure injury/);
    expect(text).toMatch(/Stats/);
    expect(text).toMatch(/lab reference/);
    expect(text).toMatch(/Readiness exams/);
    expect(text).toMatch(/Listen/);
  });
});
