import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { checkAdversaryReport, checkClass2Approvals, checkReportsAppendOnly, isClass2, parseVerdict } from "../scripts/gate-lib.mjs";

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

  it("ATTACK: a fresh FAIL blocks even when a fresh PASS exists (R2-10)", () => {
    // A second adversary — the cross-family review H6b requires — must be able
    // to stop a merge on a tree an earlier adversary already passed. Reports
    // are append-only, so without this a PASS could never be revoked.
    for (const order of [
      [report("PASS"), report("FAIL")],
      [report("FAIL"), report("PASS")],
    ]) {
      const reports = order.map((content, i) => ({ name: `ADVERSARY_REPORT_phase0.${i}.md`, content }));
      const res = checkAdversaryReport({ phase: "0", reports, currentTreeHash: TREE });
      expect(res.ok).toBe(false);
      expect(res.reason).toMatch(/unresolved FAIL/);
    }
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

  it("ATTACK: a verdict hidden in an HTML comment is invisible to a human and must not count (R2-09)", () => {
    const hidden = ["# r", "<!--", "Verdict: PASS", "-->", "Verdict: FAIL"].join("\n");
    expect(parseVerdict(hidden)?.token).toBe("FAIL");
  });

  it("ATTACK: an indented code block is code, not a verdict (R2-09)", () => {
    expect(parseVerdict(["# r", "    Verdict: PASS", "Verdict: FAIL"].join("\n"))?.token).toBe("FAIL");
    expect(parseVerdict(["# r", "\tVerdict: PASS", "Verdict: FAIL"].join("\n"))?.token).toBe("FAIL");
  });

  it("ATTACK: a fence cannot be closed by a different marker (R2-09)", () => {
    const mismatched = ["# r", "```", "Verdict: PASS", "~~~", "Verdict: PASS", "```", "Verdict: FAIL"].join("\n");
    expect(parseVerdict(mismatched)?.token).toBe("FAIL");
  });

  it("a leading-whitespace verdict does not count — the real one starts at column 0", () => {
    expect(parseVerdict("  Verdict: PASS\nVerdict: FAIL")?.token).toBe("FAIL");
  });

  it("CRLF reports parse", () => {
    expect(parseVerdict("# r\r\nVerdict: FAIL\r\n")?.token).toBe("FAIL");
  });
});

describe("class-2 change-control gate (Law 2/14/15, §13, R1)", () => {
  const capsPath = "fullburn/config/src/caps.ts";
  const hashOf = () => "deadbeef";
  const baseHashOf = () => "cafe01";
  // Every call supplies a base commit: since N-03 the check fails closed
  // without one, so omitting it no longer silently skips the PR binding.
  const BASE = "1111111111111111111111111111111111111111";

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
      expect(isClass2(p), `${p} is not Class 2`).toBe(true);
    }
  });

  it("ATTACK: changing caps without an approval entry is blocked", () => {
    const res = checkClass2Approvals({ changedFiles: [{ status: "modified", path: capsPath }], approvalDocs: [], hashOf, baseHashOf, baseCommit: BASE });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/without a matching human approval/);
  });

  it("ATTACK: an approval for different content (wrong hash) does not transfer", () => {
    const doc = { path: "fullburn/APPROVALS/a.md", status: "added", content: `approves: ${capsPath}\ncontent-hash: 0000` };
    const res = checkClass2Approvals({ changedFiles: [{ status: "modified", path: capsPath }], approvalDocs: [doc], hashOf, baseHashOf, baseCommit: BASE });
    expect(res.ok).toBe(false);
  });

  it("ATTACK: a pre-existing approval already in the tree is not harvested (F14)", () => {
    const stale = {
      path: "fullburn/APPROVALS/old.md",
      status: "modified", // not added in this diff
      content: `approves: ${capsPath}\ncontent-hash: deadbeef`,
    };
    const res = checkClass2Approvals({ changedFiles: [{ status: "modified", path: capsPath }], approvalDocs: [stale], hashOf, baseHashOf, baseCommit: BASE });
    expect(res.ok).toBe(false);
  });

  it("an approval naming this exact transition (from-hash → to-hash) passes", () => {
    const doc = {
      path: "fullburn/APPROVALS/2026-08-15-caps.md",
      status: "added",
      content: `Approved-by: human\napproves: ${capsPath}\nbase-commit: ${BASE}\nfrom-content-hash: cafe01\ncontent-hash: deadbeef`,
    };
    const res = checkClass2Approvals({
      changedFiles: [{ status: "modified", path: capsPath }],
      approvalDocs: [doc],
      hashOf,
      baseHashOf,
      baseCommit: BASE,
    });
    expect(res.ok).toBe(true);
  });

  it("ATTACK: replaying a superseded approval does not re-authorize old content (R2-05)", () => {
    // The human once approved reaching this content from an earlier state. The
    // tree has since moved on. Re-adding that same doc verbatim must not
    // authorize travelling back to it: the approval names a transition, and
    // this diff's from-hash is not the one signed.
    const januaryApproval = {
      path: "fullburn/APPROVALS/2026-01-02-caps.md",
      status: "added",
      content: `approves: ${capsPath}\nfrom-content-hash: 000older\ncontent-hash: deadbeef`,
    };
    const res = checkClass2Approvals({
      changedFiles: [{ status: "modified", path: capsPath }],
      approvalDocs: [januaryApproval],
      hashOf,
      baseHashOf,
      baseCommit: BASE,
    });
    expect(res.ok).toBe(false);
  });

  it("ATTACK: renaming a Class-2 file does not walk it out of the protected set (R2-06)", () => {
    const res = checkClass2Approvals({
      changedFiles: [{ status: "renamed", oldPath: capsPath, path: "fullburn/config/src/caps.v2.ts" }],
      approvalDocs: [],
      hashOf,
      baseHashOf,
      baseCommit: BASE,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("caps.ts");
  });

  it("ATTACK: deleting a Class-2 file needs approval and does not crash the gate (R2-31)", () => {
    const res = checkClass2Approvals({
      changedFiles: [{ status: "deleted", path: capsPath }],
      approvalDocs: [],
      hashOf: () => {
        throw new Error("ENOENT: no such file");
      },
      baseHashOf,
      baseCommit: BASE,
    });
    expect(res.ok).toBe(false);
  });

  it("ATTACK: a multi-file approval cannot lend one path's hash to another (R2-32)", () => {
    // Two clauses in one entry: caps approved cafe01→deadbeef, models approved
    // beef02→feed99. A change to caps whose new content hashes to feed99 must
    // not validate against the models clause.
    const doc = {
      path: "fullburn/APPROVALS/multi.md",
      status: "added",
      content: [
        `approves: ${capsPath}`,
        `base-commit: ${BASE}`,
        "from-content-hash: cafe01",
        "content-hash: deadbeef",
        "approves: fullburn/config/src/models.ts",
        `base-commit: ${BASE}`,
        "from-content-hash: beef02",
        "content-hash: feed99",
      ].join("\n"),
    };
    const res = checkClass2Approvals({
      changedFiles: [{ status: "modified", path: capsPath }],
      approvalDocs: [doc],
      hashOf: () => "feed99",
      baseHashOf: () => "beef02",
      baseCommit: BASE,
    });
    expect(res.ok).toBe(false);
  });

  it("the package manifests and the test tree are Class 2 (R2-04, R2-08, R2-11)", () => {
    for (const p of [
      "fullburn/package.json",
      "fullburn/config/package.json",
      "fullburn/tsconfig.json",
      "fullburn/config/src/markets.ts",
      "fullburn/config/src/channels.ts",
      "fullburn/engine/test/invariants/invariants.test.ts",
      "fullburn/PHASE",
    ]) {
      expect(isClass2(p)).toBe(true);
    }
  });

  it("non-Class-2 changes need no approval", () => {
    const res = checkClass2Approvals({
      changedFiles: [{ status: "modified", path: "fullburn/HUMAN_TASKS.md" }],
      approvalDocs: [],
      hashOf,
      baseHashOf,
      baseCommit: BASE,
    });
    expect(res.ok).toBe(true);
  });
});
