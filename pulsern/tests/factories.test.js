/* Schema gates for the scaled-content factories: cards and cases. */
import { describe, it, expect } from "vitest";
import { validCard } from "../ops/card-factory.mjs";
import { validCase } from "../ops/case-factory.mjs";

const goodCard = {
  cat: "Pharmacology", topic: "Antidotes",
  front: "Antidote for benzodiazepine overdose?",
  back: "Flumazenil",
};

describe("card schema gate", () => {
  it("accepts a valid card", () => expect(validCard(goodCard)).toBeNull());
  it("rejects bad categories, short fronts, and oversize backs", () => {
    expect(validCard({ ...goodCard, cat: "Astrology" })).toBe("bad category");
    expect(validCard({ ...goodCard, front: "K+?" })).toBe("bad front");
    expect(validCard({ ...goodCard, back: "x".repeat(500) })).toBe("bad back");
    expect(validCard({ ...goodCard, topic: "" })).toBe("bad topic");
  });
});

const PHASES = ["Recognize Cues", "Analyze Cues", "Prioritize Hypotheses", "Generate Solutions", "Take Action", "Evaluate Outcomes"];
const RAT = "This rationale explains why the keyed options are right and why every distractor is wrong in this scenario.";
const goodCase = {
  cat: "Physiological Adaptation",
  title: "Acute Asthma · The Silent Chest",
  blurb: "A wheezing client suddenly goes quiet — recognize why that's worse.",
  intro: "1800 · Emergency department. Mr. Reyes, 24, arrives with an asthma exacerbation after shoveling snow.",
  vitals: [["Temp", "37.0 °C"], ["HR", "126/min"], ["BP", "138/84"], ["RR", "32/min"], ["SpO₂", "88% RA"]],
  labs: [["ABG pH", "7.30"]],
  note: "Audible expiratory wheezes, accessory muscle use, speaking in two-word phrases. Peak flow 40% of personal best.",
  steps: PHASES.map((phase, i) => (i % 2 === 0
    ? { phase, type: "sata", stem: "Which findings require immediate follow-up? Select all that apply.", options: ["a", "b", "c", "d", "e"], answer: [0, 1], rationale: RAT }
    : { phase, type: "mc", stem: "Which condition is this presentation most consistent with overall?", options: ["a", "b", "c", "d"], answer: 0, rationale: RAT })),
};

describe("case schema gate", () => {
  it("accepts a valid six-step case", () => expect(validCase(goodCase)).toBeNull());
  it("rejects wrong step counts, phases, and keys", () => {
    expect(validCase({ ...goodCase, steps: goodCase.steps.slice(0, 5) })).toBe("needs exactly 6 steps");
    const wrongPhase = { ...goodCase, steps: goodCase.steps.map((s, i) => (i === 2 ? { ...s, phase: "Vibe Check" } : s)) };
    expect(validCase(wrongPhase)).toContain("phase must be");
    const badKey = { ...goodCase, steps: goodCase.steps.map((s, i) => (i === 1 ? { ...s, answer: 9 } : s)) };
    expect(validCase(badKey)).toContain("answer out of range");
    const dupSata = { ...goodCase, steps: goodCase.steps.map((s, i) => (i === 0 ? { ...s, answer: [0, 0] } : s)) };
    expect(validCase(dupSata)).toContain("sata answer invalid");
  });
  it("rejects malformed charts", () => {
    expect(validCase({ ...goodCase, vitals: [["Temp"]] })).toBe("bad vitals");
    expect(validCase({ ...goodCase, vitals: goodCase.vitals.slice(0, 2) })).toBe("too few vitals");
  });
});
