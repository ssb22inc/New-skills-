/* Proposing diagram pairings and reading patient values out of a stem.
   ------------------------------------------------------------------
   Extraction errs toward null. A diagram shown as a concept is a small
   loss; a diagram drawing the wrong patient's numbers is a wrong lesson. */
import { describe, it, expect } from "vitest";
import { extractAbg, extractPotassium, proposePairs, MATCHERS } from "../src/diagrams/match.js";

describe("ABG values", () => {
  it("reads the common formats", () => {
    expect(extractAbg("ABG: pH 7.30, PaCO2 55 mmHg, HCO3 24 mEq/L")).toEqual({ ph: 7.3, paco2: 55, hco3: 24 });
    expect(extractAbg("pH of 7.48, PaCO₂ 30, HCO₃⁻ 22")).toEqual({ ph: 7.48, paco2: 30, hco3: 22 });
    expect(extractAbg("pH = 7.25; pCO2 = 40; bicarbonate 16")).toEqual({ ph: 7.25, paco2: 40, hco3: 16 });
  });
  it("returns null when any value is missing", () => {
    expect(extractAbg("pH 7.30 and PaCO2 55")).toBeNull();
  });
  /* Two clients, or a before-and-after: never pick one. */
  it("returns null when a value is ambiguous", () => {
    expect(extractAbg("Client A: pH 7.30, PaCO2 55, HCO3 24. Client B: pH 7.50, PaCO2 30, HCO3 24.")).toBeNull();
  });
  it("rejects an impossible value as a misread", () => {
    expect(extractAbg("pH 7.30, PaCO2 550, HCO3 24")).toBeNull();
  });
  it("accepts a repeated identical value", () => {
    expect(extractAbg("pH 7.30 ... the pH 7.30 shows, PaCO2 55, HCO3 24")).toEqual({ ph: 7.3, paco2: 55, hco3: 24 });
  });
});

describe("potassium values", () => {
  it("reads the common formats", () => {
    expect(extractPotassium("serum potassium of 6.2 mEq/L")).toEqual({ k: 6.2 });
    expect(extractPotassium("K+ 2.9 mmol/L")).toEqual({ k: 2.9 });
    expect(extractPotassium("Potassium level is 3.1")).toEqual({ k: 3.1 });
  });
  it("returns null with two different levels", () => {
    expect(extractPotassium("potassium was 3.0 yesterday and potassium is 3.8 today")).toBeNull();
  });
  it("does not read a dose as a level", () => {
    expect(extractPotassium("potassium chloride 20 mEq in 100 mL")).toBeNull();
  });
});

describe("proposing pairs", () => {
  it("proposes ABG with values read only from the stem", () => {
    const q = { stem: "ABG: pH 7.30, PaCO2 55, HCO3 24. What is the interpretation?", options: ["a", "b"], rationale: "Normal pH is 7.35-7.45; e.g. pH 7.50 would be alkalosis." };
    expect(proposePairs(q)).toEqual([{ d: "abg", p: { ph: 7.3, paco2: 55, hco3: 24 } }]);
  });
  /* The rationale quoted a contrasting pH; that must not make the stem's
     values ambiguous or become the patient's value. */
  it("ignores values quoted in the rationale", () => {
    const q = { stem: "Potassium 6.2 mEq/L. Which finding?", options: [], rationale: "Normal potassium is 3.5-5.0; a potassium of 3.0 would cause U waves." };
    expect(proposePairs(q)).toEqual([{ d: "potassium", p: { k: 6.2 } }]);
  });
  it("proposes concept-only when the topic matches but no values are given", () => {
    const q = { stem: "Which ECG change is expected in hyperkalemia?", options: ["Peaked T waves"], rationale: "" };
    expect(proposePairs(q)).toEqual([{ d: "potassium", p: null }]);
  });
  it("proposes nothing for an unrelated item", () => {
    expect(proposePairs({ stem: "Which client should the nurse see first?", options: [], rationale: "Airway first." })).toEqual([]);
  });
  it("keeps the tonicity matcher tight — a bare IV mention is not enough", () => {
    expect(MATCHERS.tonicity.candidate.test("Start an IV and give the antibiotic")).toBe(false);
    expect(MATCHERS.tonicity.candidate.test("Flush the line with normal saline before the dose")).toBe(false);
    expect(MATCHERS.tonicity.candidate.test("Infuse 0.45% sodium chloride for hypernatremia")).toBe(true);
    expect(MATCHERS.tonicity.candidate.test("Which solution is hypotonic?")).toBe(true);
  });
});
