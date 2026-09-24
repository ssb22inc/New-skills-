import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** X-17 (cross-family, 2026-09-24): the trusted clock bound `process.hrtime`
 * at module load, and `index.ts` reaches it at import, so the declared
 * Workers scaffold could not initialise without Node APIs. Executed, not read:
 * a child Node process deletes its `process` global and imports the module.
 * Pre-fix that threw ReferenceError at import; now the import succeeds and the
 * clock refuses at CONSTRUCTION with the meter's own unavailable error.
 *
 * `[LIMITATION]` this is Node without `process`, not workerd. Running the
 * scaffold under workerd needs the Workers toolchain (H2). Whether the
 * deployment declares `nodejs_compat` is a stack decision for the human.
 *
 * MUTATION: X1-17 — bind `process.hrtime` at load again. */
describe("the engine's import graph needs no Node API at module load", () => {
  it("trusted-clock imports without a process global and refuses at construction", () => {
    const mod = fileURLToPath(new URL("../src/trusted-clock.ts", import.meta.url));
    const script =
      "delete globalThis.process;" +
      `import(${JSON.stringify(mod)}).then((m) => { try { m.trustedClock(); console.log("CONSTRUCTED"); } catch (e) { console.log("REFUSED " + e.constructor.name + ": " + e.message); } }, (e) => console.log("IMPORT THREW " + e.name + ": " + e.message));`;
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "-e", script], { encoding: "utf8", timeout: 30_000 });
    const out = (r.stdout + r.stderr).trim();
    expect(out, out).not.toMatch(/IMPORT THREW/);
    expect(out, out).toMatch(/^REFUSED MeterUnavailableError: no monotonic clock/m);
  });
});
