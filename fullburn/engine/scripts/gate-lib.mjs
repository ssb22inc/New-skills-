/** Pure logic for the CI gates — unit-testable without git (R1, R5; hardened
 * for F4, F5, F14 and then for R2-04/05/06/08/09/10/11/12/31/32). The CLI
 * wrappers do the git plumbing. */

/** Class-2 protection is expressed as PATTERNS, not a literal path list
 * (adversary findings R2-04, R2-06, R2-08, R2-11, R2-12).
 *
 * A literal list protects a file only while it keeps its name and only while
 * the file it names is the one that runs. Three demonstrated bypasses forced
 * this change: `git mv` walked a Class-2 file out of the set; `config/package.json`
 * redirected the `@fullburn/config/caps` specifier to an attacker module without
 * touching caps.ts; and `fullburn/package.json` redefined `npm test` so the
 * whole invariant suite became a no-op. Patterns cover the directory, so a
 * rename lands inside the protected set rather than outside it. */
export const CLASS2_PATTERNS = [
  // The constitution
  /^fullburn\/CLAUDE\.md$/,
  /^fullburn\/ENGINE_BUILD\.md$/,
  /^fullburn\/\.claude\//,
  // Money, the grader, and the immutability primitive: values AND enforcing code
  /^fullburn\/config\/src\//,
  /^fullburn\/engine\/src\/(?:gateway|spend-meter|grade-registry|vault|tracing|redact|eval-harness)\.ts$/,
  // The gates themselves and everything that decides whether they run
  /^\.github\//,
  /^fullburn\/engine\/scripts\//,
  /^fullburn\/vitest\.config\.ts$/,
  /^fullburn\/(?:[^/]+\/)?package\.json$/,
  /^fullburn\/(?:[^/]+\/)?tsconfig(?:\.base)?\.json$/,
  /^fullburn\/PHASE$/,
  // The evidence: tests are the only thing standing between a defect and a
  // green gate, so silencing one is a human decision.
  /^fullburn\/(?:config|engine)\/test\//,
  /^fullburn\/engine\/evals\//,
];

export function isClass2(path) {
  return CLASS2_PATTERNS.some((re) => re.test(path));
}

/** Retained for callers/tests that want a concrete list of the paths that exist
 * today. `isClass2` is the authority. */
export const CLASS2_FILES = [
  "fullburn/CLAUDE.md",
  "fullburn/ENGINE_BUILD.md",
  "fullburn/.claude/agents/engine-adversary.md",
  "fullburn/.claude/settings.json",
  "fullburn/config/src/caps.ts",
  "fullburn/config/src/grade-thresholds.ts",
  "fullburn/config/src/models.ts",
  "fullburn/config/src/markets.ts",
  "fullburn/config/src/channels.ts",
  "fullburn/config/src/freeze.ts",
  "fullburn/engine/src/gateway.ts",
  "fullburn/engine/src/spend-meter.ts",
  "fullburn/engine/src/grade-registry.ts",
  "fullburn/engine/src/vault.ts",
  "fullburn/engine/src/tracing.ts",
  "fullburn/engine/src/redact.ts",
  "fullburn/engine/src/eval-harness.ts",
  ".github/workflows/fullburn-ci.yml",
  "fullburn/engine/scripts/gate-lib.mjs",
  "fullburn/engine/scripts/adversary-gate.mjs",
  "fullburn/engine/scripts/class2-gate.mjs",
  "fullburn/engine/scripts/leak-check.mjs",
  "fullburn/engine/scripts/scan-lib.mjs",
  "fullburn/vitest.config.ts",
  "fullburn/package.json",
  "fullburn/config/package.json",
  "fullburn/engine/package.json",
  "fullburn/tsconfig.json",
  "fullburn/tsconfig.base.json",
  "fullburn/PHASE",
];

/** Strip HTML comments before any line scanning: a verdict hidden in
 * `<!-- ... -->` renders invisibly to a human but was read by the parser
 * (adversary finding R2-09). */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

/** The verdict is the first verdict line that is (a) not inside a fenced code
 * block, (b) not inside an indented code block, (c) not quoted, and (d) starts
 * at column 0. Fences must be closed by the SAME marker — ``` cannot be closed
 * by ~~~ (R2-09). The token must be exactly PASS or FAIL. */
export function parseVerdict(reportContent) {
  const lines = stripHtmlComments(reportContent).split("\n");
  let fence = null; // the marker that opened the current fence, or null
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    // Indented code block (4+ spaces or a tab) renders as code, not prose.
    if (/^(?: {4,}|\t)/.test(line)) continue;
    if (/^\s*>/.test(line)) continue; // blockquote
    const m = /^verdict\s*:\s*(\S+)/i.exec(line);
    if (!m) continue;
    const token = m[1].toUpperCase();
    if (token === "PASS" || token === "FAIL") return { token, line: line.trim() };
    return { token: "INVALID", line: line.trim() };
  }
  return null;
}

function readTreeBinding(reportContent) {
  const lines = stripHtmlComments(reportContent).split("\n");
  let fence = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    // Any non-empty token binds. Deliberately NOT restricted to hex: a
    // malformed binding can never equal a real tree hash, so it fails closed on
    // its own, and over-strict validation silently defanged the F4 lock tests
    // by short-circuiting them before they reached the verdict parser (R2-17).
    const m = /^verified-tree\s*:\s*(\S+)\s*$/i.exec(line);
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
 * ANY fresh FAIL blocks, even when a fresh PASS also exists (adversary finding
 * R2-10). Reports are append-only and the tree hash confers freshness, so
 * without this a PASS could never be revoked for a tree it already passed —
 * and the second, cross-family adversary that H6b requires would be unable to
 * stop a merge no matter what it found. §12 requires 0 unreviewed FAILs;
 * "someone else passed it" is not a review. */
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

  // A FAIL bound to this tree is unresolved business — check it FIRST.
  const freshFail = judged.find((j) => j.fresh && !j.ok);
  if (freshFail) {
    return { ok: false, reason: `${freshFail.name}: ${freshFail.reason} (an unresolved FAIL on this tree blocks regardless of any PASS)` };
  }

  const pass = judged.find((j) => j.ok);
  if (pass) return { ok: true, reason: `${pass.name}: ${pass.reason}` };

  const first = judged[0];
  return { ok: false, reason: `${first.name}: ${first.reason}` };
}

/** Append-only reports: a PR may add ADVERSARY_REPORT files, never modify,
 * delete OR RENAME one (adversary finding R2-06 — a rename erased a standing
 * FAIL while the gate certified append-only intact). */
export function checkReportsAppendOnly(changedFiles) {
  const isReport = (p) => /fullburn\/reports\/ADVERSARY_REPORT_.*\.md$/.test(p ?? "");
  const touched = changedFiles.filter(
    (f) => (isReport(f.path) && f.status !== "added") || (isReport(f.oldPath) && f.status === "renamed"),
  );
  if (touched.length > 0) {
    const names = touched.map((f) => f.oldPath ?? f.path);
    return { ok: false, reason: `adversary reports are append-only; modified/deleted/renamed: ${names.join(", ")}` };
  }
  return { ok: true, reason: "reports append-only holds" };
}

/** class2-gate (R1): every changed Class-2 path needs an approval entry ADDED
 * in the same diff that authorizes THIS TRANSITION.
 *
 * An approval names the transition, not the state (adversary finding R2-05):
 *   approves: <path>
 *   from-content-hash: <sha256 of the file at the PR base, or "absent">
 *   content-hash: <sha256 of the new content, or "deleted">
 * Pinning only the destination let a superseded approval be re-added verbatim
 * to reinstate content a human had already revoked — no forgery required. A
 * transition can only be replayed if the tree is in exactly the state the human
 * signed off FROM, which is the state they approved leaving.
 *
 * Both halves of a rename count as changes (R2-06), a deletion is a change that
 * needs approval (R2-31), and each approval clause is parsed as a BLOCK so a
 * path cannot borrow another path's hash (R2-32). */
function parseApprovalBlocks(content) {
  const blocks = [];
  let current = null;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    const approves = /^approves\s*:\s*(\S+)$/i.exec(line);
    if (approves) {
      if (current) blocks.push(current);
      current = { path: approves[1], from: null, to: null };
      continue;
    }
    if (!current) continue;
    const from = /^from-content-hash\s*:\s*(\S+)$/i.exec(line);
    if (from) {
      current.from = from[1];
      continue;
    }
    const to = /^content-hash\s*:\s*(\S+)$/i.exec(line);
    if (to) current.to = to[1];
  }
  if (current) blocks.push(current);
  return blocks;
}

export function checkClass2Approvals({ changedFiles, approvalDocs, hashOf, baseHashOf }) {
  // Every path a change touches, including the source side of a rename.
  const touched = [];
  for (const f of changedFiles) {
    if (isClass2(f.path)) touched.push({ path: f.path, status: f.status });
    if (f.oldPath && isClass2(f.oldPath)) touched.push({ path: f.oldPath, status: "renamed-away" });
  }
  if (touched.length === 0) return { ok: true, reason: "no Class-2 changes" };

  const usable = approvalDocs
    .map((d) => (typeof d === "string" ? { path: null, content: d, status: "added" } : d))
    .filter((d) => d.status === undefined || d.status === "added")
    .flatMap((d) => parseApprovalBlocks(d.content));

  const failures = [];
  for (const f of touched) {
    // "deleted"/"renamed-away" have no new content; the transition is to absence.
    const wantTo = f.status === "deleted" || f.status === "renamed-away" ? "deleted" : safeHash(hashOf, f.path);
    const wantFrom = f.status === "added" ? "absent" : safeHash(baseHashOf, f.path);
    const approved = usable.some((b) => b.path === f.path && b.to === wantTo && b.from === wantFrom);
    if (!approved) failures.push(`${f.path} (${f.status})`);
  }
  if (failures.length > 0) {
    return {
      ok: false,
      reason: `Class-2 changes without a matching human approval for this transition (Law 2/14/15): ${failures.join(", ")}`,
    };
  }
  return { ok: true, reason: "Class-2 changes carry transition approvals" };
}

/** A hash that cannot be computed (deleted file, unreadable base) must not
 * crash the gate — it fails closed to a sentinel no approval will match
 * (adversary finding R2-31). */
function safeHash(fn, path) {
  if (typeof fn !== "function") return "unavailable";
  try {
    const h = fn(path);
    return typeof h === "string" && h.length > 0 ? h : "unavailable";
  } catch {
    return "deleted";
  }
}
