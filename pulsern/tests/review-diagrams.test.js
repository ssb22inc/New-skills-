/* Astra's visual and clinical review of concept diagrams — the parts that
   decide what is sent and what a verdict means. No model is called. */
import { describe, it, expect } from "vitest";
import { imagePlan, diagramReviewPrompt, validateReview, verdictFor, reviewKey, renderReviewMarkdown, DIAGRAM_REVIEW_SCHEMA, canReuse, reviewOne, reviewAndRecord, diagramRequest, diagramSources } from "../ops/review-diagrams-lib.mjs";
import { DIAGRAMS } from "../src/diagrams/index.js";
import { signApproval, verifyApproval } from "../ops/diagram-attest.mjs";
import { testKeys } from "./helpers/attest-keys.js";
const KEYS = testKeys(), SIGNER = KEYS.signer;
const K = { prompt: "the review prompt", source: "export const x = 1;" };

const d = DIAGRAMS.abg;
const gallery = [
  { id: "abg", theme: "light", key: "static", file: "/l-static.png" },
  { id: "abg", theme: "dark", key: "static", file: "/d-static.png" },
  ...d.steps.map((s) => ({ id: "abg", theme: "light", key: s.key, file: `/l-${s.key}.png` })),
  ...d.steps.map((s) => ({ id: "abg", theme: "dark", key: s.key, file: `/d-${s.key}.png` })),
  { id: "potassium", theme: "light", key: "static", file: "/k.png" },
];

describe("what Astra is shown", () => {
  /* PR #133 review, finding 14: dark-theme step frames were never shown. */
  it("every frame in both themes — overview and every step — and only this diagram", () => {
    const plan = imagePlan(d, gallery);
    expect(plan.map((p) => p.file)).toEqual([
      "/l-static.png", ...d.steps.map((s) => `/l-${s.key}.png`),
      "/d-static.png", ...d.steps.map((s) => `/d-${s.key}.png`),
    ]);
  });
  it("refuses to review with a frame missing", () => {
    expect(() => imagePlan(d, gallery.filter((g) => !(g.theme === "dark" && g.key === d.steps[1].key)))).toThrow(/missing rendered frames dark\//);
  });
  it("labels each image so findings can point at one", () => {
    const p = diagramReviewPrompt(d, imagePlan(d, gallery), "rules");
    expect(p).toContain("Image 1: light theme — inline");
    expect(p).toContain(`Image 2: light theme — explainer step "${d.steps[0].key}"`);
    expect(p).toContain(`dark theme — explainer step "${d.steps[0].key}"`);
  });
  it("gives every clinical claim, caption and narration script", () => {
    const p = diagramReviewPrompt(d, imagePlan(d, gallery), "rules");
    for (const f of d.facts) expect(p).toContain(f);
    for (const s of d.steps.filter((x) => !x.dynamic)) { expect(p).toContain(s.caption); expect(p).toContain(s.narration); }
  });
  it("shows the worked example's computed caption, and says it is never recorded", () => {
    const p = diagramReviewPrompt(d, imagePlan(d, gallery), "rules");
    expect(p).toContain(d.dynamicCaption(d.example));
    expect(p).toContain("(none — never recorded)");
  });
  it("judges against the project's rules", () => {
    expect(diagramReviewPrompt(d, [], "coral only for incorrect/critical")).toContain("coral only for incorrect/critical");
  });
});

describe("what a verdict means", () => {
  const f = (severity, area = "clinical") => ({ severity, area, where: "Image 1", title: "t", problem: "p", fix: "x", confidence: "high" });
  it("fails on any blocker or major", () => {
    expect(verdictFor([f("major", "visual")]).verdict).toBe("FAIL");
    expect(verdictFor([f("blocker")]).verdict).toBe("FAIL");
  });
  it("passes with minors only", () => { expect(verdictFor([f("minor")]).verdict).toBe("PASS"); });
  it("rejects a finding with an unknown area or no fix", () => {
    expect(() => validateReview({ assessment: "a", findings: [f("major", "vibes")] })).toThrow(/bad area/);
    expect(() => validateReview({ assessment: "a", findings: [{ ...f("major"), fix: "" }] })).toThrow(/missing fix/);
  });
  it("uses a strict schema", () => { expect(DIAGRAM_REVIEW_SCHEMA.json_schema.strict).toBe(true); });
});

describe("paying only when something changed", () => {
  const png = (b) => Buffer.from([b]);
  it("keeps the verdict for an identical render and identical words", () => {
    expect(reviewKey(d, [png(1), png(2)], K)).toBe(reviewKey(d, [png(1), png(2)], K));
  });
  it("re-reviews when a single pixel of a render changes", () => {
    expect(reviewKey(d, [png(1), png(3)], K)).not.toBe(reviewKey(d, [png(1), png(2)], K));
  });
  it("re-reviews when a clinical claim changes", () => {
    expect(reviewKey({ ...d, facts: [...d.facts, "new claim"] }, [png(1)], K)).not.toBe(reviewKey(d, [png(1)], K));
  });
});

describe("the saved report", () => {
  it("records an unfinished review as a failure", () => {
    const md = renderReviewMarkdown({ title: "ABG", model: "m", reviewedAt: "t", images: 8, verdict: "FAIL", error: "timeout", findings: [] });
    expect(md).toContain("an unfinished review is not a pass");
  });
  it("says unknown, never $0, when the cost was not reported", () => {
    const md = renderReviewMarkdown({ title: "ABG", model: "m", reviewedAt: "t", images: 8, verdict: "PASS", counts: { blocker: 0, major: 0, minor: 0 }, findings: [], usage: { costUsd: null } });
    expect(md).toContain("| Cost | unknown |");
  });
});

/* PR #134 review, round 6: an operational error was cached as FAIL under the
   same key as a real verdict, and the normal re-run never retried it. */
describe("an error is retried, a verdict is reused", () => {
  const ok = { assessment: "Fine.", findings: [] };
  const F = ["light/static", "dark/static"];
  const sign = (e, id = "abg") => ({ ...e, sig: signApproval(id, e, SIGNER) });
  it("retries after an error and then reuses the completed review", async () => {
    const index = {};
    const run = async (ask) => {
      const prev = index.abg;
      if (canReuse(prev, "k1", false, F, "abg", SIGNER)) return "reused";
      const r = await reviewOne({ d, key: "k1", images: 2, model: "m", ask });
      index.abg = sign({ key: "k1", frames: F, verdict: r.verdict, completed: r.completed });
      return r.verdict;
    };
    expect(await run(async () => { throw new Error("timeout"); })).toBe("ERROR");
    expect(index.abg).toMatchObject({ verdict: "ERROR", completed: false });
    expect(await run(async () => ok)).toBe("PASS");        // same content: retried, not skipped
    expect(index.abg).toMatchObject({ verdict: "PASS", completed: true });
    expect(await run(async () => { throw new Error("should not be called"); })).toBe("reused");
  });
  it("never reuses a malformed answer as a verdict", async () => {
    const r = await reviewOne({ d, key: "k", images: 1, model: "m", ask: async () => ({ nonsense: true }) });
    expect(r).toMatchObject({ completed: false, verdict: "ERROR" });
    expect(canReuse({ key: "k", verdict: "ERROR", completed: false }, "k")).toBe(false);
    expect(canReuse({ key: "k", verdict: "FAIL" }, "k"), "an old entry with no completion record").toBe(false);
  });
  it("still reuses a completed FAIL — a real verdict is not re-bought", () => {
    expect(canReuse(sign({ key: "k", verdict: "FAIL", completed: true, frames: F }), "k", false, F, "abg", SIGNER)).toBe(true);
    expect(canReuse(sign({ key: "k", verdict: "FAIL", completed: true, frames: F }), "k", true, F, "abg", SIGNER)).toBe(false);
  });
  /* Round 24: a verdict is carried only with the same frames on record —
     never for an entry from before frames were recorded. */
  it("reuses a verdict only for the same frame set", () => {
    const prev = sign({ key: "k", verdict: "PASS", completed: true, frames: F });
    expect(canReuse(prev, "k", false, ["light/static"], "abg", SIGNER)).toBe(false);
    expect(canReuse(sign({ key: "k", verdict: "PASS", completed: true }), "k", false, F, "abg", SIGNER)).toBe(false);
    expect(canReuse(prev, "k")).toBe(false);
  });
  /* Round 25: the cache is in the branch, so a hand-written entry with the
     right key, frames and "completed PASS" suppressed the paid call. */
  it("never takes an entry the review job did not sign as a review", async () => {
    const forged = { key: "k1", sourceKey: "s", frames: F, verdict: "PASS", completed: true, reviewedAt: "2026-10-09T00:00:00.000Z", model: "m", report: "x.md" };
    expect(canReuse(forged, "k1", false, F, "abg", SIGNER)).toBe(false);
    expect(canReuse({ ...forged, sig: "0".repeat(64) }, "k1", false, F, "abg", SIGNER)).toBe(false);
    expect(canReuse({ ...forged, sig: signApproval("abg", forged, KEYS.other) }, "k1", false, F, "abg", SIGNER), "signed with another key").toBe(false);
    expect(canReuse(sign(forged, "tonicity"), "k1", false, F, "abg", SIGNER), "another diagram's signature").toBe(false);
    // the run: a forged cache entry does not stop the reviewer being asked
    const index = { abg: forged };
    let asked = 0;
    if (!canReuse(index.abg, "k1", false, F, "abg", SIGNER)) {
      const { write } = { write: () => {} };
      await reviewAndRecord({ d: { ...d, images: [{ theme: "light", key: "static" }, { theme: "dark", key: "static" }] }, key: "k1", images: 2, model: "m", dir: "r", index, sourceKey: "s", write, signer: SIGNER,
        ask: async () => { asked++; return ok; } });
    }
    expect(asked).toBe(1);
    expect(verifyApproval("abg", index.abg, SIGNER)).toBe(true);
    expect(canReuse(index.abg, "k1", false, F, "abg", SIGNER)).toBe(true);
  });
});

/* Astra, PR #134 review, round 13: the report was written only after the
   paid call returned, so a hung or killed call left no record of it. */
describe("a paid diagram review is recorded before it is asked", () => {
  const d = { id: "abg", title: "ABG", images: [{ theme: "light", key: "static" }, { theme: "dark", key: "static" }] };
  const store = () => { const files = {}; return { files, write: (p, s) => { files[p] = s; } }; };
  const answer = { assessment: "fine", findings: [] };
  it("writes a 'did not finish' checkpoint and index entry before the reviewer answers", async () => {
    const { files, write } = store();
    const index = {};
    let release;
    const pending = reviewAndRecord({ d, key: "k1", images: 2, model: "m", dir: "r", index, sourceKey: "s", write, signer: SIGNER,
      now: () => "2026-10-09T12:00:00.000Z", ask: () => new Promise((res) => { release = res; }) });
    await new Promise((r) => setTimeout(r, 10));
    const json = Object.keys(files).find((p) => p.endsWith(".json") && p.startsWith("r/abg/"));
    expect(json).toBeTruthy();
    expect(JSON.parse(files[json])).toMatchObject({ verdict: "ERROR", completed: false });
    expect(JSON.parse(files["r/index.json"]).abg).toMatchObject({ key: "k1", verdict: "ERROR", completed: false });
    release(answer);
    const r = await pending;
    // the same attempt's files are finalised, not a second record
    expect(JSON.parse(files[json])).toMatchObject({ verdict: "PASS", completed: true });
    expect(JSON.parse(files["r/index.json"]).abg).toMatchObject({ verdict: "PASS", completed: true, report: r.report, frames: ["light/static", "dark/static"] });
  });
  it("gives up on a reviewer that never answers, and keeps the record", async () => {
    const { files, write } = store();
    const index = {};
    const r = await reviewAndRecord({ d, key: "k2", images: 1, model: "m", dir: "r", index, sourceKey: "s", write, signer: SIGNER,
      timeoutMs: 30, ask: () => new Promise(() => {}) });
    expect(r).toMatchObject({ verdict: "ERROR", completed: false });
    expect(r.error).toMatch(/no answer within/);
    expect(JSON.parse(files["r/index.json"]).abg).toMatchObject({ key: "k2", completed: false });
    expect(canReuse(index.abg, "k2")).toBe(false);   // retried next run, never cached
  });
  it("records nothing it cannot sign", async () => {
    const { files, write } = store();
    await expect(reviewAndRecord({ d, key: "k", images: 1, model: "m", dir: "r", index: {}, sourceKey: "s", write, ask: async () => answer })).rejects.toThrow(/no signing key/);
    expect(Object.keys(files)).toHaveLength(0);
  });
  it("keeps every attempt under its own name", async () => {
    const { files, write } = store();
    const index = {};
    let t = 0;
    const now = () => `2026-10-09T12:00:0${t++}.000Z`;
    await reviewAndRecord({ d, key: "k", images: 1, model: "m", dir: "r", index, sourceKey: "s", write, signer: SIGNER, now, ask: async () => { throw new Error("boom"); } });
    await reviewAndRecord({ d, key: "k", images: 1, model: "m", dir: "r", index, sourceKey: "s", write, signer: SIGNER, now, ask: async () => answer });
    expect(Object.keys(files).filter((p) => p.endsWith(".json") && p.startsWith("r/abg/"))).toHaveLength(2);
  });
});

/* Astra, PR #134 review, round 17: a change to the worked-example caption
   logic kept a cached approval, because only static words and pixels were
   in the key. */
describe("the review key covers everything the verdict rests on", () => {
  const d = DIAGRAMS.abg;
  const pngs = [Buffer.from([1, 2, 3])];
  const base = { prompt: diagramReviewPrompt(d, [{ label: "x" }], "rules"), source: "function interpret() { return 1; }" };
  it("changes when only the dynamic caption changes", () => {
    const changed = { ...d, dynamicCaption: (p) => `${d.dynamicCaption(p)} — and this is now wrong.` };
    expect(reviewKey(changed, pngs, { ...base, prompt: diagramReviewPrompt(changed, [{ label: "x" }], "rules") })).not.toBe(reviewKey(d, pngs, base));
    // even if the example's own caption is unchanged, the caption logic lives
    // in the diagram's source, which is in the key (and shown to the reviewer)
    const changedLogic = { ...base, source: base.source.replace("return 1;", "return p === example ? 1 : 'wrong for every other value';") };
    expect(changedLogic.source).not.toBe(base.source);
    expect(reviewKey(d, pngs, changedLogic)).not.toBe(reviewKey(d, pngs, base));
  });
  it("changes when the diagram's source or the prompt changes", () => {
    expect(reviewKey(d, pngs, { ...base, source: base.source + " " })).not.toBe(reviewKey(d, pngs, base));
    expect(reviewKey(d, pngs, { ...base, prompt: base.prompt + "!" })).not.toBe(reviewKey(d, pngs, base));
  });
  it("refuses to compute a key without the prompt and source", () => {
    expect(() => reviewKey(d, pngs)).toThrow(/required/);
  });
});

/* Astra, PR #134 review, round 19: changed logic invalidated the cache but
   was never shown to the reviewer. */
describe("the reviewer sees the logic, not only the example", () => {
  it("puts the diagram's source in the request", () => {
    const d = DIAGRAMS.abg;
    const source = "export function interpretAbg() { /* branch for pH 7.20 */ return 'changed'; }";
    const p = diagramReviewPrompt(d, [{ label: "x" }], "rules", source);
    expect(p).toContain("branch for pH 7.20");
    expect(p).toMatch(/EVERY set of values/);
  });
  it("builds the request and its key from the same source, so a logic change is both re-reviewed and shown", () => {
    const d = DIAGRAMS.abg;
    const pngs = [Buffer.from([1])];
    const before = diagramRequest(d, [{ label: "x" }], "rules", pngs, () => "if (ph < 7.35) return 'acidosis';");
    const after = diagramRequest(d, [{ label: "x" }], "rules", pngs, () => "if (ph < 7.30) return 'acidosis';");
    expect(after.key).not.toBe(before.key);
    expect(after.prompt).toContain("ph < 7.30");
    expect(before.prompt).not.toContain("ph < 7.30");
  });
});

/* Astra, PR #134 review, round 20: kit.jsx draws every gauge and chip but
   was in neither the request nor the key, so a change there kept a PASS. */
describe("a review covers everything the drawing depends on", () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
  const { join } = require("node:path");
  const { tmpdir } = require("node:os");
  const tree = (kitBranch) => {
    const root = mkdtempSync(join(tmpdir(), "diagram-src-"));
    mkdirSync(join(root, "src/diagrams"), { recursive: true });
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import React from "react";\nimport { Gauge } from "./kit.jsx";\nexport const A = 1;\n');
    writeFileSync(join(root, "src/diagrams/kit.jsx"), `import { tone } from "./tone";\nexport function Gauge(v) { ${kitBranch} }\n`);
    writeFileSync(join(root, "src/diagrams/tone.js"), "export const tone = 1;\n");
    writeFileSync(join(root, "src/explainer.jsx"), 'import { DIAGRAM_CSS } from "./diagrams/kit.jsx";\nexport const E = 1;\n');
    writeFileSync(join(root, "src/diagrams/index.js"), 'export const DIAGRAMS = {};\n');
    writeFileSync(join(root, "src/diagrams/match.js"), 'export const proposePairs = () => [];\n');
    writeFileSync(join(root, "src/App.jsx"), '.app{--paper:#F3F6F4;--teal:#0a7;--mon:#000;--ecg:#0f0;}.app[data-theme="dim"]{--paper:#151A18;--teal:#3c9;}');
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { react: "18" } }));
    return root;
  };
  it("follows imports transitively and includes the explainer and theme", () => {
    const root = tree("return v;");
    const s = diagramSources("abg", root);
    for (const p of ["src/diagrams/abg.jsx", "src/diagrams/kit.jsx", "src/diagrams/tone.js", "src/explainer.jsx", "theme tokens"]) expect(s).toContain(p);
    expect(s.match(/===== src\/diagrams\/kit\.jsx =====/g)).toHaveLength(1);   // visited once
    rmSync(root, { recursive: true, force: true });
  });
  it("a kit.jsx branch the example never draws still invalidates the approval and is shown", () => {
    const a = tree("return v;"), b = tree("if (v < 20) return 'off-scale marker moved'; return v;");
    const pngs = [Buffer.from([1])];
    const ra = diagramRequest(DIAGRAMS.abg, [{ label: "x" }], "rules", pngs, (id) => diagramSources(id, a));
    const rb = diagramRequest(DIAGRAMS.abg, [{ label: "x" }], "rules", pngs, (id) => diagramSources(id, b));
    expect(rb.key).not.toBe(ra.key);
    expect(rb.prompt).toContain("off-scale marker moved");
    expect(canReuse({ key: ra.key, completed: true, verdict: "PASS" }, rb.key)).toBe(false);
    rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true });
  });
  /* Round 21: an imported JSON value, and re-exported modules, were not
     followed, so a threshold could change under a cached PASS. */
  it("includes imported data and re-exports, and a change there invalidates the approval", () => {
    const make = (limit) => {
      const root = tree("return v;");
      writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import limits from "./limits.json";\nexport { Gauge } from "./kit.jsx";\nimport "./side.js";\nconst lazy = () => import("./lazy.js");\nexport const A = limits.low;\n');
      writeFileSync(join(root, "src/diagrams/limits.json"), JSON.stringify({ low: limit }));
      writeFileSync(join(root, "src/diagrams/side.js"), "globalThis.side = 1;\n");
      writeFileSync(join(root, "src/diagrams/lazy.js"), "export const L = 'lazy';\n");
      return root;
    };
    const a = make(7.35), b = make(7.3);
    const sa = diagramSources("abg", a), sb = diagramSources("abg", b);
    for (const p of ["src/diagrams/limits.json", "src/diagrams/kit.jsx", "src/diagrams/side.js", "src/diagrams/lazy.js"]) expect(sa).toContain(p);
    expect(sb).toContain('"low":7.3');
    const pngs = [Buffer.from([1])];
    const ra = diagramRequest(DIAGRAMS.abg, [{ label: "x" }], "rules", pngs, () => sa);
    const rb = diagramRequest(DIAGRAMS.abg, [{ label: "x" }], "rules", pngs, () => sb);
    expect(rb.key).not.toBe(ra.key);
    expect(canReuse({ key: ra.key, completed: true, verdict: "PASS" }, rb.key)).toBe(false);
    rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true });
  });
  /* Round 22: a relative import could climb out of the checkout and put
     a git config or /proc contents into the paid request. */
  it("refuses to read anything outside src/, by ../ or through a symlink", () => {
    const { symlinkSync } = require("node:fs");
    const root = tree("return v;");
    writeFileSync(join(root, "secret.txt"), "GITHUB_TOKEN=ghs_sentinel");
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import s from "../../secret.txt";\n');
    expect(() => diagramSources("abg", root)).toThrow(/leaves the project|outside src/);
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import s from "./leak.txt";\n');
    symlinkSync(join(root, "secret.txt"), join(root, "src/diagrams/leak.txt"));
    expect(() => diagramSources("abg", root)).toThrow(/outside src/);
    rmSync(root, { recursive: true, force: true });
  });
  /* Round 22: the publication key hashed only top-level files, so a nested
     or .mjs dependency could change under a current approval. */
  it("the publication key covers every dependency the reviewer is shown", async () => {
    const { sourceKey } = await import("../ops/diagram-attest.mjs");
    const root = tree("return v;");
    mkdirSync(join(root, "src/clinical"), { recursive: true });
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import { LOW } from "../clinical/limits.mjs";\nexport const A = LOW;\n');
    writeFileSync(join(root, "src/clinical/limits.mjs"), "export const LOW = 7.35;\n");
    const before = sourceKey(root);
    expect(diagramSources("abg", root)).toContain("src/clinical/limits.mjs");
    writeFileSync(join(root, "src/clinical/limits.mjs"), "export const LOW = 7.30;\n");
    expect(sourceKey(root)).not.toBe(before);
    rmSync(root, { recursive: true, force: true });
  });
  /* Round 23: a second import on the same line was missed, so a nested
     clinical module could change without invalidating the approval. */
  it("finds every import from the syntax tree, wherever it sits", async () => {
    const { sourceKey, importsOf } = await import("../ops/diagram-attest.mjs");
    expect(importsOf("x.jsx", 'import React from "react"; import { LOW } from "../clinical/limits.mjs";\nconst s = "import nope from \'./fake.js\'";\nexport * from "./a.js"; export { B } from "./b.js";\nconst r = require("./c.js");\nconst el = <div>{LOW}</div>;')).toEqual(["react", "../clinical/limits.mjs", "./a.js", "./b.js", "./c.js"]);
    expect(() => importsOf("x.js", "const m = require(name);")).toThrow(/computed/);
    expect(() => importsOf("x.js", "this is ( not javascript")).toThrow(/could not be parsed/);
    const root = tree("return v;");
    mkdirSync(join(root, "src/clinical"), { recursive: true });
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import React from "react"; import { LOW } from "../clinical/limits.mjs";\nexport const A = () => <div>{LOW}</div>;\n');
    writeFileSync(join(root, "src/clinical/limits.mjs"), "export const LOW = 7.35;\n");
    const before = sourceKey(root);
    expect(diagramSources("abg", root)).toContain("src/clinical/limits.mjs");
    writeFileSync(join(root, "src/clinical/limits.mjs"), "export const LOW = 7.30;\n");
    expect(sourceKey(root)).not.toBe(before);
    rmSync(root, { recursive: true, force: true });
  });
  it("refuses an import it cannot follow or show", () => {
    const root = tree("return v;");
    writeFileSync(join(root, "src/diagrams/abg.jsx"), "const n = 'x';\nconst m = () => import(`./${n}.js`);\n");
    expect(() => diagramSources("abg", root)).toThrow(/computed/);
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import pic from "./pic.png";\n');
    writeFileSync(join(root, "src/diagrams/pic.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]));
    expect(() => diagramSources("abg", root)).toThrow(/not text/);
    rmSync(root, { recursive: true, force: true });
  });
  /* Round 24: a root-relative import ("/src/…", which Vite loads from the
     project root) was skipped as if it were a package, so the module never
     reached the reviewer or the approval key. */
  it("follows root-relative imports, and a logic change there invalidates the approval", async () => {
    const { sourceKey } = await import("../ops/diagram-attest.mjs");
    const root = tree("return v;");
    mkdirSync(join(root, "src/clinical"), { recursive: true });
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import { lowFor } from "/src/clinical/limits.mjs";\nexport const A = () => lowFor(7.4);\n');
    writeFileSync(join(root, "src/clinical/limits.mjs"), "export const lowFor = (ph) => (ph < 7.0 ? 'critical' : 7.35);\n");
    const before = sourceKey(root);
    expect(diagramSources("abg", root)).toContain("src/clinical/limits.mjs");
    // a threshold the example (pH 7.4) never reaches
    writeFileSync(join(root, "src/clinical/limits.mjs"), "export const lowFor = (ph) => (ph < 6.9 ? 'critical' : 7.35);\n");
    expect(sourceKey(root)).not.toBe(before);
    expect(diagramSources("abg", root)).toContain("ph < 6.9");
    rmSync(root, { recursive: true, force: true });
  });
  it("resolves like Vite: an exact file wins, two candidates are refused, unknown names are refused", async () => {
    const { resolveImport } = await import("../ops/diagram-attest.mjs");
    const root = tree("return v;");
    writeFileSync(join(root, "src/diagrams/limits.js"), "export const L = 'js';\n");
    writeFileSync(join(root, "src/diagrams/limits.jsx"), "export const L = 'jsx';\n");
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import { L } from "./limits";\n');
    expect(() => diagramSources("abg", root)).toThrow(/could mean src\/diagrams\/limits\.js or src\/diagrams\/limits\.jsx/);
    expect(resolveImport(root, "src/diagrams/abg.jsx", "./limits.jsx")).toBe("src/diagrams/limits.jsx");
    expect(resolveImport(root, "src/diagrams/abg.jsx", "./tone")).toBe("src/diagrams/tone.js");
    expect(resolveImport(root, "src/diagrams/abg.jsx", "/src/diagrams/tone.js")).toBe("src/diagrams/tone.js");
    expect(resolveImport(root, "src/diagrams/abg.jsx", "react")).toBe(null);
    expect(resolveImport(root, "src/diagrams/abg.jsx", "react/jsx-runtime")).toBe(null);
    expect(() => resolveImport(root, "src/diagrams/abg.jsx", "clinical/limits")).toThrow(/neither a project file nor a dependency/);
    expect(() => resolveImport(root, "src/diagrams/abg.jsx", "./tone.js?raw")).toThrow(/not a plain path/);
    expect(() => resolveImport(root, "src/diagrams/abg.jsx", "/../secret.txt")).toThrow(/leaves the project/);
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import x from "/package.json";\n');
    expect(() => diagramSources("abg", root)).toThrow(/outside src/);
    rmSync(root, { recursive: true, force: true });
  });
  /* Round 25: a TypeScript module was accepted as data, so what it
     imported was never followed. */
  it("refuses a dependency format whose own imports it cannot follow", () => {
    const root = tree("return v;");
    mkdirSync(join(root, "src/clinical"), { recursive: true });
    writeFileSync(join(root, "src/clinical/thresholds.json"), '{"low": 7.35}');
    writeFileSync(join(root, "src/clinical/interpret.ts"), 'import t from "./thresholds.json";\nexport const low = (x: number) => x < t.low;\n');
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import { low } from "/src/clinical/interpret.ts";\nexport const A = low;\n');
    expect(() => diagramSources("abg", root)).toThrow(/interpret\.ts is not a JavaScript module or JSON/);
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import { low } from "../clinical/interpret";\nexport const A = low;\n');
    expect(() => diagramSources("abg", root)).toThrow(/interpret\.ts is not a JavaScript module or JSON/);
    writeFileSync(join(root, "src/diagrams/style.css"), '@import "./more.css";\n');
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import "./style.css";\n');
    expect(() => diagramSources("abg", root)).toThrow(/style\.css is not a JavaScript module or JSON/);
    rmSync(root, { recursive: true, force: true });
  });
  /* Round 26: the registry the renderer runs was not in a diagram's own
     review, so a wrapper added there kept the diagram's approval. */
  it("covers the registry the app loads: a wrapper there needs a new review", async () => {
    const { sourceKey } = await import("../ops/diagram-attest.mjs");
    const root = tree("return v;");
    writeFileSync(join(root, "src/diagrams/index.js"), 'import { A } from "./abg.jsx";\nexport const DIAGRAMS = { abg: A };\n');
    const pngs = [Buffer.from([1])];
    const before = { s: diagramSources("abg", root), k: sourceKey(root) };
    const ra = diagramRequest(DIAGRAMS.abg, [{ label: "x" }], "rules", pngs, () => before.s);
    expect(before.s).toContain("===== src/diagrams/index.js =====");
    writeFileSync(join(root, "src/diagrams/index.js"), 'import { A } from "./abg.jsx";\nconst wrap = (f) => (x) => (x > 7.5 ? "wrong" : f(x));\nexport const DIAGRAMS = { abg: wrap(A) };\n');
    const after = diagramSources("abg", root);
    expect(after).toContain('x > 7.5 ? "wrong"');
    const rb = diagramRequest(DIAGRAMS.abg, [{ label: "x" }], "rules", pngs, () => after);
    expect(rb.key).not.toBe(ra.key);
    expect(rb.prompt).toContain('x > 7.5 ? "wrong"');
    expect(sourceKey(root)).not.toBe(before.k);
    rmSync(root, { recursive: true, force: true });
  });
  it("follows helpers imported only by the registry or the matcher", async () => {
    const { sourceKey } = await import("../ops/diagram-attest.mjs");
    const root = tree("return v;");
    mkdirSync(join(root, "src/clinical"), { recursive: true });
    writeFileSync(join(root, "src/clinical/caption.js"), "export const cap = (ph) => (ph < 7.35 ? 'acidosis' : 'normal');\n");
    writeFileSync(join(root, "src/clinical/read.js"), "export const readK = (s) => Number(/K (\\d\\.\\d)/.exec(s)?.[1]);\n");
    writeFileSync(join(root, "src/diagrams/index.js"), 'import { cap } from "../clinical/caption.js";\nexport const DIAGRAMS = { cap };\n');
    writeFileSync(join(root, "src/diagrams/match.js"), 'import { readK } from "/src/clinical/read.js";\nexport const proposePairs = (q) => [readK(q.stem)];\n');
    const k0 = sourceKey(root), s0 = diagramSources("abg", root);
    expect(s0).toContain("src/clinical/caption.js");
    writeFileSync(join(root, "src/clinical/caption.js"), "export const cap = (ph) => (ph < 7.2 ? 'acidosis' : 'normal');\n");
    expect(diagramSources("abg", root)).not.toBe(s0);
    const k1 = sourceKey(root);
    expect(k1).not.toBe(k0);
    writeFileSync(join(root, "src/clinical/read.js"), "export const readK = (s) => 2.9;\n");
    expect(sourceKey(root), "a matcher helper change re-checks every pairing").not.toBe(k1);
    rmSync(root, { recursive: true, force: true });
  });
  /* Round 29: import.meta.glob loads files the walk never saw. */
  it("refuses import.meta, which loads files the walk cannot follow", async () => {
    const { importsOf } = await import("../ops/diagram-attest.mjs");
    expect(() => importsOf("x.js", 'const t = import.meta.glob("../clinical/*.json", { eager: true });')).toThrow(/import\.meta/);
    expect(() => importsOf("x.js", 'const u = new URL("./table.json", import.meta.url);')).toThrow(/import\.meta/);
    const root = tree("return v;");
    mkdirSync(join(root, "src/clinical"), { recursive: true });
    writeFileSync(join(root, "src/clinical/limits.json"), '{"low": 7.35}');
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'const tables = import.meta.glob("../clinical/*.json", { eager: true, import: "default" });\nexport const A = tables;\n');
    expect(() => diagramSources("abg", root)).toThrow(/import\.meta/);
    rmSync(root, { recursive: true, force: true });
  });
  it("refuses to build a request when an import cannot be found", () => {
    const root = tree("return v;");
    writeFileSync(join(root, "src/diagrams/abg.jsx"), 'import { X } from "./missing.jsx";\n');
    expect(() => diagramSources("abg", root)).toThrow(/not found/);
    rmSync(root, { recursive: true, force: true });
  });
});
