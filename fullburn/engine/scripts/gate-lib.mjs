import { createHash } from "node:crypto";
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
  /(?:^|\/)vite(?:st)?[._\-][^/]*$/,
  // The Playwright runner and everything it points at. Adding the §10.3 e2e
  // stage without this left BOTH halves Class-1: `playwright.config.ts` chooses
  // `testDir`, so a two-file Class-1 diff repointed it at a new `fullburn/e2e/`
  // holding a stub that launches no browser — five stages green, three gates
  // green, and the invariant suite still asserting the H20 variance held,
  // because it read the directory and never the runner that executes it
  // (adversary finding R5-02). Same defect class as R3-CP-03 and N-02, fourth
  // round, through a filename the H20 commit itself introduced.
  /(?:^|\/)playwright[._\-][^/]*$/,
  /(?:^|\/)e2e\//,
  // `npm ci` reads these; the lockfile was made Class-2 on exactly this
  // reasoning (N-11).
  /(?:^|\/)\.npmrc$/,
  /(?:^|\/)\.nvmrc$/,
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
  "fullburn/vitest_workspace.ts",
  "fullburn/playwright.config.ts",
  "fullburn/e2e/anything.spec.ts",
  "fullburn/.npmrc",
  "fullburn/.nvmrc",
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

/** Closed comments are removed; an UNCLOSED opener conceals everything after
 * it and therefore ENDS the header.
 *
 * This replaced only `<!-- … -->` pairs, and `stripConcealed` matched
 * `</?[a-zA-Z]`, which a comment opener is not. So `<!--` with no closing
 * delimiter survived both passes untouched and the concealed lines were read
 * normally: a report whose rendered form shows nothing was accepted as
 * `Verdict: PASS` bound to the current tree (adversary finding R7-01, the
 * cross-family review). That is a manufactured PASS on the mechanism that
 * gates every other mechanism.
 *
 * The r6 rule said "any raw tag ends the header" and was written one round
 * before this. It was a rule about tags when the problem was about anything a
 * renderer hides. */
function stripHtmlComments(text) {
  // Only closed pairs are removed here. An UNCLOSED opener is left in place on
  // purpose, so `stripConcealed` truncates the header at it — one guard, not
  // two. Truncating here as well was redundant, and a redundant guard reads as
  // coverage without being it.
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

/** THE HEADER IS PURE PROSE. Any raw HTML tag ends it.
 *
 * The previous rule was a five-tag list — details, script, style, template,
 * iframe — and every round found a new member of it: `<details>` in r4,
 * `<div style="display:none">` in r5. An enumeration of hiding places is not a
 * rule, it is a scoreboard. A renderer can conceal with any element and any
 * attribute, so the header simply may not contain markup: the first tag
 * truncates it, and a binding below that point does not exist as far as the
 * gate is concerned (which fails closed, per checkAdversaryReport). */
function stripConcealed(text) {
  // Any markup-ish opener ends the header, closed or not: a tag, a comment, a
  // CDATA or doctype opener, or a processing instruction. Enumerating which
  // ones conceal was the mistake three rounds running (R5-04, R6-05, R7-01).
  const tag = /<[!/?a-zA-Z]/.exec(text);
  return tag === null ? text : text.slice(0, tag.index);
}

/** The report's header lines, with everything a renderer would hide removed.
 * ONE definition, shared by both readers: `readTreeBinding` was a near-copy of
 * `parseVerdict` that compared fence CHARACTERS without length, so a correctly
 * bound `Verdict: FAIL` was read as unbound, filed as history, and silently
 * overridden by a sibling PASS — the gate's output never naming the FAIL report
 * at all (N-04). Two parsers for one grammar is how that happens. */
function visibleHeaderLines(reportContent) {
  if (typeof reportContent !== "string") return [];
  // Invisible and direction-flipping characters render as nothing or as
  // something else entirely, so a header containing them is not a header a
  // human read. Zero-width, BOM, and the bidi overrides (R7-01's remedy list).
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(reportContent)) {
    return [];
  }
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
    // No blockquote skip: both readers anchor at column 0, so a "> " prefix
    // already fails to match. A skip here would be dead code that reads as a
    // guard (adversary finding R6-05/P3). The behaviour is asserted directly in
    // gates.test.ts so removing the anchors is still caught.
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

/** The binding, read through ordinary Markdown decoration.
 *
 * The old rule demanded the hash be the only thing on the line, bare. Writing
 * it in backticks — ordinary Markdown practice — produced "`5f956c…`", which
 * compared unequal to the tree, so a correctly bound FAIL was judged STALE,
 * dropped, and silently overridden by a sibling PASS. The gate's own message
 * printed two identical hashes and said "the code changed" (adversary finding
 * R5-03). Six variants did it: backticks, bold, a list marker, a trailing
 * parenthetical.
 *
 * Decoration is stripped and the first hash-shaped token is taken. Anything
 * that yields no such token returns null — and null now BLOCKS rather than
 * being skipped, which is the other half of the fix. */
function readTreeBinding(reportContent) {
  for (const line of visibleHeaderLines(reportContent)) {
    const m = /^\s*(?:[-*+]\s+)?(?:\*\*|__)?verified-tree(?:\*\*|__)?\s*:\s*(.+)$/i.exec(line);
    if (m === null) continue;
    // ANCHORED. The hash pattern was unanchored and took the FIRST hex-shaped
    // run on the line, so `verified-tree: <commit-sha> (commit; tree <hash>)`
    // bound to the commit — a WRONG binding, not a parse failure, which landed
    // in the one non-blocking branch. The FAIL was skipped, a sibling PASS
    // opened the gate, and the gate's own message printed both hashes and said
    // "code changed after the adversary judged it", which was false (adversary
    // finding R6-01). Anything other than exactly one hash, after decoration is
    // stripped, is now unreadable — and unreadable blocks.
    const bare = m[1].replace(/[`*_]/g, "").trim();
    return /^[0-9a-f]{7,64}$/i.test(bare) ? bare : null;
  }
  return null;
}

/** Reports that legitimately carry no tree binding, pinned by content hash.
 *
 * An unparseable report now BLOCKS (see below), and exactly one report in
 * history cannot satisfy that: the r3 review's synthesizer died on a spend
 * limit, so its findings were preserved mechanically and it was labelled, in
 * its own text, as not adversary-authored and carrying no binding. Reports are
 * append-only, so it cannot be edited into shape.
 *
 * The hash pins it: this exemption cannot be inherited by new content in the
 * same filename, which is the only way an exemption like this goes wrong. */
function shortSha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
}

const UNBOUND_HISTORICAL_REPORTS = new Map([
  ["ADVERSARY_REPORT_phase0.r3.md", "38ba0f39"],
]);

/** Judge one report against the current tree. */
function judgeReport(reportContent, currentTreeHash) {
  // Freshness is established FIRST (adversary finding R3-CP-06). Judging the
  // verdict first meant an unparseable one — a blockquoted FAIL, a homoglyph —
  // returned fresh:false, so a report bound to THIS tree was filed as history
  // and a sibling PASS opened the gate. Anything bound to the current tree that
  // is not a clean PASS is unresolved business.
  const tree = readTreeBinding(reportContent);
  if (!tree) {
    // UNPARSEABLE IS NOT STALE. These were the same state, and that was the
    // defect: a report the gate could not read was filed as "about some other
    // tree" and skipped, so six ordinary Markdown choices — a hash in
    // backticks, a trailing parenthetical, a list marker — silently discarded a
    // correctly bound FAIL while a sibling PASS opened the gate (adversary
    // finding R5-03). The gate cannot show such a report is stale, so it must
    // treat it as unresolved. `blocking` says so; `fresh` stays false because
    // the report is not evidence ABOUT this tree, only an obstacle to it.
    return {
      ok: false,
      fresh: false,
      blocking: true,
      reason:
        "report has no readable 'verified-tree:' binding in its first 10 lines at column 0 — it cannot be shown to be about a different tree, so it blocks (fail closed)",
    };
  }
  const fresh = tree === currentTreeHash;
  const verdict = parseVerdict(reportContent);
  if (!verdict) {
    return {
      ok: false,
      fresh,
      blocking: true,
      reason: "report has no parseable 'Verdict:' line at column 0 in the first 10 lines",
    };
  }
  if (!fresh) {
    return {
      ok: false,
      fresh: false,
      blocking: false,
      reason: `report verified tree ${tree} but current fullburn tree is ${currentTreeHash} — code changed after the adversary judged it; re-run the adversary`,
    };
  }
  if (verdict.token !== "PASS") {
    return { ok: false, fresh: true, blocking: true, reason: `verdict is not PASS: "${verdict.line}"` };
  }
  return { ok: true, fresh: true, blocking: false, reason: "adversary report PASS and bound to the current tree" };
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

  const judged = docs
    .filter((d) => {
      const pinned = UNBOUND_HISTORICAL_REPORTS.get(d.name);
      return pinned === undefined || shortSha256(d.content) !== pinned;
    })
    .map((d) => ({ name: d.name, ...judgeReport(d.content, currentTreeHash) }));

  if (judged.length === 0) {
    return { ok: false, reason: `no reports/ADVERSARY_REPORT_phase${phase}*.md found that makes a claim about any tree` };
  }

  // Unresolved business blocks, whatever else exists. That is a FAIL bound to
  // this tree, AND a report the gate cannot read at all — the two were
  // different states and only the first one blocked (R5-03).
  const unresolved = judged.find((j) => j.blocking);
  if (unresolved) {
    return {
      ok: false,
      reason: `${unresolved.name}: ${unresolved.reason} (unresolved business on this tree blocks regardless of any PASS)`,
    };
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
  // APPROVALS/ is append-only for the same reason and was not covered, though
  // its own README said it was. A signed approval could be rewritten — the
  // `Approved-by` line altered, the standing caveat retitled "(RESOLVED)" — with
  // all three gates green and the verified-tree hash UNCHANGED, because
  // APPROVALS/ is excluded from the tree scope so a report's PASS cannot see it
  // (adversary finding R5-05). L11/L13 disclose that an approval cannot prove
  // WHO signed; nothing disclosed that it did not reliably prove WHAT, after
  // the fact. The only artifact recording a human decision could be made to
  // assert the opposite of that decision.
  const isAppendOnly = (p) =>
    /fullburn\/reports\/ADVERSARY_REPORT_.*\.md$/.test(p ?? "") ||
    (/fullburn\/APPROVALS\/.*\.md$/.test(p ?? "") && !/\/README\.md$/.test(p ?? ""));
  const touched = changedFiles.filter(
    (f) => (isAppendOnly(f.path) && f.status !== "added") || (isAppendOnly(f.oldPath) && f.status === "renamed"),
  );
  if (touched.length > 0) {
    const names = touched.map((f) => f.oldPath ?? f.path);
    return {
      ok: false,
      reason: `adversary reports and approvals are append-only; modified/deleted/renamed: ${names.join(", ")}`,
    };
  }
  return { ok: true, reason: "reports and approvals append-only holds" };
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

/** Principals whose commits cannot carry a Class-2 approval.
 *
 * An approval proved the bytes and never the author: a PR author or an
 * autonomous agent could compute the base commit and both hashes, add a
 * conforming approval file, and satisfy the gate — so the same agent changing
 * caps could mint the evidence forbidding it (adversary finding R7-07).
 *
 * This is the in-repo half. It refuses an approval whose commit was authored by
 * the automation principal, which raises the cost of the attack but does not
 * prove a human either — a committer name is self-asserted. Only branch
 * protection plus CODEOWNERS makes it real, and ledger L27 records that every
 * approval predating that lock is unverified. */
export const AUTOMATION_AUTHORS = [/\bclaude\b/i, /\bgithub-actions\b/i, /\[bot\]/i, /noreply@anthropic\.com/i];

/** Does any CODEOWNERS rule claim this path?
 *
 * A deliberately small subset of the CODEOWNERS grammar — leading `/` anchors
 * to the repository root, a trailing `/` matches a directory and everything
 * under it, `*` matches within one segment, and a bare pattern matches by
 * basename at any depth. That is every form this repo's file uses, and a rule
 * shape it does NOT understand must be added here rather than assumed to work:
 * a matcher that quietly returns false for a rule GitHub honours would report
 * missing coverage, and one that quietly returns true would report coverage
 * that does not exist. The second is the dangerous direction, so unknown
 * constructs are not silently accepted.
 *
 * Exists because the file it checks covered 38 of 97 Class-2 paths while a lock
 * test asserted six hard-coded strings and read as coverage of the set
 * (adversary finding R8-04). */
export function codeownersCovers(path, codeownersText) {
  const rules = codeownersText
    .split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split(/\s+/)[0]);
  const seg = (p) => p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return rules.some((rule) => {
    if (rule.startsWith("/")) {
      const body = rule.slice(1);
      return body.endsWith("/")
        ? new RegExp(`^${seg(body)}`).test(path)
        : new RegExp(`^${seg(body)}$`).test(path);
    }
    if (rule.endsWith("/")) return new RegExp(`(?:^|/)${seg(rule.slice(0, -1))}/`).test(path);
    // Bare pattern: matches the basename at any depth, which is how GitHub
    // treats a rule with no slash in it.
    return new RegExp(`(?:^|/)${seg(rule)}$`).test(path);
  });
}

/** Refuses approvals added by a commit the automation principal authored. */
export function checkApprovalAuthorship(approvalDocs) {
  const forged = approvalDocs.filter(
    (d) =>
      typeof d.authoredBy === "string" && AUTOMATION_AUTHORS.some((re) => re.test(d.authoredBy)),
  );
  if (forged.length > 0) {
    return {
      ok: false,
      reason: `Class-2 approvals may not be authored by the automation principal (Law 15): ${forged
        .map((d) => `${d.path} by ${d.authoredBy}`)
        .join(", ")}`,
    };
  }
  return { ok: true, reason: "approvals are not agent-authored" };
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

  const authorship = checkApprovalAuthorship(approvalDocs);
  if (!authorship.ok) return authorship;

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
