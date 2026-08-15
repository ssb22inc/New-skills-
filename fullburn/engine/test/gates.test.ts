import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { CLASS2_FILES, checkAdversaryReport, checkClass2Approvals, checkReportsAppendOnly, parseVerdict } from "../scripts/gate-lib.mjs";

// Tree bindings must look like git object hashes — the gate rejects anything else.
const TREE = "abc1234def5678";
const OTHER_TREE = "0123456789abcdef";
const report = (verdict: string, tree = TREE) => ["# ADVERSARY_REPORT_phase0", `Verdict: ${verdict}`, `verified-tree: ${tree}`].join("\n");
const goodReport = report("PASS (CONDITIONAL — live ledger open)");

describe("adversary-report gate (AC 4, Law 9, §10.3, R5)", () => {
  it("blocks when the report is missing", () => {
    expect(checkAdversaryReport({ phase: "0", reportContent: null, currentTreeHash: TREE }).ok).toBe(false);
  });

  it("ATTACK: a committed FAIL report does not open the gate", () => {
    const res = checkAdversaryReport({ phase: "0", reportContent: report("FAIL"), currentTreeHash: TREE });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not PASS/);
  });

  it("ATTACK: a stale report (code changed after the pass) is rejected", () => {
    const res = checkAdversaryReport({ phase: "0", reportContent: goodReport, currentTreeHash: OTHER_TREE });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/re-run the adversary/);
  });

  it("a report with no verified-tree binding is rejected", () => {
    const unbound = goodReport.replace(/verified-tree: .*/, "");
    expect(checkAdversaryReport({ phase: "0", reportContent: unbound, currentTreeHash: TREE }).ok).toBe(false);
  });

  it("a fresh PASS report opens the gate (conditionality is preserved for human ack)", () => {
    expect(checkAdversaryReport({ phase: "0", reportContent: goodReport, currentTreeHash: TREE }).ok).toBe(true);
  });

  it("re-runs: a superseded FAIL stays in history while a fresh PASS opens the gate", () => {
    // Reports are append-only, so a FAIL is never edited into a PASS: the
    // re-run adds a new file and the gate judges the one bound to this tree.
    const reports = [
      { name: "ADVERSARY_REPORT_phase0.md", content: report("FAIL", OTHER_TREE) },
      { name: "ADVERSARY_REPORT_phase0.r2.md", content: goodReport },
    ];
    expect(checkAdversaryReport({ phase: "0", reports, currentTreeHash: TREE }).ok).toBe(true);
  });

  it("re-runs: a FAIL bound to the CURRENT tree still blocks, whatever else is in history", () => {
    const reports = [
      { name: "ADVERSARY_REPORT_phase0.md", content: report("PASS", OTHER_TREE) },
      { name: "ADVERSARY_REPORT_phase0.r2.md", content: report("FAIL") },
    ];
    const res = checkAdversaryReport({ phase: "0", reports, currentTreeHash: TREE });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not PASS/);
  });

  it("ATTACK: editing an old adversary report is refused (append-only)", () => {
    const res = checkReportsAppendOnly([{ status: "modified", path: "fullburn/reports/ADVERSARY_REPORT_phase0.md" }]);
    expect(res.ok).toBe(false);
    const add = checkReportsAppendOnly([{ status: "added", path: "fullburn/reports/ADVERSARY_REPORT_phase1.md" }]);
    expect(add.ok).toBe(true);
  });
});

describe("verdict parsing (adversary finding F4)", () => {
  it("reads the first verdict line that is not inside a code fence", () => {
    const fenced = ["# r", "```", "Verdict: PASS", "```", "Verdict: FAIL", `verified-tree: ${TREE}`].join("\n");
    expect(parseVerdict(fenced)?.token).toBe("FAIL");
  });

  it("ignores quoted prose", () => {
    const quoted = ["# r", "> Verdict: PASS (quoting the last report)", "Verdict: FAIL"].join("\n");
    expect(parseVerdict(quoted)?.token).toBe("FAIL");
  });

  it("requires an exact token: PASS-PENDING-FIXES is not a pass", () => {
    expect(parseVerdict("Verdict: PASS-PENDING-FIXES")?.token).toBe("INVALID");
    expect(parseVerdict("Verdict: PASSABLE")?.token).toBe("INVALID");
  });

  it("accepts a conditional PASS with a parenthetical", () => {
    expect(parseVerdict("Verdict: PASS (CONDITIONAL — ledger open)")?.token).toBe("PASS");
  });
});

describe("class-2 change-control gate (Law 2/14/15, §13, R1)", () => {
  const capsPath = "fullburn/config/src/caps.ts";
  const hashOf = () => "deadbeef";

  it("covers the values, the code that enforces them, and the gates (F5)", () => {
    for (const p of [
      capsPath,
      "fullburn/config/src/grade-thresholds.ts",
      "fullburn/engine/src/grade-registry.ts", // the grader itself
      "fullburn/engine/src/gateway.ts", // where the cap check lives
      "fullburn/engine/src/spend-meter.ts",
      "fullburn/config/src/freeze.ts",
      "fullburn/engine/scripts/leak-check.mjs",
      "fullburn/engine/scripts/scan-lib.mjs",
      "fullburn/vitest.config.ts",
      "fullburn/engine/scripts/gate-lib.mjs",
    ]) {
      expect(CLASS2_FILES).toContain(p);
    }
  });

  it("ATTACK: changing caps without an approval entry is blocked", () => {
    const res = checkClass2Approvals({ changedFiles: [{ status: "modified", path: capsPath }], approvalDocs: [], hashOf });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/without a matching human approval/);
  });

  it("ATTACK: an approval for different content (wrong hash) does not transfer", () => {
    const doc = { path: "fullburn/APPROVALS/a.md", status: "added", content: `approves: ${capsPath}\ncontent-hash: 0000` };
    const res = checkClass2Approvals({ changedFiles: [{ status: "modified", path: capsPath }], approvalDocs: [doc], hashOf });
    expect(res.ok).toBe(false);
  });

  it("ATTACK: a pre-existing approval already in the tree is not harvested (F14)", () => {
    const stale = {
      path: "fullburn/APPROVALS/old.md",
      status: "modified", // not added in this diff
      content: `approves: ${capsPath}\ncontent-hash: deadbeef`,
    };
    const res = checkClass2Approvals({ changedFiles: [{ status: "modified", path: capsPath }], approvalDocs: [stale], hashOf });
    expect(res.ok).toBe(false);
  });

  it("an approval added in the same diff, matching path + exact content hash, passes", () => {
    const doc = {
      path: "fullburn/APPROVALS/2026-08-15-caps.md",
      status: "added",
      content: `Approved-by: human\napproves: ${capsPath}\ncontent-hash: deadbeef`,
    };
    const res = checkClass2Approvals({ changedFiles: [{ status: "modified", path: capsPath }], approvalDocs: [doc], hashOf });
    expect(res.ok).toBe(true);
  });

  it("non-Class-2 changes need no approval", () => {
    const res = checkClass2Approvals({
      changedFiles: [{ status: "modified", path: "fullburn/engine/src/eval-harness.ts" }],
      approvalDocs: [],
      hashOf,
    });
    expect(res.ok).toBe(true);
  });
});
