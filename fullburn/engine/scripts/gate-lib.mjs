/** Pure logic for the CI gates — unit-testable without git (adversary findings
 * R1, R5). The CLI wrappers below the exports do the git plumbing. */

/** Class-2 file set (Law 2/14/15, §13). Changing any of these requires an
 * APPROVALS/ entry whose content-hash matches the new file content. */
export const CLASS2_FILES = [
  "fullburn/config/src/caps.ts",
  "fullburn/config/src/grade-thresholds.ts",
  "fullburn/CLAUDE.md",
  "fullburn/ENGINE_BUILD.md",
  "fullburn/.claude/agents/engine-adversary.md",
  "fullburn/.claude/settings.json",
  ".github/workflows/fullburn-ci.yml",
  "fullburn/engine/scripts/gate-lib.mjs",
  "fullburn/engine/scripts/adversary-gate.mjs",
  "fullburn/engine/scripts/class2-gate.mjs",
];

/** adversary-gate (R5): the report must exist, carry an explicit PASS verdict
 * (FAIL or absent verdict blocks), and be bound to the code tree it judged via
 * a verified-tree line matching the current fullburn tree hash. */
export function checkAdversaryReport({ phase, reportContent, currentTreeHash }) {
  if (reportContent === null || reportContent === undefined) {
    return { ok: false, reason: `reports/ADVERSARY_REPORT_phase${phase}.md is missing` };
  }
  const verdictLine = reportContent.split("\n").find((l) => /^\s*verdict\s*:/i.test(l));
  if (!verdictLine) return { ok: false, reason: "report has no 'Verdict:' line" };
  if (!/^\s*verdict\s*:\s*PASS\b/i.test(verdictLine)) {
    return { ok: false, reason: `verdict is not PASS: "${verdictLine.trim()}"` };
  }
  const treeLine = reportContent.split("\n").find((l) => /^\s*verified-tree\s*:/i.test(l));
  if (!treeLine) return { ok: false, reason: "report has no 'verified-tree:' binding (stale-report protection)" };
  const hash = treeLine.split(":")[1]?.trim();
  if (hash !== currentTreeHash) {
    return {
      ok: false,
      reason: `report verified tree ${hash} but current fullburn tree is ${currentTreeHash} — code changed after the adversary passed it; re-run the adversary`,
    };
  }
  return { ok: true, reason: "adversary report PASS and fresh" };
}

/** Append-only reports (R5iii): a PR may add ADVERSARY_REPORT files, never
 * modify or delete an existing one. */
export function checkReportsAppendOnly(changedFiles) {
  const touched = changedFiles.filter(
    (f) => /fullburn\/reports\/ADVERSARY_REPORT_.*\.md$/.test(f.path) && f.status !== "added",
  );
  if (touched.length > 0) {
    return { ok: false, reason: `adversary reports are append-only; modified/deleted: ${touched.map((f) => f.path).join(", ")}` };
  }
  return { ok: true, reason: "reports append-only holds" };
}

/** class2-gate (R1): every changed Class-2 file needs an approval entry added
 * in the same diff: a file under fullburn/APPROVALS/ containing lines
 *   approves: <path>
 *   content-hash: <sha256 of the new file content>
 * The hash pins approval to the exact content, so approval cannot be reused. */
export function checkClass2Approvals({ changedFiles, approvalDocs, hashOf }) {
  const changedClass2 = changedFiles.filter((f) => CLASS2_FILES.includes(f.path));
  const failures = [];
  for (const f of changedClass2) {
    const wantHash = hashOf(f.path);
    const approved = approvalDocs.some((doc) => {
      const lines = doc.split("\n").map((l) => l.trim());
      return lines.includes(`approves: ${f.path}`) && lines.includes(`content-hash: ${wantHash}`);
    });
    if (!approved) failures.push(f.path);
  }
  if (failures.length > 0) {
    return {
      ok: false,
      reason: `Class-2 files changed without a matching human approval entry (Law 2/14/15): ${failures.join(", ")}`,
    };
  }
  return { ok: true, reason: changedClass2.length ? "Class-2 changes carry approvals" : "no Class-2 changes" };
}
