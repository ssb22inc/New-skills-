import { defineConfig } from "vitest/config";

/** THE DRILL RUNNER — separate on purpose (adversary finding R10-05).
 *
 * `engine/test/drill/` holds checks that spawn the real mutation harness
 * against the real workspace. They must never run under `npm test`: the harness
 * runs the suite 117 times, so a drill inside the default include spawns a
 * harness per suite run, mutates `engine/src/spend-meter.ts` on disk, and
 * orphans a CPU-bound worker tree each time.
 *
 * `vitest.config.ts` deliberately does not match `*.drill.ts`, and an invariant
 * asserts that it does not. */
export default defineConfig({
  test: {
    include: ["engine/test/drill/**/*.drill.ts"],
    environment: "node",
    retry: 0,
    testTimeout: 180_000,
    // One at a time: these spawn real processes against one fixed marker path.
    fileParallelism: false,
  },
});
