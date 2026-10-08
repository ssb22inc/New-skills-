/* ABG interpretation — every branch against a textbook case.
   ------------------------------------------------------------------
   The diagram renders whatever interpretAbg() returns, so this function is
   the clinical claim. Each case below is a standard teaching example; the
   expected reading is what an NCLEX answer key would say. */
import { describe, it, expect } from "vitest";
import { interpretAbg, ABG_RANGES } from "../src/diagrams/abg.jsx";

const read = (ph, paco2, hco3) => interpretAbg({ ph, paco2, hco3 });

describe("uncompensated", () => {
  it("respiratory acidosis: high CO₂ drives the pH down, kidneys not yet involved", () => {
    expect(read(7.30, 55, 24)).toMatchObject({ disorder: "respiratory acidosis", primary: "respiratory", compensation: "none" });
  });
  it("respiratory alkalosis: low CO₂ (hyperventilation)", () => {
    expect(read(7.50, 28, 24)).toMatchObject({ disorder: "respiratory alkalosis", compensation: "none" });
  });
  it("metabolic acidosis: low bicarbonate (e.g. DKA)", () => {
    expect(read(7.28, 40, 16)).toMatchObject({ disorder: "metabolic acidosis", primary: "metabolic", compensation: "none" });
  });
  it("metabolic alkalosis: high bicarbonate (e.g. vomiting, NG suction)", () => {
    expect(read(7.52, 42, 34)).toMatchObject({ disorder: "metabolic alkalosis", compensation: "none" });
  });
});

describe("partially compensated", () => {
  it("respiratory acidosis with kidneys retaining bicarbonate (COPD)", () => {
    expect(read(7.32, 60, 30)).toMatchObject({ disorder: "respiratory acidosis", compensation: "partial" });
  });
  it("metabolic acidosis with lungs blowing off CO₂ (Kussmaul)", () => {
    expect(read(7.25, 28, 14)).toMatchObject({ disorder: "metabolic acidosis", compensation: "partial" });
  });
  it("metabolic alkalosis with lungs retaining CO₂", () => {
    expect(read(7.48, 50, 35)).toMatchObject({ disorder: "metabolic alkalosis", compensation: "partial" });
  });
});

describe("fully compensated — pH normal, side of 7.40 tells the origin", () => {
  it("respiratory acidosis, fully compensated", () => {
    expect(read(7.36, 55, 32)).toMatchObject({ disorder: "respiratory acidosis", compensation: "full" });
  });
  it("metabolic acidosis, fully compensated", () => {
    expect(read(7.37, 30, 17)).toMatchObject({ disorder: "metabolic acidosis", compensation: "full" });
  });
  it("respiratory alkalosis, fully compensated", () => {
    expect(read(7.43, 30, 19)).toMatchObject({ disorder: "respiratory alkalosis", compensation: "full" });
  });
  it("metabolic alkalosis, fully compensated", () => {
    expect(read(7.44, 48, 31)).toMatchObject({ disorder: "metabolic alkalosis", compensation: "full" });
  });
  it("refuses to guess at exactly 7.40", () => {
    expect(read(7.40, 55, 32)).toMatchObject({ disorder: "indeterminate", compensation: "full" });
  });
});

describe("the edges", () => {
  it("normal ABG", () => {
    expect(read(7.40, 40, 24)).toMatchObject({ disorder: "normal", compensation: null });
  });
  it("combined acidosis: both systems push acid", () => {
    expect(read(7.15, 60, 16)).toMatchObject({ disorder: "combined respiratory and metabolic acidosis", primary: "both" });
  });
  it("flags a pH no value explains instead of inventing a diagnosis", () => {
    expect(read(7.25, 30, 30).disorder).toBe("inconsistent");
  });
  it("flags a single abnormal value under a normal pH as not fitting", () => {
    expect(read(7.38, 50, 24).disorder).toBe("inconsistent");
  });

  /* The boundaries are inclusive normal values: 7.35 and 7.45 are normal. */
  it("treats the range limits as normal", () => {
    expect(read(7.35, 45, 22).disorder).toBe("normal");
    expect(read(7.45, 35, 26).disorder).toBe("normal");
  });

  it("uses the standard adult reference ranges", () => {
    expect(ABG_RANGES).toEqual({ ph: { lo: 7.35, hi: 7.45 }, paco2: { lo: 35, hi: 45 }, hco3: { lo: 22, hi: 26 } });
  });

  it("rejects a missing value rather than reading it as normal", () => {
    expect(() => interpretAbg({ ph: 7.3, paco2: undefined, hco3: 24 })).toThrow(/paco2/);
  });
});
