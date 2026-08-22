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
  tableEndOf,
} from "./mutate-lib.mjs";

/** The fullburn workspace root, two levels up from engine/scripts/. */
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
/** The repository root. Some Class-2 artifacts — CODEOWNERS, the CI workflow —
 * live outside the workspace, and a fix that lives there needs an entry here
 * just as much: R8-04 was two of them. */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const resolveEntry = (file) => `${file.startsWith(".github/") ? REPO_ROOT : ROOT}/${file}`;
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
  ["N-02 vitest extension list", "engine/scripts/gate-lib.mjs", "  /(?:^|\\/)vite(?:st)?[._\\-][^/]*$/,", "  /^fullburn\\/vitest[^/]*\\.(?:ts|js|mjs|json)$/,"],
  ["N-02 vite pattern", "engine/scripts/gate-lib.mjs", "  /(?:^|\\/)vite(?:st)?[._\\-][^/]*$/,", "  /^__never__$/,"],
  ["N-11 lockfile Class-1", "engine/scripts/gate-lib.mjs", "  /(?:^|\\/)package-lock\\.json$/,", "  /^__never__$/,"],
  ["N-03 baseCommit fail-open", "engine/scripts/gate-lib.mjs", 'if (typeof baseCommit !== "string" || baseCommit.length === 0) {', "if (false) {"],
  // NOTE: restoring the `baseCommit === undefined ||` disjunct is a semantic
  // NO-OP now that the fail-closed guard returns before the loop, so it is not
  // listed as a mutation — a "survivor" there would be a harness artifact, not
  // an unprotected fix. The guard itself is mutated above and is caught.
  ["N-03 CLI wiring", "engine/scripts/class2-gate.mjs", "  baseCommit: resolvedBase,", "  baseCommitt: resolvedBase,"],
  ["N-04/05 header window", "engine/scripts/gate-lib.mjs", "for (const raw of lines.slice(0, HEADER_LINES)) {", "for (const raw of lines) {"],
  ["N-04 fence length", "engine/scripts/gate-lib.mjs", "      else if (fence.ch === marker.ch && marker.len >= fence.len) fence = null;", "      else if (fence.ch === marker.ch) fence = null;"],
  ["N-06 substitute-then-scan", "engine/scripts/scan-lib.mjs", "    if (realMatches(re, content, path).length > 0) {", "    if (re.test(DECLARED_FIXTURES.reduce((t, f) => t.split(f).join(\"[test-fixture]\"), content))) {"],
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
  ["R7-09 trace loss surfaced", "engine/src/gateway.ts", "      traceLost = sinkErr instanceof Error ? sinkErr.name : \"a non-error\";", "      void sinkErr;"],
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
  ["R8-04b CI runs on .github changes", ".github/workflows/fullburn-ci.yml", `  pull_request:
    paths: ["fullburn/**", ".github/**"]`, `  pull_request:
    paths: ["fullburn/**", ".github/workflows/fullburn-ci.yml"]`],
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
  ["R10-01 meta-check canaries cover both answers", "engine/scripts/mutate-lib.mjs", '    expect: "SURVIVED",', '    expect: "CAUGHT",'],
  ["R10-01 meta-check refuses a disagreement", "engine/scripts/mutate-lib.mjs", "  const wrong = results.filter((r) => r.got !== r.expect);", "  const wrong = [];"],
  ["R10-01 an empty meta-check is void", "engine/scripts/mutate-lib.mjs", "  if (!Array.isArray(results) || results.length === 0) {", "  if (false) {"],
  ["R9-05 production meter binds its own clock", "engine/src/spend-meter.ts", "  constructor(narrowing?: CapsNarrowingTable) {", "  constructor(now?: () => number, narrowing?: CapsNarrowingTable) {"],
  ["R9-09 marker cannot write outside the workspace", "engine/scripts/mutate-lib.mjs", "  if (!inWorkspace || !sameWorkspace || !fs.existsSync(record.path)) {", "  if (false) {"],
  ["R9-10 no Class-2 file is git-binary", "engine/test/hardening.test.ts", "backend.set(\"acme\\u0000corp\", \"meta-oauth\", \"nul-secret\");", "backend.set(\"acme\u0000corp\", \"meta-oauth\", \"nul-secret\");"],
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
  ["R5-02 playwright pattern", "engine/scripts/gate-lib.mjs", "  /(?:^|\\/)playwright[._\\-][^/]*$/,", "  /^__never__$/,"],
  ["R5-02 e2e dir pattern", "engine/scripts/gate-lib.mjs", "  /(?:^|\\/)e2e\\//,", "  /^__never__$/,"],
  ["R5-02 npmrc pattern", "engine/scripts/gate-lib.mjs", "  /(?:^|\\/)\\.npmrc$/,", "  /^__never__$/,"],
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
  ["H-12 own-property recording", "engine/src/eval-harness.ts", "Object.hasOwn(this.#outputs, this.#currentCase) ? this.#outputs[this.#currentCase] : undefined", "this.#outputs[this.#currentCase]"],
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
    "      /^[ \\t]*(?:import|export)\\b[^;]*?from[ \\t]+[\"']([^\"']+)[\"']|^[ \\t]*import[ \\t]+[\"']([^\"']+)[\"']/gm,",
    "      /from[ \\t]+[\"']([^\"']+)[\"']|^[ \\t]*import[ \\t]+[\"']([^\"']+)[\"']/gm,"],
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
  ["R14-01 a transport refusal is surfaced", "engine/src/gateway.ts",
    "      committedUsd = reservation.amountUsd;\n      throw redactError(err, secrets, GatewayError);",
    "      committedUsd = reservation.amountUsd;\n      return { greeting: \"swallowed\" };"],
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
  const recovered = recoverInFlight();
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
