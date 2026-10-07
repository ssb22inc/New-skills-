import { defineConfig } from "@playwright/test";

/** PLAYWRIGHT — §10.3's fifth CI stage.
 *
 * H20 RECORDED VARIANCE (approved 2026-08-16, ledger L16). Phase 0 ships no
 * endpoints and no client screens, so there is nothing for a substantive e2e
 * suite to drive. Substantive e2e is deferred to Phase 1, but the stage is
 * INSTALLED AND RUNNING NOW, on a minimal smoke — because a stage that does not
 * exist cannot be checked, and every deferral this project has written down was
 * eventually found to have quietly become permanent.
 *
 * THE VARIANCE EXPIRES AT PHASE 1'S GATE: no real e2e on the intake confirm
 * flow, no Phase 1 pass. `engine/test/invariants/invariants.test.ts` enforces
 * that expiry mechanically — it fails the moment PHASE reads 1 while this suite
 * is still smoke-only, so the deferral cannot outlive its terms by being
 * forgotten. */
/** Some sandboxes provision Chromium at a build number that does not match the
 * pinned @playwright/test, and re-downloading is not always possible. Honour an
 * explicit path when one is given; otherwise use the browser Playwright manages
 * itself, which is what CI does after `playwright install chromium`. */
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_PATH"];

export default defineConfig({
  testDir: "engine/test/e2e",
  reporter: "list",
  forbidOnly: true,
  use: {
    headless: true,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
});
