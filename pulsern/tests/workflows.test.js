/* Guard against workflows that exist but never run.

   GitHub only reads workflow files from .github/workflows/ at the REPOSITORY
   ROOT. A workflow in any other directory is a file that looks scheduled,
   reviews like it is scheduled, and does nothing — forever, silently.

   That is not hypothetical here. content-factory.yml sat at
   pulsern/.github/workflows/ from the day it was written and never executed
   once, which is why the practice bank stopped growing and nobody noticed.
   This test exists so that failure mode is caught by `npm test` rather than by
   wondering months later why the numbers never moved. */
import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(process.cwd(), "..");
const LIVE_DIR = join(REPO_ROOT, ".github", "workflows");

/* Workflows belonging to other projects in this monorepo. They were never
   activated and activating them is not this project's call — but they are
   named here explicitly so they stay visible rather than silently tolerated. */
const KNOWN_DORMANT = ["haven/.github/workflows"];

function findWorkflowDirs(dir, out = [], depth = 0) {
  if (depth > 4) return out;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (["node_modules", "dist", ".git"].includes(e.name)) continue;
    const full = join(dir, e.name);
    if (e.name === "workflows" && full.includes(".github")) out.push(full);
    else findWorkflowDirs(full, out, depth + 1);
  }
  return out;
}

describe("workflow placement", () => {
  it("has a live workflows directory at the repository root", () => {
    // If this fails the checkout is not what the test assumes, and every other
    // assertion here would be meaningless rather than reassuring.
    expect(existsSync(LIVE_DIR), `${LIVE_DIR} does not exist`).toBe(true);
    expect(statSync(LIVE_DIR).isDirectory()).toBe(true);
  });

  it("keeps no PulseRN workflow outside the root, where it would never run", () => {
    const dirs = findWorkflowDirs(REPO_ROOT)
      .map((d) => relative(REPO_ROOT, d).replace(/\\/g, "/"))
      .filter((d) => d !== ".github/workflows")
      .filter((d) => !KNOWN_DORMANT.includes(d));

    expect(
      dirs,
      `These workflow directories are not at the repository root, so GitHub ` +
      `will never run anything inside them. Move the files to ` +
      `.github/workflows/ (keep working-directory: pulsern).`
    ).toEqual([]);
  });

  it("keeps the scheduled PulseRN jobs live", () => {
    const live = readdirSync(LIVE_DIR);
    for (const w of ["pulsern-content-factory.yml", "pulsern-sms-reminders.yml", "pulsern-bank-scale.yml"]) {
      expect(live, `${w} is missing from the live workflows directory`).toContain(w);
    }
  });

  it("keeps IndexNow inside the fail-closed adversarial release workflow", () => {
    const workflow = readFileSync(join(LIVE_DIR, "pulsern-seo-guardian.yml"), "utf8");
    expect(workflow).toContain("id: indexnow");
    expect(workflow).toContain("run: npm run seo:indexnow");
    expect(workflow).toContain('test "${{ steps.indexnow.outcome }}" = "success"');
  });

  it("captures authentic product screenshots in the fail-closed workflow", () => {
    const workflow = readFileSync(join(LIVE_DIR, "pulsern-seo-guardian.yml"), "utf8");
    expect(workflow).toContain("id: product_capture");
    expect(workflow).toContain("run: npm run product:screenshots:capture");
    expect(workflow).toContain('test "${{ steps.product_capture.outcome }}" = "success"');
    expect(workflow).toContain("id: product_images");
    expect(workflow).toContain("run: npm run seo:product-images");
    expect(workflow).toContain('test "${{ steps.product_images.outcome }}" = "success"');
  });
});
