import { describe, expect, it } from "vitest";
import { blockingBindings, blockingCalls } from "./blocking-calls.ts";

/** THE CHECKER'S OWN RED-PROOF. A guard shipped beside its checker is worth
 * nothing until the checker is shown to go red (standing rule, after R9-01), and
 * this checker exists precisely because its predecessor could not. */
describe("blocking child_process bindings are resolved, not name-matched (R11-04)", () => {
  const call = "runSuiteBlocking(process.execPath, [VITEST_BIN, \"run\"]);";

  it("catches the aliased import that defeated the name-matching check", () => {
    const src = `import { spawnSync as runSuiteBlocking } from "node:child_process";\n${call}`;
    expect(blockingCalls(src, call)).toEqual(["runSuiteBlocking"]);
  });

  it("catches the plain spelling too, aliased or not, with or without the node: prefix", () => {
    for (const spec of ["node:child_process", "child_process"]) {
      for (const api of ["execSync", "execFileSync", "spawnSync", "fork"]) {
        const src = `import { ${api} } from "${spec}";\n${api}("x");`;
        expect(blockingCalls(src, `${api}("x");`), `${api} from ${spec} was missed`).toEqual([api]);
      }
    }
  });

  it("REFUSES what it cannot resolve rather than reporting clean", () => {
    for (const src of [
      'import * as cp from "node:child_process";\ncp.spawnSync("x");',
      'import cp from "child_process";\ncp.spawnSync("x");',
      'const { spawnSync } = require("node:child_process");',
      'const cp = await import("node:child_process");',
    ]) {
      expect(blockingBindings(src).unresolvable.length, `resolved something it cannot: ${src}`).toBeGreaterThan(0);
      expect(blockingCalls(src, src).length).toBeGreaterThan(0);
    }
  });

  it("does not fire on the async APIs, so it is a discrimination and not a refusal of everything", () => {
    const src = 'import { spawn } from "node:child_process";\nspawn(process.execPath, []);';
    expect(blockingBindings(src)).toEqual({ names: [], unresolvable: [] });
    expect(blockingCalls(src, src)).toEqual([]);
    // …and an imported blocking API that is never CALLED in the slice is not a
    // finding either: the harness may hold one for a path outside the loop.
    const held = 'import { spawnSync } from "node:child_process";\nvoid spawnSync;';
    expect(blockingCalls(held, "await measure(entry);")).toEqual([]);
  });
});

describe("the resolver follows local re-exports and every call form (R12-04)", () => {
  /** The three evasions r12 measured, each of which restored a blocking runner
   * with the previous resolver reporting clean. */
  const helper = 'export { spawnSync as runSync } from "node:child_process";';

  it("follows a one-line re-export helper", () => {
    const runner = 'import { runSync as runSuiteBlocking } from "./cp-util.mjs";\nrunSuiteBlocking(process.execPath, []);';
    const graph = new Map([["./cp-util.mjs", helper]]);
    expect(blockingBindings(runner, graph).names).toEqual(["runSuiteBlocking"]);
    expect(blockingCalls(runner, runner, graph)).toEqual(["runSuiteBlocking"]);
  });

  it("follows a re-export chain, and a star re-export", () => {
    const mid = 'export * from "./cp-util.mjs";';
    const runner = 'import { runSync } from "./mid.mjs";\nrunSync("x");';
    const graph = new Map([["./cp-util.mjs", helper], ["./mid.mjs", mid]]);
    expect(blockingCalls(runner, runner, graph)).toEqual(["runSync"]);
    const star = 'export * from "node:child_process";';
    const direct = 'import { spawnSync } from "./all.mjs";\nspawnSync("x");';
    expect(blockingCalls(direct, direct, new Map([["./all.mjs", star]]))).toEqual(["spawnSync"]);
  });

  it("counts .call, .apply, .bind and Reflect.apply as calls", () => {
    const src = 'import { spawnSync as rb } from "node:child_process";';
    for (const call of ["rb.call(null, 'x')", "rb.apply(null, ['x'])", "rb.bind(null)('x')", "Reflect.apply(rb, null, ['x'])"]) {
      expect(blockingCalls(src, call), `${call} was not counted as a call`).toEqual(["rb"]);
    }
  });

  it("REFUSES a helper it was not given — unknown is not clean", () => {
    const runner = 'import { runSync } from "./unknown.mjs";\nrunSync("x");';
    /** THE COMMENT SAID THIS AND THE CODE DID THE OPPOSITE. `blockingImports`
     * `continue`d on a module absent from the graph, so a one-line helper one
     * directory away restored R9-03's synchronous runner with this check
     * reporting `[]` and every gate green (adversary finding R13-04, the fourth
     * consecutive round on this file). */
    expect(blockingBindings(runner).unresolvable.length, "an unseen module was read as clean").toBeGreaterThan(0);
    expect(blockingCalls(runner, runner).length).toBeGreaterThan(0);
    // …and a helper that IS given but hides child_process behind a namespace
    // import is refused too, rather than read as clean.
    const hiding = 'import * as cp from "node:child_process";\nexport const runSync = cp.spawnSync;';
    expect(blockingCalls(runner, runner, new Map([["./unknown.mjs", hiding]])).length).toBeGreaterThan(0);
    // A module that IS given and genuinely imports nothing blocking stays clean,
    // so this is a discrimination and not a refusal of everything.
    const innocent = 'export const runSync = () => {};';
    expect(blockingCalls(runner, runner, new Map([["./unknown.mjs", innocent]]))).toEqual([]);
  });

  it("follows a helper in a SUBDIRECTORY, which is how trap #8 was spelled", () => {
    const helperSrc = 'export { spawnSync as runSync } from "node:child_process";';
    const runner = 'import { runSync as runSuiteBlocking } from "./helpers/blocking.mjs";\nrunSuiteBlocking("x");';
    const graph = new Map([["./helpers/blocking.mjs", helperSrc]]);
    expect(blockingCalls(runner, runner, graph)).toEqual(["runSuiteBlocking"]);
  });

  it("still does not fire on the async APIs, so it discriminates", () => {
    const src = 'import { spawn } from "node:child_process";\nspawn(process.execPath, []);';
    expect(blockingCalls(src, src, new Map([["./cp-util.mjs", helper]]))).toEqual([]);
  });
});

describe("value flow and the braced default import (R14-04, trap #9)", () => {
  /** The five spellings that walked past the form list, each measured clean by
   * the adversary and each caught here. */
  it("REFUSES a braced default import — it is a default import wearing braces", () => {
    for (const spec of ["node:child_process", "child_process"]) {
      const src = `import { default as cp } from "${spec}";\ncp.spawnSync("x");`;
      expect(blockingBindings(src).unresolvable.length, `${spec} braced default read as clean`).toBeGreaterThan(0);
      expect(blockingCalls(src, src).length).toBeGreaterThan(0);
    }
    // …and through a helper module, which is where it would actually hide.
    const helper = 'import { default as cp } from "node:child_process";\nexport const runSync = cp.spawnSync;';
    const runner = 'import { runSync } from "./h.mjs";\nrunSync("x");';
    expect(blockingCalls(runner, runner, new Map([["./h.mjs", helper]])).length).toBeGreaterThan(0);
  });

  it("catches a bound value moved through a variable, an object or an array", () => {
    const src = 'import { spawnSync } from "node:child_process";';
    for (const slice of [
      "const run = spawnSync; run(process.execPath, []);",
      "const t = { go: spawnSync }; t.go(process.execPath, []);",
      "const fns = [spawnSync]; fns[0](process.execPath, []);",
      "queueMicrotask(spawnSync);",
    ]) {
      expect(blockingCalls(src, slice), `${slice} walked past`).toEqual(["spawnSync"]);
    }
  });

  it("still does not fire when the runner never names the binding", () => {
    // The module may import it for a path outside the runner; the SLICE is what
    // is judged, so this stays a discrimination rather than a blanket refusal.
    const src = 'import { spawnSync } from "node:child_process";\nvoid spawnSync;';
    expect(blockingCalls(src, "await measure(entry);")).toEqual([]);
    const async_ = 'import { spawn } from "node:child_process";';
    expect(blockingCalls(async_, "spawn(process.execPath, []);")).toEqual([]);
  });
});
