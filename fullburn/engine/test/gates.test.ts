import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { CLASS2_FILES, checkAdversaryReport, checkClass2Approvals, checkReportsAppendOnly } from "../scripts/gate-lib.mjs";

const TREE = "abc123";
const goodReport = ["# ADVERSARY_REPORT_phase0", "Verdict: PASS (CONDITIONAL — live ledger open)", `verified-tree: ${TREE}`].join("\n");

describe("adversary-report gate (AC 4, Law 9, §10.3, R5)", () => {
  it("blocks when the report is missing", () => {
    expect(checkAdversaryReport({ phase: "0", reportContent: null, currentTreeHash: TREE }).ok).toBe(false);
  });

  it("ATTACK: a committed FAIL report does not open the gate", () => {
    const fail = goodReport.replace(/Verdict: PASS.*/, "Verdict: FAIL");
    const res = checkAdversaryReport({ phase: "0", reportContent: fail, currentTreeHash: TREE });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not PASS/);
  });

  it("ATTACK: a stale report (code changed after the pass) is rejected", () => {
    const res = checkAdversaryReport({ phase: "0", reportContent: goodReport, currentTreeHash: "different-tree" });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/re-run the adversary/);
  });

  it("a report with no verified-tree binding is rejected", () => {
    const unbound = goodReport.replace(/verified-tree: .*/, "");
    expect(checkAdversaryReport({ phase: "0", reportContent: unbound, currentTreeHash: TREE }).ok).toBe(false);
  });

  it("a fresh PASS report opens the gate (conditional PASS allowed, conditionality preserved for human ack)", () => {
    expect(checkAdversaryReport({ phase: "0", reportContent: goodReport, currentTreeHash: TREE }).ok).toBe(true);
  });

  it("ATTACK: editing an old adversary report is refused (append-only)", () => {
    const res = checkReportsAppendOnly([{ status: "modified", path: "fullburn/reports/ADVERSARY_REPORT_phase0.md" }]);
    expect(res.ok).toBe(false);
    const add = checkReportsAppendOnly([{ status: "added", path: "fullburn/reports/ADVERSARY_REPORT_phase1.md" }]);
    expect(add.ok).toBe(true);
  });
});

describe("class-2 change-control gate (Law 2/14/15, §13, R1)", () => {
  const capsPath = "fullburn/config/src/caps.ts";
  const hashOf = () => "deadbeef";

  it("caps.ts is in the Class-2 set, as are the gates themselves", () => {
    expect(CLASS2_FILES).toContain(capsPath);
    expect(CLASS2_FILES).toContain("fullburn/engine/scripts/gate-lib.mjs");
    expect(CLASS2_FILES).toContain("fullburn/config/src/grade-thresholds.ts");
  });

  it("ATTACK: changing caps without an approval entry is blocked", () => {
    const res = checkClass2Approvals({ changedFiles: [{ status: "modified", path: capsPath }], approvalDocs: [], hashOf });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/without a matching human approval/);
  });

  it("ATTACK: an approval for different content (wrong hash) does not transfer", () => {
    const doc = `approves: ${capsPath}\ncontent-hash: 0000`;
    const res = checkClass2Approvals({ changedFiles: [{ status: "modified", path: capsPath }], approvalDocs: [doc], hashOf });
    expect(res.ok).toBe(false);
  });

  it("a matching approval (path + exact content hash) passes", () => {
    const doc = `Approved-by: human\napproves: ${capsPath}\ncontent-hash: deadbeef`;
    const res = checkClass2Approvals({ changedFiles: [{ status: "modified", path: capsPath }], approvalDocs: [doc], hashOf });
    expect(res.ok).toBe(true);
  });

  it("non-Class-2 changes need no approval", () => {
    const res = checkClass2Approvals({
      changedFiles: [{ status: "modified", path: "fullburn/engine/src/grade-registry.ts" }],
      approvalDocs: [],
      hashOf,
    });
    expect(res.ok).toBe(true);
  });
});
