/* What may attach a diagram to a question — and the pairing run's honesty.
   From Astra's review of PR #133:
     6  a diagram that FAILED its visual review could still be published;
     11 the pairing CLI crashed under plain Node on a .jsx import;
     12 a run whose every batch failed still reported success. */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approval, sourceKey, readReviewIndex, mapIsCurrent, stepInventory, diagramSteps, expectedFrames, frameIds } from "../ops/diagram-attest.mjs";
import { publishable, sameProposal, pairAll, exitCodeFor, itemHash, diagramHash, decisionKey } from "../ops/map-diagrams-lib.mjs";

const dg = { id: "abg", title: "ABG", facts: ["f"], steps: [{ key: "ph", caption: "c", narration: "n" }] };
const q = { id: 7, stem: "pH 7.30, PaCO2 55, HCO3 24", options: ["a", "b"], rationale: "r", answer: "a" };
const decision = { attach: true, itemHash: itemHash(q), diagramHash: diagramHash(dg), fp: "abc", shown: null };

describe("approval of a diagram for publication", () => {
  it("fails closed when missing, failed or stale", () => {
    const steps = ["ph", "lungs"], frames = frameIds(expectedFrames(steps));
    expect(approval({}, "abg", "k1", steps)).toEqual({ ok: false, why: "never reviewed" });
    expect(approval({ abg: { verdict: "FAIL", sourceKey: "k1", frames } }, "abg", "k1", steps).ok).toBe(false);
    expect(approval({ abg: { verdict: "PASS", sourceKey: "old", frames } }, "abg", "k1", steps)).toEqual({ ok: false, why: "changed since its review" });
    expect(approval({ abg: { verdict: "PASS", sourceKey: "k1", frames } }, "abg", "k1", steps)).toEqual({ ok: true, why: null });
    expect(() => approval({ abg: { verdict: "PASS", sourceKey: "k1", frames } }, "abg", "k1")).toThrow(/real steps are required/);
  });

  /* Astra, PR #134 review, round 24: a PASS recorded from prepared data
     that left out a real step — and that step's frames — still approved
     the diagram. A PASS now counts only for the frames it was shown. */
  it("does not approve a PASS whose review left out a real step", () => {
    const real = ["ph", "lungs", "kidneys"];
    const without = frameIds(expectedFrames(["ph", "lungs"]));
    expect(approval({ abg: { verdict: "PASS", sourceKey: "k1", frames: without } }, "abg", "k1", real)).toEqual({ ok: false, why: "its review did not cover every step" });
    expect(approval({ abg: { verdict: "PASS", sourceKey: "k1", frames: frameIds(expectedFrames([])) } }, "abg", "k1", real).ok).toBe(false);
    expect(approval({ abg: { verdict: "PASS", sourceKey: "k1" } }, "abg", "k1", real).ok, "an entry with no frames on record").toBe(false);
    expect(approval({ abg: { verdict: "PASS", sourceKey: "k1", frames: frameIds(expectedFrames(real)) } }, "abg", "k1", real).ok).toBe(true);
  });

  it("reads each diagram's steps from its source exactly as the app defines them", async () => {
    const { DIAGRAMS } = await import("../src/diagrams/index.js");
    const inv = stepInventory();
    expect(Object.keys(inv).sort()).toEqual(Object.keys(DIAGRAMS).sort());
    for (const [id, d] of Object.entries(DIAGRAMS)) expect(inv[id], id).toEqual(d.steps.map((s) => s.key));
  });

  it("refuses a step list it cannot read without running the code", () => {
    const ok = 'export const abg = { id: "abg", title: "t", steps: [{ key: "ph", caption: "c" }, { key: "lungs" }] };';
    expect(diagramSteps("abg.jsx", ok, "abg")).toEqual(["ph", "lungs"]);
    for (const [why, src] of [
      ["steps from a variable", 'const S = [{ key: "ph" }];\nexport const abg = { id: "abg", steps: S };'],
      ["a spread step", 'const extra = { key: "x" };\nexport const abg = { id: "abg", steps: [{ key: "ph" }, extra] };'],
      ["a spread object", 'const more = { steps: [] };\nexport const abg = { id: "abg", steps: [{ key: "ph" }], ...more };'],
      ["a computed key", 'const k = "ph";\nexport const abg = { id: "abg", steps: [{ key: k }] };'],
      ["a computed property", 'const p = "steps";\nexport const abg = { id: "abg", steps: [{ key: "ph" }], [p]: [] };'],
      ["duplicate keys", 'export const abg = { id: "abg", steps: [{ key: "ph" }, { key: "ph" }] };'],
      ["two definitions", 'export const abg = { id: "abg", steps: [] };\nexport const abg2 = { id: "abg", steps: [] };'],
      ["no definition", 'export const other = { id: "other", steps: [] };'],
    ]) expect(() => diagramSteps("abg.jsx", src, "abg"), why).toThrow(/stepInventory/);
  });

  it("publishes a confirmed pairing only for an approved diagram", () => {
    const decisions = { [decisionKey(7, "abg")]: decision };
    const items = new Map([[7, q]]);
    expect(Object.keys(publishable(decisions, items, { abg: dg }, () => true))).toEqual(["7:abg"]);
    // the drawing failed its visual review: the pairing review's "attach" is not enough
    expect(publishable(decisions, items, { abg: dg }, () => false)).toEqual({});
  });

  /* PR #134 review, finding 6: this used to call sourceKey() twice on an
     unchanged tree — a constant would have passed. Now each input is
     changed in a scratch copy and the key must move (or must not). */
  it("changes the key for any drawing change, and not for generated data", () => {
    const root = mkdtempSync(join(tmpdir(), "attest-"));
    try {
      cpSync("src/diagrams", join(root, "src/diagrams"), { recursive: true });
      cpSync("src/explainer.jsx", join(root, "src/explainer.jsx"));
      cpSync("src/App.jsx", join(root, "src/App.jsx"));
      cpSync("package.json", join(root, "package.json"));
      const base = sourceKey(root);
      expect(base).toMatch(/^[0-9a-f]{24}$/);
      const touch = (rel, edit) => {
        const p = join(root, rel), before = readFileSync(p, "utf8");
        writeFileSync(p, edit(before));
        const k = sourceKey(root);
        writeFileSync(p, before);
        return k;
      };
      for (const rel of ["src/diagrams/abg.jsx", "src/diagrams/kit.jsx", "src/diagrams/match.js", "src/explainer.jsx"]) {
        expect(touch(rel, (t) => t + "\n// changed\n"), rel).not.toBe(base);
      }
      expect(touch("src/App.jsx", (t) => t.replace("--teal:#0E7C6B", "--teal:#0E7C6C")), "theme colour").not.toBe(base);
      expect(touch("src/App.jsx", (t) => t + "\n// unrelated app code\n"), "app code outside the theme").toBe(base);
      for (const rel of ["src/diagrams/item-map.json", "src/diagrams/narration.json"]) {
        expect(touch(rel, (t) => t.replace(/\}\s*$/, ',"x":1}')), rel).toBe(base);
      }
      expect(sourceKey(root)).toBe(base);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /* The guard that holds at merge time: the shipped map may only name
     diagrams whose CURRENT code passed visual review. A drawing change after
     pairing fails this test until the review is run again. */
  /* PR #134 review: a fresh visual PASS must not revive a pairing made for
     different content or different extracted values. */
  it("retires a pairing whose extracted values today's matcher no longer reads", () => {
    const longDecision = { ...decision, extracted: { type: "long", givenAt: "21:00" } };
    const decisions = { [decisionKey(7, "abg")]: longDecision };
    const items = new Map([[7, q]]);
    const nowProposes = new Map([[7, [{ d: "abg", p: null }]]]);   // e.g. detemir: no longer read as long-acting
    expect(publishable(decisions, items, { abg: dg }, () => true, nowProposes)).toEqual({});
    const stillProposes = new Map([[7, [{ d: "abg", p: { type: "long", givenAt: "21:00" } }]]]);
    expect(Object.keys(publishable(decisions, items, { abg: dg }, () => true, stillProposes))).toEqual(["7:abg"]);
    expect(sameProposal([], "abg", null)).toBe(false);   // not proposed at all any more
  });
  it("retires a pairing approved for different clinical content, even after a fresh visual pass", () => {
    const decisions = { [decisionKey(7, "abg")]: decision };
    const changed = { ...dg, facts: ["a corrected fact"] };
    expect(publishable(decisions, new Map([[7, q]]), { abg: changed }, () => true)).toEqual({});
  });
  it("requires a map with pairings to be rebuilt after any drawing or matcher change", () => {
    const withPairs = { pairs: { "7": [{ d: "abg", f: "x", v: "y" }] }, sourceKey: "old" };
    expect(mapIsCurrent(withPairs, "new")).toBe(false);
    expect(mapIsCurrent({ ...withPairs, sourceKey: "new" }, "new")).toBe(true);
    expect(mapIsCurrent({ pairs: {} }, "new")).toBe(true);
  });

  it("ships no pairing for a diagram without a current passing review", () => {
    const map = JSON.parse(readFileSync("src/diagrams/item-map.json", "utf8"));
    expect(mapIsCurrent(map, sourceKey()), "item-map.json was built against older drawing code: rerun ops/map-diagrams.mjs").toBe(true);
    const used = new Set(Object.values(map.pairs).flat().map((p) => p.d));
    const index = readReviewIndex(), key = sourceKey();
    const steps = stepInventory();
    for (const id of used) expect(approval(index, id, key, steps[id]), id).toEqual({ ok: true, why: null });
  });
});

describe("a pairing run tells the truth about failures", () => {
  const blank = () => ({ asked: 0, attached: 0, attachedWithValues: 0, rejected: 0, failedBatches: [], stoppedFor: null });
  const base = { diagrams: { abg: dg }, maxUsd: 15, spent: () => 0, fingerprintOf: () => "fp", model: "m" };

  it("fails the run when every batch fails", async () => {
    const run = blank();
    await pairAll({ ...base, queue: { abg: [{ ...q, extracted: null }] }, decisions: {}, run, ask: async () => { throw new Error("401 bad key"); } });
    expect(run.failedBatches).toHaveLength(1);
    expect(exitCodeFor(run)).toBe(1);
  });

  it("succeeds only when every batch was answered", async () => {
    const run = blank(), decisions = {};
    await pairAll({ ...base, queue: { abg: [{ ...q, extracted: null }] }, decisions, run,
      ask: async () => ({ decisions: [{ id: 7, attach: true, values_confirmed: false, reason: "fits" }] }) });
    expect(run.asked).toBe(1);
    expect(decisions["7:abg"].attach).toBe(true);
    expect(exitCodeFor(run)).toBe(0);
  });

  it("stops at the spend cap without calling the reviewer", async () => {
    const run = blank();
    let called = 0;
    await pairAll({ ...base, spent: () => 99, queue: { abg: [{ ...q, extracted: null }] }, decisions: {}, run, ask: async () => { called++; return { decisions: [] }; } });
    expect(called).toBe(0);
    expect(run.stoppedFor).toMatch(/cap/);
  });
});

describe("the pairing CLI under plain Node", () => {
  it("starts without a .jsx import error", () => {
    const r = spawnSync(process.execPath, ["ops/map-diagrams.mjs", "--dry-run"], {
      encoding: "utf8", timeout: 90_000, env: { ...process.env, PULSERN_SUPABASE_URL: "http://127.0.0.1:9" },
    });
    const out = `${r.stdout}\n${r.stderr}`;
    expect(out).not.toMatch(/Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/);
    /* Got past module loading to the database read — whatever the review
       state of the diagrams (PR #134 review, finding 8: this once required
       a "held back" message that disappears once every diagram passes). */
    expect(out).toContain("Reading practice questions…");
  }, 120_000);
});
