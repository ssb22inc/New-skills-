/** Pure logic for the CI gates — unit-testable without git (R1, R5; hardened
 * for adversary findings F4, F5, F14). The CLI wrappers do the git plumbing. */

/** Class-2 file set (Law 2/14/15, §13). Changing any of these requires an
 * APPROVALS/ entry, added in the same diff, whose content-hash matches the new
 * file content.
 *
 * The set covers not just the VALUES a human owns but the CODE that enforces
 * them (adversary finding F5): §12 makes "the registry, its thresholds, and the
 * grading code" Class 2, and Law 15 names the money paths. A cap constant that
 * cannot be edited without approval is worthless if the line that reads it can. */
export const CLASS2_FILES = [
  // The constitution
  "fullburn/CLAUDE.md",
  "fullburn/ENGINE_BUILD.md",
  "fullburn/.claude/agents/engine-adversary.md",
  "fullburn/.claude/settings.json",
  // Money: the values AND the code that enforces them
  "fullburn/config/src/caps.ts",
  "fullburn/engine/src/gateway.ts",
  "fullburn/engine/src/spend-meter.ts",
  // The grader: thresholds AND grading code (§12 anti-Goodhart)
  "fullburn/config/src/grade-thresholds.ts",
  "fullburn/engine/src/grade-registry.ts",
  // The immutability primitive behind Law 2 / Law 18
  "fullburn/config/src/freeze.ts",
  // The gates themselves, and the config that decides whether they run
  ".github/workflows/fullburn-ci.yml",
  "fullburn/engine/scripts/gate-lib.mjs",
  "fullburn/engine/scripts/adversary-gate.mjs",
  "fullburn/engine/scripts/class2-gate.mjs",
  "fullburn/engine/scripts/leak-check.mjs",
  "fullburn/engine/scripts/scan-lib.mjs",
  "fullburn/vitest.config.ts",
];

/** Reports are prose; a verdict must not be readable out of an example, a quote
 * or a fenced block (adversary finding F4). The verdict is the FIRST verdict
 * line that is not inside a fenced code block, and its token must be exactly
 * PASS or FAIL — `PASS-PENDING-FIXES` is not a pass. */
export function parseVerdict(reportContent) {
  const lines = reportContent.split("\n");
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // Quoted/prose lines cannot carry the verdict.
    if (/^\s*>/.test(line)) continue;
    const m = /^\s*verdict\s*:\s*(\S+)/i.exec(line);
    if (!m) continue;
    const token = m[1].toUpperCase();
    if (token === "PASS" || token === "FAIL") return { token, line: line.trim() };
    return { token: "INVALID", line: line.trim() };
  }
  return null;
}

function readTreeBinding(reportContent) {
  const lines = reportContent.split("\n");
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^\s*verified-tree\s*:\s*([0-9a-f]{7,64})\s*$/i.exec(line);
    if (m) return m[1];
  }
  return null;
}

/** Judge one report against the current tree. */
function judgeReport(reportContent, currentTreeHash) {
  const verdict = parseVerdict(reportContent);
  if (!verdict) return { ok: false, fresh: false, reason: "report has no 'Verdict:' line outside a code fence" };
  const tree = readTreeBinding(reportContent);
  if (!tree) return { ok: false, fresh: false, reason: "report has no 'verified-tree:' binding (stale-report protection)" };
  const fresh = tree === currentTreeHash;
  if (!fresh) {
    return {
      ok: false,
      fresh: false,
      reason: `report verified tree ${tree} but current fullburn tree is ${currentTreeHash} — code changed after the adversary judged it; re-run the adversary`,
    };
  }
  if (verdict.token !== "PASS") {
    return { ok: false, fresh: true, reason: `verdict is not PASS: "${verdict.line}"` };
  }
  return { ok: true, fresh: true, reason: "adversary report PASS and bound to the current tree" };
}

/** adversary-gate (R5): a report for this phase must exist, be bound to the
 * current tree, and read PASS.
 *
 * Accepts either a single `reportContent` or a list of `reports` for the phase.
 * The list form exists because reports are append-only: a FAIL cannot be edited
 * into a PASS, so a re-run adds a NEW report file and the gate must judge the
 * one bound to the code as it stands now. A stale report is history, not a
 * blocker; a FAIL bound to the current tree blocks. */
export function checkAdversaryReport({ phase, reportContent, reports, currentTreeHash }) {
  const docs =
    Array.isArray(reports) && reports.length > 0
      ? reports
      : reportContent === null || reportContent === undefined
        ? []
        : [{ name: `ADVERSARY_REPORT_phase${phase}.md`, content: reportContent }];

  if (docs.length === 0) {
    return { ok: false, reason: `no reports/ADVERSARY_REPORT_phase${phase}*.md found` };
  }

  const judged = docs.map((d) => ({ name: d.name, ...judgeReport(d.content, currentTreeHash) }));
  const pass = judged.find((j) => j.ok);
  if (pass) return { ok: true, reason: `${pass.name}: ${pass.reason}` };

  const freshFail = judged.find((j) => j.fresh);
  if (freshFail) return { ok: false, reason: `${freshFail.name}: ${freshFail.reason}` };

  const first = judged[0];
  return { ok: false, reason: `${first.name}: ${first.reason}` };
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

/** class2-gate (R1): every changed Class-2 file needs an approval entry ADDED
 * in the same diff — a file under fullburn/APPROVALS/ containing
 *   approves: <path>
 *   content-hash: <sha256 of the new file content>
 *
 * The hash pins approval to exact content, so approval cannot be reused for a
 * different change. Requiring the entry to be part of the diff (adversary
 * finding F14, partial) stops a pre-existing approval from being re-harvested;
 * it does NOT establish WHO wrote it — only CODEOWNERS on APPROVALS/** does
 * that, which is human task H19. Until H19 lands this gate proves what was
 * approved, not who approved it. */
export function checkClass2Approvals({ changedFiles, approvalDocs, hashOf }) {
  const changedClass2 = changedFiles.filter((f) => CLASS2_FILES.includes(f.path));
  const usable = approvalDocs
    .map((d) => (typeof d === "string" ? { path: null, content: d, status: "added" } : d))
    .filter((d) => d.status === undefined || d.status === "added");

  const failures = [];
  for (const f of changedClass2) {
    const wantHash = hashOf(f.path);
    const approved = usable.some((doc) => {
      const lines = doc.content.split("\n").map((l) => l.trim());
      return lines.includes(`approves: ${f.path}`) && lines.includes(`content-hash: ${wantHash}`);
    });
    if (!approved) failures.push(f.path);
  }
  if (failures.length > 0) {
    return {
      ok: false,
      reason: `Class-2 files changed without a matching human approval entry added in this diff (Law 2/14/15): ${failures.join(", ")}`,
    };
  }
  return { ok: true, reason: changedClass2.length ? "Class-2 changes carry approvals" : "no Class-2 changes" };
}
