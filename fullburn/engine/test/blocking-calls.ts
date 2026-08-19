/** WHICH LOCAL NAMES IN THIS MODULE BLOCK THE EVENT LOOP.
 *
 * The check this replaces matched call sites by NAME:
 * `/\b(?:execSync|execFileSync|spawnSync)\s*\(/`. One import renames the API
 * and the check goes blind —
 *
 *     import { spawnSync as runSuiteBlocking } from "node:child_process";
 *     runSuiteBlocking(process.execPath, [VITEST_BIN, "run"]);
 *
 * — which restores R9-03 in full (a harness that cannot service SIGINT, so an
 * interrupted run leaves the tree mutated) with every structural check green.
 * That is the sixth time a check matched the SPELLING of a defect rather than
 * the defect; the fifth was R10-09, on this same line (adversary finding
 * R11-04).
 *
 * So the binding is resolved instead of the call site guessed: read what the
 * module actually imported from `child_process`, under whatever local name, and
 * report those names. What cannot be resolved statically — a namespace import,
 * a default import, `require`, a dynamic `import()` — is REFUSED rather than
 * assumed benign, the same rule the e2e-variance checks follow.
 *
 * THIS IS DEFENCE IN DEPTH, NOT THE LOCK. The behavioural lock on R9-03 is the
 * SIGINT drill (`npm run drill`, its own CI stage): it interrupts a REAL
 * harness run and asserts the tree comes back. A static check cannot prove an
 * event loop turns. Said plainly here because a check that overstates its own
 * coverage is the defect it is meant to catch. */

/** Synchronous `child_process` APIs — each one blocks until the child exits. */
const BLOCKING_APIS = ["execSync", "execFileSync", "spawnSync", "fork"] as const;

export interface BlockingScan {
  /** Local names in this source that are bound to a blocking child_process API. */
  readonly names: readonly string[];
  /** Why the scan could not be completed. Non-empty means REFUSE. */
  readonly unresolvable: readonly string[];
}

const CP = String.raw`["'](?:node:)?child_process["']`;

export function blockingBindings(source: string): BlockingScan {
  const names: string[] = [];
  const unresolvable: string[] = [];

  // A namespace or default import hides the member access behind a value the
  // check cannot follow (`cp["spawn" + "Sync"](…)`), so it is refused.
  if (new RegExp(String.raw`import\s+(?:\*\s+as\s+\w+|\w+)\s*(?:,\s*\{[^}]*\}\s*)?from\s+${CP}`).test(source)) {
    unresolvable.push("a namespace or default import of child_process cannot be resolved statically");
  }
  if (new RegExp(String.raw`require\s*\(\s*${CP}`).test(source)) {
    unresolvable.push("require() of child_process cannot be resolved statically");
  }
  if (new RegExp(String.raw`import\s*\(\s*${CP}`).test(source)) {
    unresolvable.push("a dynamic import of child_process cannot be resolved statically");
  }

  for (const m of source.matchAll(new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s+${CP}`, "g"))) {
    for (const raw of m[1]!.split(",")) {
      const spec = raw.trim();
      if (spec === "") continue;
      const alias = /^(\w+)\s+as\s+(\w+)$/.exec(spec);
      const imported = alias ? alias[1]! : spec;
      const local = alias ? alias[2]! : spec;
      if ((BLOCKING_APIS as readonly string[]).includes(imported)) names.push(local);
    }
  }
  return { names, unresolvable };
}

/** Is any blocking binding CALLED in this slice of source? Returns the offending
 * local names, or the unresolvable reasons — both are failures. */
export function blockingCalls(moduleSource: string, slice: string): readonly string[] {
  const scan = blockingBindings(moduleSource);
  if (scan.unresolvable.length > 0) return scan.unresolvable;
  return scan.names.filter((n) => new RegExp(String.raw`\b${n}\s*\(`).test(slice));
}
