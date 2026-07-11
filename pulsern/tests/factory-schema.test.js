/* Factory schema gate — the 14-case test per PULSERN_BUILD.md §10.2:
   all six item types valid + every corruption caught. */
import { describe, it, expect } from "vitest";
import { validItem } from "../ops/content-factory.mjs";

const STEM = "A nurse is caring for a client who returned from surgery two hours ago.";
const RATIONALE =
  "The keyed option reflects the priority assessment per the nursing process; " +
  "each distractor is either out of sequence or outside the nurse's scope.";

const base = { cat: "Pharmacology", diff: 2, stem: STEM, rationale: RATIONALE };

const valid = {
  mc:     { ...base, type: "mc",     options: ["a", "b", "c", "d"], answer: 2 },
  sata:   { ...base, type: "sata",   options: ["a", "b", "c", "d", "e"], answer: [0, 2] },
  order:  { ...base, type: "order",  options: ["a", "b", "c", "d"], answer: [2, 0, 3, 1] },
  matrix: { ...base, type: "matrix", rows: ["r1", "r2", "r3"], columns: ["Indicated", "Contraindicated"], answer: [0, 1, 0] },
  bowtie: { ...base, type: "bowtie",
    actions: ["a1", "a2", "a3", "a4", "a5"],
    conditions: ["c1", "c2", "c3", "c4"],
    parameters: ["p1", "p2", "p3", "p4", "p5"],
    answer: { actions: [0, 2], condition: 1, parameters: [3, 4] } },
  cloze:  { ...base, type: "cloze",
    stem: `${STEM} The client is at highest risk for {0} as evidenced by {1}.`,
    dropdowns: [["opt a", "opt b", "opt c"], ["opt d", "opt e", "opt f"]],
    answer: [1, 0] },
};

describe("schema gate — all six types valid (6 cases)", () => {
  for (const [type, item] of Object.entries(valid)) {
    it(`accepts a valid ${type} item`, () => {
      expect(validItem(item)).toBeNull();
    });
  }
});

describe("schema gate — every corruption caught (8 cases)", () => {
  it("rejects a stem under 30 chars", () => {
    expect(validItem({ ...valid.mc, stem: "Too short." })).toBe("stem too short");
  });
  it("rejects a rationale under 60 chars", () => {
    expect(validItem({ ...valid.mc, rationale: "Because." })).toBe("rationale too short");
  });
  it("rejects an unknown category", () => {
    expect(validItem({ ...valid.mc, cat: "Astrology" })).toBe("bad category");
  });
  it("rejects an mc answer out of range", () => {
    expect(validItem({ ...valid.mc, answer: 4 })).toBe("mc answer out of range");
  });
  it("rejects sata answers with non-integer or out-of-range indices", () => {
    expect(validItem({ ...valid.sata, answer: [0, 9] })).toBe("sata answer invalid");
    expect(validItem({ ...valid.sata, answer: [] })).toBe("sata answer invalid");
  });
  it("rejects an order answer that is not a full permutation", () => {
    expect(validItem({ ...valid.order, answer: [0, 0, 3, 1] })).toBe("order answer must be a permutation");
  });
  it("rejects a matrix answer that does not map every row", () => {
    expect(validItem({ ...valid.matrix, answer: [0, 1] })).toBe("matrix answer must map every row to a column");
    expect(validItem({ ...valid.matrix, answer: [0, 1, 5] })).toBe("matrix answer must map every row to a column");
  });
  it("rejects broken bowtie and cloze payloads", () => {
    expect(validItem({ ...valid.bowtie, answer: { actions: [0], condition: 1, parameters: [3, 4] } })).toBe("bowtie answer shape invalid");
    expect(validItem({ ...valid.cloze, stem: `${STEM} Placeholder {0} only.` })).toBe("cloze stem missing {1}");
    expect(validItem({ ...valid.cloze, answer: [1, 9] })).toBe("cloze answer out of range");
    expect(validItem({ ...valid.mc, type: "hotspot" })).toBe("unknown type");
  });
});
