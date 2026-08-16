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
  // Money, the grader, and the immutability primitive: values AND enforcing code.
  // The WHOLE engine source tree, not an enumeration (adversary finding R2-CP-04):
  // a list of seven files left index.ts — the deployed Worker entrypoint — free to
  // re-export an unmetered llm() from a new module, with every gate green.
  /^fullburn\/config\/src\//,
  /^fullburn\/engine\/src\//,
  // The gates themselves and everything that decides whether they run
  /^\.github\//,
  /^fullburn\/engine\/scripts\//,
  // Any test-runner or deploy config, by shape rather than by name: vitest
  // honours vitest.workspace.ts OVER vitest.config.ts, so protecting only the
  // latter left a sibling filename that silenced 145 of 148 tests (R3-CP-03).
  //
  // Enumerating the extensions was still too narrow. vitest resolves a workspace
  // from WORKSPACES_NAMES × WORKSPACES_EXTENSIONS = {vitest.workspace,
  // vitest.projects} × {.ts,.mts,.cts,.js,.mjs,.cjs,.json}; the four-extension
  // list left .mts, .cts and .cjs Class-1, and `vitest.workspace.mts` silenced
  // 165 of 168 tests with every gate green (adversary finding N-02). The rule is
  // now ANY config-shaped file at ANY depth whose basename starts with vitest.
  // or vite. — extension-agnostic, because the next runner version decides the
  // extension list, not us.
  /(?:^|\/)vite(?:st)?[.\-][^/]*$/,
  /(?:^|\/)vitest\.[^/]*$/,
  /(?:^|\/)wrangler\.[^/]*$/,
  /(?:^|\/)\.gitignore$/,
  /(?:^|\/)package\.json$/,
  // npm ci resolves STRICTLY from the lockfile — `resolved` and `integrity` both
  // live there — so the lockfile decides what `vitest` actually is. It was the
  // only executable thing left in the Class-1 surface (adversary finding N-11).
  /(?:^|\/)package-lock\.json$/,
  /(?:^|\/)tsconfig[^/]*\.json$/,
  /^fullburn\/PHASE$/,
  // The evidence: tests are the only thing standing between a defect and a
  // green gate, so silencing one is a human decision.
  /^fullburn\/(?:config|engine)\/test\//,
  /^fullburn\/engine\/evals\//,
];

export function isClass2(path) {
  return CLASS2_PATTERNS.some((re) => re.test(path));
}

/** A concrete path per pattern, so `isClass2` — the authority — is what the
 * lock tests drive. This replaces the old exported `CLASS2_FILES` array
 * (adversary finding H-03): once `isClass2` became the authority, that list was
 * read by nothing, yet two test files still asserted membership in it. Eight of
 * the thirteen patterns were therefore neuterable with the whole suite green,
 * including the money-path sources, the gate scripts, `.github/`, the Laws, and
 * the adversary's own mandate. A dead list that tests point at is worse than no
 * list at all, because it reads as coverage.
 *
 * Every entry here must be matched by some pattern AND every pattern must claim
 * some entry — `locks-r5.test.ts` asserts both directions, so neutering a
 * pattern or adding one without a witness turns the suite red. */
export const CLASS2_WITNESS_PATHS = [
  "fullburn/CLAUDE.md",
  "fullburn/ENGINE_BUILD.md",
  "fullburn/.claude/agents/engine-adversary.md",
  "fullburn/config/src/caps.ts",
  "fullburn/engine/src/gateway.ts",
  ".github/workflows/fullburn-ci.yml",
  "fullburn/engine/scripts/gate-lib.mjs",
  "fullburn/vitest.workspace.mts",
  "fullburn/engine/deploy/wrangler.toml",
  "fullburn/package-lock.json",
  "fullburn/engine/.gitignore",
  "fullburn/wrangler.toml",
  "fullburn/.gitignore",
  "fullburn/package.json",
  "fullburn/tsconfig.base.json",
  "fullburn/PHASE",
  "fullburn/engine/test/invariants/invariants.test.ts",
  "fullburn/engine/evals/hello-world/golden.ts",
];
/** Strip HTML comments before any line scanning: a verdict hidden in
 * `<!-- ... -->` renders invisibly to a human but was read by the parser
 * (adversary finding R2-09). */
/** How far into a report the gate will look for its two machine-read fields.
 *
 * Both fields used to be findable anywhere in the file, and every fix since has
 * been another entry on a list of hiding places: fenced blocks, mismatched
 * fence markers, fence LENGTH, indented blocks, blockquotes, HTML comments,
 * `<details>`. The list kept growing because the parser was deciding visibility
 * from Markdown source while the artifact a human reads is rendered HTML — and
 * those two disagree in ways nobody enumerates completely (adversary findings
 * R2-09, R3-CP-02, N-04, N-05).
 *
 * A positive schema ends that: the verdict and the tree binding must appear in
 * the report's HEADER — the first few lines, at column 0. There is no hiding
 * place in a ten-line header, because a human opening the file sees all of it
 * before scrolling. Every report ever written already complies. */
const HEADER_LINES = 10;

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

/** Regions that render collapsed, invisible, or not as prose at all. A verdict
 * inside one of these is not a verdict a reviewer saw. */
const CONCEALING_BLOCKS = /<(details|script|style|template|iframe)\b[\s\S]*?<\/\1\s*>/gi;

function stripConcealed(text) {
  // `<details>` renders collapsed by default in every renderer including
  // GitHub, so a PASS inside one opened the gate while the visible prose said
  // "do not merge" (N-05). Unterminated blocks are handled too: an opening tag
  // with no close conceals everything after it, so the header stops there.
  const open = /<(details|script|style|template|iframe)\b/i.exec(text.replace(CONCEALING_BLOCKS, ""));
  const stripped = text.replace(CONCEALING_BLOCKS, "");
  return open === null ? stripped : stripped.slice(0, open.index);
}

/** The report's header lines, with everything a renderer would hide removed.
 * ONE definition, shared by both readers: `readTreeBinding` was a near-copy of
 * `parseVerdict` that compared fence CHARACTERS without length, so a correctly
 * bound `Verdict: FAIL` was read as unbound, filed as history, and silently
 * overridden by a sibling PASS — the gate's output never naming the FAIL report
 * at all (N-04). Two parsers for one grammar is how that happens. */
function visibleHeaderLines(reportContent) {
  if (typeof reportContent !== "string") return [];
  const lines = stripConcealed(stripHtmlComments(reportContent)).split("\n");
  const out = [];
  let fence = null; // {ch,len} of the fence currently open, or null
  for (const raw of lines.slice(0, HEADER_LINES)) {
    const line = raw.replace(/\r$/, "");
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      // CommonMark: a closing fence must use the same character AND be at least
      // as long as the opening one. Comparing only the character let a
      // 3-backtick line close a 4-backtick block (R3-CP-02).
      const marker = { ch: fenceMatch[1][0], len: fenceMatch[1].length };
      if (fence === null) fence = marker;
      else if (fence.ch === marker.ch && marker.len >= fence.len) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (/^(?: {4,}|\t)/.test(line)) continue; // indented code block
    if (/^\s*>/.test(line)) continue; // blockquote
    out.push(line);
  }
  return out;
}

/** The verdict is the first verdict line in the visible header. The token must
 * be exactly PASS or FAIL — anything else is INVALID, never a pass. */
export function parseVerdict(reportContent) {
  for (const line of visibleHeaderLines(reportContent)) {
    const m = /^verdict\s*:\s*(\S+)/i.exec(line);
    if (!m) continue;
    const token = m[1].toUpperCase();
    if (token === "PASS" || token === "FAIL") return { token, line: line.trim() };
    return { token: "INVALID", line: line.trim() };
  }
  return null;
}

function readTreeBinding(reportContent) {
  for (const line of visibleHeaderLines(reportContent)) {
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
  // Freshness is established FIRST (adversary finding R3-CP-06). Judging the
  // verdict first meant an unparseable one — a blockquoted FAIL, a homoglyph —
  // returned fresh:false, so a report bound to THIS tree was filed as history
  // and a sibling PASS opened the gate. Anything bound to the current tree that
  // is not a clean PASS is unresolved business.
  const tree = readTreeBinding(reportContent);
  if (!tree) return { ok: false, fresh: false, reason: "report has no 'verified-tree:' binding (stale-report protection)" };
  const fresh = tree === currentTreeHash;
  const verdict = parseVerdict(reportContent);
  if (!verdict) {
    return { ok: false, fresh, reason: "report has no parseable 'Verdict:' line at column 0 outside a code fence" };
  }
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
      current = { path: approves[1], from: null, to: null, base: null };
      continue;
    }
    if (!current) continue;
    const from = /^from-content-hash\s*:\s*(\S+)$/i.exec(line);
    if (from) {
      current.from = from[1];
      continue;
    }
    const base = /^base-commit\s*:\s*(\S+)$/i.exec(line);
    if (base) {
      current.base = base[1];
      continue;
    }
    const to = /^content-hash\s*:\s*(\S+)$/i.exec(line);
    if (to) current.to = to[1];
  }
  if (current) blocks.push(current);
  return blocks;
}

/** Every Class-2 path a diff touches, including the source side of a rename,
 * tagged with the transition it represents. This is the ONE definition of "what
 * this PR owes an approval for": `checkClass2Approvals` enforces against it and
 * `owed-approvals.mjs` prints from it, so the list a human is told to sign can
 * never be a different list from the one the gate demands (adversary finding
 * H-17, where a hand-maintained list drifted in both directions at once). */
export function class2TouchedPaths(changedFiles) {
  const touched = [];
  for (const f of changedFiles) {
    if (isClass2(f.path)) touched.push({ path: f.path, status: f.status === "renamed" ? "renamed-to" : f.status });
    if (f.oldPath && isClass2(f.oldPath)) touched.push({ path: f.oldPath, status: "renamed-away" });
  }
  return touched;
}

/** The transition an approval for `entry` must authorize: which content it
 * starts from and which it ends at. Shared for the same reason as above — a
 * printed `from-content-hash` that the gate would not accept is worse than no
 * printout, because the human believes they have signed. */
export function approvalTransition(entry, { hashOf, baseHashOf }) {
  const to = entry.status === "deleted" || entry.status === "renamed-away" ? "deleted" : safeHash(hashOf, entry.path);
  // A rename destination did not exist at the base, so its transition starts
  // from absence — the same shape as any newly added file.
  const from =
    entry.status === "added" || entry.status === "renamed-to" ? "absent" : safeHash(baseHashOf, entry.path, "unreadable");
  return { from, to };
}

export function checkClass2Approvals({ changedFiles, approvalDocs, hashOf, baseHashOf, baseCommit }) {
  const touched = class2TouchedPaths(changedFiles);
  if (touched.length === 0) return { ok: true, reason: "no Class-2 changes" };

  // FAIL CLOSED ON A MISSING BASE COMMIT. This was `baseCommit === undefined ||
  // b.base === baseCommit` — an omitted argument disabled the whole
  // pull-request binding and restored full approval replay. No test imported
  // class2-gate.mjs, so renaming the property at the single call site left the
  // suite green with the binding silently gone (adversary finding N-03, legs A
  // and B). A control-plane check whose default is "skip me" is not a check.
  if (typeof baseCommit !== "string" || baseCommit.length === 0) {
    return {
      ok: false,
      reason:
        "Class-2 approval check ran without a base commit, so approvals could not be bound to this pull request — refusing (fail closed)",
    };
  }

  const usable = approvalDocs
    .map((d) => (typeof d === "string" ? { path: null, content: d, status: "added" } : d))
    .filter((d) => d.status === undefined || d.status === "added")
    .flatMap((d) => parseApprovalBlocks(d.content));

  const failures = [];
  for (const f of touched) {
    const { from: wantFrom, to: wantTo } = approvalTransition(f, { hashOf, baseHashOf });
    const approved = usable.some(
      (b) =>
        b.path === f.path && b.to === wantTo && b.from === wantFrom &&
        // The approval must name THIS pull request's base (R3-CP-01). Content
        // hashes alone authorize a content STATE: once a human's revert restored
        // the previous bytes, every approval ever issued from those bytes was
        // re-armed, and copying one back in re-authorized the revoked change with
        // no forgery at all. A base commit occurs once.
        b.base === baseCommit,
    );
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
function safeHash(fn, path, absentSentinel) {
  if (typeof fn !== "function") return "unavailable";
  try {
    const h = fn(path);
    return typeof h === "string" && h.length > 0 ? h : "unavailable";
  } catch {
    // "deleted" means "this transition ends in absence" — a DELIBERATE state a
    // human can approve. An unreadable base is something else entirely, and
    // reusing the sentinel for it made a rename destination approvable with
    // `from-content-hash: deleted` on a file being created (R3-CP-09).
    return absentSentinel ?? "unreadable";
  }
}
