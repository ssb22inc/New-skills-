import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["config/test/**/*.test.ts", "engine/test/**/*.test.ts"],
    environment: "node",
    /** EXPLICIT, NOT INHERITED. The suite's correctness rested on this being
     * vitest's default: two files need a PRIVATE module registry — one mocks a
     * production module for its whole file, the other needs the process ledger
     * slot to be empty — and under `--no-isolate` six money-path locks went red
     * with "expected error to be instance of MeterUnavailableError" when the
     * error WAS one, because a duplicated registry duplicates every class
     * (adversary finding R13-08). A config change would have removed that
     * silently. `npm run test:noisolate` proves everything ELSE is independent
     * of it, so the dependency is bounded and measured rather than assumed. */
    isolate: true,
    // Determinism is the point (adversary Phase B rule): no retries hiding flakes.
    retry: 0,
  },
});
