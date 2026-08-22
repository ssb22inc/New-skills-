import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { NOT_SCANNED_EXTENSIONS, isScannedFile, isSkippedDir, leakVerdict, looksBinary, scanContent } from "../scripts/scan-lib.mjs";

/** Verifies the scanner actually detects what it claims (adversary findings
 * F16, F18, F19). Every sample "secret" is assembled at runtime so this file
 * never contains a scannable token literal — the scanner runs over this file
 * too, and secret rules are not exempt for tests. */

const SRC = "fullburn/engine/src/thing.ts";
const fake = (prefix: string, n: number) => prefix + "a1b2c3d4e5".repeat(Math.ceil(n / 10)).slice(0, n);

describe("secret rules (§10.2, §15) — apply to every file type", () => {
  const cases: [string, string][] = [
    ["anthropic", fake("sk-ant-", 24)],
    ["stripe webhook", fake("whsec_", 24)],
    ["aws", "AKIA" + "ABCDEFGHIJKLMNOP"],
    ["github", fake("ghp_", 24)],
    ["meta/facebook", fake("EAA", 30)],
    ["google oauth", fake("ya29.", 30)],
    ["google api key", "AIza" + "b1c2d3e4f5".repeat(4).slice(0, 35)],
    ["slack", fake("xoxb-", 24)],
  ];
  for (const [label, sample] of cases) {
    it(`flags a ${label} token`, () => {
      expect(scanContent(SRC, `const k = "${sample}";`)).toHaveLength(1);
    });
  }

  it("a quoted PEM header without a key body is documentation, not a leak", () => {
    expect(scanContent("fullburn/reports/r.md", "the rule matches `-----BEGIN RSA PRIVATE KEY-----`")).toHaveLength(0);
    const real = ["-----BEGIN RSA PRIVATE KEY-----", "MIIEowIBAAKCAQEAx7Vv" + "QmFzZTY0Qm9keUhlcmU".repeat(3)].join("\n");
    expect(scanContent("fullburn/engine/src/x.ts", real).length).toBeGreaterThan(0);
  });

  it("the declared test canary is exempt, and only it (R2-14 evidence must be quotable)", () => {
    expect(scanContent("fullburn/reports/r.md", "Bearer canary-vault-value-do-not-leak-8891")).toHaveLength(0);
    // A different long bearer literal still fires.
    expect(scanContent("fullburn/reports/r.md", "Bearer " + "z9y8x7w6v5".repeat(3)).length).toBeGreaterThan(0);
  });

  it("the fixture allowlist is exact strings only — a realistic token still fires beside one", () => {
    // Guards the allowlist against becoming a hiding place: a real-shaped token
    // is caught even in the same file as a declared placeholder, and a token
    // that merely starts with a placeholder prefix is still caught.
    const withBoth = "sk-ant-ABCDEFGH12345678 and " + fake("sk-ant-", 40);
    expect(scanContent("fullburn/reports/r.md", withBoth).length).toBeGreaterThan(0);
    expect(scanContent("fullburn/reports/r.md", "sk-ant-ABCDEFGH12345678")).toHaveLength(0);
  });

  it("flags tokens in non-code files too — a secret in a report is still a secret", () => {
    expect(scanContent("fullburn/reports/notes.md", fake("sk-ant-", 24)).length).toBeGreaterThan(0);
  });
});

describe("structural rules (Law 1, 6, 11, 18) — code only", () => {
  it("bans LLM provider hostnames outside the gateway (Law 11)", () => {
    expect(scanContent(SRC, 'fetch("https://api.openai.com/v1/chat")')).toHaveLength(1);
    expect(scanContent(SRC, 'fetch("https://api.anthropic.com/v1/messages")')).toHaveLength(1);
  });

  it("bans provider SDK imports in every module form (F16)", () => {
    expect(scanContent(SRC, 'import x from "openai";')).toHaveLength(1);
    expect(scanContent(SRC, 'const x = require("openai");')).toHaveLength(1);
    expect(scanContent(SRC, 'const x = await import("@anthropic-ai/sdk");')).toHaveLength(1);
  });

  it("bans platform API hostnames — reads come from the warehouse (Law 1)", () => {
    expect(scanContent(SRC, 'fetch("https://graph.facebook.com/v21.0/act_1/insights")')).toHaveLength(1);
    expect(scanContent(SRC, 'fetch("https://googleads.googleapis.com/v18/customers")')).toHaveLength(1);
  });

  it("bans prediction-gate identifiers — the market picks winners (Law 6)", () => {
    expect(scanContent(SRC, "if (predictedRoas < 2) return skip;")).toHaveLength(1);
    expect(scanContent(SRC, "const winProbability = model.score(ad);")).toHaveLength(1);
  });

  it("bans direct registry indexing so staged/locked flags stay inert (Law 18, F19)", () => {
    expect(scanContent(SRC, 'const c = CHANNELS["google"];')).toHaveLength(1);
    expect(scanContent("fullburn/config/src/channels.ts", 'const c = CHANNELS[code];')).toHaveLength(0);
  });

  it("bans raw model ids in engine code (§2.4)", () => {
    expect(scanContent(SRC, 'const m = "claude-sonnet";')).toHaveLength(1);
    expect(scanContent("fullburn/config/src/models.ts", 'const m = "claude-sonnet";')).toHaveLength(0);
  });

  it("does not fire structural rules on prose — a doc may discuss what code may not do", () => {
    const prose = 'The engine never calls https://api.openai.com directly; see CHANNELS["google"].';
    expect(scanContent("fullburn/reports/ADVERSARY_REPORT_phase0.md", prose)).toHaveLength(0);
  });

  it("catches the NATURAL spellings, not just the literal ones (R2-13)", () => {
    // Literal-string greps missed the most obvious evasions: a hostname built
    // from fragments, a subdomain variant, and a differently-named predictor.
    expect(scanContent(SRC, 'const h = "api." + "openai.com"; fetch(`https://${h}/v1`)').length).toBeGreaterThan(0);
    expect(scanContent(SRC, 'fetch("https://eu.api.mistral.ai/v1/chat")').length).toBeGreaterThan(0);
    expect(scanContent(SRC, 'fetch("https://graph.facebook.com/v21.0/act/insights")').length).toBeGreaterThan(0);
    for (const ident of ["predictedConversion", "forecastRoas", "projectedRevenue", "estimatedCtr", "successProbability"]) {
      expect(scanContent(SRC, `if (${ident} < 2) return skip;`).length).toBeGreaterThan(0);
    }
  });

  it("the test exemption is anchored to the real test roots (R2-15)", () => {
    const offending = 'fetch("https://api.openai.com/v1")';
    // A production directory that merely contains a "test" segment is NOT exempt.
    expect(scanContent("fullburn/engine/src/ab-test/runner.ts", offending).length).toBeGreaterThan(0);
    expect(scanContent("fullburn/config/src/test/helper.ts", offending).length).toBeGreaterThan(0);
    // The genuine test roots are.
    expect(scanContent("fullburn/engine/test/x.test.ts", offending)).toHaveLength(0);
  });

  it("is import-safe: importing the rules runs no filesystem walk (F18)", () => {
    // Reaching this line at all proves it — a walking module would have run
    // (and possibly process.exit'd) during import above.
    expect(typeof scanContent).toBe("function");
  });

  /** The scan's rules are all written against repo-root-relative paths, so the
   * root it is handed decides whether any of them apply. Given the wrong root
   * it did not fail — `STRUCTURAL_SCOPE` matched nothing and the whole
   * structural half reported clean. `npm run leak-check` had been doing exactly
   * that: it passed no root, defaulted to `.` under fullburn/, and disagreed
   * with the CI invocation that passes `..`. Nothing drove scanTree, so both
   * the divergence and the disabled rules were invisible.
   *
   * MUTATION: drop assertScannableRoot, or revert the npm script's `..`. */
  it("refuses a root whose paths its rules cannot match", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { scanTree } = await import("../scripts/leak-check.mjs");
    const { readFileSync } = await import("node:fs");
    const repoRoot = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
    expect(() => scanTree(repoRoot), "the real repository root was refused").not.toThrow();
    // The fullburn/ workspace is NOT the repository root: handed it, every
    // path-scoped rule silently matches nothing.
    expect(() => scanTree(`${repoRoot}/fullburn`)).toThrow(/REPOSITORY root/);
    // A root that does not exist is an ERROR, not an empty result. The guard
    // sat one branch too late and `leak-check /nonexistent-root` printed
    // "clean" — the same defect it was written to fix (R8-07).
    expect(() => scanTree("/nonexistent-root-r8-07"), "a missing root scanned zero files and passed").toThrow(
      /does not exist/,
    );
    // And the documented local command must be the one CI runs.
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(pkg.scripts["leak-check"], "the local scan no longer matches CI's").toContain("leak-check.mjs ..");
  });
});

/** THE THREE DECISIONS THAT USED TO LIVE IN THE CLI.
 *
 * `SCANNED`, `SKIP_DIRS` and the CLI's `if (findings.length > 0)` were const
 * literals and control flow inside `leak-check.mjs`. All three were measured
 * surviving a one-line revert with `npm test` green at 354/354, because nothing
 * in the default suite drove them and nothing executed the CLI at all. They are
 * `scan-lib` decisions now, and these are their red-proofs. */
describe("what the scan reads, and what it does with what it finds (runner audit, R14-06)", () => {
  /** THE POPULATION IS DERIVED, AND SO IS THE EXEMPTION. A hand-written
   * extension list in a test is the same defect as a hand-written one in the
   * code — it just moves which file goes stale. So this drives the real scan
   * over the real tree and lets the BYTES adjudicate: a tracked file the scan
   * does not read must actually be binary. There is no other exemption.
   *
   * TWO SKIP CLAUSES WERE REMOVED FROM THIS TEST, and each was hiding a class
   * of unread file (human ruling 2026-08-22, after the haven investigation):
   *
   *   (a) It asked `isScannedFile`, which answers about a FILENAME. A tracked
   *       file inside a skipped DIRECTORY answers "yes, scanned" and is never
   *       walked. Zero files are in that position today, which is exactly why
   *       the test could not see the hole: a check with no reachable negative
   *       case is this project's recurring defect. It now asks the WALK.
   *   (b) `if (!existsSync(abs) || !statSync(abs).isFile()) continue` silently
   *       dropped anything that was not a readable regular file — a symlink, a
   *       gitlink, a tracked path missing from the checkout. Those are now
   *       reported, not skipped.
   *
   * The earlier version also skipped extensionless files and its own disclosed
   * `svg` entry, so it reported ELEVEN newly-read files when the true widening
   * was TWENTY-ONE — and never named `.github/CODEOWNERS` or `fullburn/PHASE`,
   * the two the gate depends on. That understatement is corrected in
   * RUNNER_AUDIT_2026-08-21.md §4 and ledger L34.
   *
   * MUTATION: put a text extension into NOT_SCANNED_EXTENSIONS; add a source
   * directory to SKIP_DIRS; or revert this to ask the filename again. */

  /** The decision, as a function, so it can be driven with inputs the real tree
   * does not contain — an unread text file, a missing path, a directory. On the
   * real tree every one of those lists is empty, which is why they have to be
   * driven separately to mean anything. */
  interface ReadReport {
    readonly unread: readonly string[];
    readonly unreadable: readonly string[];
  }
  const auditReadCoverage = (
    tracked: readonly string[],
    visited: ReadonlySet<string>,
    read: (f: string) => Buffer,
  ): ReadReport => {
    const unread: string[] = [];
    const unreadable: string[] = [];
    for (const f of tracked) {
      let bytes: Buffer;
      try {
        bytes = read(f);
      } catch (e) {
        // NOT A SKIP. A tracked path the scan cannot even open is an unknown,
        // and an unknown is reported.
        unreadable.push(`${f} — tracked but not a readable regular file: ${(e as Error).message}`);
        continue;
      }
      if (visited.has(f)) continue;
      if (!looksBinary(bytes)) unread.push(f);
    }
    return { unread, unreadable };
  };

  it("the coverage audit reports an unread text file, and refuses to skip what it cannot open", () => {
    const read = (f: string) => {
      if (f === "gone.ts") throw new Error("ENOENT: no such file or directory");
      if (f === "a-submodule") throw new Error("EISDIR: illegal operation on a directory");
      return Buffer.from(f === "logo.png" ? [0x89, 0x50, 0x4e, 0x47, 0x00] : "plain text");
    };
    const r = auditReadCoverage(
      ["seen.ts", "unwalked.tf", "logo.png", "gone.ts", "a-submodule"],
      new Set(["seen.ts"]),
      read,
    );
    // Walked → fine. Not walked and TEXT → unread. Not walked and BINARY → fine.
    expect(r.unread, "an unwalked text file was not reported").toEqual(["unwalked.tf"]);
    // Neither of the two unopenable paths may vanish quietly.
    expect(r.unreadable.length, "a tracked path the scan cannot open was skipped").toBe(2);
    expect(r.unreadable.join(" ")).toContain("gone.ts");
    expect(r.unreadable.join(" ")).toContain("a-submodule");
    // And the positive half: a fully-walked tree reports nothing.
    expect(auditReadCoverage(["seen.ts"], new Set(["seen.ts"]), read)).toEqual({ unread: [], unreadable: [] });
  });

  it("every tracked text file is READ BY THE WALK — exemptions must actually be binary", async () => {
    const { execFileSync } = await import("node:child_process");
    const { readFileSync: readBytes } = await import("node:fs");
    const { relative } = await import("node:path");
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { walk } = await import("../scripts/leak-check.mjs");
    const repoRoot = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
    const tracked = execFileSync("git", ["-C", repoRoot, "ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter((f) => f !== "");
    expect(tracked.length, "git listed no files — this test would pass vacuously").toBeGreaterThan(100);

    /** WHAT THE SCAN ACTUALLY OPENS, not what a filename predicate says about
     * it. This is the half that makes SKIP_DIRS reachable by this test. */
    const visited = new Set<string>();
    for (const abs of walk(repoRoot) as Iterable<string>) visited.add(relative(repoRoot, abs));
    expect(visited.size, "the walk visited nothing — this test would pass vacuously").toBeGreaterThan(100);

    const { unread, unreadable } = auditReadCoverage(tracked, visited, (f) => readBytes(`${repoRoot}/${f}`));
    expect(
      unreadable,
      "these tracked paths could not be opened, so nothing can be said about their contents",
    ).toEqual([]);
    expect(
      unread,
      "these tracked files are TEXT and the leak scan never opens them — a token pasted into one would never be found",
    ).toEqual([]);

    // …and the exemption list may only name binary formats. A text type here
    // would switch the scan off for that type across the whole tree.
    for (const [ext, why] of Object.entries(NOT_SCANNED_EXTENSIONS)) {
      expect(String(why), `.${ext} is exempted without saying it is binary`).toMatch(/binary/i);
    }
  });

  it("a dotenv file is scanned whatever its suffix", () => {
    expect(isScannedFile(".env")).toBe(true);
    expect(isScannedFile(".env.local")).toBe(true);
    expect(isScannedFile(".env.production")).toBe(true);
  });

  /** MUTATION: add a source directory to SKIP_DIRS. */
  it("only build output and vendored trees are skipped", () => {
    expect(isSkippedDir("node_modules")).toBe(true);
    expect(isSkippedDir("dist")).toBe(true);
    expect(isSkippedDir(".git")).toBe(true);
    // The engine's own tree, the config workspace, the reports and the
    // workflows must all be walked. Adding any of them to SKIP_DIRS switched
    // off the scan over exactly the code the Laws govern.
    for (const d of ["src", "scripts", "test", "engine", "config", "reports", "fullburn", ".github", "workflows"]) {
      expect(isSkippedDir(d), `${d} is no longer walked by the leak scan`).toBe(false);
    }
  });

  /** MUTATION: `if (!verdict.ok)` → `if (false)` in leak-check.mjs, or invert
   * the emptiness test here. */
  it("findings are a FAIL and an empty result is clean — and a non-result is neither", () => {
    expect(leakVerdict([]).ok).toBe(true);
    const bad = leakVerdict(["fullburn/engine/src/x.ts: possible anthropic key"]);
    expect(bad.ok, "a finding did not fail the scan").toBe(false);
    // The reason must NAME the finding: a verdict that fails without saying
    // what it found sends a human to read the whole tree.
    expect(bad.reason).toContain("fullburn/engine/src/x.ts");
    // Fail closed on a non-result: a scan that returned nothing at all has not
    // proved the tree is clean.
    expect(leakVerdict(undefined as unknown as string[]).ok).toBe(false);
    expect(leakVerdict(null as unknown as string[]).ok).toBe(false);
  });
});
