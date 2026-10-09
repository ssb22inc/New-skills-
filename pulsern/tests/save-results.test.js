/* ops/save-results.sh against real git repositories (Astra, PR #134 review,
   round 7): a rebase conflict used to leave HEAD at the remote tip, whose
   no-op push then reported "Saved." with the results nowhere on the branch. */
import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, accessSync, constants } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = resolve("ops/save-results.sh");
const BRANCH = "feature";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", SAVE_RETRY_DELAY: "0" };

let dir, remote, runner, other;
function clone(name) {
  const d = join(dir, name);
  execFileSync("git", ["clone", "-q", "-b", BRANCH, remote, d], { env: ENV });
  return d;
}
function write(repo, file, text) {
  mkdirSync(join(repo, file, ".."), { recursive: true });
  writeFileSync(join(repo, file), text);
}
/* Someone else pushes to the branch while the paid run is working. */
function concurrent(file, text) {
  write(other, file, text);
  git(other, "add", "-A");
  execFileSync("git", ["commit", "-q", "-m", "concurrent"], { cwd: other, env: ENV });
  git(other, "push", "-q", "origin", `HEAD:${BRANCH}`);
}
function save(...paths) {
  const out = join(dir, "output.txt");
  writeFileSync(out, "");
  const r = spawnSync(SCRIPT, [BRANCH, "results", ...paths], { cwd: runner, env: { ...ENV, GITHUB_OUTPUT: out }, encoding: "utf8" });
  return { code: r.status, log: r.stdout + r.stderr, out: readFileSync(out, "utf8") };
}
const remoteFile = (file) => {
  try { return git(remote, "show", `${BRANCH}:${file}`); } catch { return null; }
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "save-results-"));
  remote = join(dir, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", BRANCH, remote]);
  const seed = join(dir, "seed");
  execFileSync("git", ["init", "-q", "-b", BRANCH, seed]);
  write(seed, "src/item-map.json", '{"pairs":{}}\n');
  write(seed, "README", "base\n");
  git(seed, "add", "-A");
  execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: seed, env: ENV });
  git(seed, "push", "-q", remote, BRANCH);
  runner = clone("runner");
  other = clone("other");
});

describe("save-results.sh", () => {
  /* Checks the bit without setting it (Astra, PR #134 review, round 8: the
     first version of this test set the mode itself, repairing the very
     defect it was meant to catch). The workflows run the script directly. */
  it("is committed executable and is executable on disk", () => {
    expect(() => accessSync(SCRIPT, constants.X_OK)).not.toThrow();
    const mode = execFileSync("git", ["ls-files", "-s", "--", "ops/save-results.sh"], { encoding: "utf8" }).slice(0, 6);
    expect(mode).toBe("100755");
  });

  it("saves and reports the pushed head when nobody else touched the branch", () => {
    write(runner, "src/item-map.json", '{"pairs":{"a":1}}\n');
    const r = save("src/item-map.json", "reports/missing/");
    expect(r.code, r.log).toBe(0);
    const head = git(runner, "rev-parse", "HEAD");
    expect(r.out).toBe(`pushed=true\nhead=${head}\n`);
    expect(remoteFile("src/item-map.json")).toBe('{"pairs":{"a":1}}');
  });

  it("rebases over a non-conflicting concurrent update and reports the rebased head", () => {
    write(runner, "src/item-map.json", '{"pairs":{"a":1}}\n');
    concurrent("README", "someone else\n");
    const r = save("src/item-map.json");
    expect(r.code, r.log).toBe(0);
    const tip = git(remote, "rev-parse", BRANCH);
    expect(r.out).toBe(`pushed=true\nhead=${tip}\n`);
    expect(remoteFile("src/item-map.json")).toBe('{"pairs":{"a":1}}');
    expect(remoteFile("README")).toBe("someone else");
  });

  it("fails on a conflicting concurrent update, claims no save and keeps the results locally", () => {
    write(runner, "src/item-map.json", '{"pairs":{"a":1}}\n');
    concurrent("src/item-map.json", '{"pairs":{"b":2}}\n');
    const before = git(remote, "rev-parse", BRANCH);
    const r = save("src/item-map.json");
    expect(r.code).toBe(1);
    expect(r.log).toMatch(/conflict with a concurrent update/);
    expect(r.out).toBe("");
    expect(git(remote, "rev-parse", BRANCH)).toBe(before);
    expect(remoteFile("src/item-map.json")).toBe('{"pairs":{"b":2}}');
    // the rebase was aborted: the runner still holds its own results commit
    expect(existsSync(join(runner, ".git", "rebase-merge"))).toBe(false);
    expect(readFileSync(join(runner, "src/item-map.json"), "utf8")).toBe('{"pairs":{"a":1}}\n');
  });

  it("says so, and claims nothing, when there is nothing to save", () => {
    const r = save("src/item-map.json");
    expect(r.code).toBe(0);
    expect(r.log).toMatch(/Nothing new to save/);
    expect(r.out).toBe("");
  });

  it("fails when the push never lands", () => {
    write(runner, "src/item-map.json", '{"pairs":{"a":1}}\n');
    git(runner, "remote", "set-url", "origin", join(dir, "nowhere.git"));
    const r = save("src/item-map.json");
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
  });
});
