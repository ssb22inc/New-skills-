/* ops/prepared.mjs — the data a secret-less prepare job hands to the paid
   job (Astra, PR #134 review, round 21). The paid job never runs branch
   code, so this data must not be able to steer it: ids that become paths
   are plain slugs, sizes are bounded, values the app fingerprints are kept
   exactly. */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { narrationPlan, reviewPlan, mapPlan, readPrepared, readFrame } from "../ops/prepared.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "prepared-"));

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
    const plan = reviewPlan({ diagrams: [{ id: "abg", title: "t", facts: ["f"], steps: [{ key: "ph", caption: "c", narration: "n" }], images: [{ label: "x", file: "/etc/passwd" }] }] });
    expect(plan[0].images).toEqual([{ label: "x", n: 0 }]);   // a file name in the data is ignored
    rmSync(d, { recursive: true, force: true });
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
    writeFileSync(plan, JSON.stringify({ kind: "narration", diagrams: [{ id: "abg", steps: [{ key: "ph", narration: "The pH is low." }] }] }));
    const into = join(d, "branch");
    mkdirSync(join(into, "src/diagrams"), { recursive: true });
    writeFileSync(join(into, "src/diagrams/narration.json"), JSON.stringify({ version: 1, clips: {} }));
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
    writeFileSync(plan, JSON.stringify({ kind: "narration", diagrams: [{ id: "../../escape", steps: [] }] }));
    const r = spawnSync(process.execPath, [resolve("ops/narrate.mjs"), "--prepared", plan, "--into", d, "--dry-run"], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/prepared data refused/);
    rmSync(d, { recursive: true, force: true });
  });
});
