import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/** `done.mjs` EXECUTED — the wiring between done-lib's decisions and the exit
 * code, which no unit test reaches (the N-03 leg B lesson). Only the paths
 * that stop before any heavy work are driven here: a bad target, and a dirty
 * tree. Both must exit 2 with a reason and start nothing. */
const CLI = fileURLToPath(new URL("../../scripts/done.mjs", import.meta.url));
const REPO = fileURLToPath(new URL("../../../../", import.meta.url)).replace(/\/$/, "");
const PLANT = `${REPO}/.done-cli-test-untracked-file`;

const run = (...args: string[]) => {
  try {
    return { code: 0, out: execFileSync("node", [CLI, ...args], { encoding: "utf8", stdio: "pipe" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
};

afterEach(() => {
  if (existsSync(PLANT)) rmSync(PLANT, { force: true });
});

describe("done CLI — refuses before it measures", () => {
  it("a bad target exits 2 with usage", () => {
    const r = run("phase0");
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/usage/);
  });

  /** MUTATION: drop the pre-flight exit in done.mjs. */
  it("a dirty tree is refused before any condition runs", () => {
    writeFileSync(PLANT, "planted by done-cli.test.ts\n");
    const r = run("phase", "--skip-mutate");
    expect(r.code, `expected refusal, got:\n${r.out.slice(0, 400)}`).toBe(2);
    expect(r.out).toMatch(/REFUSED/);
    expect(r.out, "the checker measured something before refusing").not.toMatch(/META-CHECK/);
  });
});
