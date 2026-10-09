/* A confirmed diagram appears under exactly the question it was confirmed
   for — and nowhere else. */
import { describe, it, expect } from "vitest";
import { pairsFor, MAX_PER_QUESTION } from "../src/concept-explainers.jsx";
import { fingerprint } from "../src/diagrams/fingerprint.js";
import { DIAGRAMS } from "../src/diagrams/index.js";

const bankQ = { id: 1, stem: "ABG: pH 7.30, PaCO2 55, HCO3 24. Interpret.", rationale: "Respiratory acidosis." };
const map = { version: 1, pairs: { "1": [{ d: "abg", p: { ph: 7.3, paco2: 55, hco3: 24 }, f: fingerprint(bankQ) }] } };

describe("pairsFor", () => {
  it("returns the confirmed diagram with its confirmed values", () => {
    const [r] = pairsFor(map, bankQ, DIAGRAMS);
    expect(r.diagram.id).toBe("abg");
    expect(r.params).toEqual({ ph: 7.3, paco2: 55, hco3: 24 });
  });

  /* Built-in sample question 1 shares the id with bank question 1. */
  it("shows nothing on a different question that happens to share the id", () => {
    const sample = { id: 1, stem: "The nurse is preparing to administer digoxin…", rationale: "Apical pulse." };
    expect(pairsFor(map, sample, DIAGRAMS)).toEqual([]);
  });

  it("stops showing when the question is edited after review", () => {
    expect(pairsFor(map, { ...bankQ, rationale: "Edited rationale." }, DIAGRAMS)).toEqual([]);
  });

  it("ignores a pairing for a diagram that no longer exists", () => {
    const m = { pairs: { "1": [{ d: "retired-diagram", f: fingerprint(bankQ) }] } };
    expect(pairsFor(m, bankQ, DIAGRAMS)).toEqual([]);
  });

  it("passes concept-only pairings through as params null", () => {
    const m = { pairs: { "1": [{ d: "tonicity", f: fingerprint(bankQ) }] } };
    expect(pairsFor(m, bankQ, DIAGRAMS)[0].params).toBeNull();
  });

  it(`never stacks more than ${MAX_PER_QUESTION} under one rationale`, () => {
    const f = fingerprint(bankQ);
    const m = { pairs: { "1": [{ d: "abg", f }, { d: "potassium", f }, { d: "tonicity", f }] } };
    expect(pairsFor(m, bankQ, DIAGRAMS)).toHaveLength(MAX_PER_QUESTION);
  });

  it("is safe with no map, no question, or no id", () => {
    expect(pairsFor(null, bankQ, DIAGRAMS)).toEqual([]);
    expect(pairsFor(map, null, DIAGRAMS)).toEqual([]);
    expect(pairsFor(map, { stem: "x" }, DIAGRAMS)).toEqual([]);
  });
});

describe("fingerprint", () => {
  it("is stable and sensitive to stem and rationale", () => {
    expect(fingerprint(bankQ)).toBe(fingerprint({ ...bankQ }));
    expect(fingerprint({ ...bankQ, stem: bankQ.stem + " " })).not.toBe(fingerprint(bankQ));
    expect(fingerprint(bankQ)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("the shipped map file", () => {
  it("is valid and only references diagrams that exist", async () => {
    const m = (await import("../src/diagrams/item-map.json")).default;
    expect(m.version).toBe(1);
    for (const [qid, entries] of Object.entries(m.pairs)) {
      expect(qid).toMatch(/^\d+$/);
      for (const e of entries) {
        expect(DIAGRAMS[e.d], `unknown diagram ${e.d}`).toBeDefined();
        expect(e.f).toMatch(/^[0-9a-f]{8}$/);
      }
    }
  });
});
