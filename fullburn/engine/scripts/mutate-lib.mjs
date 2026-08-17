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

