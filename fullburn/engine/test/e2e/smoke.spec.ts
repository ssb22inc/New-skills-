import { expect, test } from "@playwright/test";

/** MINIMAL SMOKE — the H20 variance's running half.
 *
 * Phase 0 has no UI, so this asserts the only thing there is to assert: that
 * the e2e stage is genuinely wired and would fail if it broke. A stage that
 * silently launches nothing is worse than no stage, because it reports green.
 *
 * PHASE 1 REPLACES THIS with real coverage of the intake confirm flow. The
 * invariant suite fails the build if that has not happened by the Phase 1 gate. */
test("the e2e stage really drives a browser", async ({ page }) => {
  await page.setContent(
    "<!doctype html><title>fullburn smoke</title><main><h1 id=probe>engine up</h1></main>",
  );
  await expect(page.locator("#probe")).toHaveText("engine up");
  expect(await page.title()).toBe("fullburn smoke");
  // Proves a real engine is executing, not a stub that resolves every assertion.
  expect(await page.evaluate(() => 6 * 7)).toBe(42);
});
