/* ops/prepared.mjs — the data a secret-less prepare job hands to the paid
   job (Astra, PR #134 review, round 21). The paid job never runs branch
   code, so this data must not be able to steer it: ids that become paths
   are plain slugs, sizes are bounded, values the app fingerprints are kept
   exactly. */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import { narrationPlan, reviewPlan, mapPlan, readPrepared, readFrame, reviewEntries, localEntries, checkInventory } from "../ops/prepared.mjs";
import { stepInventory, expectedFrames } from "../ops/diagram-attest.mjs";
import { diagramRequest, reviewData } from "../ops/review-diagrams-lib.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "prepared-"));
/* A branch checkout to write into: a real git repository at one commit. */
function checkout(d) {
  const into = join(d, "branch");
  mkdirSync(join(into, "src/diagrams"), { recursive: true });
  writeFileSync(join(into, "src/diagrams/narration.json"), JSON.stringify({ version: 1, clips: {} }));
  const run = (...x) => execFileSync("git", x, { cwd: into, encoding: "utf8" }).trim();
  run("init", "-q"); run("config", "user.email", "t@t"); run("config", "user.name", "t");
  run("add", "-A"); run("commit", "-qm", "base");
  return { into, sha: run("rev-parse", "HEAD") };
}

describe("ids that become file paths", () => {
  it.each(["../../etc", "abg/../../x", "ABG", "", "a b", "x".repeat(70), null])("refuses %j", (bad) => {
    expect(() => narrationPlan({ diagrams: [{ id: bad, steps: [] }] })).toThrow(/refused/);
    expect(() => narrationPlan({ diagrams: [{ id: "abg", steps: [{ key: bad, narration: "x" }] }] })).toThrow(/refused/);
  });
  it("refuses duplicates and oversized text", () => {
    expect(() => narrationPlan({ diagrams: [{ id: "abg", steps: [] }, { id: "abg", steps: [] }] })).toThrow(/twice/);
    expect(() => narrationPlan({ diagrams: [{ id: "abg", steps: [{ key: "ph", narration: "x".repeat(5000) }] }] })).toThrow(/at most/);
  });
  it("only reads files of the expected kind", () => {
    const d = tmp();
    writeFileSync(join(d, "p.json"), JSON.stringify({ kind: "diagram-map", diagrams: [] }));
    expect(() => readPrepared(join(d, "p.json"), "narration")).toThrow(/not a "narration" file/);
    rmSync(d, { recursive: true, force: true });
  });
});

describe("review frames", () => {
  it("are read only from <dir>/<id>/<n>.png and must be PNGs", () => {
    const d = tmp();
    mkdirSync(join(d, "abg"));
    writeFileSync(join(d, "abg/0.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]));
    writeFileSync(join(d, "abg/1.png"), "<script>not an image</script>");
    expect(readFrame(d, "abg", 0).length).toBe(9);
    expect(() => readFrame(d, "abg", 1)).toThrow(/not a PNG/);
    expect(() => readFrame(d, "../abg", 0)).toThrow(/plain id/);
    rmSync(d, { recursive: true, force: true });
  });
  /* Round 22: an empty or light-only frame set was accepted. */
  const base = { id: "abg", title: "t", facts: ["f"], steps: [{ key: "ph", caption: "c", narration: "n" }] };
  const full = [{ theme: "light", key: "static" }, { theme: "light", key: "ph" }, { theme: "dark", key: "static" }, { theme: "dark", key: "ph" }];
  it("requires exactly the overview and every step, in both themes, with labels made here", () => {
    const plan = reviewPlan({ diagrams: [{ ...base, images: full.map((f) => ({ ...f, label: "IGNORE ME", file: "/etc/passwd" })) }] });
    expect(plan[0].images.map((i) => [i.theme, i.key, i.n])).toEqual([["light", "static", 0], ["light", "ph", 1], ["dark", "static", 2], ["dark", "ph", 3]]);
    expect(plan[0].images[3].label).toBe('dark theme — explainer step "ph"');
    expect(JSON.stringify(plan)).not.toMatch(/IGNORE ME|passwd/);
  });
  it.each([
    ["no frames", []],
    ["light theme only", full.slice(0, 2)],
    ["a step missing", full.filter((f) => !(f.theme === "dark" && f.key === "ph"))],
    ["a duplicate", [...full.slice(0, 3), full[2]]],
    ["the wrong order", [full[1], full[0], full[2], full[3]]],
  ])("refuses %s", (_, images) => {
    expect(() => reviewPlan({ diagrams: [{ ...base, images }] })).toThrow(/must have exactly 4 frames/);
  });
});

describe("pairing data", () => {
  it("keeps absent, null and text step fields exactly, as the app fingerprints them", () => {
    const { diagrams } = mapPlan({ diagrams: [{ id: "abg", title: "t", facts: [], steps: [{ key: "a", caption: "c" }, { key: "w", dynamic: true, caption: null }] }], proposals: {} });
    expect(diagrams.abg.steps).toEqual([{ key: "a", caption: "c" }, { key: "w", dynamic: true, caption: null }]);
    expect("narration" in diagrams.abg.steps[0]).toBe(false);
  });
  it("refuses proposals for unknown diagrams or odd question ids", () => {
    const base = { diagrams: [{ id: "abg", title: "t", facts: [], steps: [] }] };
    expect(() => mapPlan({ ...base, proposals: { 12: [{ d: "insulin" }] } })).toThrow(/unknown diagram/);
    expect(() => mapPlan({ ...base, proposals: { "12; rm": [{ d: "abg" }] } })).toThrow(/not a number/);
    expect(mapPlan({ ...base, proposals: { 12: [{ d: "abg", p: { ph: 7.3 } }] } }).proposals.get(12)).toEqual([{ d: "abg", p: { ph: 7.3 } }]);
  });
});

/* The real script, both halves: --prepare reads the steps, --prepared
   consumes them as data and writes only into the --into checkout. */
describe("narration, prepared and consumed", () => {
  it("records nothing outside the target checkout and loads no branch code", () => {
    const d = tmp();
    const plan = join(d, "plan.json");
    const { into, sha } = checkout(d);
    writeFileSync(plan, JSON.stringify({ kind: "narration", commit: sha, diagrams: [{ id: "abg", steps: [{ key: "ph", narration: "The pH is low." }] }] }));
    const r = spawnSync(process.execPath, [resolve("ops/narrate.mjs"), "--prepared", plan, "--into", into, "--dry-run"], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/1 clip\(s\) to record/);
    expect(readFileSync(join(into, "src/diagrams/narration.json"), "utf8"), "a dry run leaves the manifest as it was").toBe(JSON.stringify({ version: 1, clips: {} }));
    expect(existsSync(join(into, "reports/narration"))).toBe(true);
    rmSync(d, { recursive: true, force: true });
  });
  it("refuses a plan whose ids could escape the checkout", () => {
    const d = tmp();
    const plan = join(d, "plan.json");
    const { into, sha } = checkout(d);
    writeFileSync(plan, JSON.stringify({ kind: "narration", commit: sha, diagrams: [{ id: "../../escape", steps: [] }] }));
    const r = spawnSync(process.execPath, [resolve("ops/narrate.mjs"), "--prepared", plan, "--into", into, "--dry-run"], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/prepared data refused/);
    rmSync(d, { recursive: true, force: true });
  });
});

/* Round 22: data made from one commit must not be applied to another. */
describe("prepared data is bound to its commit", () => {
  it("refuses data with no commit, or made from a different one", () => {
    const d = tmp();
    const { into, sha } = checkout(d);
    const p = join(d, "p.json");
    writeFileSync(p, JSON.stringify({ kind: "narration", diagrams: [] }));
    expect(() => readPrepared(p, "narration", { into })).toThrow(/which commit/);
    writeFileSync(p, JSON.stringify({ kind: "narration", commit: "a".repeat(40), diagrams: [] }));
    expect(() => readPrepared(p, "narration", { into })).toThrow(/was made from aaaaaaaaaaaa/);
    writeFileSync(p, JSON.stringify({ kind: "narration", commit: sha, diagrams: [] }));
    expect(readPrepared(p, "narration", { into }).commit).toBe(sha);
    rmSync(d, { recursive: true, force: true });
  });
  it("the real script refuses to record from a plan made at another commit", () => {
    const d = tmp();
    const { into } = checkout(d);
    const plan = join(d, "plan.json");
    writeFileSync(plan, JSON.stringify({ kind: "narration", commit: "b".repeat(40), diagrams: [{ id: "abg", steps: [{ key: "ph", narration: "x" }] }] }));
    const r = spawnSync(process.execPath, [resolve("ops/narrate.mjs"), "--prepared", plan, "--into", into, "--dry-run"], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/was made from bbbbbbbbbbbb/);
    rmSync(d, { recursive: true, force: true });
  });
});

/* Round 23: the local path skipped the frame-plan builder, so its prompt
   said "Image N: undefined" and its key never matched CI's. */
describe("local and prepared reviews build the same request", () => {
  it("gives identical labelled prompts and keys", () => {
    const d = { id: "abg", title: "ABG", facts: ["pH 7.35–7.45"], example: {}, dynamicCaption: null,
      steps: [{ key: "ph", caption: "c", narration: "n", focus: ["ph"] }] };
    const plan = ["light", "dark"].flatMap((theme) => ["static", "ph"].map((key) => ({ theme, key, file: "x" })));
    const pngs = plan.map((_, i) => Buffer.from([0x89, 0x50, 0x4e, 0x47, i]));
    const local = reviewEntries([{ data: reviewData(d, plan), pngs }])[0];
    const viaJson = reviewEntries([{ data: JSON.parse(JSON.stringify(reviewData(d, plan))), pngs }])[0];
    const src = () => "export const x = 1;";
    const a = diagramRequest(local.data, local.data.images, "rules", local.pngs, src);
    const b = diagramRequest(viaJson.data, viaJson.data.images, "rules", viaJson.pngs, src);
    expect(a.prompt).toBe(b.prompt);
    expect(a.key).toBe(b.key);
    expect(a.prompt).not.toMatch(/undefined/);
    expect(a.prompt).toContain('Image 4: dark theme — explainer step "ph"');
  });
  it("the local runner builds its entries through that same builder", () => {
    const d = { id: "abg", title: "ABG", facts: ["f"], example: {}, steps: [{ key: "ph", caption: "c", narration: "n" }] };
    const gallery = ["light", "dark"].flatMap((theme) => ["static", "ph"].map((key) => ({ id: "abg", theme, key, file: `${theme}-${key}.png` })));
    const [e] = localEntries([d], gallery, (file) => Buffer.from(file));
    expect(e.data.images.map((i) => i.label)).toEqual([
      "light theme — inline, as shown under a rationale", 'light theme — explainer step "ph"',
      "dark theme — inline, as shown under a rationale", 'dark theme — explainer step "ph"',
    ]);
    const runner = readFileSync("ops/review-diagrams.mjs", "utf8");
    expect(runner).toMatch(/entries = localEntries\(/);
    expect(runner).not.toMatch(/reviewData\(/);   // no second, unlabelled path
  });
});

/* Astra, PR #134 review, round 24: the frame set was checked against the
   step list the branch's prepare script supplied, so dropping a real step
   together with its frames passed. The paid job now checks the prepared
   diagrams against the steps trusted code reads from the source. */
describe("prepared diagrams are checked against the source's own steps", () => {
  const inventory = stepInventory();
  const prepared = (id, keys) => reviewPlan({ diagrams: [{ id, title: id, facts: [], steps: keys.map((key) => ({ key })), images: expectedFrames(keys) }] })[0];
  const all = (edit = (id, keys) => keys) => Object.entries(inventory).map(([id, keys]) => prepared(id, edit(id, keys)));

  it("accepts every diagram with exactly its real steps", () => {
    expect(checkInventory(all(), inventory)).toHaveLength(Object.keys(inventory).length);
    expect(checkInventory([prepared("abg", inventory.abg)], inventory, "abg")).toHaveLength(1);
  });
  it("refuses a real step dropped together with its frames", () => {
    expect(inventory.abg).toContain("kidneys");
    const dropped = all((id, keys) => (id === "abg" ? keys.filter((k) => k !== "kidneys") : keys));
    expect(() => checkInventory(dropped, inventory)).toThrow(/abg steps/);
    expect(() => checkInventory(all((id, keys) => (id === "abg" ? [] : keys)), inventory)).toThrow(/abg steps/);
  });
  it("refuses reordered or invented steps, and a missing or unknown diagram", () => {
    expect(() => checkInventory(all((id, keys) => (id === "abg" ? [...keys].reverse() : keys)), inventory)).toThrow(/abg steps/);
    expect(() => checkInventory(all((id, keys) => (id === "abg" ? [...keys, "extra"] : keys)), inventory)).toThrow(/abg steps/);
    expect(() => checkInventory(all().filter((d) => d.id !== "tonicity"), inventory)).toThrow(/not the diagrams in the source/);
    expect(() => checkInventory([...all(), prepared("made-up", ["a"])], inventory)).toThrow(/not the diagrams in the source/);
    expect(() => checkInventory([prepared("tonicity", inventory.tonicity)], inventory, "abg")).toThrow(/not the diagrams in the source/);
  });
});

/* Astra, PR #134 review, round 25: the prepare job ran the branch's own
   render script, so nothing proved the frames showed the pinned source.
   Now the trusted script renders a source tree it is pointed at; the
   tree's diagram code runs only in the browser, and a tree that differs
   from its commit is refused. */
describe("frames are rendered from the source tree by the trusted renderer", () => {
  const { cpSync } = require("node:fs");
  const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" });
  const source = () => {
    const root = mkdtempSync(join(tmpdir(), "render-src-"));
    cpSync("src", join(root, "src"), { recursive: true });
    cpSync("package.json", join(root, "package.json"));
    const abg = join(root, "src/diagrams/abg.jsx");
    // the title says where the diagram code actually ran
    writeFileSync(abg, readFileSync(abg, "utf8").replace('title: "Reading an ABG"', 'title: typeof process === "undefined" ? "ABG drawn in the browser" : "ABG drawn in Node"'));
    git(root, "init", "-q"); git(root, "add", "-A");
    git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "source");
    return root;
  };
  const prepare = (root, out) => spawnSync(process.execPath, ["ops/review-diagrams.mjs", "--prepare", out, "--source", root, "--only", "abg"], { encoding: "utf8", timeout: 240_000 });

  it("renders the given tree in the browser, and records its commit", () => {
    const root = source(), out = mkdtempSync(join(tmpdir(), "render-out-"));
    try {
      const r = prepare(root, out);
      expect(r.status, r.stderr).toBe(0);
      const plan = JSON.parse(readFileSync(join(out, "plan.json"), "utf8"));
      expect(plan.commit).toBe(git(root, "rev-parse", "HEAD").trim());
      expect(plan.diagrams.map((d) => d.title)).toEqual(["ABG drawn in the browser"]);
      expect(plan.diagrams[0].steps.map((s) => s.key)).toEqual(["ph", "lungs", "kidneys", "rome", "worked", "compensation"]);
      expect(readFileSync(join(out, "abg/0.png")).subarray(1, 4).toString()).toBe("PNG");
      expect(git(root, "status", "--porcelain", "--ignored"), "rendering left the tree untouched").toBe("");
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
  }, 300_000);

  it("refuses a tree that differs from its commit", () => {
    const root = source(), out = mkdtempSync(join(tmpdir(), "render-out-"));
    try {
      writeFileSync(join(root, "src/diagrams/stray.txt"), "not committed\n");
      const r = prepare(root, out);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/changes beyond its commit/);
      expect(existsSync(join(out, "plan.json"))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
  }, 300_000);
});

/* Astra, PR #134 review, round 28: the pairing and narration prepare steps
   ran the branch's own scripts, so the matcher's proposals and the words to
   record were whatever that script said. The trusted scripts now read the
   source's diagrams and run its matcher in the browser sandbox. */
describe("the pairing and narration jobs read the source through the sandbox", () => {
  const { cpSync } = require("node:fs");
  const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" });
  const source = (edit) => {
    const root = mkdtempSync(join(tmpdir(), "sandbox-src-"));
    cpSync("src", join(root, "src"), { recursive: true });
    cpSync("package.json", join(root, "package.json"));
    edit(root);
    git(root, "init", "-q"); git(root, "add", "-A");
    git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "source");
    return root;
  };
  const editFile = (root, rel, f) => writeFileSync(join(root, rel), f(readFileSync(join(root, rel), "utf8")));

  it("runs the source's own matcher and reads its own words", async () => {
    const { withSandbox } = await import("../ops/render-diagrams.mjs");
    const { proposePairs } = await import("../src/diagrams/match.js");
    const q = { id: 1, stem: "The client's potassium is 6.2 mEq/L. Which finding is expected?", options: ["a", "b"], answer: "a", rationale: "Peaked T waves." };
    const here = await withSandbox(".", (call) => call("propose", [q]));
    expect(here["1"]).toEqual(proposePairs(q).map((x) => (x.p == null ? { d: x.d } : { d: x.d, p: x.p })));
    // a source whose matcher reads nothing, and whose ABG step says other words
    const root = source((r) => {
      editFile(r, "src/diagrams/match.js", (t) => t.replace("export function proposePairs(item) {", "export function proposePairs(item) {\n  return [];"));
      editFile(r, "src/diagrams/abg.jsx", (t) => t.replace("Start with the pH. Anything below", "Begin with the pH. Anything below"));
    });
    try {
      const got = await withSandbox(root, async (call) => ({ p: await call("propose", [q]), abg: await call("raw", "abg") }));
      expect(got.p["1"]).toEqual([]);
      expect(got.abg.steps[0].narration).toMatch(/^Begin with the pH/);
      expect(got.abg.steps.find((s) => s.dynamic)).toBeTruthy();
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 300_000);

  it("prepares the narration plan from the source tree, at its commit, and refuses a dirty tree", () => {
    const root = source((r) => editFile(r, "src/diagrams/abg.jsx", (t) => t.replace("Start with the pH. Anything below", "Begin with the pH. Anything below")));
    const out = join(mkdtempSync(join(tmpdir(), "narr-out-")), "plan.json");
    try {
      const r = spawnSync(process.execPath, ["ops/narrate.mjs", "--prepare", out, "--source", root], { encoding: "utf8", timeout: 240_000 });
      expect(r.status, r.stderr).toBe(0);
      const plan = JSON.parse(readFileSync(out, "utf8"));
      expect(plan.commit).toBe(git(root, "rev-parse", "HEAD").trim());
      expect(plan.diagrams.find((d) => d.id === "abg").steps[0].narration).toMatch(/^Begin with the pH/);
      writeFileSync(join(root, "src/stray.txt"), "x\n");
      const dirty = spawnSync(process.execPath, ["ops/narrate.mjs", "--prepare", out + ".2", "--source", root], { encoding: "utf8", timeout: 240_000 });
      expect(dirty.status).not.toBe(0);
      expect(dirty.stderr + dirty.stdout).toMatch(/changes beyond its commit/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 300_000);
});

/* Round 28: a dry run without the public key treated every clip as
   unverified, deleted them, and saved the emptied manifest. */
describe("a narration dry run changes nothing", () => {
  it("leaves a populated manifest byte-identical without the public key", async () => {
    const { testKeys } = await import("./helpers/attest-keys.js");
    const { signClip, scriptDigest, textFp, clipId, QA_VERSION, TTS } = await import("../ops/narrate-lib.mjs");
    const keys = testKeys(), words = "Start with the pH.", audio = "c".repeat(32);
    const e = { id: clipId({ text: words, voice: "marin" }), script: scriptDigest(words), qa: QA_VERSION, audio, voice: "marin", model: TTS.model, textFp: textFp(words), url: `https://x/${audio}.mp3` };
    const populated = JSON.stringify({ version: 1, clips: { abg: { ph: { ...e, sig: signClip("abg", "ph", e, keys.signer) }, gone: { ...e } } } }, null, 2) + "\n";
    const d = tmp();
    const into = join(d, "branch");
    mkdirSync(join(into, "src/diagrams"), { recursive: true });
    writeFileSync(join(into, "src/diagrams/narration.json"), populated);
    const run = (...x) => execFileSync("git", x, { cwd: into, encoding: "utf8" }).trim();
    run("init", "-q"); run("add", "-A"); run("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
    const plan = join(d, "plan.json");
    writeFileSync(plan, JSON.stringify({ kind: "narration", commit: run("rev-parse", "HEAD"), diagrams: [{ id: "abg", steps: [{ key: "ph", narration: words }] }] }));
    const env = { ...process.env };
    delete env.PULSERN_ATTEST_PUBLIC_KEY; delete env.PULSERN_ATTEST_PRIVATE_KEY;
    const r = spawnSync(process.execPath, [resolve("ops/narrate.mjs"), "--prepared", plan, "--into", into, "--dry-run"], { encoding: "utf8", timeout: 120_000, env });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/nothing is changed/);
    expect(readFileSync(join(into, "src/diagrams/narration.json"), "utf8")).toBe(populated);
    rmSync(d, { recursive: true, force: true });
  }, 180_000);
});
