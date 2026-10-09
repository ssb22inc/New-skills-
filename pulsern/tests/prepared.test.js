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
import { narrationPlan, reviewPlan, mapPlan, readPrepared, readFrame, reviewEntries, localEntries } from "../ops/prepared.mjs";
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
    expect(JSON.parse(readFileSync(join(into, "src/diagrams/narration.json"), "utf8")).clips).toEqual({ abg: {} });
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
