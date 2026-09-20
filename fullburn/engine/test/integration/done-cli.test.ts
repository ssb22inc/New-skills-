import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** `done.mjs` EXECUTED — the wiring no unit test reaches (the N-03 leg B
 * lesson). Only paths that stop before any heavy work are driven.
 *
 * THE FIRST TEST IS THE ONE THAT MATTERS. On 2026-09-20 a mutation that removed
 * the pre-flight exit made this file's dirty-tree test spawn a `done.mjs` that
 * proceeded into its meta-check, ran the suite, ran this file, and spawned
 * another — unbounded. The checker now refuses to exist inside a test worker
 * or inside another done run, before it reads an argument. This test drives
 * that refusal with the worker's own environment, which is exactly the
 * environment the runaway had. */
const CLI = fileURLToPath(new URL("../../scripts/done.mjs", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const REPO = fileURLToPath(new URL("../../../../", import.meta.url)).replace(/\/$/, "");
const PLANT = `${REPO}/.done-cli-test-${process.pid}`;

/** The worker's env minus every vitest marker — what a human's shell looks like. */
const shellEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("VITEST") && k !== "FULLBURN_DONE_ACTIVE"));

const run = (args: string[], env: NodeJS.ProcessEnv = process.env) => {
  try {
    // A hard kill: a checker that does not refuse would otherwise run for
    // minutes inside this test. A killed child is a failed assertion, not a hang.
    return { code: 0, out: execFileSync("node", [CLI, ...args], { encoding: "utf8", stdio: "pipe", env, timeout: 60_000, killSignal: "SIGTERM" }) };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string; signal?: string };
    return { code: err.status ?? (err.signal ? 137 : 1), out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
};

let reportsBefore: string[] = [];
beforeEach(() => {
  reportsBefore = readdirSync(`${ROOT}/reports`);
});
afterEach(() => {
  // EVERY plant, not only this worker's: a worker killed mid-test never
  // reaches its own afterEach, and a plant it left is a dirty tree for the
  // next run of the checker (measured 2026-09-20, `.done-cli-test-9095`).
  for (const f of readdirSync(REPO)) if (f.startsWith(".done-cli-test-")) rmSync(`${REPO}/${f}`, { force: true });
  // A checker that got past pre-flight would have written a report and maybe
  // left a canary; neither may outlive this test.
  for (const f of readdirSync(`${ROOT}/reports`)) if (!reportsBefore.includes(f) && f.startsWith("DONE_")) rmSync(`${ROOT}/reports/${f}`, { force: true });
  for (const p of [`${ROOT}/engine/test/zz-done-meta-canary.test.ts`, `${REPO}/.done-refusal-canary`]) if (existsSync(p)) rmSync(p, { force: true });
});

describe("done CLI — refuses before it measures", () => {
  /** MUTATION: drop the VITEST / FULLBURN_DONE_ACTIVE guard in done.mjs. */
  it("refuses to run inside a test worker, before reading an argument", () => {
    const r = run(["phase", "--skip-mutate"]);
    expect(r.code, `a checker spawned from a test worker did not refuse:\n${r.out.slice(0, 300)}`).toBe(2);
    expect(r.out).toMatch(/test worker/);
    expect(r.out, "it measured something before refusing").not.toMatch(/META-CHECK/);
    // …and the nested-run marker alone is enough.
    const r2 = run(["phase", "--skip-mutate"], { ...shellEnv(), FULLBURN_DONE_ACTIVE: "1" });
    expect(r2.code).toBe(2);
  });

  it("a bad target exits 2 with usage", () => {
    const r = run(["phase0"], shellEnv());
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/usage/);
  });

  /** MUTATION: drop the pre-flight exit in done.mjs. Under that mutation the
   * checker proceeds and is killed at 60s — a non-2 exit either way. */
  it("a dirty tree is refused before any condition runs", () => {
    writeFileSync(PLANT, "planted by done-cli.test.ts\n");
    const r = run(["phase", "--skip-mutate"], shellEnv());
    expect(r.code, `expected refusal, got:\n${r.out.slice(0, 400)}`).toBe(2);
    expect(r.out).toMatch(/REFUSED/);
    expect(r.out, "the checker measured something before refusing").not.toMatch(/META-CHECK/);
  });
});
