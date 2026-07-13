/* NGN scoring per PULSERN_BUILD.md §10.5: matrix/bowtie/cloze scorers —
   exact match correct, any deviation incorrect. Plus validQ coverage of the
   sample items and corrupted shapes. */
import { describe, it, expect } from "vitest";
import { scoreMatrix, scoreBowtie, scoreCloze, scoreCalc, scoreHighlight, fourFn, validQ, ngnExt } from "../src/ngn.js";
import { NGN_SAMPLES, CALC_SAMPLES, COVERAGE_SAMPLES } from "../src/ngn-samples.js";

describe("matrix scoring", () => {
  const answer = [0, 0, 1];
  it("exact match is correct", () => expect(scoreMatrix([0, 0, 1], answer)).toBe(true));
  it("one wrong row is incorrect", () => expect(scoreMatrix([0, 1, 1], answer)).toBe(false));
  it("incomplete selection is incorrect", () => expect(scoreMatrix([0, undefined, 1], answer)).toBe(false));
  it("empty selection is incorrect", () => expect(scoreMatrix([], answer)).toBe(false));
});

describe("bowtie scoring", () => {
  const answer = { actions: [0, 1], condition: 0, parameters: [0, 1] };
  it("exact match is correct", () =>
    expect(scoreBowtie({ actions: [0, 1], condition: 0, parameters: [0, 1] }, answer)).toBe(true));
  it("order within a slot does not matter (set-equal)", () =>
    expect(scoreBowtie({ actions: [1, 0], condition: 0, parameters: [1, 0] }, answer)).toBe(true));
  it("wrong condition is incorrect", () =>
    expect(scoreBowtie({ actions: [0, 1], condition: 2, parameters: [0, 1] }, answer)).toBe(false));
  it("one wrong action is incorrect", () =>
    expect(scoreBowtie({ actions: [0, 2], condition: 0, parameters: [0, 1] }, answer)).toBe(false));
  it("missing a parameter is incorrect", () =>
    expect(scoreBowtie({ actions: [0, 1], condition: 0, parameters: [0] }, answer)).toBe(false));
  it("null selection is incorrect", () => expect(scoreBowtie(null, answer)).toBe(false));
});

describe("cloze scoring", () => {
  const answer = [0, 0];
  it("exact match is correct", () => expect(scoreCloze([0, 0], answer)).toBe(true));
  it("one wrong dropdown is incorrect", () => expect(scoreCloze([0, 1], answer)).toBe(false));
  it("missing a dropdown is incorrect", () => expect(scoreCloze([0], answer)).toBe(false));
});

describe("validQ accepts the NGN shapes (mirrors the factory gate)", () => {
  for (const s of NGN_SAMPLES) {
    it(`accepts the hand-written ${s.type} sample`, () => expect(validQ(s)).toBe(true));
  }
  it("accepts payloads at the top level too (factory shape)", () => {
    const flat = NGN_SAMPLES.map((s) => ({ ...s, ...s.extra, extra: undefined }));
    for (const f of flat) expect(validQ(f)).toBe(true);
  });
  it("rejects a matrix answer that skips a row", () => {
    const m = NGN_SAMPLES.find((s) => s.type === "matrix");
    expect(validQ({ ...m, answer: m.answer.slice(1) })).toBe(false);
  });
  it("rejects a bowtie answer with only one action", () => {
    const b = NGN_SAMPLES.find((s) => s.type === "bowtie");
    expect(validQ({ ...b, answer: { ...b.answer, actions: [0] } })).toBe(false);
  });
  it("rejects a cloze whose stem lost a placeholder", () => {
    const c = NGN_SAMPLES.find((s) => s.type === "cloze");
    expect(validQ({ ...c, stem: c.stem.replace("{1}", "something") })).toBe(false);
  });
  it("still accepts classic mc/sata/order items", () => {
    const base = { cat: "Pharmacology", diff: 1, stem: "A nurse reviews new prescriptions for a client.", rationale: "The keyed option is correct because it follows the standard of care sequence." };
    expect(validQ({ ...base, type: "mc", options: ["a", "b", "c"], answer: 1 })).toBe(true);
    expect(validQ({ ...base, type: "sata", options: ["a", "b", "c", "d", "e"], answer: [0, 2] })).toBe(true);
    expect(validQ({ ...base, type: "order", options: ["a", "b", "c", "d"], answer: [3, 1, 0, 2] })).toBe(true);
  });
});

describe("calc (dosage math) scoring", () => {
  it("exact numeric match is correct, commas and spaces forgiven", () => {
    expect(scoreCalc("125", 125)).toBe(true);
    expect(scoreCalc(" 1,250 ", 1250)).toBe(true);
    expect(scoreCalc("125.0", 125)).toBe(true);
  });
  it("any deviation without tolerance is incorrect", () => {
    expect(scoreCalc("124", 125)).toBe(false);
    expect(scoreCalc("125.1", 125)).toBe(false);
  });
  it("tolerance admits rounding", () => {
    expect(scoreCalc("31.3", 31.25, 0.1)).toBe(true);
    expect(scoreCalc("31.5", 31.25, 0.1)).toBe(false);
  });
  it("non-numeric or empty entry is incorrect", () => {
    expect(scoreCalc("", 125)).toBe(false);
    expect(scoreCalc("abc", 125)).toBe(false);
    expect(scoreCalc(null, 125)).toBe(false);
  });
  it("validQ accepts the hand-written calc samples and rejects corruptions", () => {
    for (const s of CALC_SAMPLES) expect(validQ(s)).toBe(true);
    const c = CALC_SAMPLES[0];
    expect(validQ({ ...c, answer: "125" })).toBe(false);
    expect(validQ({ ...c, extra: { ...c.extra, unit: "" } })).toBe(false);
    expect(validQ({ ...c, extra: { ...c.extra, tolerance: -1 } })).toBe(false);
  });
});

describe("fourFn (on-screen calculator math)", () => {
  it("computes the four operations", () => {
    expect(fourFn(600, 15, "×")).toBe(9000);
    expect(fourFn(9000, 300, "÷")).toBe(30);
    expect(fourFn(240, 2, "÷")).toBe(120);
    expect(fourFn(0.25, 0.125, "÷")).toBe(2);
    expect(fourFn(100, 25, "−")).toBe(75);
    expect(fourFn(1.5, 2.25, "+")).toBe(3.75);
  });
  it("trims floating-point noise", () => {
    expect(fourFn(0.1, 0.2, "+")).toBe(0.3);
  });
  it("division by zero is NaN, not Infinity", () => {
    expect(Number.isNaN(fourFn(5, 0, "÷"))).toBe(true);
  });
  it("calc samples all carry work steps", () => {
    for (const s of CALC_SAMPLES) {
      expect(Array.isArray(s.extra.work)).toBe(true);
      expect(s.extra.work.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("highlight scoring", () => {
  const answer = [0, 1, 4];
  it("set-equal selection is correct regardless of tap order", () => {
    expect(scoreHighlight([4, 0, 1], answer)).toBe(true);
  });
  it("missing or extra highlights are incorrect", () => {
    expect(scoreHighlight([0, 1], answer)).toBe(false);
    expect(scoreHighlight([0, 1, 4, 5], answer)).toBe(false);
    expect(scoreHighlight([0, 1, 5], answer)).toBe(false);
    expect(scoreHighlight([], answer)).toBe(false);
  });
});

describe("coverage samples validate", () => {
  for (const s of COVERAGE_SAMPLES) {
    it(`accepts sample ${s.id} (${s.type}, ${s.cat})`, () => expect(validQ(s)).toBe(true));
  }
  it("rejects a highlight with duplicate answer indices", () => {
    const h = COVERAGE_SAMPLES.find((s) => s.type === "highlight");
    expect(validQ({ ...h, answer: [0, 0, 1] })).toBe(false);
  });
  it("rejects a highlight where everything is keyed", () => {
    const h = COVERAGE_SAMPLES.find((s) => s.type === "highlight");
    expect(validQ({ ...h, answer: h.extra.tokens.map((_, i) => i) })).toBe(false);
  });
});

describe("ngnExt payload access", () => {
  it("lifts extra payloads and leaves top-level payloads alone", () => {
    expect(ngnExt({ extra: { rows: [1] } }).rows).toEqual([1]);
    expect(ngnExt({ rows: [2] }).rows).toEqual([2]);
  });
});
