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

describe("insulin type and time", () => {
  it("reads military time", async () => {
    const { extractInsulin } = await import("../src/diagrams/match.js");
    expect(extractInsulin("The client received NPH insulin at 0700.")).toEqual({ type: "nph", givenAt: "07:00" });
  });
  it("reads clock time with am/pm", async () => {
    const { extractInsulin } = await import("../src/diagrams/match.js");
    expect(extractInsulin("Insulin lispro was given at 5:30 pm")).toEqual({ type: "rapid", givenAt: "17:30" });
    expect(extractInsulin("regular insulin at 12:15 am")).toEqual({ type: "short", givenAt: "00:15" });
  });
  it("returns null with two insulin types (a mixed dose) rather than pick one", async () => {
    const { extractInsulin } = await import("../src/diagrams/match.js");
    expect(extractInsulin("NPH and regular insulin at 0700")).toBeNull();
  });
  it("returns null with no administration time", async () => {
    const { extractInsulin } = await import("../src/diagrams/match.js");
    expect(extractInsulin("The client uses insulin glargine daily.")).toBeNull();
  });
  /* Degludec lasts ~42 h; drawing it as glargine would be wrong. */
  it("never maps degludec onto the long-acting row", async () => {
    const { extractInsulin } = await import("../src/diagrams/match.js");
    expect(extractInsulin("Insulin degludec at 2100")).toBeNull();
  });
  /* PR #133 review, finding 9: different basal products were drawn as one
     24-hour profile. Only glargine U-100 is drawn on the long-acting row. */
  it("maps glargine U-100 to the long-acting row and nothing else basal", async () => {
    const { extractInsulin } = await import("../src/diagrams/match.js");
    expect(extractInsulin("Insulin glargine at 2100")).toEqual({ type: "long", givenAt: "21:00" });
    expect(extractInsulin("Lantus 20 units at 2100")).toEqual({ type: "long", givenAt: "21:00" });
    for (const t of ["Toujeo at 2100", "insulin glargine U-300 at 2100", "insulin detemir at 2100", "Levemir at 2100", "Tresiba at 2100"]) {
      expect(extractInsulin(t), t).toBeNull();
    }
  });
  it("proposes the insulin diagram for an insulin question", () => {
    expect(proposePairs({ stem: "A client received NPH insulin at 0700. When is hypoglycemia most likely?", options: [], rationale: "" }))
      .toEqual([{ d: "insulin", p: { type: "nph", givenAt: "07:00" } }]);
  });
});

/* A diagram with no matcher is never proposed for any question, so it
   would sit in the library unseen — the insulin diagram did exactly that
   until this test existed. */
describe("registry and matchers stay in step", () => {
  it("every registered diagram has a matcher, and every matcher a diagram", async () => {
    const { DIAGRAMS } = await import("../src/diagrams/index.js");
    expect(Object.keys(MATCHERS).sort()).toEqual(Object.keys(DIAGRAMS).sort());
  });
});
