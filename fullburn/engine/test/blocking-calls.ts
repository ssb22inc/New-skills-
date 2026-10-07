/** WHICH LOCAL NAMES IN THIS MODULE BLOCK THE EVENT LOOP.
 *
 * Three rounds have now walked past this check on the same line of the same
 * file, each time by respelling the dependency rather than by hiding it:
 *
 *   R10-09  `spawnSync(` did not match a list containing only `execSync`.
 *   R11-04  `import { spawnSync as runSuiteBlocking }` did not match the
 *           widened NAME list.
 *   R12-04  `export { spawnSync as runSync } from "node:child_process"` in an
 *           ordinary one-line helper module did not match the direct-import
 *           BINDING resolver — and neither did `f.call(null, …)` or
 *           `Reflect.apply(f, …)` once the binding was resolved.
 *
 * Each fix enumerated one more spelling. So this version resolves the binding
 * TRANSITIVELY through the local module graph — a name is blocking if it is
 * bound, through any chain of local re-exports, to a synchronous
 * `child_process` API — and it treats every way of invoking a value as a call,
 * not just `name(`. What it cannot resolve statically it REFUSES: a namespace
 * import, a default import, `require`, a dynamic `import()`, or a re-export
 * from a module it was not given.
 *
 * THIS IS DEFENCE IN DEPTH, NOT THE LOCK, and saying so is the point. The
 * behavioural lock on R9-03 is the SIGINT drill (`npm run drill`, its own CI
 * stage), which now asserts that NO FURTHER SOURCE FILE is mutated after the
 * signal is delivered — R9-03's recorded harm, measured rather than timed. A
 * static check cannot prove an event loop turns. A check that overstates its
 * own coverage is the defect it exists to catch. */

/** Synchronous `child_process` APIs — each one blocks until the child exits. */
const BLOCKING_APIS = ["execSync", "execFileSync", "spawnSync", "fork"] as const;

const CP = String.raw`["'](?:node:)?child_process["']`;
const LOCAL = String.raw`["']\.{1,2}\/[^"']+["']`;

export interface BlockingScan {
  /** Local names in this source bound to a blocking child_process API. */
  readonly names: readonly string[];
  /** Why the scan could not be completed. Non-empty means REFUSE. */
  readonly unresolvable: readonly string[];
}

/** One module's exports that are (transitively) blocking APIs: exported name →
 * true. `graph` maps a specifier as written to that module's source. */
function blockingExports(
  source: string,
  graph: ReadonlyMap<string, string>,
  seen: ReadonlySet<string>,
  unresolvable: string[],
): Set<string> {
  const out = new Set<string>();

  // `export * from "node:child_process"` re-exports every API under its own
  // name; `export * from "./x.mjs"` does the same for whatever x exports.
  for (const m of source.matchAll(new RegExp(String.raw`export\s*\*\s*from\s+(${CP}|${LOCAL})`, "g"))) {
    const spec = m[1]!.slice(1, -1);
    if (/^(?:node:)?child_process$/.test(spec)) {
      for (const api of BLOCKING_APIS) out.add(api);
      continue;
    }
    const child = graph.get(spec);
    if (child === undefined || seen.has(spec)) {
      unresolvable.push(`export * from "${spec}" could not be followed`);
      continue;
    }
    for (const n of blockingExports(child, graph, new Set([...seen, spec]), unresolvable)) out.add(n);
  }

  // `export { a as b } from "..."`
  for (const m of source.matchAll(new RegExp(String.raw`export\s*\{([^}]*)\}\s*from\s+(${CP}|${LOCAL})`, "g"))) {
    const spec = m[2]!.slice(1, -1);
    const fromCp = /^(?:node:)?child_process$/.test(spec);
    let childBlocking: Set<string> | null = null;
    if (!fromCp) {
      const child = graph.get(spec);
      if (child === undefined || seen.has(spec)) {
        unresolvable.push(`export ... from "${spec}" could not be followed`);
        continue;
      }
      childBlocking = blockingExports(child, graph, new Set([...seen, spec]), unresolvable);
    }
    for (const spec2 of m[1]!.split(",")) {
      const t = spec2.trim();
      if (t === "") continue;
      const alias = /^(\w+)\s+as\s+(\w+)$/.exec(t);
      const imported = alias ? alias[1]! : t;
      const local = alias ? alias[2]! : t;
      const isBlocking = fromCp
        ? (BLOCKING_APIS as readonly string[]).includes(imported)
        : childBlocking!.has(imported);
      if (isBlocking) out.add(local);
    }
  }

  // A local `import` re-exported later (`import { x } from "..."; export { x }`)
  // is covered by treating imported blocking names as exportable.
  const imported = blockingImports(source, graph, seen, unresolvable);
  for (const m of source.matchAll(/export\s*\{([^}]*)\}\s*;/g)) {
    for (const spec2 of m[1]!.split(",")) {
      const t = spec2.trim();
      if (t === "") continue;
      const alias = /^(\w+)\s+as\s+(\w+)$/.exec(t);
      const from = alias ? alias[1]! : t;
      const local = alias ? alias[2]! : t;
      if (imported.includes(from)) out.add(local);
    }
  }
  return out;
}

/** Local names this source IMPORTS that resolve to a blocking API. */
function blockingImports(
  source: string,
  graph: ReadonlyMap<string, string>,
  seen: ReadonlySet<string>,
  unresolvable: string[],
): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s+(${CP}|${LOCAL})`, "g"))) {
    const spec = m[2]!.slice(1, -1);
    const fromCp = /^(?:node:)?child_process$/.test(spec);
    let childBlocking: Set<string> | null = null;
    if (!fromCp) {
      const child = graph.get(spec);
      /** A LOCAL MODULE WE WERE NOT GIVEN IS UNKNOWN, NOT CLEAN.
       *
       * The comment above this line said exactly that, and the code below it
       * did the opposite: `continue`. So a helper one directory away —
       * `engine/scripts/helpers/blocking.mjs`, one line long — restored R9-03's
       * fully synchronous runner with this check reporting `[]`, the invariant
       * green and the whole suite green (adversary finding R13-04, the fourth
       * consecutive round on this file). The graph was built from ONE directory
       * and ONE extension; the path was the new spelling. */
      if (child === undefined) {
        unresolvable.push(`import from "${spec}" could not be followed — the module was not supplied`);
        continue;
      }
      if (seen.has(spec)) {
        unresolvable.push(`import from "${spec}" is a cycle this check cannot resolve`);
        continue;
      }
      childBlocking = blockingExports(child, graph, new Set([...seen, spec]), unresolvable);
      if (childBlocking.size === 0) continue;
    }
    for (const spec2 of m[1]!.split(",")) {
      const t = spec2.trim();
      if (t === "") continue;
      const alias = /^(\w+)\s+as\s+(\w+)$/.exec(t);
      const impName = alias ? alias[1]! : t;
      const local = alias ? alias[2]! : t;
      const isBlocking = fromCp
        ? (BLOCKING_APIS as readonly string[]).includes(impName)
        : childBlocking!.has(impName);
      if (isBlocking) names.push(local);
    }
  }
  return names;
}

/**
 * @param source  the module under inspection
 * @param graph   specifier (as written) → source, for local modules it imports
 */
export function blockingBindings(source: string, graph: ReadonlyMap<string, string> = new Map()): BlockingScan {
  const unresolvable: string[] = [];

  // A namespace or default import hides the member access behind a value the
  // check cannot follow (`cp["spawn" + "Sync"](…)`), so it is refused.
  if (new RegExp(String.raw`import\s+(?:\*\s+as\s+\w+|\w+)\s*(?:,\s*\{[^}]*\}\s*)?from\s+${CP}`).test(source)) {
    unresolvable.push("a namespace or default import of child_process cannot be resolved statically");
  }
  /** THE BRACED DEFAULT IMPORT. `import { default as cp } from "node:child_process"`
   * is a default import wearing braces, so it never reached the branch above —
   * and then `blockingImports` saw the imported name `"default"`, found it
   * absent from the API list, and recorded nothing. `names=[]`,
   * `unresolvable=[]`: the file's own fail-closed principle was not reached
   * because the check believed it had resolved the module (adversary finding
   * R14-04). One line, no helper, no alias. */
  if (new RegExp(String.raw`import\s*\{[^}]*\bdefault\b[^}]*\}\s*from\s+${CP}`).test(source)) {
    unresolvable.push("a braced default import of child_process cannot be resolved statically");
  }
  for (const [spec, child] of graph) {
    if (new RegExp(String.raw`import\s*\{[^}]*\bdefault\b[^}]*\}\s*from\s+${CP}`).test(child)) {
      unresolvable.push(`"${spec}" takes a braced default import of child_process`);
    }
  }
  if (new RegExp(String.raw`require\s*\(\s*${CP}`).test(source)) {
    unresolvable.push("require() of child_process cannot be resolved statically");
  }
  if (new RegExp(String.raw`import\s*\(\s*${CP}`).test(source)) {
    unresolvable.push("a dynamic import of child_process cannot be resolved statically");
  }
  // …and the same three forms in any LOCAL module it imports, since a helper
  // can hide the dependency just as well as the runner can.
  for (const [spec, child] of graph) {
    if (new RegExp(String.raw`import\s+(?:\*\s+as\s+\w+|\w+)\s*(?:,\s*\{[^}]*\}\s*)?from\s+${CP}`).test(child)) {
      unresolvable.push(`"${spec}" takes a namespace or default import of child_process`);
    }
  }

  const names = blockingImports(source, graph, new Set(), unresolvable);
  return { names: [...new Set(names)], unresolvable };
}

/** A BLOCKING BINDING MAY NOT BE REFERENCED AT ALL. Not "may not be called".
 *
 * This asked "is it called?", and answered it by enumerating invocation FORMS:
 * `f(…)`, then `f.call`/`f.apply`/`f.bind`/`Reflect.apply` after R12-04. The
 * value does not have to be invoked under its own name. Measured, all three
 * clean against the form list while the binding itself resolved correctly:
 *
 *     const run = spawnSync;      run(…)
 *     const t = { go: spawnSync }; t.go(…)
 *     const fns = [spawnSync];     fns[0](…)
 *
 * (adversary finding R14-04, the fifth consecutive round on this file). There
 * is no finite list of ways to move a value in JavaScript, so the question
 * changes: a runner that MENTIONS a blocking binding is refused, called or not.
 * That removes the capability — you cannot use what you cannot name — instead
 * of enumerating one more spelling of using it. A runner that genuinely needs
 * a synchronous child process is a design conversation, not a regex. */
function isReferenced(name: string, slice: string): boolean {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(String.raw`\b${n}\b`).test(slice);
}

/** Blocking bindings CALLED in this slice of source, or the unresolvable
 * reasons — both are failures. */
export function blockingCalls(
  moduleSource: string,
  slice: string,
  graph: ReadonlyMap<string, string> = new Map(),
): readonly string[] {
  const scan = blockingBindings(moduleSource, graph);
  if (scan.unresolvable.length > 0) return scan.unresolvable;
  return scan.names.filter((n) => isReferenced(n, slice));
}
