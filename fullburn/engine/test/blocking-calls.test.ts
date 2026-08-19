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
