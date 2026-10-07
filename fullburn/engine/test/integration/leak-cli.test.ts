import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** THE LEAK SCAN, EXECUTED AS CI EXECUTES IT.
 *
 * `gate-cli.test.ts` exists because the gate CLIs were the only wiring between
 * a tested library and CI, and two defects lived in exactly that gap. The leak
 * scan had the same gap and nobody had closed it: `scan-lib.mjs` was driven
 * directly, `scanTree` was driven directly, and `leak-check.mjs`'s CLI block —
 * the part that turns findings into a non-zero exit — had never been run by any
 * test. Measured, `if (findings.length > 0)` → `if (false)` left the whole
 * default suite green at 354/354 while the scan reported clean with findings in
 * hand (runner audit against the R14-06 rule).
 *
 * The decisions now live in `scan-lib.mjs` with their own red-proofs. This file
 * is the other half: it proves the CLI actually consults them, exits non-zero,
 * and says what it found. */

const CLI = fileURLToPath(new URL("../../scripts/leak-check.mjs", import.meta.url));
let root: string;

function run(...args: string[]): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync("node", [CLI, ...args], { encoding: "utf8", stdio: "pipe" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const write = (rel: string, body: string | Buffer) => {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
};

/** Assembled at runtime. This file is scanned by the real scan, and the secret
 * rules are not exempt for tests. */
const fakeToken = () => "sk-" + "ant-" + "a1b2c3d4e5".repeat(3);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fullburn-leak-"));
  // A minimally valid repository root: the scan refuses a root with no
  // fullburn/ because every path-scoped rule would silently match nothing.
  write("fullburn/README.md", "clean\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("leak-check CLI (runner audit — the N-03 leg B gap, on the leak scan)", () => {
  it("a clean tree exits 0 and says so", () => {
    const res = run(root);
    expect(res.code, res.out).toBe(0);
    expect(res.out).toContain("clean");
  });

  /** MUTATION: `if (!verdict.ok)` → `if (false)` in leak-check.mjs. */
  it("a planted token exits 1 and names the file", () => {
    write("fullburn/engine/src/thing.ts", `const key = "${fakeToken()}";\n`);
    const res = run(root);
    expect(res.code, `the CLI reported clean with a token on disk:\n${res.out}`).toBe(1);
    expect(res.out).toContain("fullburn/engine/src/thing.ts");
    expect(res.out).toContain("FAIL");
  });

  /** The formats the old extension allowlist never read. Both are plain text,
   * both are where credentials actually get pasted, and neither was scanned. */
  it("a token in a terraform file or a Dockerfile is found", () => {
    write("infra/variables.tf", `variable "k" { default = "${fakeToken()}" }\n`);
    expect(run(root).code, "a terraform file was not scanned").toBe(1);
    rmSync(join(root, "infra"), { recursive: true });

    write("Dockerfile.dev", `ENV ANTHROPIC_API_KEY=${fakeToken()}\n`);
    expect(run(root).code, "a Dockerfile was not scanned").toBe(1);
  });

  /** MUTATION: add a source directory to SKIP_DIRS. */
  it("the engine's own source tree is walked", () => {
    write("fullburn/engine/scripts/helper.mjs", `export const k = "${fakeToken()}";\n`);
    expect(run(root).code, "engine/scripts/ was not walked").toBe(1);
  });

  it("build output and vendored trees are not walked", () => {
    write("node_modules/pkg/index.js", `const k = "${fakeToken()}";\n`);
    write("fullburn/dist/bundle.js", `const k = "${fakeToken()}";\n`);
    expect(run(root).code, "a dependency's own fixtures failed the repository's scan").toBe(0);
  });

  it("a binary file is skipped rather than read as text", () => {
    // A PNG header, then bytes that would match a secret rule if this were read
    // as text. Skipping is by MEASUREMENT — the NUL byte — not by the name.
    write("assets/logo.dat", Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]), Buffer.from(fakeToken())]));
    expect(run(root).code, "a binary file was read as text").toBe(0);
  });

  /** R8-07: a root that does not exist scanned zero files and printed clean. */
  it("refuses a root it cannot scan rather than reporting clean", () => {
    expect(run("/nonexistent-root-runner-audit").code).toBe(1);
    expect(run(join(root, "fullburn")).code, "the workspace was accepted as the repository root").toBe(1);
  });
});
