import { defineConfig } from "vitest/config";

/** THE LIVE CHECK RUNNER — separate on purpose, like the drill. The files it
 * runs make real, billed calls to the provisioned services with real keys, so
 * they must never run under `npm test`: `vitest.config.ts` matches only
 * `*.test.ts`, and an invariant asserts that `*.live.ts` is outside it. In CI
 * this runs only from `.github/workflows/fullburn-live.yml`. */
export default defineConfig({
  test: {
    include: ["engine/test/live/**/*.live.ts"],
    environment: "node",
    retry: 0,
    testTimeout: 420_000,
    fileParallelism: false,
  },
});
