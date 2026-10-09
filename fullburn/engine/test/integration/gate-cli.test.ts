import { execFile, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { VERIFIED_TREE_SCOPE } from "../../scripts/gate-lib.mjs";

/** INTEGRATION — the gate CLIs, executed as CI executes them, against a real
 * git repository.
 *
 * Every gate test before this one drove the pure library. That left the CLIs —
 * the only wiring between the library and CI — completely unexecuted, and two
 * separate reviews found defects living in exactly that gap: renaming
 * `baseCommit:` at its single call site disabled the whole pull-request binding
 * with the suite green (N-03 leg B), and swapping the NUL-separated diff parser
 * back to the text one was invisible for the same reason (R3-CP-08). A mutation
 * run confirmed both survived every unit test.
 *
 * This is also the first of §10.3's two missing pipeline stages (ledger L16). */

const SCRIPTS = fileURLToPath(new URL("../../scripts/", import.meta.url));
let repo: string;

const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

/** Runs a gate exactly as CI does. Returns exit code and combined output. */
function gate(script: string, ...args: string[]): { code: number; out: string } {
  return gateEnv({}, script, ...args);
}

/** A stand-in for `gh attestation verify` (X5-02), put first on PATH: it
 * reports the file it is asked about as attested by this repository's
 * cross-family-read workflow — unless FAKE_GH says otherwise. Real GitHub
 * verification is CI's; this drives the CLI's wiring and the decision. */
let fakeGhDir = "";
function fakeGh(): string {
  if (fakeGhDir) return fakeGhDir;
  fakeGhDir = mkdtempSync(join(tmpdir(), "fake-gh-"));
  writeFileSync(
    join(fakeGhDir, "gh"),
    [
      "#!/usr/bin/env bash",
      '[ "$1" = attestation ] && [ "$2" = verify ] || exit 2',
      'mode="${FAKE_GH:-ok}"',
      '[ "$mode" = fail ] && { echo "no attestation" >&2; exit 1; }',
      'sha=$(sha256sum "$3" | cut -d" " -f1)',
      '[ "$mode" = wrongdigest ] && sha=$(printf x | sha256sum | cut -d" " -f1)',
      'signer="https://github.com/o/r/.github/workflows/cross-family-read.yml@refs/heads/main"',
      '[ "$mode" = wrongsigner ] && signer="https://github.com/o/r/.github/workflows/other.yml@refs/heads/main"',
      'printf \'[{"verificationResult":{"statement":{"subject":[{"digest":{"sha256":"%s"}}]},"signature":{"certificate":{"buildSignerURI":"%s"}}}}]\' "$sha" "$signer"',
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return fakeGhDir;
}

function gateEnv(extra: Record<string, string>, script: string, ...args: string[]): { code: number; out: string } {
  try {
    const env = { ...process.env, PATH: `${fakeGh()}:${process.env.PATH ?? ""}`, GITHUB_REPOSITORY: "o/r", ...extra };
    const out = execFileSync("node", [join(SCRIPTS, script), ...args], { encoding: "utf8", stdio: "pipe", env });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** A stand-in for GitHub's "get a commit" API (X5-03): every commit is
 * reported as signature-verified and authored by `maintainer`, unless the
 * test overrides a sha. The CLI is run ASYNC against it — a synchronous child
 * would block the event loop this server answers on. */
async function withGithub<T>(
  fn: (env: Record<string, string>, override: Map<string, { verified: boolean; login: string | null }>) => Promise<T>,
): Promise<T> {
  const override = new Map<string, { verified: boolean; login: string | null }>();
  const server = createServer((req, res) => {
    const m = /\/repos\/o\/r\/commits\/([0-9a-f]{40})$/.exec(req.url ?? "");
    if (!m || req.headers.authorization !== "Bearer test-token") {
      res.writeHead(404).end();
      return;
    }
    const o = override.get(m[1]!) ?? { verified: true, login: "maintainer" };
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({ sha: m[1], commit: { verification: { verified: o.verified } }, author: o.login === null ? null : { login: o.login } }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  try {
    return await fn(
      { GITHUB_API_URL: `http://127.0.0.1:${port}`, GITHUB_TOKEN: "test-token", GITHUB_REPOSITORY: "o/r", FULLBURN_MAINTAINER: "maintainer" },
      override,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

function gateAsync(env: Record<string, string>, script: string, ...args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile("node", [join(SCRIPTS, script), ...args], { encoding: "utf8", env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}` });
    });
  });
}

/** The tree hash the gate itself computes: `git ls-files -s` over the verified
 * scope, hashed. reports/ and APPROVALS/ are excluded, which is what lets a
 * report bind to the tree it is then committed into. */
const currentTreeHash = () => {
  // ONE definition of the scope, read from gate-lib — a literal copy here
  // silently diverged from the CLI's the day the scope changed (2026-09-20).
  const listing = execFileSync("git", ["-C", repo, "ls-files", "-s", "--", ...VERIFIED_TREE_SCOPE], { encoding: "utf8" });
  return execFileSync("git", ["-C", repo, "hash-object", "--stdin"], { encoding: "utf8", input: listing }).trim();
};

const write = (rel: string, body: string) => {
  const abs = join(repo, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "fullburn-gate-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "gate test");
  write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 5 };\n");
  write("fullburn/README.md", "base\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("class2-gate CLI (N-03 leg B, R3-CP-08)", () => {
  it("blocks an unapproved Class-2 change", () => {
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 500 };\n");
    git("add", "-A");
    git("commit", "-q", "-m", "raise the cap");
    const res = gate("class2-gate.mjs", repo, base);
    expect(res.code).toBe(1);
    expect(res.out).toContain("caps.ts");
  });

  /** git QUOTES any path containing a space, a quote, a backslash or a
   * non-ASCII byte. With the human-readable diff the quoted form matched no
   * CLASS2_PATTERN, so the file walked straight out of the protected set. Only
   * the CLI knows which diff format it asks git for, so only the CLI can be
   * wrong about it — which is why no unit test could catch the regression.
   *
   * MUTATION: swap parseNameStatusZ back to parseNameStatus (and drop `-z`). */
  it("a Class-2 path containing a space does not walk out of the protected set", () => {
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/config/src/spend caps.ts", "export const CAPS = { dailyAiSpendUsd: 500 };\n");
    git("add", "-A");
    git("commit", "-q", "-m", "add a spaced path");
    const res = gate("class2-gate.mjs", repo, base);
    expect(res.code, `a quoted path was treated as Class 1:\n${res.out}`).toBe(1);
    expect(res.out).toContain("spend caps.ts");
  });

  it("a non-ASCII Class-2 path is protected too", () => {
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/config/src/caps-café.ts", "export const CAPS = {};\n");
    git("add", "-A");
    git("commit", "-q", "-m", "add a non-ascii path");
    const res = gate("class2-gate.mjs", repo, base);
    expect(res.code, `a non-ASCII path was treated as Class 1:\n${res.out}`).toBe(1);
  });

  /** The CLI must hand the library a base commit. Renaming that one property
   * restored full approval replay with every unit test green (N-03 leg B). */
  it("a replayed approval from another pull request does not authorize the change", () => withGithub(async (env) => {
    const base = git("rev-parse", "HEAD").trim();
    const sha = (path: string) =>
      execFileSync("sha256sum", [join(repo, path)], { encoding: "utf8" }).split(" ")[0];
    const fromHash = sha("fullburn/config/src/caps.ts");
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 500 };\n");
    const toHash = sha("fullburn/config/src/caps.ts");

    // An approval naming a DIFFERENT pull request's base.
    write(
      "fullburn/APPROVALS/2026-01-02-caps.md",
      ["Approved-by: human", "approves: fullburn/config/src/caps.ts", "base-commit: " + "0".repeat(40),
       `from-content-hash: ${fromHash}`, `content-hash: ${toHash}`].join("\n") + "\n",
    );
    git("add", "-A");
    git("commit", "-q", "-m", "raise the cap with a replayed approval");
    const replayed = await gateAsync(env, "class2-gate.mjs", repo, base);
    expect(replayed.code, `a replayed approval opened the gate:\n${replayed.out}`).toBe(1);

    // The same approval, naming THIS pull request's base, is honoured.
    git("rm", "-q", "fullburn/APPROVALS/2026-01-02-caps.md");
    write(
      "fullburn/APPROVALS/2026-08-16-caps.md",
      ["Approved-by: human", "approves: fullburn/config/src/caps.ts", `base-commit: ${base}`,
       `from-content-hash: ${fromHash}`, `content-hash: ${toHash}`].join("\n") + "\n",
    );
    git("add", "-A");
    git("commit", "-q", "-m", "correct the approval");
    const honoured = await gateAsync(env, "class2-gate.mjs", repo, base);
    expect(honoured.code, honoured.out).toBe(0);
    expect(honoured.out).toContain(base);
  }));

  /** R7-07. The gate verified the approval's BYTES and never its author, so the
   * same agent raising the cap could commit a conforming approval beside it and
   * satisfy the rule that exists to restrain it. This is the in-repo half: a
   * committer name is self-asserted, so it raises the cost without proving a
   * human — branch protection plus CODEOWNERS is the half that does, and ledger
   * L27 records that every approval predating that lock is unverified.
   *
   * It lives HERE and not in the unit suite because the author comes from
   * `git log`, at the single CLI call site N-03 already proved is invisible to
   * every test that drives the library directly.
   *
   * MUTATION: drop `authoredBy:` from class2-gate.mjs. */
  it("an approval the automation principal committed does not open the gate", () => withGithub(async (env, override) => {
    const base = git("rev-parse", "HEAD").trim();
    const sha = (path: string) =>
      execFileSync("sha256sum", [join(repo, path)], { encoding: "utf8" }).split(" ")[0];
    const fromHash = sha("fullburn/config/src/caps.ts");
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 500 };\n");
    const toHash = sha("fullburn/config/src/caps.ts");
    const approval = ["Approved-by: human", "approves: fullburn/config/src/caps.ts", `base-commit: ${base}`,
      `from-content-hash: ${fromHash}`, `content-hash: ${toHash}`].join("\n") + "\n";

    // The agent raises the cap and signs off on it in the same breath. Note the
    // approval's own `Approved-by:` line still says "human" — the document
    // cannot be trusted about who wrote it, which is the entire finding.
    write("fullburn/APPROVALS/2026-08-17-self-approved.md", approval);
    git("add", "-A");
    git("-c", "user.name=Claude", "-c", "user.email=noreply@anthropic.com", "commit", "-q", "-m", "raise the cap");
    const selfApproved = await gateAsync(env, "class2-gate.mjs", repo, base);
    expect(selfApproved.code, `the agent approved its own Class-2 change:\n${selfApproved.out}`).toBe(1);
    expect(selfApproved.out).toMatch(/automation principal/);

    // The identical bytes, committed by a human, are honoured.
    git("rm", "-q", "fullburn/APPROVALS/2026-08-17-self-approved.md");
    write("fullburn/APPROVALS/2026-08-17-human-approved.md", approval);
    git("add", "-A");
    git("-c", "user.name=A Human", "-c", "user.email=human@example.invalid", "commit", "-q", "-m", "approve");
    const approvalCommit = git("rev-parse", "HEAD").trim();
    const honoured = await gateAsync(env, "class2-gate.mjs", repo, base);
    expect(honoured.code, honoured.out).toBe(0);

    /** X5-03 (GPT-6 Astra, 2026-10-06): the same bytes under ANY self-asserted
     * human name used to open the gate. Now GitHub's record decides: an
     * unverified commit, another account, or no record at all is refused.
     * MUTATION: X5-03a (decision), X5-03b (CLI wiring). */
    override.set(approvalCommit, { verified: false, login: "maintainer" });
    const unsigned = await gateAsync(env, "class2-gate.mjs", repo, base);
    expect(unsigned.code, `an unverified commit's approval opened the gate:\n${unsigned.out}`).toBe(1);
    expect(unsigned.out).toMatch(/not signature-verified/);
    override.set(approvalCommit, { verified: true, login: "someone-else" });
    const other = await gateAsync(env, "class2-gate.mjs", repo, base);
    expect(other.code, `another account's approval opened the gate:\n${other.out}`).toBe(1);
    expect(other.out).toMatch(/authored by someone-else/);
    /** X6-03 (GPT-6 Astra, 2026-10-06): the maintainer's verified commit adds
     * the approval; a LATER unsigned commit rewrites it. Only the addition was
     * authenticated, while the gate parsed the rewritten bytes.
     * MUTATION: X6-03. */
    override.delete(approvalCommit);
    write("fullburn/APPROVALS/2026-08-17-human-approved.md", approval + "\n");
    git("-c", "user.name=Someone", "-c", "user.email=someone@example.invalid", "commit", "-q", "-am", "edit the approval");
    const editCommit = git("rev-parse", "HEAD").trim();
    override.set(editCommit, { verified: false, login: null });
    const edited = await gateAsync(env, "class2-gate.mjs", repo, base);
    expect(edited.code, `an approval rewritten by an unsigned commit opened the gate:\n${edited.out}`).toBe(1);
    override.delete(editCommit);
    expect((await gateAsync(env, "class2-gate.mjs", repo, base)).code, "a maintainer-signed edit was refused").toBe(0);
    const noRecord = await gateAsync({ ...env, GITHUB_TOKEN: "" }, "class2-gate.mjs", repo, base);
    expect(noRecord.code, "an approval with no GitHub record opened the gate").toBe(1);
    const noMaintainer = await gateAsync({ ...env, FULLBURN_MAINTAINER: "" }, "class2-gate.mjs", repo, base);
    expect(noMaintainer.code, "the gate opened with no maintainer configured").toBe(1);
  }));

  it("refuses to run at all without a base ref", () => {
    expect(gate("class2-gate.mjs", repo).code).toBe(1);
  });
});

/** X7-04 (GPT-6 Astra, 2026-10-09): approval paths come from the pull request
 * and were interpolated into shell commands with JSON quoting — `$(...)` ran
 * inside the trusted gate, with the job token in its environment. Every git
 * call is an argument vector now. MUTATION: X7-04. */
describe("no pull-request path reaches a shell", () => {
  it("an approval file named with a command substitution runs nothing", () => {
    const sentinel = join(repo, "gate-shell-sentinel");
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 500 };\n");
    for (const name of [`$(touch ${sentinel})`, `\`touch ${sentinel}\``]) {
      write(`fullburn/APPROVALS/${name}.md`, "approves: fullburn/config/src/caps.ts\n");
    }
    git("add", "-A");
    git("commit", "-q", "-m", "hostile approval names");
    gate("class2-gate.mjs", repo, base);
    gate("owed-approvals.mjs", repo, base);
    gate("adversary-gate.mjs", repo, base);
    expect(existsSync(sentinel), "a pull-request filename executed a shell command inside a gate").toBe(false);
  });

  it("no gate script can spawn a shell", () => {
    for (const f of readdirSync(SCRIPTS).filter((n) => n.endsWith(".mjs"))) {
      const src = readFileSync(join(SCRIPTS, f), "utf8");
      expect(/\bexecSync\s*\(|shell:\s*true|["'`](?:ba|z|da)?sh["'`]\s*,\s*\[\s*["'`]-c/.test(src), `${f} can spawn a shell`).toBe(false);
    }
  });
});

describe("owed-approvals CLI prints what class2-gate demands (H-17)", () => {
  it("its output, pasted verbatim into APPROVALS/, opens the gate", () => withGithub(async (env) => {
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 500 };\n");
    write("fullburn/config/src/freeze.ts", "export const deepFreeze = (x) => x;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "touch two money-cap files");

    const blocked = gate("class2-gate.mjs", repo, base);
    expect(blocked.code).toBe(1);

    const printed = gate("owed-approvals.mjs", repo, base);
    expect(printed.code, printed.out).toBe(0);
    expect(printed.out).toContain("caps.ts");
    expect(printed.out).toContain("freeze.ts");

    write("fullburn/APPROVALS/2026-08-16-generated.md", `Approved-by: human\n${printed.out}`);
    git("add", "-A");
    git("commit", "-q", "-m", "add the generated approvals");
    const opened = await gateAsync(env, "class2-gate.mjs", repo, base);
    expect(opened.code, `the generated approvals did not satisfy the gate:\n${opened.out}`).toBe(0);
  }));
});

describe("adversary-gate CLI — the tree hash reads the index, so the worktree must be clean", () => {
  /** `assertCleanTree` had NO test of any kind: deleting the call left the
   * suite 232/232 green and walked an untracked `engine/src/backdoor.ts` past a
   * PASS bound to a hash that structurally cannot see it (adversary findings
   * R2-19, R5-07). It is CLI-only — it shells out to `git status` — so only an
   * integration test can reach it, which is exactly why it had none.
   *
   * MUTATION: delete `assertCleanTree(repoRoot)` from adversary-gate.mjs. */
  it("an untracked module in the verified scope blocks a PASS bound to the index", () => {
    write("fullburn/PHASE", "0\n");
    // A tracked sibling, so git reports the new file by name rather than
    // collapsing a wholly-untracked directory to "?? fullburn/engine/src/".
    write("fullburn/engine/src/index.ts", "export const version = 0;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "declare the phase");
    const tree = currentTreeHash();
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", `# r\nVerdict: PASS\nverified-tree: ${tree}\nReviewer-family: OpenAI (gpt-6-astra)\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "add a PASS report");
    const base = git("rev-parse", "HEAD").trim();
    expect(gate("adversary-gate.mjs", repo, base).code, "a clean tree with a fresh PASS should open").toBe(0);

    // A brand-new module the index-based hash cannot see.
    write("fullburn/engine/src/backdoor.ts", "export const unmetered = () => 'no cap check here';\n");
    const res = gate("adversary-gate.mjs", repo, base);
    expect(res.code, `an untracked engine module sailed past the gate:\n${res.out}`).toBe(1);
    expect(res.out).toContain("backdoor.ts");

    // An unstaged EDIT to a tracked file is the same problem.
    rmSync(join(repo, "fullburn/engine/src/backdoor.ts"));
    expect(gate("adversary-gate.mjs", repo, base).code).toBe(0);
    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 999999 };\n");
    expect(gate("adversary-gate.mjs", repo, base).code, "an unstaged cap edit sailed past").toBe(1);
  });

  /** MUTATION: relax the APPROVALS clause in checkReportsAppendOnly. */
  it("rewriting a signed approval is refused — APPROVALS is append-only too", () => {
    write("fullburn/PHASE", "0\n");
    write("fullburn/APPROVALS/2026-08-16-caps.md", "Approved-by: human\napproves: fullburn/config/src/caps.ts\n");
    git("add", "-A");
    git("commit", "-q", "-m", "sign the caps");
    const base = git("rev-parse", "HEAD").trim();
    const tree = currentTreeHash();
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", `# r\nVerdict: PASS\nverified-tree: ${tree}\nReviewer-family: OpenAI (gpt-6-astra)\n`);
    // Rewrite the signed approval to say something the human never signed.
    write("fullburn/APPROVALS/2026-08-16-caps.md", "Approved-by: someone else\napproves: everything, forever\n");
    git("add", "-A");
    git("commit", "-q", "-m", "quietly rewrite the approval");
    const res = gate("adversary-gate.mjs", repo, base);
    expect(res.code, `a signed approval was rewritten with the gate green:\n${res.out}`).toBe(1);
    expect(res.out).toContain("append-only");
  });
});

/** THE VERIFIED TREE COVERS THE CI THAT ENFORCES THE GATE (R2-18).
 *
 * `TREE_SCOPE` was a const literal inside `adversary-gate.mjs`. Removing
 * `.github/` from it restored R2-18 in one line with the whole default suite
 * green at 354/354 — the workflow jobs could be deleted after a PASS was
 * written and the binding would still match, because no test drove the scope
 * through a change under `.github/` (runner audit, R14-06 rule).
 *
 * The constant moved to gate-lib, and this is the behavioural half: the scope
 * is proven by making a `.github/` change and watching the gate refuse.
 *
 * MUTATION: drop ".github/" from VERIFIED_TREE_SCOPE. */
describe("adversary-gate CLI — a PASS is a statement about the workflow too (R2-18)", () => {
  it("a committed workflow change makes a standing PASS stale", () => {
    write("fullburn/PHASE", "0\n");
    write(".github/workflows/fullburn-ci.yml", "name: ci\non: [pull_request]\njobs: {}\n");
    git("add", "-A");
    git("commit", "-q", "-m", "declare the phase and the CI");
    const tree = currentTreeHash();
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", `# r\nVerdict: PASS\nverified-tree: ${tree}\nReviewer-family: OpenAI (gpt-6-astra)\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "add a PASS report");
    const base = git("rev-parse", "HEAD").trim();
    expect(gate("adversary-gate.mjs", repo, base).code, "a clean tree with a fresh PASS should open").toBe(0);

    // Gut the CI that enforces the gate, AFTER the adversary signed off.
    write(".github/workflows/fullburn-ci.yml", "name: ci\non: [pull_request]\njobs:\n  # every gate removed\n");
    git("add", "-A");
    git("commit", "-q", "-m", "quietly remove the gates");
    const res = gate("adversary-gate.mjs", repo, base);
    expect(res.code, `the workflow was gutted and the PASS still stood:\n${res.out}`).toBe(1);
  });

  it("an unstaged workflow edit is refused like any other unstaged change", () => {
    write("fullburn/PHASE", "0\n");
    write(".github/workflows/fullburn-ci.yml", "name: ci\non: [pull_request]\njobs: {}\n");
    git("add", "-A");
    git("commit", "-q", "-m", "declare the phase and the CI");
    const tree = currentTreeHash();
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", `# r\nVerdict: PASS\nverified-tree: ${tree}\nReviewer-family: OpenAI (gpt-6-astra)\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "add a PASS report");
    const base = git("rev-parse", "HEAD").trim();
    expect(gate("adversary-gate.mjs", repo, base).code).toBe(0);

    write(".github/workflows/fullburn-ci.yml", "name: ci\non: [pull_request]\njobs:\n  # gone\n");
    expect(gate("adversary-gate.mjs", repo, base).code, "an unstaged workflow edit sailed past").toBe(1);
  });
});

/** WHICH REPORTS ANSWER FOR THIS PHASE (runner audit).
 *
 * The selection regex lived between the CLI's readdir and the library. Widened
 * to `/^ADVERSARY_REPORT_phase/` it survived the whole default suite, and a
 * PASS written for a different phase opened this one.
 *
 * MUTATION: widen the pattern in selectPhaseReports. */
describe("adversary-gate CLI — a PASS for another phase is not a PASS for this one", () => {
  it("phase 1's report does not open the phase 0 gate", () => {
    write("fullburn/PHASE", "0\n");
    git("add", "-A");
    git("commit", "-q", "-m", "declare the phase");
    const tree = currentTreeHash();
    // Bound to the CURRENT tree and reading PASS: only the phase binding can
    // stop it, so a pass here would be for the wrong reason.
    write("fullburn/reports/ADVERSARY_REPORT_phase1.md", `# r\nVerdict: PASS\nverified-tree: ${tree}\nReviewer-family: OpenAI (gpt-6-astra)\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "add a phase-1 PASS");
    const base = git("rev-parse", "HEAD").trim();
    const res = gate("adversary-gate.mjs", repo, base);
    expect(res.code, `a phase-1 PASS opened the phase-0 gate:\n${res.out}`).toBe(1);
    expect(res.out).toMatch(/phase0/);
  });
});

/** A REWRITTEN APPROVAL IS NOT AN APPROVAL (runner audit).
 *
 * The approval-document filter lived inline in `class2-gate.mjs`. Dropping its
 * `status === "added"` clause survived the default suite: the append-only check
 * in the OTHER gate refuses a rewritten approval, so the tree was never open —
 * but the gate that authorizes Class-2 changes was relying on a different gate
 * to notice, and nothing tested that it did not.
 *
 * MUTATION: drop the `status === "added"` clause from selectApprovalDocs. */
describe("class2-gate CLI — an approval must ARRIVE with the change it approves", () => {
  it("rewriting an approval that existed at the base does not open the gate", () => {
    // An approval committed in an earlier PR, for an earlier transition.
    write("fullburn/APPROVALS/2026-08-16-caps.md", "Approved-by: human\napproves: nothing yet\n");
    git("add", "-A");
    git("commit", "-q", "-m", "an old approval");
    const base = git("rev-parse", "HEAD").trim();

    write("fullburn/config/src/caps.ts", "export const CAPS = { dailyAiSpendUsd: 500 };\n");
    git("add", "-A");
    git("commit", "-q", "-m", "raise the cap");

    // Ask the tool what a valid approval for THIS transition looks like, then
    // put that text into the file that already existed instead of adding one.
    const printed = gate("owed-approvals.mjs", repo, base);
    expect(printed.code, printed.out).toBe(0);
    write("fullburn/APPROVALS/2026-08-16-caps.md", `Approved-by: human\n${printed.out}`);
    git("add", "-A");
    git("commit", "-q", "-m", "rewrite the old approval to cover the new change");

    const res = gate("class2-gate.mjs", repo, base);
    expect(res.code, `a rewritten approval authorized a Class-2 change:\n${res.out}`).toBe(1);
  });
});

describe("adversary-gate CLI", () => {
  /** X5-02 (GPT-6 Astra, 2026-10-06): a handwritten PASS with the current tree
   * and a non-Claude family opened the gate. Now its exact bytes need the
   * review workflow's verified attestation. MUTATION: X5-02a (CLI), X5-02b
   * (decision: signer), X5-02c (decision: digest). */
  it("a PASS without the review workflow's attestation of its exact bytes does not open the gate", () => {
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/PHASE", "0\n");
    git("add", "-A");
    git("commit", "-q", "-m", "declare the phase");
    write("fullburn/reports/ADVERSARY_REPORT_phase0.x9.md", `# r\nVerdict: PASS\nverified-tree: ${currentTreeHash()}\nReviewer-family: OpenAI (gpt-6-astra)\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "a handwritten PASS");
    expect(gateEnv({}, "adversary-gate.mjs", repo, base).code, "an attested PASS was refused").toBe(0);
    for (const mode of ["fail", "wrongsigner", "wrongdigest"]) {
      const res = gateEnv({ FAKE_GH: mode }, "adversary-gate.mjs", repo, base);
      expect(res.code, `a PASS opened the gate with attestation mode ${mode}:\n${res.out}`).toBe(1);
      expect(res.out).toMatch(/attestation/);
    }
    expect(gateEnv({ GITHUB_REPOSITORY: "" }, "adversary-gate.mjs", repo, base).code, "a PASS opened the gate with no repository to bind the signer to").toBe(1);
  });

  it("a FAIL report bound to the current tree blocks the gate", () => {
    const base = git("rev-parse", "HEAD").trim();
    write("fullburn/PHASE", "0\n");
    git("add", "-A");
    git("commit", "-q", "-m", "declare the phase");
    const tree = currentTreeHash();
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", `# r\nVerdict: FAIL\nverified-tree: ${tree}\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "add a FAIL report");
    const res = gate("adversary-gate.mjs", repo, base);
    expect(res.code).toBe(1);
  });

  it("editing an existing report is refused — reports are append-only", () => {
    write("fullburn/PHASE", "0\n");
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", "# r\nVerdict: FAIL\nverified-tree: x\n");
    git("add", "-A");
    git("commit", "-q", "-m", "add a report");
    const base = git("rev-parse", "HEAD").trim();
    // Bound to the CURRENT tree, so only the append-only rule can stop it —
    // otherwise this would pass for the wrong reason (staleness).
    write("fullburn/reports/ADVERSARY_REPORT_phase0.md", `# r\nVerdict: PASS\nverified-tree: ${currentTreeHash()}\nReviewer-family: OpenAI (gpt-6-astra)\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "edit the FAIL into a PASS");
    const res = gate("adversary-gate.mjs", repo, base);
    expect(res.code, `an edited report passed:\n${res.out}`).toBe(1);
    expect(res.out).toContain("append-only");
  });
});
