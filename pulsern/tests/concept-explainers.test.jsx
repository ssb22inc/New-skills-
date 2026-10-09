/* A confirmed diagram appears under exactly the question it was confirmed
   for — and nowhere else. */
import { describe, it, expect } from "vitest";
import { pairsFor, audioFor, MAX_PER_QUESTION } from "../src/concept-explainers.jsx";
import { fingerprint, fnv1a, diagramFp } from "../src/diagrams/fingerprint.js";
import { DIAGRAMS } from "../src/diagrams/index.js";

const bankQ = { id: 1, stem: "ABG: pH 7.30, PaCO2 55, HCO3 24. Interpret.", rationale: "Respiratory acidosis." };
const v = (id) => diagramFp(DIAGRAMS[id]);
const map = { version: 2, pairs: { "1": [{ d: "abg", p: { ph: 7.3, paco2: 55, hco3: 24 }, f: fingerprint(bankQ), v: v("abg") }] } };

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
  /* Round 6: options and the answer feed the pairing and its values, so an
     edit to either must retire the pairing too. */
  it("stops showing when only an option or only the answer is edited", () => {
    const q = { id: 9, stem: "NPH insulin was given at 0700.", rationale: "Peak risk.", options: ["NPH", "regular"], answer: 0 };
    const m = { pairs: { "9": [{ d: "insulin", p: { type: "nph", givenAt: "07:00" }, f: fingerprint(q), v: v("insulin") }] } };
    expect(pairsFor(m, q, DIAGRAMS)).toHaveLength(1);
    expect(pairsFor(m, { ...q, options: ["regular", "regular"] }, DIAGRAMS)).toEqual([]);
    expect(pairsFor(m, { ...q, answer: 1 }, DIAGRAMS)).toEqual([]);
  });
  it("fingerprints the same row identically whatever order its JSON keys arrive in", () => {
    const a = { id: 1, stem: "s", rationale: "r", options: { a: 1, b: [2, { c: 3, d: 4 }] }, answer: { x: 1, y: 2 } };
    const b = { id: 1, stem: "s", rationale: "r", options: { b: [2, { d: 4, c: 3 }], a: 1 }, answer: { y: 2, x: 1 } };
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("ignores a pairing for a diagram that no longer exists", () => {
    const m = { pairs: { "1": [{ d: "retired-diagram", f: fingerprint(bankQ) }] } };
    expect(pairsFor(m, bankQ, DIAGRAMS)).toEqual([]);
  });

  it("passes concept-only pairings through as params null", () => {
    const m = { pairs: { "1": [{ d: "tonicity", f: fingerprint(bankQ), v: v("tonicity") }] } };
    expect(pairsFor(m, bankQ, DIAGRAMS)[0].params).toBeNull();
  });

  it(`never stacks more than ${MAX_PER_QUESTION} under one rationale`, () => {
    const f = fingerprint(bankQ);
    const m = { pairs: { "1": [{ d: "abg", f, v: v("abg") }, { d: "potassium", f, v: v("potassium") }, { d: "tonicity", f, v: v("tonicity") }] } };
    expect(pairsFor(m, bankQ, DIAGRAMS)).toHaveLength(MAX_PER_QUESTION);
  });

  /* PR #134 review: a pairing approved for what a diagram USED to teach
     must stop showing once the diagram's content changes. */
  it("stops showing when the diagram's clinical content has changed since the pairing was approved", () => {
    const old = { ...DIAGRAMS.insulin, facts: ["Long-acting insulin (glargine, detemir): about 24 hours."] };
    const m = { pairs: { "1": [{ d: "insulin", f: fingerprint(bankQ), v: diagramFp(old) }] } };
    expect(pairsFor(m, bankQ, DIAGRAMS)).toEqual([]);
    expect(pairsFor({ pairs: { "1": [{ d: "insulin", f: fingerprint(bankQ), v: v("insulin") }] } }, bankQ, DIAGRAMS)).toHaveLength(1);
  });
  it("shows nothing for a pairing that carries no content fingerprint", () => {
    expect(pairsFor({ pairs: { "1": [{ d: "abg", f: fingerprint(bankQ) }] } }, bankQ, DIAGRAMS)).toEqual([]);
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
  /* Version 2: every pairing carries the content fingerprint (v) of the
     diagram it was approved for, and a map with pairings records the
     drawing code it was built against (sourceKey; checked against the live
     code in tests/diagram-gate.test.js). */
  it("is version 2, and every pairing is complete and current", async () => {
    const m = (await import("../src/diagrams/item-map.json")).default;
    expect(m.version).toBe(2);
    const entries = Object.entries(m.pairs);
    if (entries.length) expect(m.sourceKey).toMatch(/^[0-9a-f]{24}$/);
    for (const [qid, list] of entries) {
      expect(qid).toMatch(/^\d+$/);
      for (const e of list) {
        expect(DIAGRAMS[e.d], `unknown diagram ${e.d}`).toBeDefined();
        expect(e.f).toMatch(/^[0-9a-f]{8}$/);
        expect(e.v, `${qid}:${e.d} approved for older diagram content`).toBe(diagramFp(DIAGRAMS[e.d]));
      }
    }
  });

  /* Producer to consumer: what the mapper writes is what the app shows. */
  it("shows exactly what the mapper produced, for the question it was made for", async () => {
    const { buildItemMap } = await import("../ops/map-diagrams-lib.mjs");
    const m = buildItemMap({
      "1:abg": { attach: true, shown: { ph: 7.3, paco2: 55, hco3: 24 }, fp: fingerprint(bankQ) },
      "1:tonicity": { attach: false, shown: null, fp: fingerprint(bankQ) },
    }, DIAGRAMS, "a".repeat(24), new Map([[1, bankQ]]));
    expect(m.version).toBe(2);
    const shown = pairsFor(JSON.parse(JSON.stringify(m)), bankQ, DIAGRAMS);
    expect(shown.map((x) => [x.diagram.id, x.params])).toEqual([["abg", { ph: 7.3, paco2: 55, hco3: 24 }]]);
    expect(pairsFor(m, { ...bankQ, stem: "another question" }, DIAGRAMS)).toEqual([]);
  });
});

describe("audioFor — recorded narration", () => {
  const d = DIAGRAMS.abg;
  const step = d.steps.find((s) => s.key === "ph");
  const clip = (text) => ({ url: "https://x/ph.mp3", textFp: fnv1a(text) });

  it("plays a clip whose recorded words match the step", () => {
    expect(audioFor({ clips: { abg: { ph: clip(step.narration) } } }, d)).toEqual({ ph: "https://x/ph.mp3" });
  });
  /* The script was edited after recording: never play old words. */
  it("drops a clip recorded from an older script", () => {
    expect(audioFor({ clips: { abg: { ph: clip("an older version of the script") } } }, d)).toBeNull();
  });
  it("never attaches a clip to a worked-example step", () => {
    const worked = d.steps.find((s) => s.dynamic);
    expect(audioFor({ clips: { abg: { [worked.key]: clip("anything") } } }, d)).toBeNull();
  });
  it("returns nothing when no clips are recorded", () => {
    expect(audioFor({ version: 1, clips: {} }, d)).toBeNull();
    expect(audioFor(null, d)).toBeNull();
  });
});

describe("the shipped narration manifest", () => {
  it("is valid, and every clip points at the public explainers bucket", async () => {
    const m = (await import("../src/diagrams/narration.json")).default;
    expect(m.version).toBe(1);
    for (const [did, clips] of Object.entries(m.clips)) {
      expect(DIAGRAMS[did], `unknown diagram ${did}`).toBeDefined();
      for (const c of Object.values(clips)) {
        expect(c.url).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/explainers\//);
        expect(c.textFp).toMatch(/^[0-9a-f]{8}$/);
      }
    }
  });
});
