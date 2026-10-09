/* Diagram pairing — decision handling, caching and the shipped map.
   ------------------------------------------------------------------
   No model is called here. These pin what the run does with an answer:
   a decision that cannot be trusted is never turned into a diagram on a
   student's screen, and nothing is paid for twice. */
import { describe, it, expect } from "vitest";
import {
  itemHash, diagramHash, isFresh, batches, readDecisions, shownAs, buildItemMap, pairingPrompt, PAIRING_SCHEMA, serializeDecisions,
} from "../ops/map-diagrams-lib.mjs";

const diagram = { id: "abg", title: "Reading an ABG", facts: ["pH 7.35-7.45 is normal."], steps: [{ key: "ph", caption: "Start with pH." }, { key: "w", dynamic: true }] };
const q = { id: 7, stem: "pH 7.30, PaCO2 55, HCO3 24", options: ["a"], rationale: "r", answer: 0 };

describe("caching: never pay twice, always re-check when content changes", () => {
  it("treats an unchanged item and diagram as already decided", () => {
    expect(isFresh({ itemHash: itemHash(q), diagramHash: diagramHash(diagram) }, itemHash(q), diagramHash(diagram))).toBe(true);
  });
  it("re-checks when the question is edited", () => {
    expect(itemHash({ ...q, rationale: "changed" })).not.toBe(itemHash(q));
  });
  it("re-checks when the diagram's clinical content changes", () => {
    expect(diagramHash({ ...diagram, facts: ["pH 7.30-7.50 is normal."] })).not.toBe(diagramHash(diagram));
  });
  it("does not re-check for a layout-only change", () => {
    expect(diagramHash({ ...diagram, Diagram: () => null })).toBe(diagramHash(diagram));
  });
  it("re-checks when there was no earlier decision", () => {
    expect(isFresh(undefined, "a", "b")).toBe(false);
  });
});

describe("reading the reviewer's answer", () => {
  const items = [{ id: 1 }, { id: 2 }];
  it("accepts a complete answer", () => {
    expect(readDecisions({ decisions: [{ id: 1, attach: true, values_confirmed: null, reason: "x" }, { id: 2, attach: false, values_confirmed: null, reason: "y" }] }, items)).toHaveLength(2);
  });
  /* A partial answer must not be read as "the rest are no". */
  it("rejects an answer that skips a question", () => {
    expect(() => readDecisions({ decisions: [{ id: 1, attach: true, reason: "x" }] }, items)).toThrow(/answered 1 of 2/);
  });
  it("rejects a decision about a question it was not asked about", () => {
    expect(() => readDecisions({ decisions: [{ id: 1, attach: true }, { id: 2, attach: true }, { id: 99, attach: true }] }, items)).toThrow(/not asked/);
  });
  it("rejects two decisions for one question", () => {
    expect(() => readDecisions({ decisions: [{ id: 1, attach: true }, { id: 1, attach: false }] }, items)).toThrow(/two decisions/);
  });
});

describe("what a student is shown", () => {
  const ex = { ph: 7.3, paco2: 55, hco3: 24 };
  it("shows confirmed values", () => {
    expect(shownAs({ attach: true, values_confirmed: true }, ex)).toEqual(ex);
  });
  /* Unconfirmed numbers never reach the screen. */
  it("falls back to concept-only when values were not confirmed", () => {
    expect(shownAs({ attach: true, values_confirmed: false }, ex)).toBeNull();
    expect(shownAs({ attach: true, values_confirmed: null }, ex)).toBeNull();
  });
  it("shows nothing when the reviewer said no", () => {
    expect(shownAs({ attach: false, values_confirmed: true }, ex)).toBeNull();
  });
});

describe("the shipped map", () => {
  const decisions = {
    "12:abg": { attach: true, shown: { ph: 7.3, paco2: 55, hco3: 24 }, fp: "aaaaaaaa" },
    "3:tonicity": { attach: true, shown: null, fp: "bbbbbbbb" },
    "3:potassium": { attach: false, shown: null, fp: "bbbbbbbb" },
    "100:potassium": { attach: true, shown: { k: 6.2 }, fp: "cccccccc" },
  };
  it("contains only attached pairs, each with its question fingerprint", () => {
    const m = buildItemMap(decisions);
    expect(m.pairs["3"]).toEqual([{ d: "tonicity", f: "bbbbbbbb" }]);
    expect(m.pairs["12"]).toEqual([{ d: "abg", p: { ph: 7.3, paco2: 55, hco3: 24 }, f: "aaaaaaaa" }]);
    expect(JSON.stringify(m)).not.toContain('"attach"');
  });
  it("never ships a pairing it could not verify on screen", () => {
    expect(buildItemMap({ "9:abg": { attach: true, shown: null } }).pairs).toEqual({});
  });
  it("is byte-identical for the same decisions in any order", () => {
    const shuffled = Object.fromEntries(Object.entries(decisions).reverse());
    expect(JSON.stringify(buildItemMap(shuffled))).toBe(JSON.stringify(buildItemMap(decisions)));
  });
  it("orders question ids numerically", () => {
    expect(Object.keys(buildItemMap(decisions).pairs)).toEqual(["3", "12", "100"]);
  });
});

describe("the request", () => {
  it("states the diagram's claims and the do-not-attach-when-in-doubt rule", () => {
    const p = pairingPrompt(diagram, [{ ...q, extracted: { ph: 7.3, paco2: 55, hco3: 24 } }]);
    expect(p).toContain("pH 7.35-7.45 is normal.");
    expect(p).toMatch(/When in doubt, do not attach/);
    expect(p).toContain('"extracted":{"ph":7.3,"paco2":55,"hco3":24}');
  });
  it("leaves the worked-example step out of what the diagram teaches", () => {
    expect(pairingPrompt(diagram, [q])).not.toContain("undefined");
  });
  it("requires a decision shape the model cannot wander from", () => {
    expect(PAIRING_SCHEMA.json_schema.strict).toBe(true);
  });
  it("splits work into bounded batches", () => {
    expect(batches(Array.from({ length: 31 }, (_, i) => i), 15).map((b) => b.length)).toEqual([15, 15, 1]);
  });
});

describe("the decision cache on disk", () => {
  /* Paid decisions must round-trip intact. The first draft sorted with
     JSON.stringify(obj, keys), which strips nested fields and would have
     discarded every answer that had been paid for. */
  it("keeps every field of every decision", () => {
    const d = { "10:abg": { attach: true, values_confirmed: true, reason: "turns on ROME", shown: { ph: 7.3 }, itemHash: "a", diagramHash: "b" },
                "2:tonicity": { attach: false, values_confirmed: null, reason: "flush only", shown: null, itemHash: "c", diagramHash: "d" } };
    expect(JSON.parse(serializeDecisions(d))).toEqual(d);
  });
  it("sorts by question id for stable diffs", () => {
    const out = serializeDecisions({ "10:abg": { a: 1 }, "2:abg": { a: 1 } });
    expect(out.indexOf('"2:abg"')).toBeLessThan(out.indexOf('"10:abg"'));
  });
});
