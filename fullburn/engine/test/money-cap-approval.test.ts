import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { HUMAN_APPROVAL_PATTERNS, checkApprovalAuthentication, checkClass2Approvals, checkMoneyCapGate, isClass2, needsHumanApproval } from "../scripts/gate-lib.mjs";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { commitAuthFromApi, fetchCommitAuth, repoFromRemote } from "../scripts/github-auth.mjs";

/** Human ruling 2026-10-06 (ledger L50): every human gate is removed except
 * approval of the money caps. These tests pin both halves — what still owes a
 * human approval, and what no longer does — so neither can drift silently. */
describe("human approval is owed for the money caps only (ruling 2026-10-06)", () => {
  /** One concrete path per pattern; every pattern must claim one, and every
   * path must be claimed — so neutering a pattern turns this red.
   * MUTATION: delete or narrow any HUMAN_APPROVAL_PATTERNS entry. */
  const WITNESSES = [
    "fullburn/config/src/caps.ts",
    "fullburn/config/src/freeze.ts",
    "fullburn/config/package.json",
    "fullburn/engine/scripts/gate-lib.mjs",
    "fullburn/engine/scripts/class2-gate.mjs",
    "fullburn/engine/scripts/diff-lib.mjs",
    "fullburn/engine/scripts/ci-scope.mjs",
    "fullburn/engine/scripts/github-auth.mjs",
    ".github/workflows/fullburn-ci.yml",
    ".github/workflows/fullburn-gates.yml",
  ];

  it("every money-cap witness owes a human approval, and every pattern claims a witness", () => {
    for (const p of WITNESSES) expect(needsHumanApproval(p), `${p} no longer owes a human approval`).toBe(true);
    for (const re of HUMAN_APPROVAL_PATTERNS as RegExp[]) {
      expect(WITNESSES.some((p) => re.test(p)), `${re} claims no witness`).toBe(true);
    }
    // A new caps-named module is not a way around the list.
    expect(needsHumanApproval("fullburn/config/src/spend caps.ts")).toBe(true);
    expect(needsHumanApproval("fullburn/config/src/caps-café.ts")).toBe(true);
  });

  it("every money-cap path is also Class-2, so CI runs and the verified tree covers it", () => {
    for (const p of WITNESSES) expect(isClass2(p), `${p} owes approval but is outside the protected scope`).toBe(true);
  });

  /** The other half of the ruling: Class-2 paths that are not money caps are
   * decided by the automated gates and owe no human approval. */
  it("a non-cap Class-2 change owes no human approval", () => {
    for (const p of ["fullburn/engine/src/gateway.ts", "fullburn/engine/test/x.test.ts", "DONE.md", "fullburn/config/src/models.ts", "fullburn/config/src/grade-thresholds.ts"]) {
      expect(isClass2(p)).toBe(true);
      expect(needsHumanApproval(p), `${p} still owes a human approval`).toBe(false);
    }
    const res = checkClass2Approvals({
      changedFiles: [{ status: "modified", path: "fullburn/engine/src/gateway.ts" }],
      approvalDocs: [],
      hashOf: () => "h",
      baseHashOf: () => "b",
      baseCommit: "1111111111111111111111111111111111111111",
    });
    expect(res.ok).toBe(true);
  });

  it("a cap change with no approval is refused", () => {
    const res = checkClass2Approvals({
      changedFiles: [{ status: "modified", path: "fullburn/config/src/caps.ts" }],
      approvalDocs: [],
      hashOf: () => "h",
      baseHashOf: () => "b",
      baseCommit: "1111111111111111111111111111111111111111",
    });
    expect(res.ok, "a cap change merged with no human approval").toBe(false);
    expect(res.reason).toContain("caps.ts");
  });
});

/** X5-03 (GPT-6 Astra, 2026-10-06): a cap approval counts only if GitHub
 * reports the commit that added it as signature-verified and authored by the
 * maintainer account. */
describe("money-cap approvals are authenticated by GitHub's commit record (X5-03)", () => {
  const ok = { path: "fullburn/APPROVALS/a.md", status: "added", auth: { verified: true, authorLogin: "Maintainer", committerLogin: "maintainer" } };
  it("accepts only verified commits by the maintainer, case-insensitively", () => {
    expect(checkApprovalAuthentication([ok], "maintainer").ok).toBe(true);
    expect(checkApprovalAuthentication([{ ...ok, auth: { verified: false, authorLogin: "maintainer" } }], "maintainer").ok, "an unsigned commit counted").toBe(false);
    expect(checkApprovalAuthentication([{ ...ok, auth: { verified: true, authorLogin: "other" } }], "maintainer").ok, "another account counted").toBe(false);
    expect(checkApprovalAuthentication([{ ...ok, auth: { verified: true, authorLogin: null } }], "maintainer").ok, "an unlinked author counted").toBe(false);
    expect(checkApprovalAuthentication([{ ...ok, auth: null }], "maintainer").ok, "no record counted").toBe(false);
    // X7-02: the signer is the committer; naming the maintainer as author is not signing.
    expect(checkApprovalAuthentication([{ ...ok, auth: { verified: true, authorLogin: "maintainer", committerLogin: "other" } }], "maintainer").ok, "another account's signature counted").toBe(false);
    expect(checkApprovalAuthentication([{ ...ok, auth: { verified: true, authorLogin: "maintainer", committerLogin: null } }], "maintainer").ok, "an unlinked signer counted").toBe(false);
    expect(checkApprovalAuthentication([{ ...ok, auth: { verified: true, authorLogin: "maintainer" } }], "maintainer").ok, "a record with no signer counted").toBe(false);
    expect(checkApprovalAuthentication([{ ...ok, auth: { verified: true, authorLogin: "maintainer", committerLogin: "web-flow" } }], "maintainer").ok, "GitHub's web signer was refused").toBe(true);
    expect(checkApprovalAuthentication([{ ...ok, auth: [ok.auth, { verified: true, authorLogin: "maintainer", committerLogin: "other" }] }], "maintainer").ok, "a later edit signed by another account counted").toBe(false);
    expect(checkApprovalAuthentication([{ ...ok, auth: { verified: true, authorLogin: "maintainer", committerLogin: "other" } }], "maintainer").reason).toContain("signed by other");
    // X6-03: every commit that touched the document must pass.
    expect(checkApprovalAuthentication([{ ...ok, auth: [ok.auth, ok.auth] }], "maintainer").ok).toBe(true);
    expect(checkApprovalAuthentication([{ ...ok, auth: [ok.auth, { verified: false, authorLogin: "maintainer" }] }], "maintainer").ok, "a later unsigned edit counted").toBe(false);
    expect(checkApprovalAuthentication([{ ...ok, auth: [ok.auth, null] }], "maintainer").ok, "a later edit with no record counted").toBe(false);
    expect(checkApprovalAuthentication([{ ...ok, auth: [] }], "maintainer").ok, "no commits at all counted").toBe(false);
  });

  it("refuses everything when no maintainer is configured, even an empty login", () => {
    expect(checkApprovalAuthentication([{ ...ok, auth: { verified: true, authorLogin: "" } }], "").ok).toBe(false);
    expect(checkApprovalAuthentication([ok], undefined).ok).toBe(false);
    expect(checkApprovalAuthentication([ok], "not a login!").ok).toBe(false);
  });

  it("the gate demands authentication only when a money-cap path changed", () => {
    const base = { hashOf: () => "h", baseHashOf: () => "b", baseCommit: "1111111111111111111111111111111111111111" };
    const nonCap = checkMoneyCapGate({ ...base, maintainer: "", changedFiles: [{ status: "modified", path: "fullburn/engine/src/gateway.ts" }], approvalDocs: [] });
    expect(nonCap.ok, "a non-cap change demanded a maintainer").toBe(true);
    const block = ["approves: fullburn/config/src/caps.ts", `base-commit: ${base.baseCommit}`, "from-content-hash: b", "content-hash: h"].join("\n");
    const cap = (auth: unknown) => checkMoneyCapGate({ ...base, maintainer: "maintainer", changedFiles: [{ status: "modified", path: "fullburn/config/src/caps.ts" }], approvalDocs: [{ path: "fullburn/APPROVALS/x.md", status: "added", content: block, authoredBy: "A Human <h@x>", auth }] });
    expect(cap({ verified: true, authorLogin: "maintainer", committerLogin: "maintainer" }).ok).toBe(true);
    expect(cap({ verified: true, authorLogin: "maintainer", committerLogin: "other" }).ok, "a correct approval signed by another account opened the cap gate").toBe(false);
    expect(cap({ verified: false, authorLogin: "maintainer", committerLogin: "maintainer" }).ok, "a correct approval in an unsigned commit opened the cap gate").toBe(false);
  });

  it("reads GitHub's record faithfully and fails closed on anything else", async () => {
    expect(commitAuthFromApi({ commit: { verification: { verified: true } }, author: { login: "m" }, committer: { login: "s" } })).toEqual({ verified: true, authorLogin: "m", committerLogin: "s" });
    expect(commitAuthFromApi({ commit: { verification: { verified: "true" } }, author: null })).toEqual({ verified: false, authorLogin: null, committerLogin: null });
    expect(commitAuthFromApi(null)).toBeNull();
    const sha = "a".repeat(40);
    const reply = (status: number, body: unknown) => async () => ({ status, json: async () => body }) as unknown as Response;
    expect(await fetchCommitAuth({ repo: "o/r", sha, token: "t", fetchImpl: reply(200, { commit: { verification: { verified: true } }, author: { login: "m" }, committer: { login: "m" } }) })).toEqual({ verified: true, authorLogin: "m", committerLogin: "m" });
    expect(await fetchCommitAuth({ repo: "o/r", sha, token: "t", fetchImpl: reply(404, {}) })).toBeNull();
    expect(await fetchCommitAuth({ repo: "o/r", sha, token: "", fetchImpl: reply(200, {}) }), "no token still fetched").toBeNull();
    expect(await fetchCommitAuth({ repo: "o/r", sha: "not-a-sha", token: "t", fetchImpl: reply(200, {}) })).toBeNull();
    expect(await fetchCommitAuth({ repo: "o/r", sha, token: "t", fetchImpl: async () => { throw new Error("network"); } })).toBeNull();
    expect(repoFromRemote("https://github.com/ssb22inc/New-skills-.git")).toBe("ssb22inc/New-skills-");
    expect(repoFromRemote("http://local_proxy@127.0.0.1:1234/git/ssb22inc/New-skills-")).toBe("ssb22inc/New-skills-");
    expect(repoFromRemote("")).toBeNull();
  });
});
