import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["config/test/**/*.test.ts", "engine/test/**/*.test.ts"],
    environment: "node",
    // Determinism is the point (adversary Phase B rule): no retries hiding flakes.
    retry: 0,
  },
});
