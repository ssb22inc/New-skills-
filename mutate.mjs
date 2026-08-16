#!/usr/bin/env node
/** Mutation harness: apply one revert, run the suite, restore. A lock that does
 * not turn the suite red is not a lock. */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROOT = "/tmp/claude-0/-home-user-New-skills-/64269547-e557-5483-8b4d-c2147d059962/scratchpad/r5/fullburn";

const MUTATIONS = [
  // ---- r4 findings ----
  ["N-01 clock default", "engine/src/spend-meter.ts", "constructor(now: () => number) {", "constructor(now: () => number = () => 0) {"],
  ["N-01 clock type guard", "engine/src/spend-meter.ts", 'if (typeof now !== "function") {', "if (false) {"],
  ["N-09 reservedUsd day-scoped", "engine/src/spend-meter.ts",
    `    let micros = 0;
    for (const open of this.#open.values()) {
      if (open.clientId === clientId) micros += open.micros;
    }`,
    `    let micros = this.#reservedMicros.get(this.#key(clientId)) ?? 0;`],
  ["N-08 departed before call", "engine/src/gateway.ts", "      departed = true;\n      output = await inFlight;", "      output = await inFlight;\n      departed = true;"],
  ["N-08 inner-catch settles regardless", "engine/src/gateway.ts", "      if (!departed) throw err;", "      if (false) throw err;"],
  ["N-07 silent release catch", "engine/src/gateway.ts", "        releaseLeak = releaseErr;", "        void releaseErr;"],
  ["N-02 vitest extension list", "engine/scripts/gate-lib.mjs", "  /(?:^|\\/)vitest\\.[^/]*$/,", "  /^fullburn\\/vitest[^/]*\\.(?:ts|js|mjs|json)$/,"],
  ["N-02 vite pattern", "engine/scripts/gate-lib.mjs", "  /(?:^|\\/)vite(?:st)?[.\\-][^/]*$/,", "  /^__never__$/,"],
  ["N-11 lockfile Class-1", "engine/scripts/gate-lib.mjs", "  /(?:^|\\/)package-lock\\.json$/,", "  /^__never__$/,"],
  ["N-03 baseCommit fail-open", "engine/scripts/gate-lib.mjs", 'if (typeof baseCommit !== "string" || baseCommit.length === 0) {', "if (false) {"],
  // NOTE: restoring the `baseCommit === undefined ||` disjunct is a semantic
  // NO-OP now that the fail-closed guard returns before the loop, so it is not
  // listed as a mutation — a "survivor" there would be a harness artifact, not
  // an unprotected fix. The guard itself is mutated above and is caught.
  ["N-03 CLI wiring", "engine/scripts/class2-gate.mjs", "  baseCommit: resolvedBase,", "  baseCommitt: resolvedBase,"],
  ["N-04/05 header window", "engine/scripts/gate-lib.mjs", "for (const raw of lines.slice(0, HEADER_LINES)) {", "for (const raw of lines) {"],
  ["N-04 fence length", "engine/scripts/gate-lib.mjs", "      else if (fence.ch === marker.ch && marker.len >= fence.len) fence = null;", "      else if (fence.ch === marker.ch) fence = null;"],
  ["N-05 details stripping", "engine/scripts/gate-lib.mjs", "  const stripped = text.replace(CONCEALING_BLOCKS, \"\");", "  const stripped = text;"],
  ["N-06 substitute-then-scan", "engine/scripts/scan-lib.mjs", "    if (realMatches(re, content).length > 0) {", "    if (re.test(content.split(DECLARED_FIXTURES[0]).join(\"\").split(DECLARED_FIXTURES[1]).join(\"\"))) {"],
  ["N-06 residue check", "engine/scripts/scan-lib.mjs", "  return /^[^A-Za-z0-9]*(?:Bearer)?[^A-Za-z0-9]*$/i.test(residue);", "  return true;"],
  ["r4-lock8 WeakSet brand", "config/src/models.ts", "!(att instanceof EvalAttestation) || !GENUINE.has(att)", "!(att instanceof EvalAttestation)"],
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

const run = () => {
  try {
    execSync("npx vitest run --silent", { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    return null;
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    const m = /Tests\s+(.*)$/m.exec(out);
    return m ? m[1].trim() : "failed";
  }
};

let survived = 0;
let notFound = 0;
for (const [name, file, from, to] of MUTATIONS) {
  const path = `${ROOT}/${file}`;
  const original = readFileSync(path, "utf8");
  if (!original.includes(from)) {
    console.log(`PATTERN-NOT-FOUND  ${name}  (${file})`);
    notFound += 1;
    continue;
  }
  writeFileSync(path, original.replace(from, to));
  const failure = run();
  writeFileSync(path, original);
  if (failure === null) {
    console.log(`*** SURVIVED ***   ${name}`);
    survived += 1;
  } else {
    console.log(`CAUGHT             ${name}  |  ${failure}`);
  }
}
console.log(`\n${MUTATIONS.length} mutations: ${MUTATIONS.length - survived - notFound} caught, ${survived} survived, ${notFound} not found`);
