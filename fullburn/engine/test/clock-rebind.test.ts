import { describe, expect, it, vi } from "vitest";

/** BOUND 4 OF THE TRUSTED CLOCK, IN ISOLATION — and the isolation is the point.
 *
 * The monotonic source is captured at module load (`NATIVE.hrtime`), which is
 * what makes a post-import patch inert and is the whole of R10-03's fix. So
 * reaching the backwards-source guard THROUGH `trustedClock()` requires
 * patching before a fresh import, and a fresh import needs `vi.resetModules()`.
 *
 * Run inside a file that also drives money, that call splits the module graph:
 * later dynamic imports get a different `MeterUnavailableError` class and a
 * different module instance, and four of six shuffle seeds went red with
 * "expected error to be instance of MeterUnavailableError" when the error WAS
 * one (adversary finding R12-06). Vitest isolates by file, so this file resets
 * modules, imports what it needs from the fresh graph, and imports nothing
 * else — there is no second graph for anything to disagree with.
 *
 * The guard is ALSO drivable directly, via the exported `assertMonotonic`, and
 * the unreachable-guard sweep uses that. This file proves the WIRING: that
 * `trustedClock()` actually consults it. */
describe("the trusted clock refuses a backwards monotonic source (R10-03 bound 4)", () => {
  /** MUTATION: drop the `assertMonotonic(mono, lastMono)` call from
   * `trustedClock`, or the comparison inside `assertMonotonic`. */
  it("a source that advances then goes backwards refuses spend", async () => {
    const realHrtime = process.hrtime.bigint;
    try {
      let ticks = 0n;
      // Advances once, then goes backwards — a source swap, a VM migration, or
      // a platform whose "monotonic" clock is not.
      (process.hrtime as unknown as { bigint: () => bigint }).bigint = () => {
        ticks += 1n;
        return ticks === 1n ? 1_000_000_000n : 1n;
      };
      vi.resetModules();
      const fresh = await import("../src/spend-meter.ts");
      const clock = fresh.trustedClock();
      expect(() => clock(), "a backwards monotonic source was accepted").toThrow(fresh.MeterUnavailableError);
      expect(() => clock()).toThrow(/backwards/);
    } finally {
      (process.hrtime as unknown as { bigint: typeof realHrtime }).bigint = realHrtime;
    }
  });
});
