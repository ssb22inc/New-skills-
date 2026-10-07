#!/usr/bin/env node
/** MUTATION HARNESS — the project's acceptance bar for a fix, made runnable.
 *
 * `npm run mutate` applies each listed one-line revert on its own, runs the full
 * suite, and restores the file. A fix whose revert leaves the suite green is not
 * protected by anything: three consecutive adversary reviews found fixes in that
 * state, and every one of them was a defect that could be reopened with a single
 * line while CI stayed green.
 *
 * Each entry is [name, file, original, mutated]. Add one for every fix; a
 * SURVIVED line means the lock test does not test what it claims.
 *
 * PATTERN-NOT-FOUND means the code moved and the entry is now stale — it is a
 * failure to investigate, not a pass. */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  MARKER,
  META_CANARIES,
  applyEntry,
  classifyRun,
  harnessVerdict,
  metaCheckVerdict,
  recoverInFlight,
  summaryLine,
  tableEndOf, acquireRunLock, releaseRunLock } from "./mutate-lib.mjs";

/** The fullburn workspace root, two levels up from engine/scripts/. */
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
/** The repository root. Some Class-2 artifacts — CODEOWNERS, the CI workflow —
 * live outside the workspace, and a fix that lives there needs an entry here
 * just as much: R8-04 was two of them. */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const resolveEntry = (file) => `${/^\.(?:github|claude)\/|^DONE\.md$/.test(file) ? REPO_ROOT : ROOT}/${file}`;
/** vitest's real entry point. Spawned directly so there is no shim to orphan. */
const VITEST_BIN = `${ROOT}/node_modules/vitest/vitest.mjs`;

const MUTATIONS = [
  // ---- r4 findings ----
  ["N-01 clock default", "engine/src/spend-ledger.ts", "  constructor(now: () => number, capsFor: CapsResolver) {", "  constructor(now = () => 0, capsFor) {"],
  ["N-01 clock type guard", "engine/src/spend-ledger.ts", 'if (typeof now !== "function") {', "if (false) {"],
  // N-09 moved into the ledger with the arithmetic (R12-01): held money must be
  // visible whatever DAY it was reserved on. The mutation scopes it to a single
  // period, which is exactly N-09's defect one layer down.
  ["N-09 reservedUsd spans every period", "engine/src/spend-ledger.ts",
    `    let micros = 0;
    for (const e of this.#open.values()) {
      if (e.clientId === clientId) micros += e.micros;
    }`,
    `    let micros = 0;
    for (const e of this.#open.values()) {
      if (e.clientId === clientId && e.day === "never") micros += e.micros;
    }`],
  // N-08's two entries were REPLACED, not deleted: R7-04 overturned N-08's
  // conclusion, so the shape they mutated no longer exists. Their successors
  // are the R7-04 pair below, which mutate the fix back into N-08's shape.
  ["N-07 silent release catch", "engine/src/gateway.ts", "        releaseLeak = releaseErr;", "        void releaseErr;"],
  ["N-02 vitest extension list", "engine/scripts/gate-lib.mjs", "  /^(?:fullburn\\/(?:[^/]+\\/)*)?vite(?:st)?[._\\-][^/]*$/,", "  /^fullburn\\/vitest[^/]*\\.(?:ts|js|mjs|json)$/,"],
  ["N-02 vite pattern", "engine/scripts/gate-lib.mjs", "  /^(?:fullburn\\/(?:[^/]+\\/)*)?vite(?:st)?[._\\-][^/]*$/,", "  /^__never__$/,"],
  ["N-11 lockfile Class-1", "engine/scripts/gate-lib.mjs", "  /^(?:fullburn\\/(?:[^/]+\\/)*)?package-lock\\.json$/,", "  /^__never__$/,"],
  ["N-03 baseCommit fail-open", "engine/scripts/gate-lib.mjs", 'if (typeof baseCommit !== "string" || baseCommit.length === 0) {', "if (false) {"],
  // NOTE: restoring the `baseCommit === undefined ||` disjunct is a semantic
  // NO-OP now that the fail-closed guard returns before the loop, so it is not
  // listed as a mutation — a "survivor" there would be a harness artifact, not
  // an unprotected fix. The guard itself is mutated above and is caught.
  ["N-03 CLI wiring", "engine/scripts/class2-gate.mjs", "  baseCommit: resolvedBase,", "  baseCommitt: resolvedBase,"],
  ["N-04/05 header window", "engine/scripts/gate-lib.mjs", "for (const raw of lines.slice(0, HEADER_LINES)) {", "for (const raw of lines) {"],
  ["N-04 fence length", "engine/scripts/gate-lib.mjs", "      else if (fence.ch === marker.ch && marker.len >= fence.len) fence = null;", "      else if (fence.ch === marker.ch) fence = null;"],
  // REPOINTED 2026-08-22, not deleted: the expression this targets moved from
  // `scanContent`'s body into `secretRuleHits` when the two were collapsed into
  // one detection path. Same defect, same revert, new address.
  ["N-06 substitute-then-scan", "engine/scripts/scan-lib.mjs",
    "  return patterns.filter(({ re }) => realMatches(re, content, path).length > 0).map(({ name }) => name);",
    "  return patterns.filter(({ re }) => re.test(DECLARED_FIXTURES.reduce((t, f) => t.split(f).join(\"[test-fixture]\"), content))).map(({ name }) => name);"],
  ["N-06 file-scoped exemption travels", "engine/scripts/scan-lib.mjs", "  if (QUOTED_EVIDENCE.get(path)?.includes(matched)) return true;", "  if ([...QUOTED_EVIDENCE.values()].flat().includes(matched)) return true;"],
  ["N-06 residue check", "engine/scripts/scan-lib.mjs", "  return /^[^A-Za-z0-9]*(?:Bearer)?[^A-Za-z0-9]*$/i.test(residue);", "  return true;"],
  ["r4-lock8 WeakSet brand", "config/src/models.ts", "!(att instanceof EvalAttestation) || !GENUINE.has(att)", "!(att instanceof EvalAttestation)"],
  // ---- r7 findings (cross-family review) ----
  ["R7-01 opener pattern covers markup", "engine/scripts/gate-lib.mjs", "  const tag = /<[!/?a-zA-Z]/.exec(text);", "  const tag = /<\\/?[a-zA-Z][^>]*>/.exec(text);"],
  ["R7-01 invisible characters refused", "engine/scripts/gate-lib.mjs", "  if (/[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff]/.test(reportContent)) {", "  if (false) {"],
  ["R7-02 zone-bucketed day key", "engine/src/trusted-clock.ts", "  return new Intl.DateTimeFormat(\"en-CA\", {", "  void timeZone; return new Date(nowMs).toISOString().slice(0, 10); return new Intl.DateTimeFormat(\"en-CA\", {"],
  ["R7-02 zone travels with the ceilings", "config/src/caps.ts", "  return Object.freeze({ dailyUsd, monthlyUsd, timeZone: caps.ianaTimeZone });", "  return Object.freeze({ dailyUsd, monthlyUsd, timeZone: \"UTC\" });"],
  // R7-02's zone VALIDATION call is not listed, for the reason ledger L19
  // records about assertCapsCoherent: every client in the frozen table declares
  // a resolvable zone, so removing the call from getCaps changes nothing
  // observable. The check itself is driven directly in locks-r7 and a bad zone
  // is refused at reserve() time. Disclosed in L25 rather than faked.
  ["R7-03 backwards clock refused", "engine/src/spend-ledger.ts", "    if (seen !== undefined && day < seen) {", "    if (false) {"],
  ["R7-03 non-finite instant refused", "engine/src/trusted-clock.ts", "  if (!Number.isFinite(nowMs)) {", "  if (false) {"],
  ["R7-06 the ledger owns the ceilings", "engine/src/spend-ledger.ts", "    const caps = this.#capsFor(clientId, narrowing);", "    const caps = narrowing?.[clientId] ?? this.#capsFor(clientId, narrowing);"],
  ["R7-06 resolver required", "engine/src/spend-ledger.ts", "    if (typeof capsFor !== \"function\") {", "    if (false) {"],
  // R7-04: `departed` set BEFORE the transport call. The mutation restores
  // exactly N-08's shape — set it after the await — which is what the
  // cross-family review showed returns headroom for served requests.
  ["R7-04 departed set before dispatch", "engine/src/gateway.ts",
    `    departed = true;
    try {
      output = await deps.transport.post(`,
    `    try {
      output = await deps.transport.post(`],
  ["R7-04 only a typed pre-dispatch releases", "engine/src/gateway.ts", "      if (err instanceof PreDispatchError) {", "      if (err instanceof Error) {"],
  // R7-05's `actualUsd` parameter was REMOVED by R8-02, so its entry is gone
  // with it. Its successors are the R8-02 pair below: the mutation now restores
  // the parameter, which is the direction the defect actually came from.
  // R7-07: the in-repo half of the identity lock. The out-of-repo half —
  // branch protection + CODEOWNERS — is not mutable from here and is disclosed
  // in ledger L27 instead.
  ["R7-07 agent-authored approval refused", "engine/scripts/gate-lib.mjs", "  if (forged.length > 0) {", "  if (false) {"],
  ["R7-07 authorship check wired", "engine/scripts/gate-lib.mjs", "  if (!authorship.ok) return authorship;", "  void authorship;"],
  ["R7-07 CLI supplies the author", "engine/scripts/class2-gate.mjs", "    authoredBy: git(", "    authoredByy: git("],
  // R7-08: the two evasions the cross-family review demonstrated.
  ["R7-08 strings blanked in the body", "engine/test/e2e-variance.ts", "      const real = withoutStrings(body);", "      const real = body;"],
  ["R7-08 computed testDir key read", "engine/test/e2e-variance.ts", "  const keyed = /(?:\\btestDir\\s*:|\\[\\s*[\"'`]testDir[\"'`]\\s*\\]\\s*:)\\s*[\"'`]([^\"'`]+)[\"'`]/g;", "  const keyed = /\\btestDir\\s*:\\s*[\"'`]([^\"'`]+)[\"'`]/g;"],
  ["R7-08 unreadable testDir refused", "engine/test/e2e-variance.ts", "  if (keys !== found.length) return false;", "  if (false) return false;"],
  // R7-09: one event must never name two clients, and a lost trace must reach
  // the caller.
  ["R7-09 mismatched scope gets its own identity", "engine/src/gateway.ts", "    req?.trace instanceof TraceContext && !scopeMismatch ? req.trace.traceId", "    req?.trace instanceof TraceContext ? req.trace.traceId"],
  ["R7-09 trace loss surfaced", "engine/src/gateway.ts", "      traceLost = sinkErr instanceof Error ? redactText(String(sinkErr.name), secrets) : \"a non-error\";", "      void sinkErr;"],
  ["R7-09 untraced marker reaches the caller", "engine/src/gateway.ts", "    if (traceLost !== null) {", "    if (false) {"],
  // R7-10: grades are evidence only if this engine computed them.
  ["R7-10 enforcement provenance", "engine/src/grade-registry.ts",
    `  if (!COMPUTED.has(grades)) {
    throw new GradeRegistryError(
      "enforcement requires grades from computeGrades`,
    `  if (false) {
    throw new GradeRegistryError(
      "enforcement requires grades from computeGrades`],
  ["R7-10 published report provenance", "engine/src/grade-registry.ts", "    throw new GradeRegistryError(\"publishGradeReport requires grades from computeGrades (§12, Law 10)\");", "    void 0;"],
  // ---- r8 findings (the round that reviewed r7's fixes) ----
  // R8-01: R7-06 moved the ceiling seam onto llm()'s public path rather than
  // closing it. The frozen table must reach the comparison, by construction.
  ["R8-01 llm() requires a frozen-caps meter", "engine/src/gateway.ts", "    if (!isFrozenCapsMeter(deps.meter)) {", "    if (false) {"],
  ["R8-01 brand is module-private", "engine/src/spend-meter.ts", "  return FROZEN_CAPS_BOUND.has(meter as SpendMeter);", "  return true;"],
  // R8-01's `reserve` pin was SUPERSEDED, not deleted: R10-02 showed the
  // enumeration behind it was the defect — a settle rewired to release mints
  // headroom, and the pin covered only reserve. Its successors are the two
  // R10-02 entries above, which mutate the freeze and the isFrozen check.
  ["R8-01 production meter is final", "engine/src/spend-meter.ts", "    if (new.target !== FrozenCapsSpendMeter) {", "    if (false) {"],
  ["R8-01 caps come from the frozen table", "engine/src/spend-ledger.ts", "    effectiveAiCapsUsd(clientId, narrowing),", "    ({ ...effectiveAiCapsUsd(clientId, narrowing), dailyUsd: 1e9, monthlyUsd: 1e9 }),"],
  // R8-02: settle() takes one argument. The mutation restores the override.
  // Retargeted after R12-01 moved the arithmetic into the ledger. NOTE the
  // first retarget was itself a bad entry: it added an `arguments[1]` override
  // that no caller reached, so behaviour was identical and it SURVIVED by
  // construction — a mutation that cannot change an outcome measures nothing,
  // which is the L19/L23 class. R8-02's live property is that settle commits
  // EXACTLY the reserved amount, so that is what the mutation moves. The
  // "no override parameter" half is structural now: there is no parameter.
  ["R8-02 settle commits the reserved amount, exactly", "engine/src/spend-ledger.ts",
    "      this.#committed.set(period, committed + open.micros);",
    "      this.#committed.set(period, committed + Math.round(open.micros / 2));"],
  // R8-03: the MONTH key on its own. R7-02 was locked at day granularity only,
  // and this revert survived the full suite while reopening the $200 ceiling.
  ["R8-03 zone-bucketed month key", "engine/src/trusted-clock.ts", "  return zoneDayKey(nowMs, timeZone).slice(0, 7);", "  void timeZone; return new Date(nowMs).toISOString().slice(0, 7);"],
  // R8-04: CODEOWNERS coverage, and the CI trigger that decides whether the
  // gate guarding it runs at all.
  ["R8-04 CODEOWNERS covers the tests", ".github/CODEOWNERS", "/fullburn/engine/test/              @ssb22inc", "# /fullburn/engine/test/            @ssb22inc"],
  ["R8-04 CODEOWNERS covers package.json", ".github/CODEOWNERS", "package.json                        @ssb22inc", "# package.json                      @ssb22inc"],
  ["R8-04 CODEOWNERS covers the runner config", ".github/CODEOWNERS", "vitest*                             @ssb22inc", "# vitest*                           @ssb22inc"],
  ["R8-04 CODEOWNERS matcher discriminates", "engine/scripts/gate-lib.mjs", "  let owned = false;", "  let owned = true;"],
  // REPOINTED 2026-08-23, not deleted. R8-04b's property — a `.github` change
  // must run the gate — is unchanged; the MECHANISM moved out of the trigger's
  // `paths:` filter and into `ci-scope.mjs` (§7.0 item 2), so the old target
  // text no longer exists. Its two halves are now CS-02 (the scope covers
  // .github) and CS-05 (the trigger carries no filter at all). What THIS entry
  // now targets is the half neither of those covers: the gating expression
  // failing SAFE. `== 'true'` would mean a deleted scope step skips every step
  // and reports a green job that ran nothing.
  ["R8-04b the scope gate fails safe, so a missing scope step still runs the gate",
    ".github/workflows/fullburn-ci.yml",
    "      - name: Typecheck\n        if: steps.scope.outputs.relevant != 'false'",
    "      - name: Typecheck\n        if: steps.scope.outputs.relevant == 'true'"],
  // R8-05: identity proved the array was not built by the caller; the freeze is
  // what stops the caller rewriting what is in it.
  ["R8-05 grade objects frozen", "engine/src/grade-registry.ts", "    return Object.freeze({ area: areaDef.area, grade, failing: Object.freeze(failing), missing: Object.freeze(missing) });", "    return { area: areaDef.area, grade, failing, missing };"],
  ["R8-05 grade array frozen", "engine/src/grade-registry.ts", "  Object.freeze(grades);\n  COMPUTED.add(grades);", "  COMPUTED.add(grades);"],
  // R8-06: the fourth and fifth e2e evasions.
  ["R8-06 run filters refused", "engine/test/e2e-variance.ts", "  if (RUN_FILTER_KEYS.test(src)) return false;", "  if (false) return false;"],
  ["R8-06 smoke spec cannot satisfy its own deferral", "engine/test/e2e-variance.ts", `    .filter((s) => s.name.endsWith(".spec.ts") && s.name !== "smoke.spec.ts")`, `    .filter((s) => s.name.endsWith(".spec.ts"))`],
  // R8-07: the root guard sat one branch too late, so a missing root scanned
  // zero files and reported clean.
  ["R8-07 missing root is an error", "engine/scripts/leak-check.mjs", "  if (!existsSync(repoRoot)) {\n    throw new Error(", "  if (false) {\n    throw new Error("],
  // R8-08: the ADVANCING half of the high-water mark.
  ["R8-08 high-water mark advances", "engine/src/spend-ledger.ts", "if (seen === undefined || day > seen) this.#highWater.set(clientId, day);", "if (seen === undefined) this.#highWater.set(clientId, day);"],
  // R8-09: the acceptance bar must be a stage, and must be able to fail.
  ["R8-09 harness fails the build", "engine/scripts/mutate-lib.mjs", "  if (survived > 0 || notFound > 0) {", "  if (false) {"],
  // The standing invariant, 2026-08-17: a tool that writes to the source tree
  // must be import-safe and must fail closed. Both halves get an entry.
  ["R8-STANDING harness is import-safe", "engine/scripts/mutate.mjs", "if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {", "if (true) {"],
  ["R8-STANDING crash marker written first", "engine/scripts/mutate.mjs", "    writeFileSync(MARKER, JSON.stringify({ path, original, workspace: ROOT, pid: process.pid }));", "    void MARKER;"],
  ["R8-STANDING crashed run is recovered", "engine/scripts/mutate-lib.mjs", "  if (!fs.existsSync(markerPath)) return null;", "  return null;\n  if (!fs.existsSync(markerPath)) return null;"],
  ["R8-STANDING recovery is wired into the runner", "engine/scripts/mutate.mjs", "  const recovered = recoverInFlight();", "  const recovered = null;"],
  // THE HARNESS'S OWN RUNNER AND ITS DRILL HAVE NO ENTRIES, and L29 records
  // the class. This table measures "does a revert turn THE UNIT SUITE red",
  // and the runner loop, the interrupt path and the drill are all things the
  // unit suite does not execute — the drill deliberately so, since R10-05.
  // Three entries were written for them and all three SURVIVED for that reason
  // rather than because anything was unprotected; one of them (adding the drill
  // to vitest.config.ts's include) made the suite spawn harnesses recursively.
  // They are covered by `npm run drill` and by the invariant that reads the
  // config, not by this table.
  // THE GUARD SWEEP HAS NO ENTRIES, same reason as L29. Deleting an assertion
  // from a test cannot turn that test red — the checker cannot catch a mutation
  // of itself. Two were written and both SURVIVED for that reason. The sweep is
  // held by review and by the standing rule in CLAUDE.md, and what it protects
  // — the guards themselves — each carry their own entry above.
  // ---- r10 findings ----
  ["R10-02 the production meter is frozen", "engine/src/spend-meter.ts", "     * reach into internals. */\n    Object.freeze(this);", "     * reach into internals. */\n    void 0;"],
  ["R10-02 settle refuses unavailable storage", "engine/src/spend-ledger.ts", "    this.#assertAvailable(open.clientId);\n    this.#open.delete(handle);\n    for (const period of", "    this.#open.delete(handle);\n    for (const period of"],
  ["R10-02 release refuses unavailable storage", "engine/src/spend-ledger.ts", "    this.#assertAvailable(open.clientId);\n    this.#open.delete(handle);\n    return open;", "    this.#open.delete(handle);\n    return open;"],
  ["R10-03 the clock is anchored, not re-read", "engine/src/trusted-clock.ts", "    return anchorWall + Number((mono - anchorMono) / 1_000_000n);", "    return Date.now();"],
  ["R10-03 disagreeing time sources are refused", "engine/src/trusted-clock.ts", "  if (hi - lo > ANCHOR_TOLERANCE_MS) {", "  if (false) {"],
  ["R10-03 the monotonic source cannot go backwards", "engine/src/trusted-clock.ts", "  if (mono < last) {", "  if (false) {"],
  ["R10-03 the process ledger uses the trusted clock", "engine/src/spend-ledger.ts", "  PROCESS_CLOCK ??= trustedClock();", "  PROCESS_CLOCK ??= () => Date.now();"],
  // ---- r9 findings ----
  // R9-03's await is NOT listed, and the reason is structural rather than
  // convenient. Its behaviour — a SIGINT stops the run and restores the tree —
  // is proven by the drill in engine/test/integration/gate-cli.test.ts, which
  // spawns the real harness and signals it. That drill DECLINES when a harness
  // already holds the marker, because it cannot spawn a second one into the
  // same fixed path; and a mutation run is exactly that case. So no entry here
  // can ever be caught by it, and an entry that cannot fail is the "reads as
  // coverage" defect this table exists to expose. Disclosed in ledger L29
  // instead of faked. The first attempt at this entry SURVIVED, which is how
  // the property was noticed.
  ["R9-04 CODEOWNERS rules need an owner", "engine/scripts/gate-lib.mjs", "      return { pattern, owned: owners.length > 0 };", "      return { pattern, owned: true };"],
  ["R9-04 last match wins", "engine/scripts/gate-lib.mjs", "  for (const rule of rules) if (matches(rule.pattern)) owned = rule.owned;", "  for (const rule of rules) if (matches(rule.pattern)) owned = owned || rule.owned;"],
  ["R9-06 block-sequence paths are read", "engine/scripts/gate-lib.mjs", "    filters.push({ negated, globs: readable ? globs : null });", "    filters.push({ negated, globs: [] });"],
  ["R9-06 unreadable filters are refused", "engine/scripts/gate-lib.mjs", "        filters.push({ negated, globs: null }); // a flow sequence we cannot parse", "        filters.push({ negated, globs: [] });"],
  ["R10-04 paths-ignore is not paths", "engine/scripts/gate-lib.mjs", "    const negated = m[2] !== undefined;", "    const negated = false;"],
  ["R10-01 meta-check canaries cover both answers", "engine/scripts/mutate-lib.mjs", '    to: "const MICROS_PER_USD = 1_000_000; // meta-check canary",\n    expect: "SURVIVED",', '    to: "const MICROS_PER_USD = 1_000_000; // meta-check canary",\n    expect: "CAUGHT",'],
  ["R10-01 meta-check refuses a disagreement", "engine/scripts/mutate-lib.mjs", "  const wrong = results.filter((r) => r.got !== r.expect);", "  const wrong = [];"],
  ["R10-01 an empty meta-check is void", "engine/scripts/mutate-lib.mjs", "  if (!Array.isArray(results) || results.length === 0) {", "  if (false) {"],
  ["R9-05 production meter binds its own clock", "engine/src/spend-meter.ts", "  constructor(narrowing?: CapsNarrowingTable) {", "  constructor(now?: () => number, narrowing?: CapsNarrowingTable) {"],
  ["R9-09 marker cannot write outside the workspace", "engine/scripts/mutate-lib.mjs", "  if (!inWorkspace || !sameWorkspace || !fs.existsSync(record.path)) {", "  if (false) {"],
  // Repointed 2026-09-24: the \u0000 fixture drifted to byte 8708 as tests were
  // appended, git samples only the first 8000 bytes, and the entry stopped
  // making the file binary (the first honest harness run reported it SURVIVED,
  // and git's own numstat agreed). A raw NUL in an early comment is a semantic
  // no-op inside the window; git renders the file "- -" and the lock fires.
  ["R9-10 no Class-2 file is git-binary", "engine/test/hardening.test.ts",
    "// @ts-expect-error — plain .mjs module, typed loosely on purpose\nimport { parseNameStatus } from \"../scripts/diff-lib.mjs\";",
    "// @ts-expect-error — plain .mjs module, typed loosely on purpose \u0000\nimport { parseNameStatus } from \"../scripts/diff-lib.mjs\";"],
  ["R9-11 runtime skip/fail refused", "engine/test/e2e-variance.ts", "      if (/\\b(?:test|it)\\s*\\.\\s*(?:skip|fixme|fail)\\s*\\(/.test(real)) return false;", "      void real;"],
  ["R9-11 bare return refused", "engine/test/e2e-variance.ts", "      if (/\\breturn\\b\\s*;/.test(real)) return false;", "      void 0;"],
  ["R9-11 skipped describe refused", "engine/test/e2e-variance.ts", "      if (/\\b(?:test|it)\\s*\\.\\s*describe\\s*\\.\\s*(?:skip|fixme)\\s*\\(/.test(stripped)) return false;", "      void stripped;"],
  ["R9-02 self-targeting entries cannot rewrite the table", "engine/scripts/mutate-lib.mjs", "  const start = isSelf ? tableEnd : 0;\n  const at = source.indexOf(from, start);", "  const start = 0;\n  const at = source.indexOf(from, start);"],
  ["R9-02 table boundary fails closed", "engine/scripts/mutate-lib.mjs", 'if (at === -1) throw new Error("mutation table not found in harness source — refusing to run (fail closed)");', "if (at === -1) return 0;"],
  // Found while running the R7 gates, not by the review: `npm run leak-check`
  // passed no root, so every path-scoped rule matched nothing and the local
  // scan reported clean on a tree CI would have flagged.
  ["leak-check scannable root", "engine/scripts/leak-check.mjs", "  assertScannableRoot(repoRoot);", "  void repoRoot;"],
  ["leak-check local command matches CI", "package.json", "\"leak-check\": \"node engine/scripts/leak-check.mjs ..\"", "\"leak-check\": \"node engine/scripts/leak-check.mjs\""],
  // ---- r6 findings ----
  ["R6-04 ledger keyed by identity", "engine/src/spend-ledger.ts", "    const open = this.#open.get(handle);\n    if (open === undefined) return null; // forged, foreign, or already closed", "    const open = [...this.#open.values()].find((e) => e.clientId === (handle as { clientId?: string }).clientId);\n    if (open === undefined) return null;"],
  // TARGET AMBIGUITY IS A SILENT MISS. `Object.freeze(this);` occurs twice in
  // spend-meter.ts — once in SpendReservation (R6-04) and once in
  // FrozenCapsSpendMeter (R10-02) — and `String.replace` takes the FIRST. So
  // both entries reverted the reservation's freeze, R10-02's fix had no entry
  // touching it, and the harness printed CAUGHT for a line it never changed
  // (adversary finding R14-07). Each target now carries enough context to be
  // unique, which `applyEntry` refuses to apply if it is not.
  ["R6-04 handle frozen", "engine/src/spend-meter.ts",
    "    // A handle is a value. `id` is informational only — see #open's keying.\n    Object.freeze(this);",
    "    // A handle is a value. `id` is informational only — see #open's keying.\n    void 0;"],
  ["R6-01 anchored tree hash", "engine/scripts/gate-lib.mjs", "    return /^[0-9a-f]{7,64}$/i.test(bare) ? bare : null;", "    const t = /[0-9a-f]{7,64}/i.exec(bare); return t === null ? null : t[0];"],
  // Restated after R7-08 split the body extraction from the string blanking:
  // the mutation still reverts to the whole-file AND that R6-02 found.
  ["R6-02 test body is read", "engine/test/e2e-variance.ts", "      const body = namedTestBody(stripped, title);", "      const body = /intake/i.test(s.source) ? s.source : null;"],
  ["R6-02 skip/todo excluded", "engine/test/e2e-variance.ts", "    if (m[1] !== undefined) continue;", "    void m[1];"],
  ["R6-03 every testDir checked", "engine/test/e2e-variance.ts", "  return found.length > 0 && found.every((d) => d === want);", "  return found.length > 0 && found[0] === want;"],
  // R6-05/P3 removed: the blockquote skip was subsumed by the column-0 anchors
  // and was deleted rather than given an entry it could never fail.
  ["R6-05/P1 pinned-hash content binding", "engine/scripts/gate-lib.mjs", "      return pinned === undefined || shortSha256(d.content) !== pinned;", "      return pinned === undefined;"],
  ["R6-05/M8 toMicros range", "engine/src/spend-meter.ts", "  if (!Number.isSafeInteger(micros)) {", "  if (false) {"],
  ["R6-05/M12 assertSaneCap", "config/src/caps.ts", "  if (typeof n !== \"number\" || !Number.isFinite(n) || n <= 0) {", "  if (false) {"],
  // R6-05/M6 and M7 are NOT listed: the `open.clientId !== reservation.clientId`
  // check and the `Math.max(0, …)` clamp were dead code once the ledger became
  // identity-keyed, and dead code that reads as a guard is the very pattern this
  // round criticised. They were deleted rather than given a mutation entry.
  // R6-05/M4 is not listed: the corrupt-ledger guard in #read has no reachable
  // input. Every value in those maps comes from arithmetic the range guards
  // above already bound, and #close deletes an entry before decrementing, so a
  // negative cannot arise. It is a fail-closed backstop against a future
  // storage backend, disclosed rather than faked — same class as ledger L19.
  // R6-05/M14 is not listed either: `Object.hasOwn` on the narrowing table is
  // inert with respect to money, because `narrow()` is Math.min and a polluted
  // entry can only tighten. Kept as hygiene, disclosed as inert.
  // ---- r5 findings ----
  ["R5-01 reservation brand", "engine/src/spend-meter.ts", "    if (brand !== RESERVATION_BRAND) {", "    if (false) {"],
  ["R5-02 playwright pattern", "engine/scripts/gate-lib.mjs", "  /^(?:fullburn\\/(?:[^/]+\\/)*)?playwright[._\\-][^/]*$/,", "  /^__never__$/,"],
  ["R5-02 e2e dir pattern", "engine/scripts/gate-lib.mjs", "  /^(?:fullburn\\/(?:[^/]+\\/)*)?e2e\\//,", "  /^__never__$/,"],
  ["R5-02 npmrc pattern", "engine/scripts/gate-lib.mjs", "  /^(?:fullburn\\/(?:[^/]+\\/)*)?\\.npmrc$/,", "  /^__never__$/,"],
  ["R5-02 runner-targets check", "engine/test/e2e-variance.ts", "  if (!runnerPointsHere) return false;", "  if (false) return false;"],
  ["R5-02 runnerTargets comment-strip", "engine/test/e2e-variance.ts", "  const src = code(playwrightConfig);", "  const src = playwrightConfig;"],
  ["R5-03 unparseable blocks", "engine/scripts/gate-lib.mjs", "  const unresolved = judged.find((j) => j.blocking);", "  const unresolved = judged.find((j) => j.fresh && !j.ok);"],
  ["R5-03 binding decoration strip", "engine/scripts/gate-lib.mjs", '    const bare = m[1].replace(/[`*_]/g, "").trim();', "    const bare = m[1].trim();"],
  ["R5-04 header is pure prose", "engine/scripts/gate-lib.mjs", "  const tag = /<[!/?a-zA-Z]/.exec(text);\n  return tag === null ? text : text.slice(0, tag.index);", "  return text;"],
  ["R5-05 approvals append-only", "engine/scripts/gate-lib.mjs", "    (/fullburn\\/APPROVALS\\/.*\\.md$/.test(p ?? \"\") && !/\\/README\\.md$/.test(p ?? \"\"));", "    false;"],
  ["R5-06 expiry title match", "engine/test/e2e-variance.ts", "  const title = /intake[\\s\\S]*confirm|confirm[\\s\\S]*intake/i;", "  const title = /./;"],
  ["R5-06 expiry comment-strip", "engine/test/e2e-variance.ts", "  return source.replace(/\\/\\*[\\s\\S]*?\\*\\//g, \"\").replace(/^\\s*\\/\\/.*$/gm, \"\");", "  return source;"],
  ["R5-07 assertCleanTree", "engine/scripts/adversary-gate.mjs", "  assertCleanTree(repoRoot);", "  void repoRoot;"],
  ["R5-07 reservedUsd required", "engine/src/gateway.ts", "    typeof meter.release !== \"function\" || typeof meter.reservedUsd !== \"function\"", "    typeof meter.release !== \"function\""],
  ["R5-08 one clock read", "engine/src/spend-ledger.ts", "      day: `d:${zoneDayKey(nowMs, caps.timeZone)}|${clientId}`,\n      month: `m:${zoneMonthKey(nowMs, caps.timeZone)}|${clientId}`,", "      day: `d:${zoneDayKey(this.#now(), caps.timeZone)}|${clientId}`,\n      month: `m:${zoneMonthKey(this.#now(), caps.timeZone)}|${clientId}`,"],
  // ---- H8 caps: the approved ceilings and the month-keyed accounting ----
  ["H8 monthly ceiling unchecked", "engine/src/spend-ledger.ts", "    if (projectedMonth > monthlyCapMicros) {", "    if (false) {"],
  ["H8 month period dropped from settle", "engine/src/spend-ledger.ts", "    for (const period of [open.day, open.month]) {", "    for (const period of [open.day]) {"],
  ["H8 month key equals day key", "engine/src/spend-meter.ts", "    return fromMicros(this.#ledger.committedMicros(clientId, \"month\"));", "    return fromMicros(this.#ledger.committedMicros(clientId, \"day\"));"],
  ["H8 ceilings object not required", "engine/src/spend-ledger.ts", "    if (caps === null || typeof caps !== \"object\") {", "    if (false) {"],
  ["H8 monthly narrowing can widen", "config/src/caps.ts", "    return Math.min(ceiling, requested);", "    return requested;"],
  ["H8 sign-off check dropped", "config/src/caps.ts", "  assertCapsUsable(caps, clientId); // sign-off comes from the frozen table, always", "  void clientId;"],
  ["H8 hard-ceiling sanity check", "config/src/caps.ts", "  if (caps.hardDailyAdSpendUsd < caps.dailyAdSpendUsd) {", "  if (false) {"],
  ["H8 day-above-month sanity check", "config/src/caps.ts", "  if (caps.dailyAiSpendUsd > caps.monthlyAiSpendUsd) {", "  if (false) {"],
  ["H8 narrowed month does not tighten the day", "config/src/caps.ts", "  const dailyUsd = Math.min(narrow(caps.dailyAiSpendUsd, entry?.dailyAiSpendUsd, \"narrowed dailyAiSpendUsd\"), monthlyUsd);", "  const dailyUsd = narrow(caps.dailyAiSpendUsd, entry?.dailyAiSpendUsd, \"narrowed dailyAiSpendUsd\");"],
  // KNOWN UNGUARDED, disclosed rather than faked (ledger L19): removing the
  // `assertCapsCoherent(snapshot, clientId)` call from getCaps changes nothing
  // observable, because every client in the frozen table IS coherent. A guard
  // with no violating input in the repo cannot be caught by mutation, and
  // planting an incoherent client to catch it would ship a bad cap table to
  // make a test go red. The check itself is driven directly and IS caught.
  ["H20 e2e variance expiry", "engine/test/e2e-variance.ts", "  if (phase < E2E_VARIANCE_EXPIRES_AT_PHASE) return true;", "  return true;"],
  // ---- r3 findings fixed in this pass ----
  ["H-03 constitution pattern", "engine/scripts/gate-lib.mjs", "  /^fullburn\\/\\.claude\\//,", "  /^__never__$/,"],
  ["H-03 engine/src pattern", "engine/scripts/gate-lib.mjs", "  /^fullburn\\/engine\\/src\\//,", "  /^__never__$/,"],
  ["H-17 shared touched list", "engine/scripts/gate-lib.mjs", "  const touched = class2TouchedPaths(changedFiles);", "  const touched = changedFiles.filter((f) => isClass2(f.path)).map((f) => ({ path: f.path, status: f.status }));"],
  ["H-07 typeof guard", "engine/src/grade-registry.ts", 'return typeof actual === "number" && Number.isFinite(actual);', "return Number.isFinite(Number(actual));"],
  ["DT-03 inDomain", "engine/src/grade-registry.ts", "  if (t.domainMin !== undefined && actual < t.domainMin) return false;", "  if (false) return false;"],
  ["H-12 own-property recording", "engine/src/transport-brand.ts", "Object.hasOwn(this.#outputs, this.#currentCase) ? this.#outputs[this.#currentCase] : undefined", "this.#outputs[this.#currentCase]"],
  ["R3-CP-08 -z diff (class2)", "engine/scripts/class2-gate.mjs", 'diff --name-status -z -M', 'diff --name-status -M'],
  ["R3-CP-08 -z diff (adversary)", "engine/scripts/adversary-gate.mjs", 'diff --name-status -z -M', 'diff --name-status -M'],

  // ---- r11 findings ----
  // R11-07: the ledger left the instance. Give the production meter its own
  // ledger back and `new FrozenCapsSpendMeter()` per call mints a fresh $5/day
  // again — the measured attack, 300 dispatches against a frozen ceiling.
  ["R11-07 production meter shares the process ledger", "engine/src/spend-meter.ts",
    "    super(processLedger(), narrowing);",
    "    super(new InMemorySpendLedger(() => Date.now(), (c) => effectiveAiCapsUsd(c, narrowing)), narrowing);"],
  // The process ledger is module-scoped. Hand out a fresh one per call and it
  // is the same defect one level down, with `processLedger()` still in place.
  ["R11-07 the process ledger is one object", "engine/src/spend-ledger.ts",
    "export function processLedger(): SpendLedger {\n  return slot();",
    "export function processLedger(): SpendLedger {\n  return new InMemorySpendLedger();"],
  // The reset is R11-07 in a single call. Its fence is the runtime.
  ["R11-07 reset fenced to a test runner", "engine/src/spend-ledger.ts",
    "  if (marker === undefined || marker === null) {",
    "  if (false) {"],

  // R11-04: the sixth shape-assertion trap. The runner's blocking-call check
  // matched call sites BY NAME, so one aliased import went straight past it and
  // restored R9-03 with every structural check green. The binding is resolved
  // now; reverting the resolver to a name match reopens it.
  ["R11-04 blocking calls resolved by binding", "engine/test/blocking-calls.ts",
    "      if (isBlocking) names.push(local);",
    "      if (isBlocking) names.push(impName);"],
  ["R11-04 unresolvable imports are refused", "engine/test/blocking-calls.ts",
    "    unresolvable.push(\"a namespace or default import of child_process cannot be resolved statically\");",
    "    void 0;"],
  // R11-02: the unreachable-guard sweep recorded `something threw`, so eleven of
  // sixteen entries passed with their own guard deleted. It records WHICH guard.
  ["R11-02 the sweep identifies the guard that fired", "engine/test/invariants/invariants.test.ts",
    "        if (!g.expect.test(message)) return `a DIFFERENT guard refused: ${message}`;",
    "        void message;"],
  ["R11-02 the sweep checks the error class", "engine/test/invariants/invariants.test.ts",
    "        if (!(e instanceof g.type)) return `threw ${(e as object)?.constructor?.name ?? typeof e} — not ${g.type.name}`;",
    "        void g.type;"],
  // R11-06/R11-07: the test-only reset must not be reachable from production.
  ["R11-07 no production module names the reset", "engine/test/invariants/invariants.test.ts",
    "    const reaches = (name: string, src: string) => name !== \"spend-ledger.ts\" && src.includes(\"resetProcessLedgerForTests\");",
    "    const reaches = (name: string, src: string) => { void name; void src; return false; };"],

  // ---- r12 findings ----
  // R12-01: the ledger arrived as a public money-write primitive. The
  // arithmetic is inside it now, so a balance moves only through a cap check.
  ["R12-01 the ledger enforces the daily ceiling", "engine/src/spend-ledger.ts",
    "    if (projectedDay > dailyCapMicros) {", "    if (false) {"],
  // Reserved headroom is DERIVED from the open handles. Stored, it needed a
  // setter — and a setter is the primitive R12-01 exploited.
  ["R12-01 reserved headroom counts open handles", "engine/src/spend-ledger.ts",
    "      if (e.day === period || e.month === period) micros += e.micros;",
    "      void e; void period;"],
  // R12-06 / L31(a): the process ledger is keyed process-wide, not per module
  // instance. A module-scoped const let `vi.resetModules()` mint a ceiling.
  ["R12-06 the ledger slot is process-wide", "engine/src/spend-ledger.ts",
    "const LEDGER_SLOT = Symbol.for(\"fullburn.spend-ledger.process\");",
    "const LEDGER_SLOT = Symbol(\"fullburn.spend-ledger.process\");"],
  // R12-07: availability is per client, and a halt is audited.
  ["R12-07 availability is per client", "engine/src/spend-ledger.ts",
    "    if (this.#down.has(clientId)) {", "    if (this.#down.size > 0) {"],
  ["R12-07 a halt requires a reason", "engine/src/spend-ledger.ts",
    "    if (typeof reason !== \"string\" || reason.length === 0) {", "    if (false) {"],
  ["R12-07 a halt requires a client", "engine/src/spend-ledger.ts",
    "    if (typeof clientId !== \"string\" || clientId.length === 0) {\n      throw new MeterUnavailableError(\"setAvailable requires a clientId",
    "    if (false) {\n      throw new MeterUnavailableError(\"setAvailable requires a clientId"],
  ["R12-07 the audit log is a copy", "engine/src/spend-ledger.ts",
    "    return this.#audit.slice();", "    return this.#audit;"],
  // R12-07's cross-tenant READ is closed by construction now: period keys never
  // cross the contract at all, so there is no `assertOwnPeriod` left to mutate.
  // What remains checkable is that a read is scoped to the client asked for.
  ["R12-07 reads are scoped to their client", "engine/src/spend-ledger.ts",
    "      if (e.clientId === clientId) micros += e.micros;", "      micros += e.micros;"],
  // R12-03: three guards that survived their own deletion against all 306
  // tests, with no entry and no disclosure.
  ["R12-03 the anchor takes the median", "engine/src/trusted-clock.ts",
    "  return [...values].sort((a, b) => a - b)[1]!;", "  return values[0]!;"],
  ["R12-03 a non-finite time source is refused", "engine/src/trusted-clock.ts",
    "    if (!Number.isFinite(r.ms)) {", "    if (false) {"],
  ["R12-03 a settle that cannot record refuses to release", "engine/src/gateway.ts",
    "    throw new MeterUnavailableError(\n      `spend was incurred but could not be recorded",
    "    void err;\n    return;\n    throw new MeterUnavailableError(\n      `spend was incurred but could not be recorded"],
  // R12-02: the sweep's POPULATION is read from source, not hand-written.
  ["R12-02 the sweep counts every enumerated guard", "engine/test/invariants/invariants.test.ts",
    "      if (guards.some((entry) => hitsFor(entry).includes(g))) continue;",
    "      if (true) continue;"],
  ["R12-02 the enumerator reads every throw site", "engine/test/money-path-guards.ts",
    "  for (const m of source.matchAll(/throw new (\\w+)\\s*\\(/g)) {",
    "  for (const m of source.matchAll(/throw new (MeterUnavailableError)\\s*\\(/g)) {"],
  // R12-04: the blocking resolver follows local re-exports and every call form.
  ["R12-04 the resolver follows local re-exports", "engine/test/blocking-calls.ts",
    "      childBlocking = blockingExports(child, graph, new Set([...seen, spec]), unresolvable);\n      if (childBlocking.size === 0) continue;",
    "      void child;\n      continue;"],
  // R12-04's entry targeted `isCalled`, which R14-04 replaced entirely: the
  // question is no longer "is it called" but "is it named", because there is no
  // finite list of ways to move a value. Its successor is the R14-04 entry.
  // R12-08: the evidence column reads the summary, not a test title.
  ["R12-08 the evidence column is anchored", "engine/scripts/mutate-lib.mjs",
    "  const SUMMARY = /^[ \\t]+Tests[ \\t]+(\\d[^\\n]*)$/m;", "  const SUMMARY = /Tests\\s+(.*)$/m;"],
  // R12-05 / the standing ledger rule: a row asserting code behaviour carries a
  // test that fails when the assertion goes stale.
  ["R12-05 ledger claims are executed", "engine/test/invariants/invariants.test.ts",
    "        if (!c.holds()) out.push(`${c.row}: ${c.claim}`);", "        void c;"],
  // R11-05 / R12-09: mocking a money-path module is bounded and declared.
  ["R11-05 money-path mocks are declared", "engine/test/invariants/invariants.test.ts",
    "          if (/\\/src\\//.test(target)) found.push({ file: `${prefix}${e.name}`, module: target });",
    "          void target;"],

  // ---- r13 findings ----
  // FOUR r13 ENTRIES WERE REMOVED, AND THE RATIONALE WAS HALF WRONG — recorded
  // here because a rationale nobody revisits is how a coverage gap survives.
  //
  // The stated reason was that a mutation deleting a single assertion inside a
  // test, or targeting a file the unit suite never runs, can only report
  // SURVIVED. The first half stands. The SECOND half was the defect: R14-06
  // deleted all three of the SIGINT drill's detection paths and `npm run drill`
  // still reported PASS, which means the drill file was not merely un-mutatable
  // — it was UNPROVEN. The right move was never "drop the entry", it was
  // "extract the decision so it can be tested".
  //
  // Done: `engine/test/post-signal-writes.ts` holds the drill's decision, with
  // six red-proofs in the default suite and two entries below. The two removed
  // drill entries are therefore restored in substance, on a surface the suite
  // can actually reach. The two that deleted a lone assertion inside a test stay
  // out, and that half of the rationale is still right. (L19/L23's rule: an
  // entry that always survives is noise, and noise in this table is how R9-01
  // hid.)
  // R13-01: `reserve(-N)` + `settle` was a balance setter assembled from two
  // contract calls. The sign is validated at the boundary now.
  ["R13-01 the reservation sign is validated", "engine/src/spend-ledger.ts",
    "    if (!Number.isSafeInteger(micros) || micros <= 0) {", "    if (false) {"],
  // The ceilings are resolved INSIDE the ledger, from the frozen table.
  ["R13-01 the ledger resolves its own ceilings", "engine/src/spend-ledger.ts",
    "    const caps = this.#capsFor(clientId, narrowing);", "    const caps = narrowing?.[clientId] ?? this.#capsFor(clientId, narrowing);"],
  // The periods are the ledger's, computed from ITS clock and the client zone.
  ["R13-01 the ledger computes its own periods", "engine/src/spend-ledger.ts",
    "    const nowMs = this.#now();", "    const nowMs = 0;"],
  ["R13-01 the high-water ratchet is internal and forward-only", "engine/src/spend-ledger.ts",
    "    if (seen !== undefined && day < seen) {", "    if (false) {"],
  // R13-02: the process slot refuses an occupant it did not create.
  ["R13-02 the ledger slot refuses a foreign occupant", "engine/src/spend-ledger.ts",
    "    if (!marked) {", "    if (false) {"],
  ["R13-02 the production ledger is frozen", "engine/src/spend-ledger.ts",
    "  Object.freeze(fresh);", "  void fresh;"],
  // R13-03: the disclosed residual carries a measuring test.
  // R13-04: an unseen local module is unresolvable, not clean — trap #8.
  ["R13-04 an unseen module is unresolvable", "engine/test/blocking-calls.ts",
    "      if (child === undefined) {\n        unresolvable.push(`import from \"${spec}\" could not be followed — the module was not supplied`);\n        continue;\n      }",
    "      if (child === undefined) {\n        continue;\n      }"],
  // R13-05: the drill watches FILES after the signal, not the marker's path.
  // R13-06: the population is derived from the import graph, and coverage is
  // one-to-one rather than a substring match.
  ["R13-06 the guard population follows imports", "engine/test/money-path-guards.ts",
    "      const next0 = resolveSpecifier(spec, file);\n      if (next0 !== null) stack.push(next0);",
    "      const next0 = resolveSpecifier(spec, file);\n      void next0;"],
  ["R13-06 coverage is one-to-one", "engine/test/invariants/invariants.test.ts",
    "      enumerated.filter((g) => g.file === entry.file && entry.expect.test(g.signature));",
    "      enumerated.filter((g) => g.file === entry.file && entry.expect.test(g.signature)).slice(0, 1);"],
  // R13-07: ledger claims are DRIVEN, not grepped.
  // R13-09 / R13-10: both enumeration walks are recursive and cover every
  // extension / every workspace test tree.
  ["R13-09 the reset walk is recursive", "engine/test/invariants/invariants.test.ts",
    "        if (e.dir) {\n          walkWith(list, read, `${dir}${e.name}/`, `${prefix}${e.name}/`, hit, count);\n          continue;\n        }",
    "        if (e.dir) {\n          continue;\n        }"],
  ["R13-09 the reset walk covers every module extension", "engine/test/invariants/invariants.test.ts",
    "        if (!/\\.(?:ts|mts|cts|js|mjs|cjs)$/.test(e.name)) continue;\n        count();",
    "        if (!/\\.ts$/.test(e.name)) continue;\n        count();"],
  ["R13-10 the mock walk covers every test tree", "engine/test/invariants/invariants.test.ts",
    "    const perRoot = testRoots.map((r) => {", "    const perRoot = [testRoots[0]!].map((r) => {"],

  // ---- r14 findings ----
  // R14-12: a refusal traced the RESERVED amount as costUsd, including
  // refusals whose reservation was released and never charged.
  ["R14-12 the trace reports what was committed", "engine/src/gateway.ts",
    "        costUsd: committedUsd,", "        costUsd: reservation?.amountUsd ?? 0,"],
  // R14-04 (trap #9): value flow, not invocation form; and the braced default.
  ["R14-04 a blocking binding may not be referenced", "engine/test/blocking-calls.ts",
    "  return scan.names.filter((n) => isReferenced(n, slice));",
    "  return scan.names.filter((n) => new RegExp(String.raw`\\b${n}\\s*\\(`).test(slice));"],
  ["R14-04 a braced default import is refused", "engine/test/blocking-calls.ts",
    "    unresolvable.push(\"a braced default import of child_process cannot be resolved statically\");",
    "    void 0;"],
  // R14-07: an ambiguous mutation target is refused, not applied to the first
  // match — two entries were reverting the same line.
  ["R14-07 an ambiguous target fails closed", "engine/scripts/mutate-lib.mjs",
    "  if (source.indexOf(from, at + 1) !== -1) {", "  if (false) {"],
  // R14-08: a resume must name the halt it lifts.
  ["R14-08 a resume names the halt it lifts", "engine/src/spend-ledger.ts",
    "      if (halt !== undefined && !reason.includes(halt)) {", "      if (false) {"],
  // R14-03: the population refuses what it cannot follow, reads side-effect
  // imports, and does not invent modules from prose.
  ["R14-03 unfollowable constructs are refused", "engine/test/money-path-guards.ts",
    "    if (NOT_A_GUARD.some((f) => f.pattern.test(after))) continue;",
    "    if (true) continue;"],
  ["R14-03 the import scan is anchored to a statement", "engine/test/money-path-guards.ts",
    "      /(?:^|;)[ \\t]*(?:import|export)\\b[^;]*?from[ \\t]+[\"']([^\"']+)[\"']|(?:^|;)[ \\t]*import[ \\t]+[\"']([^\"']+)[\"']/gm,",
    "      /from[ \\t]+[\"']([^\"']+)[\"']|(?:^|;)[ \\t]*import[ \\t]+[\"']([^\"']+)[\"']/gm,"],
  ["R14-03 comments are blanked, not deleted", "engine/test/money-path-guards.ts",
    "  // so a refusal can name the line a reader will find in the file.\n  const blank = (t: string) => t.replace(/[^\\n]/g, \" \");",
    "  // so a refusal can name the line a reader will find in the file.\n  const blank = () => \"\";"],
  // R14-06: the drill's decision is a tested pure function now.
  ["R14-06 a post-signal write is reported", "engine/test/post-signal-writes.ts",
    "    if (now === inputs.originals.get(file)) continue;\n    offenders.push(file);",
    "    if (now === inputs.originals.get(file)) continue;\n    void file;"],
  ["R14-06 a restore is not a violation", "engine/test/post-signal-writes.ts",
    "    if (now === inputs.originals.get(file)) continue;", "    if (false) continue;"],
  // R14-05: money-path error identities are stable across module instances.
  ["R14-05 the error identity is registry-stable", "engine/src/money-errors.ts",
    "  const existing = g[slot];\n  if (existing !== undefined) return existing;",
    "  const existing = g[slot];\n  void existing;"],

  // R14-01's ruling: the out-of-process cap is the PRIMARY control, and its
  // proof is that a refusal survives an absent ledger and reaches the caller.
  // ---- runner audit (HANDOFF §7.2, the R14-06 rule applied to every runner) ----
  //
  // Seven decisions were living inside a runner, where the default suite could
  // not reach them. Every one was MEASURED surviving a one-line revert with
  // `npm test` green at 354/354 before it was extracted. These entries are what
  // keep the extractions honest.
  ["RA-01 leak-check CLI verdict wiring", "engine/scripts/leak-check.mjs", "  if (!verdict.ok) {", "  if (false) {"],
  ["RA-02 leak scan reads every text type", "engine/scripts/scan-lib.mjs",
    "  png: \"binary raster image\",",
    "  ts: \"binary raster image\",\n  png: \"binary raster image\","],
  ["RA-03 leak scan walks the source tree", "engine/scripts/scan-lib.mjs",
    "export const SKIP_DIRS = new Set([\"node_modules\", \"dist\", \".git\"]);",
    "export const SKIP_DIRS = new Set([\"node_modules\", \"dist\", \".git\", \"src\", \"scripts\"]);"],
  ["RA-04 leakVerdict fails closed on a non-result", "engine/scripts/scan-lib.mjs", "  if (!Array.isArray(findings)) {", "  if (false) {"],
  ["RA-05 binary is decided by bytes", "engine/scripts/scan-lib.mjs", "  return head.includes(0);", "  return true;"],
  ["RA-06 a report answers only for its own phase", "engine/scripts/gate-lib.mjs",
    "  const re = new RegExp(`^ADVERSARY_REPORT_phase${String(phase).replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\")}(?:[._-].*)?\\\\.md$`);",
    "  const re = /^ADVERSARY_REPORT_phase/;"],
  ["RA-07 an approval must ARRIVE with its change", "engine/scripts/gate-lib.mjs", "      f.status === \"added\" &&\n", "      true &&\n"],
  ["RA-08 the verified tree covers the CI", "engine/scripts/gate-lib.mjs", "  \"fullburn/\",\n  \".github/\",", "  \"fullburn/\","],
  ["RA-09 an unstaged edit is dirty", "engine/scripts/gate-lib.mjs",
    "    .filter((l) => l.startsWith(\"??\") || l[1] !== \" \");",
    "    .filter((l) => l.startsWith(\"??\"));"],
  ["RA-10 caught and survived are one expression", "engine/scripts/mutate-lib.mjs",
    "  return failure === null ? \"SURVIVED\" : \"CAUGHT\";",
    "  return failure === null ? \"CAUGHT\" : \"SURVIVED\";"],
  // `diff-lib.mjs` turns a git diff into the protected-path set — R3-CP-08's
  // fix — and carried NO entry at all. The runner sweep found that on its first
  // run, which is the sweep working as intended.
  ["RA-11 a rename keeps both of its paths", "engine/scripts/diff-lib.mjs",
    "      out.push(code.startsWith(\"R\") ? { status: \"renamed\", oldPath, path } : { status: \"added\", path });",
    "      out.push({ status: code.startsWith(\"R\") ? \"renamed\" : \"added\", path });"],
  ["RA-12 a NUL-separated delete is a delete", "engine/scripts/diff-lib.mjs",
    "    const path = f[i++];\n    if (code === \"A\") out.push({ status: \"added\", path });\n    else if (code === \"D\") out.push({ status: \"deleted\", path });",
    "    const path = f[i++];\n    if (code === \"A\") out.push({ status: \"added\", path });\n    else if (code === \"D\") out.push({ status: \"modified\", path });"],
  // The CLI wiring itself: the library can be right and the runner still not
  // call it. That is N-03 leg B, and it is why each extraction gets two entries.
  ["RA-13 adversary-gate consults the phase selection", "engine/scripts/adversary-gate.mjs",
    "  ? selectPhaseReports(phase, readdirSync(reportsDir)).map((n) => ({",
    "  ? readdirSync(reportsDir).map((n) => ({"],
  ["RA-14 class2-gate consults the approval selection", "engine/scripts/class2-gate.mjs",
    "const approvalDocs = selectApprovalDocs(changedFiles)",
    "const approvalDocs = changedFiles"],
  // The sweep itself must be able to go red, or it is decoration.
  ["RA-15 the runner sweep enumerates from the filesystem", "engine/test/invariants/invariants.test.ts",
    "    return [...scripts, ...drills].sort();",
    "    return [...drills].sort();"],
  // REPLACED, NOT DELETED. The first spelling of this entry mutated the
  // assertion to `.toBe(matches !== undefined)` — which is `true`, a semantic
  // no-op — and SURVIVED for a harness reason rather than an unprotected one.
  // A no-op entry is a broken entry: it is replaced with a real revert, and the
  // check it targets was given the negative case it never had.
  ["RA-16 the runner sweep can answer NO", "engine/test/invariants/invariants.test.ts",
    "  const inDefaultSuite = (include: readonly string[], path: string): boolean =>\n    include.some((glob) =>",
    "  const inDefaultSuite = (include: readonly string[], path: string): boolean =>\n    true || include.some((glob) =>"],
  // ---- haven investigation follow-up (human rulings 2026-08-22) ----
  //
  // The derived coverage test had skip clauses of its own. It asked a FILENAME
  // predicate, so a tracked file inside a skipped DIRECTORY read as covered and
  // was never opened — and it silently dropped anything it could not stat. Both
  // are removed; these keep them removed.
  ["RA-17 coverage is measured by the WALK, not by a filename", "engine/test/scan-lib.test.ts",
    "      if (visited.has(f)) continue;",
    "      if (isScannedFile(f.split(\"/\").pop()!)) continue;"],
  ["RA-18 a path the scan cannot open is reported, not skipped", "engine/test/scan-lib.test.ts",
    "        unreadable.push(`${f} — tracked but not a readable regular file: ${(e as Error).message}`);",
    "        void e;"],
  ["RA-19 the L35 scope claim derives the verified set", "engine/test/invariants/invariants.test.ts",
    "          const verifiedTops = dirs(gitOut([\"ls-files\", \"-z\", \"--\", ...gateLib.VERIFIED_TREE_SCOPE]));",
    "          const verifiedTops = allTops;"],
  ["RA-20 the L35 scope claim derives the scanned set", "engine/test/invariants/invariants.test.ts",
    "            if (d !== null) scannedTops.add(d);",
    "            if (d === \"fullburn\") scannedTops.add(d);"],
  // ---- §7.5 / §7.6 rulings 2026-08-22 ----
  //
  // The corpus is the acceptance bar for the secret rules and was authored from
  // the FORMATS, never from the expressions. These keep it load-bearing.
  ["RA-21 every credential in the corpus is detected", "engine/scripts/scan-lib.mjs",
    "  { name: \"npm auth token\", re: /\\b_authToken\\s*=\\s*\"?(?:npm_[A-Za-z0-9]{20,}|[A-Za-z0-9+/=_-]{32,})\"?/ },",
    "  { name: \"npm auth token\", re: /^__never__$/ },"],
  ["RA-22 a placeholder does not flag", "engine/scripts/scan-lib.mjs",
    "  { name: \"pgpass entry\", re: /^[^\\s:#]+:\\d{2,5}:[^\\s:]*:[^\\s:]+:(?!\\$|<|your[_-])\\S{8,}$/m },",
    "  { name: \"pgpass entry\", re: /^[^\\s:#]+:\\d{2,5}:[^\\s:]*:[^\\s:]+:\\S{3,}$/m },"],
  // REPLACED: the first spelling mutated the clause inline and SURVIVED, because
  // every real rule is load-bearing and the check had no negative case among
  // real inputs. The check is a function now, driven by a ruleset that HAS an
  // idle rule, and this entry targets that function.
  ["RA-23 the corpus red-proof requires every rule to bite", "engine/test/credential-corpus.test.ts",
    "        (e) => detected(e, all).length > 0 && detected(e, without).length === 0,",
    "        (e) => detected(e, all).length > 0,"],
  ["RA-24 scanContent and the corpus share one detection expression", "engine/scripts/scan-lib.mjs",
    "  for (const name of secretRuleHits(path, content)) {",
    "  for (const name of []) {"],
  // Workflow hygiene: the two standing rules, as code.
  ["RA-25 no action by mutable tag", "engine/test/invariants/invariants.test.ts",
    "        if (!SHA_PINNED.test(ref)) {",
    "        if (false) {"],
  ["RA-26 no workflow grants actions: write", "engine/test/invariants/invariants.test.ts",
    "      for (const m of src.matchAll(/^\\s*actions:\\s*(write|read-all|write-all)\\s*$/gm)) {",
    "      for (const m of []) {"],
  ["RA-27 fullburn-ci states its own permissions", ".github/workflows/fullburn-ci.yml",
    "permissions:\n  contents: read",
    "# permissions removed"],
  // Anchored on the ONE checkout in this file that is not followed by `with:`.
  // The first spelling matched three sites and `applyEntry` refused it as
  // ambiguous — which is R14-07's fail-closed behaviour working as designed.
  // Anchored on the ONE action reference in this file that is unique. Every
  // checkout and setup-node line is now byte-identical, so any anchor built
  // from them is ambiguous and `applyEntry` refuses it — R14-07 working.
  ["RA-28 the gate's actions stay SHA-pinned", ".github/workflows/fullburn-ci.yml",
    "        uses: gitleaks/gitleaks-action@cb7149a9b57195b609c63e8518d2c6056677d2d0 # v2.3.3",
    "        uses: gitleaks/gitleaks-action@v2"],
  // ---- §7.0 item 2: the trigger's paths filter moved inside the job ----
  ["CS-01 an undeterminable diff runs the gate", "engine/scripts/ci-scope.mjs",
    "  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return true;",
    "  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return false;"],
  // REPOINTED 2026-09-20, not deleted: the one-line array became a multi-line
  // one when `.claude/**` joined it (L39), so the old target text ceased to
  // exist. Same property — `.github` must be in the gate's scope — new address.
  ["CS-02 the gate's scope covers .github", "engine/scripts/ci-scope.mjs",
    '  "fullburn/**",\n  ".github/**",',
    '  "fullburn/**",'],
  ["CS-03 a failed diff is null, not empty", "engine/scripts/ci-scope.mjs",
    "  } catch {\n    return null;\n  }",
    "  } catch {\n    return [];\n  }"],
  ["CS-04 a rename is in scope by both paths", "engine/scripts/ci-scope.mjs",
    "      e.oldPath === undefined ? [e.path] : [e.oldPath, e.path],",
    "      [e.path],"],
  ["CS-05 the trigger carries no paths filter", ".github/workflows/fullburn-ci.yml",
    "on:\n  push:\n    branches: [\"**\"]\n  pull_request:",
    "on:\n  push:\n    branches: [\"**\"]\n    paths: [\"fullburn/**\"]\n  pull_request:"],
  // SURVIVED on its first run: nothing asserted the absence of a job-level
  // `if:`, so reinstating one left the suite green. The workflow-hygiene
  // checker now reports it, with a fixture negative case.
  ["CS-06 the gate jobs report rather than skip", ".github/workflows/fullburn-ci.yml",
    "  adversary-gate:\n    # NO JOB-LEVEL `if:`.",
    "  adversary-gate:\n    if: github.event_name == 'pull_request'\n    # NO JOB-LEVEL `if:`."],
  ["CS-07 the isolation exclusions cannot grow quietly", "package.json",
    "vitest run --no-isolate --exclude '**/departed-contract.test.ts' --exclude '**/ledger-slot.test.ts'",
    "vitest run --no-isolate --exclude '**/departed-contract.test.ts' --exclude '**/ledger-slot.test.ts' --exclude '**/locks-r12.test.ts'"],
  // ---- the adversary's discovery mirror (L39, 2026-09-20) ----
  //
  // The mirror at the repo root is discovered; the source in fullburn/ is
  // reviewed. These keep them the same file and keep the mirror as gated as
  // the source — the hole a bare copy would have opened.
  ["AD-01 the mirror cannot drift from the source", ".claude/agents/engine-adversary.md",
    "You are the adversary. You are not the builder's teammate",
    "You are the adversary. You are the builder's teammate"],
  // AD-02/03/04 were anchored on the line BELOW `.claude`; the DONE.md commit
  // inserted its own line there and all three went stale for two commits, unseen
  // until the first `done` run's C5 (2026-09-20). The default suite now checks
  // the table against the tree on every run — see invariants "every mutation
  // entry resolves to exactly one site".
  ["AD-02 the root .claude tree is Class-2", "engine/scripts/gate-lib.mjs",
    "  /^\\.claude\\//,\n  // THE COMPLETION CONTRACT",
    "  // THE COMPLETION CONTRACT"],
  ["AD-03 the root .claude tree is in the CI scope", "engine/scripts/ci-scope.mjs",
    '  ".claude/**",\n  "DONE.md",\n  // The primary secret scanner',
    '  "DONE.md",\n  // The primary secret scanner'],
  ["AD-04 the root .claude tree is in the verified tree", "engine/scripts/gate-lib.mjs",
    '  ".claude/",\n  "DONE.md",\n  // The primary scanner\'s configuration (X3-06)',
    '  "DONE.md",\n  // The primary scanner\'s configuration (X3-06)'],
  ["AD-05 the root .claude tree has a CODEOWNER", ".github/CODEOWNERS",
    "/.claude/                           @ssb22inc\n",
    ""],
  // ---- DONE.md §3: the completion checker (2026-09-20) ----
  //
  // "A completion checker that cannot fail is the r9 defect at the top level."
  // Every decision the checker makes has a negative case; these keep them.
  ["DN-01 the verdict is not PASS with a failing sub-condition", "engine/scripts/done-lib.mjs",
    "  const failing = flat.filter((r) => r.status !== \"PASS\").map((r) => r.id);",
    "  const failing = (results ?? []).filter((r) => r.status !== \"PASS\").map((r) => r.id);"],
  ["DN-02 an empty result set is not a pass", "engine/scripts/done-lib.mjs",
    "  return { ok: flat.length > 0 && failing.length === 0, failing };",
    "  return { ok: failing.length === 0, failing };"],
  ["DN-03 the meta-check demands a demonstrated flip", "engine/scripts/done-lib.mjs",
    "  if (before !== \"PASS\") problems.push(",
    "  if (false) problems.push("],
  ["DN-04 the meta-check demands the checker see a failure", "engine/scripts/done-lib.mjs",
    "  if (after !== \"FAIL\") problems.push(",
    "  if (false) problems.push("],
  ["DN-05 a harness result without its meta-check is void", "engine/scripts/done-lib.mjs",
    "  if (!p.metaNegative || !p.metaPositive || p.metaFailure || p.canariesOk === false) {",
    "  if (false) {"],
  ["DN-06 a dirty tree is refused", "engine/scripts/done-lib.mjs",
    "  if (dirty.length > 0) {",
    "  if (false) {"],
  ["DN-07 a Claude family is not cross-family", "engine/scripts/done-lib.mjs",
    "  return !/claude|anthropic/i.test(family);",
    "  return true;"],
  // DN-08 replaced 2026-10-06: the human ack parser it mutated was removed by
  // the human's ruling (L50); the automated ack takes its place.
  ["DN-08 the automated gate ack needs a C3 PASS", "engine/scripts/done-lib.mjs",
    '  if (!crossFamily || crossFamily.status !== "PASS") {',
    "  if (!crossFamily) {"],
  ["DN-09 the permitted sentence is the contract's", "engine/scripts/done-lib.mjs",
    "Money-cap changes approved under your identity; every other gate decided by the automated adversary.`;",
    "Money-cap changes approved; every other gate decided by the automated adversary.`;"],
  ["DN-10 DONE.md is Class-2", "engine/scripts/gate-lib.mjs",
    "  /^DONE\\.md$/,\n  // Money, the grader",
    "  // Money, the grader"],
  ["DN-11 DONE.md is in the CI scope", "engine/scripts/ci-scope.mjs",
    '  "DONE.md",\n  // The primary secret scanner',
    '  // The primary secret scanner'],
  ["DN-12 DONE.md is in the verified tree", "engine/scripts/gate-lib.mjs",
    '  ".claude/",\n  "DONE.md",\n  // The primary scanner\'s configuration (X3-06)',
    '  ".claude/",\n  // The primary scanner\'s configuration (X3-06)'],
  ["DN-13 DONE.md has a CODEOWNER", ".github/CODEOWNERS",
    "/DONE.md                            @ssb22inc\n",
    ""],
  // The runaway of 2026-09-20: without this guard, DN-14 made the checker
  // nest inside its own suite five levels deep. Structural, not a check.
  ["DN-15 the checker never runs inside a test worker or another done run", "engine/scripts/done.mjs",
    "  if (process.env.VITEST || process.env.FULLBURN_DONE_ACTIVE) {",
    "  if (false) {"],
  ["DN-14 the checker refuses before it measures", "engine/scripts/done.mjs",
    "    if (refusals.length > 0) {\n      console.error(\"DONE: REFUSED\\n  \" + refusals.join(\"\\n  \"));\n      process.exit(2);\n    }",
    "    if (refusals.length > 0) {\n      console.error(\"DONE: REFUSED\\n  \" + refusals.join(\"\\n  \"));\n    }"],
  // The table-vs-tree check (2026-09-20) and the checker naming what it found.
  ["SE-01 an ambiguous target is stale, not a coin flip", "engine/scripts/mutate-lib.mjs",
    "    if (r.at === -1) stale.push({ name, file, why: r.ambiguous ? \"ambiguous target\" : \"pattern not found\" });",
    "    if (r.at === -1 && !r.ambiguous) stale.push({ name, file, why: \"pattern not found\" });"],
  ["DN-16 the checker names every stale entry", "engine/scripts/done-lib.mjs",
    "    stale: [...s.matchAll(STALE_LINE)].map((m) => m[1]),",
    "    stale: [],"],
  // ---- §2.1.7 lint gate (human ruling 2026-09-22) ----
  //
  // Each rule is a lock only if turning it off goes red; the integration suite
  // plants a floating and a misused promise and expects the linter to refuse.
  ["LT-01 no-floating-promises is an error", "eslint.config.mjs",
    '  "@typescript-eslint/no-floating-promises": "error",',
    '  "@typescript-eslint/no-floating-promises": "off",'],
  ["LT-02 no-misused-promises is an error", "eslint.config.mjs",
    '  "@typescript-eslint/no-misused-promises": "error",',
    '  "@typescript-eslint/no-misused-promises": "off",'],
  ["DN-18 a failed meta-check's reason reaches the C5 row", "engine/scripts/done-lib.mjs",
    "    metaFailure: metaFailure ? metaFailure[1].trim() : null,",
    "    metaFailure: null,"],
  ["DN-17 the checker's lint condition fails on a non-zero exit", "engine/scripts/done-lib.mjs",
    "  if (code !== 0 || errorLines.length > 0) {",
    "  if (errorLines.length > 0) {"],
  // ---- §2.1.3 cross-family read (human ruling 2026-09-22) ----
  //
  // The reviewer is pinned and read back; a stand-in cannot mint a PASS; a
  // PASS with findings is a FAIL; the header is what the gate parsers read.
  ["XF-01 the served model must be the pinned reviewer", "engine/scripts/cross-family-lib.mjs",
    '  if (served !== requested) return { ok: false, reason: `served model "${served}" is not the pinned reviewer "${requested}"` };',
    "  // (served-model check removed)"],
  ["XF-02 a PASS with findings is a FAIL", "engine/scripts/cross-family-lib.mjs",
    '  if (review.findings.length > 0) return { verdict: "FAIL", why:',
    '  if (false) return { verdict: "FAIL", why:'],
  ["XF-03 a stand-in endpoint cannot mint a PASS", "engine/scripts/cross-family-lib.mjs",
    '  if (endpoint !== PRODUCTION_ENDPOINT) return { verdict: "FAIL", why:',
    '  if (false) return { verdict: "FAIL", why:'],
  ["XF-04 the report names the reviewer family on line 5", "engine/scripts/cross-family-lib.mjs",
    '  lines.push(`Reviewer-family: ${REVIEWER_FAMILY_LINE}`);',
    '  lines.push(`Reviewer: ${REVIEWER_FAMILY_LINE}`);'],
  ["XF-06 allow-dirty is honoured only off the production router", "engine/scripts/cross-family-lib.mjs",
    "  if (allowDirty && endpoint !== PRODUCTION_ENDPOINT) return null;",
    "  if (allowDirty) return null;"],
  ["XF-05 no key means no read and no report", "engine/scripts/cross-family-read.mjs",
    "  if (!dryRun && !key) {",
    "  if (false) {"],
  // ---- cross-family round x1 (GPT-6 Astra, 2026-09-24) ----
  //
  // Each fix below removes a capability the reviewer named; each entry puts
  // it back and the suite must go red.
  ["X1-07 the staleness check reads through the harness marker", "engine/scripts/mutate-lib.mjs",
    "  if (!marker || typeof marker.path !== \"string\" || typeof marker.original !== \"string\") return read;",
    "  return read;"],
  ["X1-04 a repo-root harness target is recoverable", "engine/scripts/mutate-lib.mjs",
    "  const inWorkspace = resolve(record.path).startsWith(`${WORKSPACE}/`) || (rootRel !== null && ROOT_TARGETS.test(rootRel));",
    "  const inWorkspace = resolve(record.path).startsWith(`${WORKSPACE}/`);"],
  ["X1-02 the lint config is Class-2", "engine/scripts/gate-lib.mjs",
    "  /^fullburn\\/(?:eslint|biome)\\.config\\.[cm]?[jt]s$/,",
    "  // (lint config pattern removed)"],
  ["X1-03 review artifacts are Class-2", "engine/scripts/gate-lib.mjs",
    "  /^fullburn\\/reports\\/(?:ADVERSARY_REPORT_|DONE_)/,",
    "  // (review artifact pattern removed)"],
  ["X1-05 the gateway origin is pinned before the vault is read", "engine/src/gateway.ts",
    "  if (u.origin !== AI_GATEWAY_ORIGIN || !u.pathname.startsWith(\"/v1/\") || u.username !== \"\" || u.password !== \"\") {",
    "  if (false) {"],
  ["X1-10 the serving path validates its bindings", "engine/src/gateway.ts",
    "    validateBindings(deps.bindings);\n    /** NO PASS, NO BIND",
    "    /** NO PASS, NO BIND"],
  ["X1-08a a provider output carrying a credential is refused", "engine/src/gateway.ts",
    "    if (containsSecret(output, secrets)) {",
    "    if (false) {"],
  ["X1-08b an error's name is redacted", "engine/src/redact.ts",
    "      return { name: redactText(typeof obj.name === \"string\" ? obj.name : \"Error\", secrets), message:",
    "      return { name: typeof obj.name === \"string\" ? obj.name : \"Error\", message:"],
  // X1-13 re-targeted 2026-10-06: since X5-10 the pass that binds is graded in
  // config, and runEval's own comparison only words the failure messages, so
  // the entry on it SURVIVED (measured: full harness at 8aea8f0).
  ["X1-13 expected fields compare structurally", "config/src/golden-sets.ts",
    "  return Object.entries(gcase.expected).every(([k, v]) => structurallyEqual((output as Record<string, unknown>)[k], v));",
    "  return Object.entries(gcase.expected).every(([k, v]) => (output as Record<string, unknown>)[k] === v);"],
  ["X1-17 no Node API at module load in the clock", "engine/src/trusted-clock.ts",
    "  hrtime: typeof process !== \"undefined\" && typeof process.hrtime?.bigint === \"function\" ? process.hrtime.bigint.bind(process.hrtime) : null,",
    "  hrtime: process.hrtime.bigint.bind(process.hrtime),"],
  ["X1-12 C8 is the class-2 gate's decision, not a count", "engine/scripts/done-lib.mjs",
    "  const ok = gate !== null && typeof gate === \"object\" && gate.ok === true;",
    "  const ok = Number.isInteger(owed) && owed === 0;"],
  // ---- cross-family round x2 (GPT-6 Astra, 2026-09-24) ----
  ["X2-02 a live marker is another run, not a crash", "engine/scripts/mutate-lib.mjs",
    "  if (isAlive(record.pid)) {",
    "  if (false) {"],
  ["X2-04 the primary scanner's configuration is Class-2", "engine/scripts/gate-lib.mjs",
    "  /^\\.gitleaks(?:\\.toml|ignore)$/,\n  /^fullburn\\/\\.gitleaks(?:\\.toml|ignore)$/,",
    "  // (gitleaks config patterns removed)"],
  ["X2-05 the cross-family runner scrubs the key from everything it writes", "engine/scripts/cross-family-read.mjs",
    'const scrub = (text) => (KEY.length >= 8 ? String(text).split(KEY).join("[redacted]") : String(text));',
    "const scrub = (text) => String(text);"],
  ["X2-06 a credential at any depth is refused", "engine/src/gateway.ts",
    "    if (containsSecret(output, secrets)) {",
    "    if (JSON.stringify(redactValue(output, secrets)) !== JSON.stringify(redactValue(output, []))) {"],
  ["X2-07 a money error is rebuilt, never handed back", "engine/src/gateway.ts",
    "      ? redactMoneyError(err, secrets)",
    "      ? err"],
  ["X2-11a every canary must report ok", "engine/scripts/done-lib.mjs",
    "  if (!p.metaNegative || !p.metaPositive || p.metaFailure || p.canariesOk === false) {",
    "  if (!p.metaNegative || !p.metaPositive || p.metaFailure) {"],
  ["X2-11b a non-zero harness exit is a FAIL", "engine/scripts/done-lib.mjs",
    "  if (exitCode !== 0) return { status: \"FAIL\", observed:",
    "  if (false) return { status: \"FAIL\", observed:"],
  ["X2-12 a cross-family report never answers for the same-family review", "engine/scripts/done-lib.mjs",
    "    if (family !== null && isNonClaudeFamily(family)) cross.push(r);\n    else same.push(r);",
    "    if (family !== null && isNonClaudeFamily(family)) cross.push(r);\n    same.push(r);"],
  ["X2-13 the origin check precedes the priming vault read", "engine/src/gateway.ts",
    "    assertGatewayBase(deps.gatewayBaseUrl);\n\n    // Prime the redaction set",
    "    // Prime the redaction set"],
  ["X2-15 audit entries are frozen", "engine/src/spend-ledger.ts",
    "    this.#audit.push(Object.freeze({ clientId, available, reason, seq: this.nextSeq() }));",
    "    this.#audit.push({ clientId, available, reason, seq: this.nextSeq() });"],
  ["X2-17 an unresolved import is refused, not skipped", "engine/test/money-path-guards.ts",
    "  return moneyPathModules(root, exists, read).flatMap((f) => [...unfollowable(f, read(f)), ...unresolvedImports(f, read(f), exists)]);",
    "  return moneyPathModules(root, exists, read).flatMap((f) => unfollowable(f, read(f)));"],
  // ---- cross-family round x4 (GPT-6 Astra, 2026-10-04) ----
  ["X4-02 sibling builds are not Fullburn Class-2", "engine/scripts/gate-lib.mjs",
    "  /^(?:fullburn\\/(?:[^/]+\\/)*)?package\\.json$/,",
    "  /(?:^|\\/)package\\.json$/,"],
  ["X4-02b the root .gitignore is in the verified tree", "engine/scripts/gate-lib.mjs",
    '  ".gitignore",\n  ":!fullburn/reports/",',
    '  ":!fullburn/reports/",'],
  // X4-03 re-targeted 2026-10-06: the rename-aside takeover it locked was
  // replaced (X5-11); what remains of X4-03 is "created with its content".
  ["X4-03 the lock is created with its owner's pid", "engine/scripts/mutate-lib.mjs",
    "  fs.writeFileSync(tmp, String(pid));\n  try {\n    try {\n      fs.linkSync(tmp, lockPath);",
    "  fs.writeFileSync(tmp, \"\");\n  try {\n    try {\n      fs.linkSync(tmp, lockPath);"],
  ["X5-11a a stale takeover needs the takeover mutex", "engine/scripts/mutate-lib.mjs",
    "      fs.linkSync(tmp, mutex);",
    "      void mutex;"],
  ["X5-11b a stale lock is replaced atomically, never left absent", "engine/scripts/mutate-lib.mjs",
    "      fs.renameSync(tmp, lockPath);",
    "      fs.unlinkSync(lockPath); fs.linkSync(tmp, lockPath);"],
  ["X4-05 the success trace uses the identity checked at entry", "engine/src/gateway.ts",
    "      traceId: redactText(traceId, secrets),\n      clientId: redactText(clientId, secrets),\n      role,",
    "      traceId: req.trace.traceId,\n      clientId: req.clientId,\n      role,"],
  ["X4-05b a TraceContext is frozen", "engine/src/tracing.ts",
    "    Object.freeze(this);",
    "    void 0;"],
  ["X4-06 the output is returned as a plain-data clone", "engine/src/gateway.ts",
    "    output = plain;",
    "    void plain;"],
  ["X4-11 the grade is computed from the traced snapshot", "engine/src/grade-registry.ts",
    "    grades = computeGrades(traced as MetricSnapshot);",
    "    grades = computeGrades(snapshot);"],
  ["X4-12 cleanup spares a live writer's canary", "engine/scripts/done-lib.mjs",
    "  return pid === selfPid || !isAlive(pid);",
    "  return true;"],
  // ---- DONE.md §2.1.6: EACH ENUMERATED GUARD DISABLED INDIVIDUALLY (2026-10-04) ----
  //
  // Cross-family finding X4-10: C6 reported PASS with the sentence "the
  // disabled-individually-and-caught half is C5's per-guard entries", and 50 of
  // 85 enumerated money-path guards had no entry that disabled them. Each entry
  // below turns one guard's `throw` into a no-op (`void new …`), so the guard
  // sweep — which drives every guard with an input written to make it fire —
  // must go red. The invariant "every enumerated money-path guard has its own
  // disabling entry" keeps this list complete from now on.
  ["G6-01 caps.ts — clientId required for cap lookup", "config/src/caps.ts",
    "    throw new CapError(\"clientId required for cap lookup\");",
    "    void new CapError(\"clientId required for cap lookup\");"],
  ["G6-02 caps.ts — no caps configured for client \" \" — spend is forbidden", "config/src/caps.ts",
    "    throw new CapError(`no caps configured for client \"${clientId}\" — spend is forbidden`);",
    "    void new CapError(`no caps configured for client \"${clientId}\" — spend is forbidden`);"],
  ["G6-03 caps.ts — no accounting timezone configured for client \" \" — spend is ", "config/src/caps.ts",
    "    throw new CapError(`no accounting timezone configured for client \"${clientId}\" — spend is forbidden`);",
    "    void new CapError(`no accounting timezone configured for client \"${clientId}\" — spend is forbidden`);"],
  ["G6-04 caps.ts — \" \" is not a resolvable IANA timezone for client \" \" — spend", "config/src/caps.ts",
    "    throw new CapError(`\"${zone}\" is not a resolvable IANA timezone for client \"${clientId}\" — spend is forbidden`);",
    "    void new CapError(`\"${zone}\" is not a resolvable IANA timezone for client \"${clientId}\" — spend is forbidden`);"],
  ["G6-05 caps.ts — caps lack human sign-off (H8) — all spend paths refuse", "config/src/caps.ts",
    "    throw new CapError(\"caps lack human sign-off (H8) — all spend paths refuse\");",
    "    void new CapError(\"caps lack human sign-off (H8) — all spend paths refuse\");"],
  ["G6-06 caps.ts — a test-fixture signature does not sign a real client — \" \" n", "config/src/caps.ts",
    "  if (caps.humanSignoff === FIXTURE_SIGNOFF && clientId !== undefined && !clientId.startsWith(FIXTURE_CLIENT_PREFIX)) {\n    throw new CapError(",
    "  if (caps.humanSignoff === FIXTURE_SIGNOFF && clientId !== undefined && !clientId.startsWith(FIXTURE_CLIENT_PREFIX)) {\n    void new CapError("],
  ["G6-07 models.ts — EvalAttestation is not directly constructible — it must come", "config/src/models.ts",
    "      throw new BindingError(\"EvalAttestation is not directly constructible — it must come from an executed eval run\");",
    "      void new BindingError(\"EvalAttestation is not directly constructible — it must come from an executed eval run\");"],
  ["G6-08 models.ts — attestEvalRun: unknown role \" \"", "config/src/models.ts",
    "  if (card === undefined) throw new BindingError(`attestEvalRun: unknown role \"${role}\"`);",
    "  if (card === undefined) void new BindingError(`attestEvalRun: unknown role \"${role}\"`);"],
  ["G6-09 models.ts — attestEvalRun: unknown model \" \"", "config/src/models.ts",
    "  if (ownEntry(MODELS, modelId) === undefined) throw new BindingError(`attestEvalRun: unknown model \"${modelId}\"`);",
    "  if (ownEntry(MODELS, modelId) === undefined) void new BindingError(`attestEvalRun: unknown model \"${modelId}\"`);"],
  ["G6-10 models.ts — role \" \" declares no golden set — an eval over nothing prove", "config/src/models.ts",
    "    throw new BindingError(`role \"${role}\" declares no golden set — an eval over nothing proves nothing`);",
    "    void new BindingError(`role \"${role}\" declares no golden set — an eval over nothing proves nothing`);"],
  ["G6-11 models.ts — eval outcomes must be an array", "config/src/models.ts",
    "  if (!Array.isArray(results)) throw new BindingError(\"eval outcomes must be an array\");",
    "  if (!Array.isArray(results)) void new BindingError(\"eval outcomes must be an array\");"],
  ["G6-12 models.ts — eval run repeats a case id", "config/src/models.ts",
    "  if (new Set(seen).size !== seen.length) throw new BindingError(\"eval run repeats a case id\");",
    "  if (new Set(seen).size !== seen.length) void new BindingError(\"eval run repeats a case id\");"],
  ["G6-13 models.ts — eval run does not cover role \" \"'s declared golden set (expe", "config/src/models.ts",
    "  if (expected.length !== actual.length || expected.some((id, i) => id !== actual[i])) {\n    throw new BindingError(",
    "  if (expected.length !== actual.length || expected.some((id, i) => id !== actual[i])) {\n    void new BindingError("],
  // G6-14 re-targeted 2026-10-06 (X5-10): the boolean-per-case guard it
  // disabled is gone with the caller-reported booleans; the pass is graded.
  ["G6-14 models.ts — attestEvalRun grades each output itself", "config/src/models.ts",
    "    return { caseId: r.caseId, passed: gcase !== undefined && gradeCase(gcase, r.output) };",
    "    return { caseId: r.caseId, passed: true };"],
  ["X5-10 a case passes only when every expected field matches", "config/src/golden-sets.ts",
    "  return Object.entries(gcase.expected).every(([k, v]) => structurallyEqual((output as Record<string, unknown>)[k], v));",
    "  return true;"],
  ["G6-15 models.ts — eval result is for role \" \", not \" \"", "config/src/models.ts",
    "  if (att.role !== role) throw new BindingError(`eval result is for role \"${att.role}\", not \"${role}\"`);",
    "  if (att.role !== role) void new BindingError(`eval result is for role \"${att.role}\", not \"${role}\"`);"],
  ["G6-16 models.ts — eval result is for model \" \", not \" \"", "config/src/models.ts",
    "  if (att.modelId !== modelId) throw new BindingError(`eval result is for model \"${att.modelId}\", not \"${modelId}\"`);",
    "  if (att.modelId !== modelId) void new BindingError(`eval result is for model \"${att.modelId}\", not \"${modelId}\"`);"],
  ["G6-17 models.ts — role \" \" has no binding", "config/src/models.ts",
    "  if (modelId === undefined) throw new BindingError(`role \"${role}\" has no binding`);",
    "  if (modelId === undefined) void new BindingError(`role \"${role}\" has no binding`);"],
  ["G6-18 models.ts — binding for \" \" names unknown model \" \"", "config/src/models.ts",
    "  if (spec === undefined) throw new BindingError(`binding for \"${role}\" names unknown model \"${modelId}\"`);",
    "  if (spec === undefined) void new BindingError(`binding for \"${role}\" names unknown model \"${modelId}\"`);"],
  ["G6-19 models.ts — role \" \" is declared but unbound — every role card must hold", "config/src/models.ts",
    "      throw new BindingError(`role \"${role}\" is declared but unbound — every role card must hold a binding (Law 13)`);",
    "      void new BindingError(`role \"${role}\" is declared but unbound — every role card must hold a binding (Law 13)`);"],
  ["G6-20 models.ts — binding exists for unknown role \" \"", "config/src/models.ts",
    "    if (card === undefined) throw new BindingError(`binding exists for unknown role \"${role}\"`);",
    "    if (card === undefined) void new BindingError(`binding exists for unknown role \"${role}\"`);"],
  ["G6-21 models.ts — domain \" \" binds a builder with no adversary — family divers", "config/src/models.ts",
    "    if (builders.length > 0 && adversaries.length === 0) {\n      throw new BindingError(",
    "    if (builders.length > 0 && adversaries.length === 0) {\n      void new BindingError("],
  ["G6-22 models.ts — family-diversity violation in domain \" \": builder \" \" and ad", "config/src/models.ts",
    "          throw new BindingError(",
    "          void new BindingError("],
  ["G6-23 models.ts — bindRole: unknown role \" \"", "config/src/models.ts",
    "  if (card === undefined) throw new BindingError(`bindRole: unknown role \"${role}\"`);",
    "  if (card === undefined) void new BindingError(`bindRole: unknown role \"${role}\"`);"],
  ["G6-24 models.ts — bindRole: unknown model \" \"", "config/src/models.ts",
    "  if (ownEntry(MODELS, modelId) === undefined) throw new BindingError(`bindRole: unknown model \"${modelId}\"`);",
    "  if (ownEntry(MODELS, modelId) === undefined) void new BindingError(`bindRole: unknown model \"${modelId}\"`);"],
  ["G6-25 models.ts — model \" \" scored < threshold for role \" \" — no pass, no bind", "config/src/models.ts",
    "  if (evalResult.score < card.evalThreshold) {\n    throw new BindingError(",
    "  if (evalResult.score < card.evalThreshold) {\n    void new BindingError("],
  ["G6-26 gateway.ts — gatewayBaseUrl is not a URL — refusing to dispatch (Law 9)", "engine/src/gateway.ts",
    "    throw new GatewayError(`gatewayBaseUrl is not a URL — refusing to dispatch (Law 9)`);",
    "    void new GatewayError(`gatewayBaseUrl is not a URL — refusing to dispatch (Law 9)`);"],
  ["G6-27 gateway.ts — output is not an object", "engine/src/gateway.ts",
    "    throw new SchemaError(\"output is not an object\");",
    "    void new SchemaError(\"output is not an object\");"],
  ["G6-28 gateway.ts — output missing required field \" \"", "engine/src/gateway.ts",
    "    if (!(key in obj)) throw new SchemaError(`output missing required field \"${key}\"`);",
    "    if (!(key in obj)) void new SchemaError(`output missing required field \"${key}\"`);"],
  ["G6-29 gateway.ts — output field \" \" is not", "engine/src/gateway.ts",
    "    if (!ok) throw new SchemaError(`output field \"${key}\" is not ${spec.type}`);",
    "    if (!ok) void new SchemaError(`output field \"${key}\" is not ${spec.type}`);"],
  ["G6-30 gateway.ts — unknown role \" \"", "engine/src/gateway.ts",
    "    if (card === undefined) throw new BindingError(`unknown role \"${role}\"`);",
    "    if (card === undefined) void new BindingError(`unknown role \"${role}\"`);"],
  ["G6-31 gateway.ts — llm() requires a TraceContext", "engine/src/gateway.ts",
    "    if (!(req.trace instanceof TraceContext)) throw new TraceEmitError(\"llm() requires a TraceContext\");",
    "    if (!(req.trace instanceof TraceContext)) void new TraceEmitError(\"llm() requires a TraceContext\");"],
  ["G6-32 gateway.ts — trace context is scoped to a different client (Law 3)", "engine/src/gateway.ts",
    "      throw new TraceEmitError(\"trace context is scoped to a different client (Law 3)\");",
    "      void new TraceEmitError(\"trace context is scoped to a different client (Law 3)\");"],
  ["G6-33 gateway.ts — vault scope mismatch — cross-client secret access refused (L", "engine/src/gateway.ts",
    "      throw new GatewayError(\"vault scope mismatch — cross-client secret access refused (Law 3)\");",
    "      void new GatewayError(\"vault scope mismatch — cross-client secret access refused (Law 3)\");"],
  ["G6-34 gateway.ts — transport has no post() — refusing spend (fail closed)", "engine/src/gateway.ts",
    "      throw new GatewayError(\"transport has no post() — refusing spend (fail closed)\");",
    "      void new GatewayError(\"transport has no post() — refusing spend (fail closed)\");"],
  ["G6-35 gateway.ts — provider output is not plain JSON data — refused (Law 9)", "engine/src/gateway.ts",
    "      throw new GatewayError(\"provider output is not plain JSON data — refused (Law 9)\");",
    "      void new GatewayError(\"provider output is not plain JSON data — refused (Law 9)\");"],
  ["G6-36 spend-ledger.ts — ledger is corrupt — refusing spend (fail closed)", "engine/src/spend-ledger.ts",
    "    throw new MeterUnavailableError(`${label} ledger is corrupt — refusing spend (fail closed)`);",
    "    void new MeterUnavailableError(`${label} ledger is corrupt — refusing spend (fail closed)`);"],
  ["G6-37 spend-ledger.ts — a reservation needs a handle object — refusing spend (fail c", "engine/src/spend-ledger.ts",
    "      throw new MeterUnavailableError(\"a reservation needs a handle object — refusing spend (fail closed)\");",
    "      void new MeterUnavailableError(\"a reservation needs a handle object — refusing spend (fail closed)\");"],
  ["G6-38 spend-ledger.ts — reservation handle is already open — refusing spend (fail cl", "engine/src/spend-ledger.ts",
    "      throw new MeterUnavailableError(\"reservation handle is already open — refusing spend (fail closed)\");",
    "      void new MeterUnavailableError(\"reservation handle is already open — refusing spend (fail closed)\");"],
  ["G6-39 spend-ledger.ts — projected spend is out of range — refusing spend (fail close", "engine/src/spend-ledger.ts",
    "        throw new MeterUnavailableError(\"projected spend is out of range — refusing spend (fail closed)\");",
    "        void new MeterUnavailableError(\"projected spend is out of range — refusing spend (fail closed)\");"],
  ["G6-40 spend-ledger.ts — is not a usable ceiling — refusing spend (fail closed)", "engine/src/spend-ledger.ts",
    "    throw new MeterUnavailableError(`${label} is not a usable ceiling — refusing spend (fail closed)`);",
    "    void new MeterUnavailableError(`${label} is not a usable ceiling — refusing spend (fail closed)`);"],
  ["G6-41 spend-ledger.ts — is out of range for micro-dollar accounting — refusing spend", "engine/src/spend-ledger.ts",
    "    throw new MeterUnavailableError(`${label} is out of range for micro-dollar accounting — refusing spend (fail closed)`);",
    "    void new MeterUnavailableError(`${label} is out of range for micro-dollar accounting — refusing spend (fail closed)`);"],
  ["G6-42 spend-meter.ts — is not a finite non-negative number — refusing spend (fail c", "engine/src/spend-meter.ts",
    "    throw new MeterUnavailableError(`${label} is not a finite non-negative number — refusing spend (fail closed)`);",
    "    void new MeterUnavailableError(`${label} is not a finite non-negative number — refusing spend (fail closed)`);"],
  ["G6-43 spend-meter.ts — MemorySpendMeter requires a spend ledger — refusing spend (f", "engine/src/spend-meter.ts",
    "      throw new MeterUnavailableError(\"MemorySpendMeter requires a spend ledger — refusing spend (fail closed)\");",
    "      void new MeterUnavailableError(\"MemorySpendMeter requires a spend ledger — refusing spend (fail closed)\");"],
  ["G6-44 tracing.ts — trace context requires traceId and clientId", "engine/src/tracing.ts",
    "    if (!traceId || !clientId) throw new TraceEmitError(\"trace context requires traceId and clientId\");",
    "    if (!traceId || !clientId) void new TraceEmitError(\"trace context requires traceId and clientId\");"],
  ["G6-45 tracing.ts — trace emission failed — refusing to proceed untraced (Law 11", "engine/src/tracing.ts",
    "    throw new TraceEmitError(\"trace emission failed — refusing to proceed untraced (Law 11)\");",
    "    void new TraceEmitError(\"trace emission failed — refusing to proceed untraced (Law 11)\");"],
  ["G6-46 tracing.ts — sink outage", "engine/src/tracing.ts",
    "    if (this.#failing) throw new Error(\"sink outage\");",
    "    if (this.#failing) void new Error(\"sink outage\");"],
  ["G6-47 transport-brand.ts — no golden case selected", "engine/src/transport-brand.ts",
    "    if (this.#currentCase === null) throw new TypeError(\"no golden case selected\");",
    "    if (this.#currentCase === null) void new TypeError(\"no golden case selected\");"],
  ["G6-48 trusted-clock.ts — no monotonic clock on this runtime (process.hrtime absent) —", "engine/src/trusted-clock.ts",
    "    throw new MeterUnavailableError(\"no monotonic clock on this runtime (process.hrtime absent) — refusing spend (fail closed)\");",
    "    void new MeterUnavailableError(\"no monotonic clock on this runtime (process.hrtime absent) — refusing spend (fail closed)\");"],
  ["G6-49 vault.ts — vault scope requires a clientId", "engine/src/vault.ts",
    "    if (!clientId) throw new VaultError(\"vault scope requires a clientId\");",
    "    if (!clientId) void new VaultError(\"vault scope requires a clientId\");"],
  ["G6-50 vault.ts — secret \" \" not found for scoped client", "engine/src/vault.ts",
    "      throw new VaultError(`secret \"${name}\" not found for scoped client`);",
    "      void new VaultError(`secret \"${name}\" not found for scoped client`);"],
  // ---- cross-family round x3 (GPT-6 Astra, 2026-10-04) ----
  ["X3-02 a Class-2 path anywhere is in CI scope", "engine/scripts/ci-scope.mjs",
    '  return changedFiles.some((f) => typeof f === "string" && (isClass2(f) || globs.some((g) => globsAdmit([g], f))));',
    '  return changedFiles.some((f) => typeof f === "string" && globs.some((g) => globsAdmit([g], f)));'],
  ["X3-03 a live run-lock holder is refused", "engine/scripts/mutate-lib.mjs",
    "      if (observed !== \"\" && isAlive(holder)) return { ok: false, holder,",
    "      if (false) return { ok: false, holder,"],
  ["X3-05 the finished cross-family report is scrubbed", "engine/scripts/cross-family-read.mjs",
    "  report = scrub(report);",
    "  void scrub;"],
  ["X3-06 the scanner configuration is in the verified tree", "engine/scripts/gate-lib.mjs",
    '  ".gitleaks.toml",\n  ".gitleaksignore",\n  // Root Class-2 files (X4-02)',
    '  // Root Class-2 files (X4-02)'],
  ["X3-07 the grade trace carries graded metrics only", "engine/src/grade-registry.ts",
    "  const traced = snapshotForTrace(snapshot);",
    "  const traced = snapshot;"],
  ["X3-08 a money error is rebuilt from a class we choose", "engine/src/redact.ts",
    "    : new CapError(redactText(message, secrets));",
    "    : new (err.constructor as new (m: string) => CapError)(redactText(message, secrets));"],
  ["X3-10 bindRole refuses an unearned base map", "config/src/models.ts",
    '  if (bindingsProvenance(bindings) !== "servable") {',
    "  if (false) {"],
  // X3-11 re-targeted 2026-10-06: the sets moved to config (X5-10) and were
  // frozen twice, so the engine-side entry SURVIVED (measured at 0988a0f1).
  ["X3-11 canonical golden sets are deep-frozen", "config/src/golden-sets.ts",
    "export const GOLDEN_SETS: Readonly<Record<string, readonly GoldenCase[]>> = deepFreeze({",
    "export const GOLDEN_SETS: Readonly<Record<string, readonly GoldenCase[]>> = Object.freeze({"],
  // ---- X2-09: no pass, no bind on the serving path (2026-09-27) ----
  ["XB-01 an unevaluated binding map is not servable", "engine/src/gateway.ts",
    "    if (provenance === null) {",
    "    if (false) {"],
  ["XB-02 a candidate map is served only through recorded outputs", "engine/src/gateway.ts",
    "    if (provenance === \"candidate\" && !isRecordedTransport(deps.transport)) {",
    "    if (false) {"],
  ["XB-03 RecordedTransport is final", "engine/src/transport-brand.ts",
    "    if (new.target !== RecordedTransport) throw new TypeError(",
    "    if (false) throw new TypeError("],
  ["XB-04 the golden set is the role's canonical set", "engine/src/eval-harness.ts",
    "  if (canonical === undefined || !structurallyEqual(JSON.parse(JSON.stringify(goldenSet)), JSON.parse(JSON.stringify(canonical)))) {",
    "  if (false) {"],
  ["XB-05 the recorded brand belongs to the class alone (X3-14)", "engine/src/transport-brand.ts",
    '  return typeof t === "object" && t !== null && RECORDED.has(t);',
    '  return typeof t === "object" && t !== null;'],
  ["XB-06 bindRole results are servable", "config/src/models.ts",
    "  validateBindings(next, cards);\n  SERVABLE.add(next);",
    "  validateBindings(next, cards);"],
  // ---- X2-14: grade decisions are traced (2026-09-27) ----
  ["GR-01 a grade decision is traced before it is returned", "engine/src/grade-registry.ts",
    "  await emitOrFail(deps.sink, { ...base, input: traced, output: { grades, actions }, outcome: \"ok\" });",
    "  void base;"],
  ["GR-02 no TraceContext, no grade decision", "engine/src/grade-registry.ts",
    "  if (!(deps?.trace instanceof TraceContext)) {\n    throw new TraceEmitError(\"gradeAndEnforce requires",
    "  if (false) {\n    throw new TraceEmitError(\"gradeAndEnforce requires"],
  ["GR-03 a failed grade computation is traced", "engine/src/grade-registry.ts",
    '    await emitOrFail(deps.sink, { ...base, input: traced, output: null, outcome: "error", errorMessage: safe });',
    "    void base;"],
  ["GR-04 the Worker surface carries no untraced enforcement", "engine/src/index.ts",
    "export { computeGrades, gradeAndEnforce } from \"./grade-registry.ts\";",
    "export { computeGrades, gradeAndEnforce, enforcement } from \"./grade-registry.ts\";"],
  ["R14-01 a transport refusal is surfaced", "engine/src/gateway.ts",
    "      committedUsd = reservation.amountUsd;\n      throw redactError(err, secrets, GatewayError);",
    "      committedUsd = reservation.amountUsd;\n      return { greeting: \"swallowed\" };"],
  // ---- Ruling 2026-10-06 (L50): human approval for the money caps only ----
  ["MC-01 caps-named config modules still owe a human approval", "engine/scripts/gate-lib.mjs",
    "  /^fullburn\\/config\\/src\\/[^/]*caps[^/]*$/,",
    "  /^NEVER-MATCHES$/,"],
  ["MC-02 the freeze module still owe a human approval", "engine/scripts/gate-lib.mjs",
    "  /^fullburn\\/config\\/src\\/freeze\\.ts$/,",
    "  /^NEVER-MATCHES$/,"],
  ["MC-03 the config export map still owe a human approval", "engine/scripts/gate-lib.mjs",
    "  /^fullburn\\/config\\/package\\.json$/,",
    "  /^NEVER-MATCHES$/,"],
  ["MC-04 the gate library still owe a human approval", "engine/scripts/gate-lib.mjs",
    "  /^fullburn\\/engine\\/scripts\\/gate-lib\\.mjs$/,",
    "  /^NEVER-MATCHES$/,"],
  ["MC-05 the class-2 CLI still owe a human approval", "engine/scripts/gate-lib.mjs",
    "  /^fullburn\\/engine\\/scripts\\/class2-gate\\.mjs$/,",
    "  /^NEVER-MATCHES$/,"],
  ["MC-06 the diff parser still owe a human approval", "engine/scripts/gate-lib.mjs",
    "  /^fullburn\\/engine\\/scripts\\/diff-lib\\.mjs$/,",
    "  /^NEVER-MATCHES$/,"],
  ["MC-07 the CI workflow still owe a human approval", "engine/scripts/gate-lib.mjs",
    "  /^\\.github\\/workflows\\/fullburn-ci\\.yml$/,",
    "  /^NEVER-MATCHES$/,"],
  ["MC-08 only money-cap paths owe a human approval", "engine/scripts/gate-lib.mjs",
    "  if (needsHumanApproval(f.path)) touched.push(",
    "  if (isClass2(f.path)) touched.push("],
  ["MC-09 a cap change owes a human approval", "engine/scripts/gate-lib.mjs",
    "  return HUMAN_APPROVAL_PATTERNS.some((re) => re.test(path));",
    "  return false;"],
  // ---- D-vault-rotation + X5-06..09: encrypted, auto-rotating, CAS-written vault (2026-10-06) ----
  ["VC-01 sealed records bind slot, version, time and quarantine", "engine/src/vault-crypto.ts",
    "      { name: \"AES-GCM\", iv, additionalData: aad(slot, version, at, quarantined) },",
    "      { name: \"AES-GCM\", iv },"],
  ["VC-02 a locked vault refuses reads", "engine/src/vault-crypto.ts",
    "    if (this.#unlockedClient !== clientId) {\n      throw",
    "    if (false) {\n      throw"],
  ["VC-03 unlocking drops the previous client's plaintext", "engine/src/vault-crypto.ts",
    "    this.lock();\n    const generation",
    "    const generation"],
  ["VC-04 only secrets past their maxAge rotate", "engine/src/vault-crypto.ts",
    "        if (now - loaded.sealed.at < policy.maxAgeMs) continue;",
    "        void 0;"],
  ["VC-05 an unchanged re-issue is a failed rotation", "engine/src/vault-crypto.ts",
    "        if (typeof next !== \"string\" || next.length === 0 || next === current) throw",
    "        if (typeof next !== \"string\") throw"],
  ["VC-06 a failed breach re-issue quarantines the secret", "engine/src/vault-crypto.ts",
    "      await this.#write(clientId, name, \"\", true);\n      throw new VaultError",
    "      throw new VaultError"],
  ["VC-07 re-key re-seals records under an old KEK", "engine/src/vault-crypto.ts",
    "      if (!loaded || loaded.sealed.kek === this.#current.id) continue;",
    "      if (!loaded || true) continue;"],
  ["VC-08 the version comes from the store", "engine/src/vault-crypto.ts",
    "      const version = (prior?.sealed.v ?? 0) + 1;",
    "      const version = 1;"],
  ["VC-09 a bad maxAge is a failure", "engine/src/vault-crypto.ts",
    "      if (!(Number.isFinite(policy.maxAgeMs) && policy.maxAgeMs > 0)) {",
    "      if (false) {"],
  ["VC-10 the KEK is exactly 256 bits", "engine/src/vault-crypto.ts",
    "  if (raw.byteLength !== 32) throw",
    "  if (false) throw"],
  ["VC-11 a rolled-back record is refused against the manifest", "engine/src/vault-crypto.ts",
    "      if (sealed.v < (versions[name] ?? 0)) {",
    "      if (false) {"],
  ["VC-12 a lock during an in-flight unlock is not undone", "engine/src/vault-crypto.ts",
    "    if (generation !== this.#generation) {",
    "    if (false) {"],
  ["VC-13 re-key writes only over the record it read", "engine/src/vault-crypto.ts",
    "      if (await this.#store.compareAndSwap(slot, loaded.raw, JSON.stringify(resealed))) n += 1;",
    "      this.#store.raw?.set?.(slot, JSON.stringify(resealed)); await this.#store.compareAndSwap(slot, await this.#store.get(slot), JSON.stringify(resealed)); n += 1;"],
  ["VC-14 a quarantined record is never readable", "engine/src/vault-crypto.ts",
    "      if (sealed.q) continue; // quarantined: present, never readable",
    "      void 0;"],
  ["VC-15 the old value is revoked at the provider", "engine/src/vault-crypto.ts",
    "      await revoke(clientId, name, current);",
    "      void revoke;"],
  ["VC-16 a write names the bytes it replaces", "engine/src/vault-crypto.ts",
    "      if (await this.#store.compareAndSwap(slot, prior?.raw ?? null, JSON.stringify(sealed))) {",
    "      if (await this.#store.compareAndSwap(slot, await this.#store.get(slot), JSON.stringify(sealed))) {"],
  // ---- 2026-10-06: Fullburn-only workflow scope, r9 pin, Astra-only adversary (L53) ----
  ["WF-01 Fullburn's workflow checks cover Fullburn's workflows only", "engine/test/invariants/invariants.test.ts",
    "export const FULLBURN_WORKFLOW = /^(?:fullburn-[\\w.-]+|cross-family-read)\\.ya?ml$/;",
    "export const FULLBURN_WORKFLOW = /\\.ya?ml$/;"],
  ["R9-01 the committed r9 report is pinned, not blocking", "engine/scripts/gate-lib.mjs",
    "  [\"ADVERSARY_REPORT_phase0.r9.md\", \"149d4541\"],",
    ""],
  ["AR-01 C2 needs GPT Astra's PASS", "engine/scripts/done-lib.mjs",
    "  if (!crossFamily || crossFamily.ok !== true) {",
    "  if (!crossFamily) {"],
  // ---- 2026-10-06: the GPT Astra reviewer's route through the Law 11 scan (L54) ----
  ["RV-01 the reviewer exemption is one file", "engine/scripts/scan-lib.mjs",
    "export const REVIEWER_ROUTE = Object.freeze({ path: /^fullburn\\/engine\\/scripts\\/cross-family-lib\\.mjs$/,",
    "export const REVIEWER_ROUTE = Object.freeze({ path: /cross-family-lib|scripts\\//,"],
  ["RV-02 the reviewer exemption is one host", "engine/scripts/scan-lib.mjs",
    "  return !PROVIDER_HOSTS.test(String(content).replace(REVIEWER_ROUTE.host, \"\"));",
    "  return true;"],
  ["RV-03 the leak scan consults the reviewer route, nothing wider", "engine/scripts/scan-lib.mjs",
    "  if (PROVIDER_HOSTS.test(content) && !isReviewerRoute(path, content)) {",
    "  if (PROVIDER_HOSTS.test(content) && !/scripts\\//.test(path)) {"],
  // ---- 2026-10-06: no same-family review opens the gate (L55) ----
  ["AF-01 only a non-Claude reviewer's PASS opens the gate", "engine/scripts/gate-lib.mjs",
    "  const pass = judged.find((j) => j.ok && isNonClaudeReviewer(j.content));",
    "  const pass = judged.find((j) => j.ok);"],
  ["AF-02 a Claude or empty family is not a non-Claude reviewer", "engine/scripts/gate-lib.mjs",
    "    if (m) return m[1].length > 0 && !/claude|anthropic/i.test(m[1]);",
    "    if (m) return true;"],
  ["AF-03 the family line is read from the visible header only", "engine/scripts/gate-lib.mjs",
    "  for (const line of visibleHeaderLines(reportContent)) {\n    const m = /^Reviewer-family:",
    "  for (const line of String(reportContent).split(\"\\n\")) {\n    const m = /^Reviewer-family:"],
  // ---- X5-01: the base commit's scope script decides (2026-10-06) ----
  ["MC-10 the scope script still owes a human approval", "engine/scripts/gate-lib.mjs",
    "  /^fullburn\\/engine\\/scripts\\/ci-scope\\.mjs$/,",
    "  /^NEVER-MATCHES$/,"],
  ["SC-01 the verify job's scope step runs the base's script", ".github/workflows/fullburn-ci.yml",
    "`!= 'false'` runs the gate instead.\n      # THE SCOPE IS DECIDED BY THE BASE COMMIT'S SCRIPT (cross-family finding\n      # X5-01). Run from the checkout under review, a PR could rewrite ci-scope.mjs\n      # to print relevant=false and skip every gated step below — including the\n      # money-cap approval check — with this workflow unchanged. The base's script\n      # judges the PR's diff as data. No script at the base (the bootstrap merge,\n      # a new branch) means RUN THE GATE. A failing script fails the job.\n      - id: scope\n        working-directory: .\n        env:\n          SCOPE_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}\n          SCOPE_HEAD: ${{ github.event.pull_request.head.sha || github.sha }}\n        run: |\n          if git cat-file -e \"$SCOPE_BASE:fullburn/engine/scripts/ci-scope.mjs\" 2>/dev/null; then\n            git worktree add --detach \"$RUNNER_TEMP/scope-base\" \"$SCOPE_BASE\" > /dev/null\n            node \"$RUNNER_TEMP/scope-base/fullburn/engine/scripts/ci-scope.mjs\" . \"$SCOPE_BASE\" \"$SCOPE_HEAD\" >> \"$GITHUB_OUTPUT\"",
    "`!= 'false'` runs the gate instead.\n      # THE SCOPE IS DECIDED BY THE BASE COMMIT'S SCRIPT (cross-family finding\n      # X5-01). Run from the checkout under review, a PR could rewrite ci-scope.mjs\n      # to print relevant=false and skip every gated step below — including the\n      # money-cap approval check — with this workflow unchanged. The base's script\n      # judges the PR's diff as data. No script at the base (the bootstrap merge,\n      # a new branch) means RUN THE GATE. A failing script fails the job.\n      - id: scope\n        working-directory: .\n        env:\n          SCOPE_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}\n          SCOPE_HEAD: ${{ github.event.pull_request.head.sha || github.sha }}\n        run: |\n          if git cat-file -e \"$SCOPE_BASE:fullburn/engine/scripts/ci-scope.mjs\" 2>/dev/null; then\n            git worktree add --detach \"$RUNNER_TEMP/scope-base\" \"$SCOPE_BASE\" > /dev/null\n            node fullburn/engine/scripts/ci-scope.mjs . \"$SCOPE_BASE\" \"$SCOPE_HEAD\" >> \"$GITHUB_OUTPUT\""],
  // ---- X5-05: binary is not plain data (2026-10-06) ----
  ["X5-05 binary output is refused before the clone", "engine/src/gateway.ts",
    "    if (opaque) {\n      throw new GatewayError(\"provider output carries binary",
    "    if (false) {\n      throw new GatewayError(\"provider output carries binary"],
  // ---- X5-03: cap approvals authenticated by GitHub's commit record (2026-10-06) ----
  ["X5-03a an approval needs a verified commit by the maintainer", "engine/scripts/gate-lib.mjs",
    "    const a = list.length === 0 ? null : list.find((x) => !x || x.verified !== true || typeof x.authorLogin !== \"string\" || x.authorLogin.toLowerCase() !== want) ?? null;",
    "    const a = list.length === 0 ? null : list.find((x) => !x) ?? null;"],
  ["X5-03b the class-2 CLI reads each approval's GitHub record", "engine/scripts/class2-gate.mjs",
    "    d.auth.push(await fetchCommitAuth({",
    "    d.auth.push({ verified: true, authorLogin: process.env.FULLBURN_MAINTAINER }); void ({"],
  ["X5-03c no maintainer, no authenticated approval", "engine/scripts/gate-lib.mjs",
    "  if (typeof maintainer !== \"string\" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(maintainer)) {",
    "  if (false) {"],
  ["X5-03d the cap gate authenticates when a cap path changed", "engine/scripts/gate-lib.mjs",
    "  const auth = checkApprovalAuthentication(added, maintainer);",
    "  const auth = { ok: true, reason: \"\" };"],
  ["MC-11 the GitHub record reader still owes a human approval", "engine/scripts/gate-lib.mjs",
    "  /^fullburn\\/engine\\/scripts\\/github-auth\\.mjs$/,",
    "  /^NEVER-MATCHES$/,"],
  // ---- X5-02: a PASS needs the review workflow's attestation (2026-10-06) ----
  ["X5-02a the adversary CLI refuses an unattested PASS", "engine/scripts/adversary-gate.mjs",
    "  if (!prov.ok) {\n    console.error(`ADVERSARY GATE FAIL: ${res.report}: ${prov.reason}`);",
    "  if (false) {\n    console.error(`ADVERSARY GATE FAIL: ${res.report}: ${prov.reason}`);"],
  ["X5-02b the attestation must be signed by the review workflow", "engine/scripts/gate-lib.mjs",
    "      typeof a.signerUri === \"string\" && a.signerUri.startsWith(signer) &&",
    "      true &&"],
  ["X5-02c the attestation must cover these exact bytes", "engine/scripts/gate-lib.mjs",
    "      Array.isArray(a.subjectDigests) && a.subjectDigests.includes(fileSha256),",
    "      true,"],
  ["X5-02d a REST bundle's DSSE signature is verified", "engine/scripts/attestation.mjs",
    "        signatureVerified = verifier.verify(cert.publicKey, sig);",
    "        signatureVerified = true;"],
  ["X5-02e only a verified signature counts", "engine/scripts/gate-lib.mjs",
    "      a && a.signatureVerified === true && a.chainVerified === true &&",
    "      a && a.chainVerified === true &&"],
  // ---- X5-13: a guard credited through another entry's context now has its own ----
  ["G6-51 transport-brand.ts — no recorded output for the selected case", "engine/src/transport-brand.ts",
    "    if (out === undefined) throw new TypeError(`no recorded output for case \"${this.#currentCase}\"`);",
    "    if (out === undefined) void new TypeError(`no recorded output for case \"${this.#currentCase}\"`);"],
  // ---- X5-12: production AI Gateway transport and Langfuse sink (2026-10-06) ----
  ["X5-12a the gateway key travels as the gateway credential", "engine/src/gateway-http.ts",
    "    const forward: Record<string, string> = { \"content-type\": \"application/json\", \"cf-aig-authorization\": auth };",
    "    const forward: Record<string, string> = { \"content-type\": \"application/json\", authorization: auth };"],
  ["X5-12b a non-2xx gateway reply is an error", "engine/src/gateway-http.ts",
    "    if (status < 200 || status > 299) {\n      // The body may echo request material; only the status crosses.\n      throw",
    "    if (false) {\n      // The body may echo request material; only the status crosses.\n      throw"],
  ["X5-12c the transport posts only inside its gateway", "engine/src/gateway-http.ts",
    "    if (target.origin !== this.#base.origin || !target.pathname.startsWith(this.#base.pathname)) {",
    "    if (false) {"],
  ["X5-12d a rejected Langfuse event fails the trace", "engine/src/langfuse-sink.ts",
    "      if (!Array.isArray(errors) || errors.length > 0) throw",
    "      if (false) throw"],
  ["X5-12e a Langfuse non-2xx fails the trace", "engine/src/langfuse-sink.ts",
    "    if (status < 200 || status > 299) throw new LangfuseSinkError",
    "    if (false) throw new LangfuseSinkError"],
  ["X5-12f a reply that is not a JSON object is refused", "engine/src/gateway-http.ts",
    "    if (typeof output !== \"object\" || output === null || Array.isArray(output)) {",
    "    if (false) {"],
  ["DN-19 a survivor is named even when the harness exits non-zero", "engine/scripts/done-lib.mjs",
    "  if (exitCode !== 0) return { status: \"FAIL\", observed: `harness exited ${exitCode} — ${p.total} mutations: ${p.caught} caught, ${p.survived} survived, ${p.notFound} stale${names.length ? ` — ${names.join(\" — \")}` : \"\"}` };",
    "  if (exitCode !== 0) return { status: \"FAIL\", observed: `harness exited ${exitCode} — ${p.total} mutations: ${p.caught} caught, ${p.survived} survived, ${p.notFound} stale` };"],
  ["X6-01 a report is attested whatever its verdict", ".github/workflows/cross-family-read.yml",
    "      - uses: actions/attest-build-provenance@96278af6caaf10aea03fd8d33a09a777ca52d62f # v3.2.0\n        if: steps.new.outputs.report != ''",
    "      - uses: actions/attest-build-provenance@96278af6caaf10aea03fd8d33a09a777ca52d62f # v3.2.0\n        if: success()"],
  // ---- x6 (GPT-6 Astra, 2026-10-06) ----
  ["X6-05 the binary refusal reads the value before its toJSON", "engine/src/gateway.ts",
    "          for (const v of [raw, value]) {",
    "          for (const v of [value]) {"],
  ["X6-07 a scheduled rotation writes only over the record it decided on", "engine/src/vault-crypto.ts",
    "        if (!(await this.#replaceExactly(clientId, name, loaded.raw, loaded.sealed.v, next))) throw",
    "        await this.put(clientId, name, next); if (false) throw"],
  ["X6-08 every write invalidates an in-flight unlock", "engine/src/vault-crypto.ts",
    "    this.#generation += 1;\n    if (quarantined && this.#unlockedClient === clientId) this.#plain.delete(name);",
    "    if (quarantined && this.#unlockedClient === clientId) this.#plain.delete(name);"],
  ["X6-03 every commit touching an approval is authenticated (CLI)", "engine/scripts/class2-gate.mjs",
    "  const touchedIn = git(`log --format=%H ${JSON.stringify(`${baseRef}..HEAD`)} -- ${JSON.stringify(d.path)}`).split(\"\\n\").map((l) => l.trim()).filter(Boolean);",
    "  const touchedIn = git(`log --diff-filter=A --format=%H -1 ${JSON.stringify(`${baseRef}..HEAD`)} -- ${JSON.stringify(d.path)}`).split(\"\\n\").map((l) => l.trim()).filter(Boolean);"],
  ["X6-03b every commit record must pass (decision)", "engine/scripts/gate-lib.mjs",
    "    if (list.length === 0 || a !== null || list.some((x) => !x)) {",
    "    if (list.length === 0) {"],
  ["X6-12 only a chain-verified attestation counts", "engine/scripts/gate-lib.mjs",
    "      a && a.signatureVerified === true && a.chainVerified === true &&",
    "      a && a.signatureVerified === true &&"],
];

// ── RUNS ONLY AS A CLI, NEVER ON IMPORT ─────────────────────────────────────
//
// This module used to execute the whole harness at import. A lock test that
// imported `harnessVerdict` therefore started a full mutation run inside the
// test process — which rewrote source files under the suite that was running,
// left guards mutated when it was killed, and cost an afternoon of forensic
// repair. `leak-check.mjs` learned this exact lesson as adversary finding F18
// and carries the same guard; the file that enforces the acceptance bar was the
// one place it had not been applied.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  /** Runs the suite ASYNCHRONOUSLY.
   *
   * It used `execSync`, which blocks the event loop for the whole run — so the
   * SIGINT and SIGTERM handlers below could never be serviced. Executed, a
   * Ctrl-C did not stop the harness, did not restore anything, and three more
   * entries were rewritten after the signal (adversary finding R9-03). The
   * handlers were present, the behaviour was absent, and the invariant that
   * claimed to check them was grepping for the strings "SIGINT" and "SIGTERM".
   *
   * Awaiting a spawned child returns the loop between entries, so a signal is
   * delivered and the restore actually happens. */
  const run = () =>
    new Promise((resolveRun) => {
      // NODE DIRECTLY ON VITEST'S ENTRY, NOT `npx`, AND ITS OWN PROCESS GROUP.
      //
      // `npx` exec-chains to the real vitest process, so killing the child
      // killed the shim and orphaned vitest and its tinypool workers to init,
      // never reaped: a CPU-bound worker tree leaked on every interrupted run
      // (adversary finding R10-05b). `detached` puts the whole tree in one
      // process group so `kill(-pid)` reaches every descendant.
      const child = spawn(process.execPath, [VITEST_BIN, "run", "--silent"], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      // STDOUT AND STDERR ARE KEPT APART. Merging them put vitest's box-drawing
      // stderr into the buffer the summary regex reads, so every entry's
      // evidence column became `1 ⎯⎯⎯⎯⎯⎯⎯` — destroying the per-entry counts
      // that made R9-01 visible in the first place (adversary finding R10-10).
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("close", (code) => {
        if (code === 0) return resolveRun(null);
        resolveRun(summaryLine(out, err));
      });
      child.on("error", () => resolveRun("failed to start"));
      current = child;
    });
  let current = null;

  // A marker here means the PREVIOUS run died mid-mutation. Repair before
  // measuring anything, and say so — a silent repair would hide the fact that a
  // run left the tree weakened.
  const lock = acquireRunLock();
  if (!lock.ok) {
    console.error(`MUTATION HARNESS REFUSED: ${lock.reason} — two harnesses cannot share a tree (X3-03)`);
    process.exit(2);
  }
  process.on("exit", () => releaseRunLock());
  const recovered = recoverInFlight();
  if (recovered?.live) {
    // X2-02: refuse rather than tear a running harness's mutation out from
    // under it. There is exactly one harness per checkout at a time.
    console.error(`MUTATION HARNESS REFUSED: another run (pid ${recovered.pid}) holds ${recovered.path} in flight — two harnesses cannot share a tree`);
    process.exit(2);
  }
  if (recovered?.repaired) {
    console.log(`RECOVERED          a previous run left ${recovered.path} mutated; restored before starting`);
  }

  /** The file currently mutated, restored by every exit path there is. */
  let inFlight = null;
  const restoreInFlight = () => {
    if (inFlight === null) return;
    writeFileSync(inFlight.path, inFlight.original);
    rmSync(MARKER, { force: true });
    inFlight = null;
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]) {
    process.on(sig, () => {
      // The whole group, not just the leader: see VITEST_BIN above.
      if (current?.pid !== undefined) {
        try {
          process.kill(-current.pid, "SIGKILL");
        } catch {
          current.kill("SIGKILL");
        }
      }
      // NO RESTORE CALL HERE. `process.exit` runs the `exit` handler below,
      // which restores — so a call on this line was dead code that READ as the
      // mechanism satisfying the standing invariant, and could be deleted with
      // every gate green including the drill (adversary finding R12-04 leg B).
      // The unreachable-guard rule applies to the harness as much as to the
      // money path: deleted, leaving ONE restore path that the drill proves.
      console.error(`\nMUTATION HARNESS INTERRUPTED by ${sig} — tree restored, result is void`);
      process.exit(130);
    });
  }
  process.on("uncaughtException", (err) => {
    // Same reasoning as the signal handlers: `process.exit` reaches the `exit`
    // handler, which is the one restore path and the one the drill exercises.
    console.error(`\nMUTATION HARNESS CRASHED: ${err?.message ?? err}`);
    process.exit(1);
  });
  /** THE ONE RESTORE PATH, and deliberately the only one.
   *
   * Every exit this process can observe funnels through here: the signal
   * handlers and the crash handler both call `process.exit`, which runs `exit`
   * listeners. Three redundant restore calls meant each was individually
   * deletable with the whole suite AND the drill green — coverage that read as
   * three belts and was one. */
  process.on("exit", restoreInFlight);

  const SELF = fileURLToPath(import.meta.url);
  const tableEnd = tableEndOf(readFileSync(SELF, "utf8"));

  /** Apply one entry, run the suite, restore. Returns the failure summary, or
   * null when the suite stayed green (i.e. the mutation SURVIVED). */
  const measure = async (file, from, to) => {
    const path = resolveEntry(file);
    const original = readFileSync(path, "utf8");
    const { at, next } = applyEntry(original, from, to, { isSelf: path === SELF, tableEnd });
    if (at === -1) return { found: false };
    // MARKER FIRST, then mutate. The other order leaves a window in which the
    // source is broken and nothing on disk records how to put it back.
    writeFileSync(MARKER, JSON.stringify({ path, original, workspace: ROOT, pid: process.pid }));
    inFlight = { path, original };
    let failure;
    try {
      writeFileSync(path, next);
      failure = await run();
    } finally {
      restoreInFlight();
    }
    return { found: true, failure };
  };

  /** THE META-CHECK. Nothing this harness reports may be believed until it has
   * demonstrated, on this machine and in this tree, that it can report BOTH
   * answers. The canaries and the verdict live in mutate-lib.mjs so they can be
   * driven by a test — they were enforced by nothing at all (R10-01).
   *
   * Human ruling 2026-08-17: "a harness that cannot fail must itself fail the
   * gate. Any harness result not preceded by a passing meta-check is void." */
  console.log("META-CHECK — proving the harness can report both answers\n");
  const metaResults = [];
  for (const c of META_CANARIES) {
    const { found, failure } = await measure(c.file, c.from, c.to);
    if (!found) {
      console.error(`META-CHECK FAILED: ${c.name} — its target text is gone, so the check itself is stale.`);
      console.error("HARNESS RESULT IS VOID. Investigate before trusting any number below.");
      process.exit(1);
    }
    const got = classifyRun(failure);
    metaResults.push({ name: c.name, expect: c.expect, got });
    console.log(`  ${got === c.expect ? "ok  " : "FAIL"} ${c.name}  |  got ${got}${failure ? `  (${failure})` : ""}`);
  }
  const meta = metaCheckVerdict(metaResults);
  if (!meta.ok) {
    console.error(`\n${meta.reason}`);
    process.exit(1);
  }
  console.log("");

  let survived = 0;
  let notFound = 0;
  // NO `interrupted` FLAG AND NO `break`. It was dead — the signal handler
  // exits the process, so the loop never sees it — and its REACHABLE form would
  // be worse than dead: breaking out would fall through to the summary and
  // print "N mutations: N caught" for a run that stopped a third of the way in
  // (adversary finding R10-07b). An interrupted run has no result, and the
  // handler saying so and exiting 130 is the whole of the correct behaviour.
  for (const [name, file, from, to] of MUTATIONS) {
    const { found, failure } = await measure(file, from, to);
    if (!found) {
      console.log(`PATTERN-NOT-FOUND  ${name}  (${file})`);
      notFound += 1;
      continue;
    }
    // THE SAME CALL THE META-CHECK MAKES. A second copy of this comparison is
    // a second thing to get wrong, and the meta-check validates only the copy
    // it runs — see `classifyRun`.
    if (classifyRun(failure) === "SURVIVED") {
      console.log(`*** SURVIVED ***   ${name}`);
      survived += 1;
    } else {
      console.log(`CAUGHT             ${name}  |  ${failure}`);
    }
  }
  console.log(`\n${MUTATIONS.length} mutations: ${MUTATIONS.length - survived - notFound} caught, ${survived} survived, ${notFound} not found`);

  // EXIT NON-ZERO, so this can be a CI stage rather than a ritual.
  const verdict = harnessVerdict(survived, notFound);
  if (!verdict.ok) {
    console.error(`\n${verdict.reason}`);
    process.exit(1);
  }
}
