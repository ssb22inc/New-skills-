import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** THE LINT GATE, EXECUTED. Human ruling 2026-09-22 (DONE.md §2.1.7): ESLint
 * with typescript-eslint, type-aware, `no-floating-promises` and
 * `no-misused-promises` at error, because an unawaited settle/reserve is the
 * class of defect that has reached production paths here and only a
 * type-aware linter can see it.
 *
 * A linter that is configured is a claim; a linter that REFUSES a planted
 * defect is a gate. Each plant lives inside the type checker's project (the
 * config's `files` mirror tsconfig `include`, which the invariant suite keeps
 * in step) because a type-aware rule outside the project sees no types and
 * reports nothing — the failure mode this file exists to rule out.
 *
 * MUTATION: LT-01 / LT-02 — either rule set to "off" turns this red. */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const ESLINT = `${ROOT}/node_modules/eslint/bin/eslint.js`;
const plants: string[] = [];
const plant = (name: string, body: string): string => {
  const path = `${ROOT}/engine/test/zz-lint-plant-${process.pid}-${name}.ts`;
  writeFileSync(path, body);
  plants.push(path);
  return path;
};
const lint = (path: string) => {
  const r = spawnSync(process.execPath, [ESLINT, path], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
};

afterEach(() => {
  for (const p of plants.splice(0)) rmSync(p, { force: true });
});

describe("the type-aware lint gate refuses the defect class it was chosen for", () => {
  it("a floating promise is refused, by name", () => {
    const p = plant("floating", "async function settle(): Promise<void> {}\nexport function run(): void {\n  settle();\n}\n");
    const r = lint(p);
    expect(r.code, `the linter accepted a floating promise:\n${r.out}`).not.toBe(0);
    expect(r.out).toContain("@typescript-eslint/no-floating-promises");
  });

  it("a promise handed to a void callback is refused, by name", () => {
    const p = plant("misused", "export function run(items: number[]): void {\n  items.forEach(async (n) => {\n    await Promise.resolve(n);\n  });\n}\n");
    const r = lint(p);
    expect(r.code, `the linter accepted a misused promise:\n${r.out}`).not.toBe(0);
    expect(r.out).toContain("@typescript-eslint/no-misused-promises");
  });

  it("the same code, awaited, is clean — the gate measures the defect, not the file", () => {
    const p = plant("clean", "async function settle(): Promise<void> {}\nexport async function run(items: number[]): Promise<void> {\n  await settle();\n  for (const n of items) await Promise.resolve(n);\n}\n");
    const r = lint(p);
    expect(r.code, `a clean file failed lint:\n${r.out}`).toBe(0);
  });

  it("the plants were inside the project — a type-aware rule outside it is silent", () => {
    // Positive evidence for the three tests above: the plant path matches a
    // tsconfig include glob, so the parser had a program and the rules ran.
    const include: string[] = JSON.parse(readFileSync(`${ROOT}/tsconfig.json`, "utf8")).include;
    expect(include).toContain("engine/test/**/*.ts");
    expect(existsSync(ESLINT), "eslint is not installed — the gate cannot run").toBe(true);
  });
});
