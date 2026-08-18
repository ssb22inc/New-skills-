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
  harnessVerdict,
  metaCheckVerdict,
  recoverInFlight,
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
  ["N-01 clock default", "engine/src/spend-meter.ts", "constructor(now: () => number, capsFor: CapsResolver) {", "constructor(now: () => number = () => 0, capsFor: CapsResolver) {"],
  ["N-01 clock type guard", "engine/src/spend-meter.ts", 'if (typeof now !== "function") {', "if (false) {"],
  ["N-09 reservedUsd day-scoped", "engine/src/spend-meter.ts",
    `    let micros = 0;
    for (const open of this.#open.values()) {
      if (open.clientId === clientId) micros += open.micros;
    }`,
    `    let micros = this.#reservedMicros.get(this.#key(clientId)) ?? 0;`],
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
  ["R7-02 zone-bucketed day key", "engine/src/spend-meter.ts", "  return new Intl.DateTimeFormat(\"en-CA\", {", "  void timeZone; return new Date(nowMs).toISOString().slice(0, 10); return new Intl.DateTimeFormat(\"en-CA\", {"],
  ["R7-02 zone travels with the ceilings", "config/src/caps.ts", "  return Object.freeze({ dailyUsd, monthlyUsd, timeZone: caps.ianaTimeZone });", "  return Object.freeze({ dailyUsd, monthlyUsd, timeZone: \"UTC\" });"],
  // R7-02's zone VALIDATION call is not listed, for the reason ledger L19
  // records about assertCapsCoherent: every client in the frozen table declares
  // a resolvable zone, so removing the call from getCaps changes nothing
  // observable. The check itself is driven directly in locks-r7 and a bad zone
  // is refused at reserve() time. Disclosed in L25 rather than faked.
  ["R7-03 backwards clock refused", "engine/src/spend-meter.ts", "    if (seen !== undefined && day < seen) {", "    if (false) {"],
  ["R7-03 non-finite instant refused", "engine/src/spend-meter.ts", "  if (!Number.isFinite(nowMs)) {", "  if (false) {"],
  ["R7-06 meter owns the ceilings", "engine/src/spend-meter.ts", "    const caps = this.#capsFor(clientId);", "    const caps = arguments[2] ?? this.#capsFor(clientId);"],
  ["R7-06 resolver required", "engine/src/spend-meter.ts", "    if (typeof capsFor !== \"function\") {", "    if (false) {"],
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
  ["R8-01 caps come from the frozen table", "engine/src/spend-meter.ts", "    super(trustedClock(), (clientId) => effectiveAiCapsUsd(clientId, narrowing));", "    super(trustedClock(), (clientId) => ({ ...effectiveAiCapsUsd(clientId, narrowing), dailyUsd: 1e9, monthlyUsd: 1e9 }));"],
  // R8-02: settle() takes one argument. The mutation restores the override.
  ["R8-02 settle takes no actual", "engine/src/spend-meter.ts",
    `    const open = this.#close(reservation);
    if (open === null) return;
    const micros = open.micros;`,
    `    const open = this.#close(reservation);
    if (open === null) return;
    const micros = arguments[1] === undefined ? open.micros : toMicros(arguments[1], "actual provider charge");`],
  // R8-03: the MONTH key on its own. R7-02 was locked at day granularity only,
  // and this revert survived the full suite while reopening the $200 ceiling.
  ["R8-03 zone-bucketed month key", "engine/src/spend-meter.ts", "  return zoneDayKey(nowMs, timeZone).slice(0, 7);", "  void timeZone; return new Date(nowMs).toISOString().slice(0, 7);"],
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
  ["R8-08 high-water mark advances", "engine/src/spend-meter.ts", "if (seen === undefined || day > seen) this.#highWater.set(clientId, day);", "if (seen === undefined) this.#highWater.set(clientId, day);"],
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
  ["R10-02 the production meter is frozen", "engine/src/spend-meter.ts", "    Object.freeze(this);\n  }\n}", "  }\n}"],
  ["R10-02 settle refuses unavailable storage", "engine/src/spend-meter.ts", "    this.#assertAvailable();\n    const open = this.#close(reservation);", "    const open = this.#close(reservation);"],
  ["R10-02 release refuses unavailable storage", "engine/src/spend-meter.ts", "    this.#assertAvailable();\n    this.#close(reservation);", "    this.#close(reservation);"],
  ["R10-03 the clock is anchored, not re-read", "engine/src/spend-meter.ts", "    return anchorWall + Number((mono - anchorMono) / 1_000_000n);", "    return Date.now();"],
  ["R10-03 disagreeing time sources are refused", "engine/src/spend-meter.ts", "  if (hi - lo > ANCHOR_TOLERANCE_MS) {", "  if (false) {"],
  ["R10-03 the monotonic source cannot go backwards", "engine/src/spend-meter.ts", "    if (mono < lastMono) {", "    if (false) {"],
  ["R10-03 the production meter uses the trusted clock", "engine/src/spend-meter.ts", "    super(trustedClock(), (clientId) => effectiveAiCapsUsd(clientId, narrowing));", "    super(() => Date.now(), (clientId) => effectiveAiCapsUsd(clientId, narrowing));"],
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
  ["R9-10 no Class-2 file is git-binary", "engine/test/hardening.test.ts", "acme\\u0000corp", "acme\u0000corp"],
  ["R9-11 runtime skip/fail refused", "engine/test/e2e-variance.ts", "      if (/\\b(?:test|it)\\s*\\.\\s*(?:skip|fixme|fail)\\s*\\(/.test(real)) return false;", "      void real;"],
  ["R9-11 bare return refused", "engine/test/e2e-variance.ts", "      if (/\\breturn\\b\\s*;/.test(real)) return false;", "      void 0;"],
  ["R9-11 skipped describe refused", "engine/test/e2e-variance.ts", "      if (/\\b(?:test|it)\\s*\\.\\s*describe\\s*\\.\\s*(?:skip|fixme)\\s*\\(/.test(stripped)) return false;", "      void stripped;"],
  ["R9-02 self-targeting entries cannot rewrite the table", "engine/scripts/mutate-lib.mjs", "  const at = source.indexOf(from, isSelf ? tableEnd : 0);", "  const at = source.indexOf(from);"],
  ["R9-02 table boundary fails closed", "engine/scripts/mutate-lib.mjs", 'if (at === -1) throw new Error("mutation table not found in harness source — refusing to run (fail closed)");', "if (at === -1) return 0;"],
  // Found while running the R7 gates, not by the review: `npm run leak-check`
  // passed no root, so every path-scoped rule matched nothing and the local
  // scan reported clean on a tree CI would have flagged.
  ["leak-check scannable root", "engine/scripts/leak-check.mjs", "  assertScannableRoot(repoRoot);", "  void repoRoot;"],
  ["leak-check local command matches CI", "package.json", "\"leak-check\": \"node engine/scripts/leak-check.mjs ..\"", "\"leak-check\": \"node engine/scripts/leak-check.mjs\""],
  // ---- r6 findings ----
  ["R6-04 ledger keyed by identity", "engine/src/spend-meter.ts", "    const open = this.#open.get(reservation);", "    const open = [...this.#open.entries()].find(([h]) => h.id === reservation.id)?.[1];"],
  ["R6-04 handle frozen", "engine/src/spend-meter.ts", "    Object.freeze(this);", "    void 0;"],
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
  ["R5-08 one clock read", "engine/src/spend-meter.ts", "      day: `d:${zoneDayKey(nowMs, timeZone)}|${clientId}`,\n      month: `m:${zoneMonthKey(nowMs, timeZone)}|${clientId}`,", "      day: `d:${zoneDayKey(this.#now(), timeZone)}|${clientId}`,\n      month: `m:${zoneMonthKey(this.#now(), timeZone)}|${clientId}`,"],
  // ---- H8 caps: the approved ceilings and the month-keyed accounting ----
  ["H8 monthly ceiling unchecked", "engine/src/spend-meter.ts", "    if (projectedMonth > monthlyCapMicros) {", "    if (false) {"],
  ["H8 month period dropped from settle", "engine/src/spend-meter.ts", "    for (const period of [open.day, open.month]) {\n      const committed = this.#read(this.#committedMicros, period, \"committed spend\");", "    for (const period of [open.day]) {\n      const committed = this.#read(this.#committedMicros, period, \"committed spend\");"],
  ["H8 month key equals day key", "engine/src/spend-meter.ts", "    return this.#periods(clientId, this.#zoneOf(clientId)).month;", "    return this.#periods(clientId, this.#zoneOf(clientId)).day;"],
  ["H8 ceilings object not required", "engine/src/spend-meter.ts", "    if (caps === null || typeof caps !== \"object\") {", "    if (false) {"],
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
        const m = /Tests\s+(.*)$/m.exec(out) ?? /Tests\s+(.*)$/m.exec(err);
        resolveRun(m ? m[1].trim() : "failed");
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
      restoreInFlight();
      console.error(`\nMUTATION HARNESS INTERRUPTED by ${sig} — tree restored, result is void`);
      process.exit(130);
    });
  }
  process.on("uncaughtException", (err) => {
    restoreInFlight();
    console.error(`\nMUTATION HARNESS CRASHED: ${err?.message ?? err}`);
    process.exit(1);
  });
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
    const got = failure === null ? "SURVIVED" : "CAUGHT";
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
    if (failure === null) {
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
