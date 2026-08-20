#!/usr/bin/env node
/** Mutation-harness helpers that are SAFE TO IMPORT.
 *
 * They live apart from `mutate.mjs` for one reason: nothing that imports a
 * helper should be able to start a mutation run. A lock test imported
 * `harnessVerdict` from the harness itself, and reverting the harness's
 * entry-point guard then turned that test into a nested mutation pass — the
 * check for the trap became a way to spring it. This module has no runner to
 * start, so importing it can do nothing at all.
 *
 * Nothing here weakens the tree: `recoverInFlight` only ever RESTORES. */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** The workspace this harness belongs to. A marker may only name a path inside
 * it, and only the workspace it was written in. */
const WORKSPACE = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

/** THE IN-FLIGHT MARKER — how a crashed run is made harmless.
 *
 * This harness is the only tool in the repo that writes to the source tree, and
 * it writes a DELIBERATELY BROKEN version of a guard before running the suite.
 * A run that dies between those two writes leaves that guard reverted on disk,
 * silently: this session lost an afternoon to exactly that, with 57 of 100
 * guards sitting in their mutated form and every one of them looking like
 * ordinary source.
 *
 * Signal handlers cover the polite deaths. They cannot cover SIGKILL, an OOM
 * kill, or the power going out — so before each mutation the original content
 * is written to a marker file, and the marker is removed only after the restore
 * succeeds. A marker found at startup means the previous run died mid-mutation,
 * and its content is restored before anything else happens. The marker is the
 * part that survives the deaths a process cannot handle.
 *
 * STANDING INVARIANT (human ruling, 2026-08-17): any tool that can write to the
 * source tree must be import-safe and must fail closed — a partial or crashed
 * run must never leave the tree in a weakened state. `invariants.test.ts`
 * checks it every round. */
export const MARKER = fileURLToPath(new URL("./.mutate-inflight.json", import.meta.url));

/** Restores whatever a previous run left mutated. Returns what it repaired. */
export function recoverInFlight(markerPath = MARKER, fs = { existsSync, readFileSync, writeFileSync, rmSync }) {
  if (!fs.existsSync(markerPath)) return null;
  let record;
  try {
    record = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  } catch {
    // An unreadable marker means a crash mid-write of the marker itself, which
    // happens BEFORE the source is touched — nothing to restore, but do not
    // silently swallow it either.
    fs.rmSync(markerPath, { force: true });
    return { path: null, repaired: false };
  }
  if (typeof record?.path !== "string" || typeof record?.original !== "string") {
    fs.rmSync(markerPath, { force: true });
    return { path: null, repaired: false };
  }
  /** THE MARKER NAMES A PATH, AND A PATH IS NOT A CAPABILITY.
   *
   * `recoverInFlight` wrote whatever path the marker named, so a marker left by
   * a run in another checkout — or one an attacker dropped, since the file is
   * fixed, unowned and outside `.gitignore` — created files that never existed
   * and overwrote newer content with stale pre-crash bytes (adversary finding
   * R9-09). A repair that can write anywhere is not a repair.
   *
   * Three conditions, all fail-closed: the path must resolve INSIDE this
   * workspace, the file must already exist (a repair restores, it never
   * creates), and the marker must name the workspace it was written in. */
  const inWorkspace = resolve(record.path).startsWith(`${WORKSPACE}/`);
  const sameWorkspace = record.workspace === undefined || record.workspace === WORKSPACE;
  if (!inWorkspace || !sameWorkspace || !fs.existsSync(record.path)) {
    fs.rmSync(markerPath, { force: true });
    return {
      path: record.path,
      repaired: false,
      refused: !inWorkspace ? "outside the workspace" : !sameWorkspace ? "written by another checkout" : "no such file",
    };
  }
  fs.writeFileSync(record.path, record.original);
  fs.rmSync(markerPath, { force: true });
  return { path: record.path, repaired: true };
}

/** The harness's verdict, as a pure function so it can be driven directly.
 *
 * Extracted because a test that greps this file for the guard's source text
 * matches the harness's OWN mutation entry as readily as the guard — it passed
 * with the guard reverted. A behaviour is locked by calling it, not by reading
 * the line that implements it. */
export function harnessVerdict(survived, notFound) {
  if (survived > 0 || notFound > 0) {
    return {
      ok: false,
      reason:
        `MUTATION HARNESS FAIL: ${survived} unprotected fix(es), ${notFound} stale entr(ies). ` +
        "A fix whose one-line revert leaves the suite green is not protected by anything.",
    };
  }
  return { ok: true, reason: "every lock bites" };
}

/** Where an entry's target text actually is, and what the mutated file becomes.
 *
 * PURE, AND DRIVEN BY A TEST, because the rule it implements has now been got
 * wrong three times and each time the check for it was a grep that the mutation
 * TABLE satisfied. An entry targeting the harness contains its own target as a
 * string literal, and `String.replace` takes the FIRST occurrence — the table
 * row, not the code. The run then reports a survivor for an entry whose guard
 * was never reverted, which is indistinguishable in the output from a guard
 * that is genuinely unprotected.
 *
 * So a self-targeting entry is searched only BEYOND the table it lives in.
 * Every other file is searched from the start. `isSelf` and `tableEnd` are
 * parameters rather than module state precisely so a test can drive the case
 * where the target appears in both places and assert WHICH one is chosen — a
 * table entry cannot satisfy that assertion (adversary finding R9-02). */
export function applyEntry(source, from, to, { isSelf = false, tableEnd = 0 } = {}) {
  const at = source.indexOf(from, isSelf ? tableEnd : 0);
  if (at === -1) return { at: -1, next: null };
  return { at, next: source.slice(0, at) + to + source.slice(at + from.length) };
}

/** The end of the mutation table in the harness's own source. Everything before
 * this offset is data ABOUT code and must never be treated as code. */
export function tableEndOf(harnessSource) {
  const at = harnessSource.indexOf("\n];");
  // Fail closed: an unfindable table means we cannot tell data from code, and
  // guessing zero would silently restore the exact defect this closes.
  if (at === -1) throw new Error("mutation table not found in harness source — refusing to run (fail closed)");
  return at + 3;
}

/** THE META-CHECK'S CANARIES, and the verdict over their results.
 *
 * Here rather than in the runner so they can be DRIVEN. The meta-check is what
 * every other number now rests on, and it was enforced by nothing: deleting it
 * whole left the suite green and no mutation entry named it (adversary finding
 * R10-01). The standing rule — every harness result is void without a passing
 * meta-check — was prose.
 *
 * The NEGATIVE canary is the half that catches R9-01's class. It appends a
 * comment, so it changes no behaviour and MUST survive; if it is reported
 * caught, the suite is red for reasons unrelated to mutations and every CAUGHT
 * in the run is an artifact. The POSITIVE canary reverts a real guard and MUST
 * be caught, or the harness is blind rather than merely stuck.
 *
 * `to` must begin with `from` and add only a comment — the lock asserts that,
 * because a negative canary that quietly became a real edit would make the
 * meta-check fail forever, and one that became an edit the suite happens not to
 * notice would let R9-01 back in undetected. */
export const META_CANARIES = Object.freeze([
  Object.freeze({
    name: "negative canary — a comment-only edit must SURVIVE",
    file: "engine/src/spend-meter.ts",
    from: "const MICROS_PER_USD = 1_000_000;",
    to: "const MICROS_PER_USD = 1_000_000; // meta-check canary",
    expect: "SURVIVED",
  }),
  Object.freeze({
    name: "positive canary — a reverted guard must be CAUGHT",
    file: "engine/src/spend-meter.ts",
    from: "    if (brand !== RESERVATION_BRAND) {",
    to: "    if (false) {",
    expect: "CAUGHT",
  }),
]);

/** Did the harness prove it can report BOTH answers? Anything else is void. */
export function metaCheckVerdict(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { ok: false, reason: "META-CHECK DID NOT RUN — HARNESS RESULT IS VOID." };
  }
  const wrong = results.filter((r) => r.got !== r.expect);
  if (wrong.length === 0) return { ok: true, reason: "the harness can report both answers" };
  const negativeFailed = wrong.some((r) => r.expect === "SURVIVED");
  return {
    ok: false,
    reason:
      `META-CHECK FAILED: ${wrong.map((r) => `${r.name} expected ${r.expect}, got ${r.got}`).join("; ")}.\n` +
      (negativeFailed
        ? "The suite is red for a change that alters no behaviour, so EVERY entry would report CAUGHT " +
          "whether or not its lock works. This is adversary finding R9-01 recurring.\n"
        : "The suite stayed green with a real guard reverted, so the harness cannot see failures at all.\n") +
      "HARNESS RESULT IS VOID.",
  };
}

/** THE PER-ENTRY EVIDENCE COLUMN, as a function so it can be driven.
 *
 * It was `/Tests\s+(.*)$/m` inline in the runner, which matches inside a TEST
 * NAME as readily as in vitest's summary: `resetProcessLedgerForTests refuses
 * when no test runner is present` contains `Tests ` followed by text, so three
 * entries — the three locking that round's headline money fix — printed a test
 * title where their counts belonged (adversary finding R12-08, R10-10
 * recurring). The verdict was never wrong; the DIAGNOSTIC was lost, and the
 * per-entry counts are what made R9-01 visible in the first place.
 *
 * The summary line is indented and its capture starts with a DIGIT. A test
 * name cannot satisfy that, whatever it is called.
 */
export function summaryLine(out, err) {
  const SUMMARY = /^[ \t]+Tests[ \t]+(\d[^\n]*)$/m;
  const m = SUMMARY.exec(out ?? "") ?? SUMMARY.exec(err ?? "");
  return m ? m[1].trim() : "failed";
}
