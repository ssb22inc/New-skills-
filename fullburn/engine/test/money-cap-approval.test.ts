import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { HUMAN_APPROVAL_PATTERNS, checkClass2Approvals, isClass2, needsHumanApproval } from "../scripts/gate-lib.mjs";

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
    ".github/workflows/fullburn-ci.yml",
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
