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

  it("proves the Supabase credential before any model spend", () => {
    for (const name of ["pulsern-content-factory.yml", "pulsern-bank-scale.yml"]) {
      const workflow = readFileSync(join(LIVE_DIR, name), "utf8");
      expect(workflow).toContain("Preflight — credentials actually work");
      expect(workflow).toContain("run: node ops/content-factory.mjs --check");
    }
  });

  it("deduplicates content-factory incidents and closes them after recovery", () => {
    const workflow = readFileSync(join(LIVE_DIR, "pulsern-content-factory.yml"), "utf8");
    expect(workflow).toContain("name: Reconcile factory incident");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("RUN_RESULT: ${{ job.status }}");
    expect(workflow).toContain("github.paginate(github.rest.issues.listForRepo");
    expect(workflow).toContain("state_reason: \"completed\"");
    expect(workflow).toContain("A successful recovery will close this incident automatically.");
    expect(workflow).not.toContain("The scheduled content-factory run failed.");
  });

  /* The Astra review is only worth something if a PR cannot weaken it. These
     pin the properties that make it trustworthy, so a later edit that quietly
     removes one fails here instead of in production. */
  describe("Astra review workflow", () => {
    const wf = () => readFileSync(join(LIVE_DIR, "pulsern-astra-review.yml"), "utf8");

    it("is live at the repository root", () => {
      expect(readdirSync(LIVE_DIR)).toContain("pulsern-astra-review.yml");
    });

    it("runs the reviewer from the BASE branch, not from the PR it judges", () => {
      const w = wf();
      expect(w).toContain("ref: ${{ github.event.pull_request.base.sha }}");
      expect(w).toContain("trusted/pulsern/ops/astra-review.mjs");
      expect(w).toMatch(/mode=bootstrap/);
    });

    it("keeps every report, including on FAIL", () => {
      const w = wf();
      const save = w.slice(w.indexOf("- name: Commit the report to the reviews branch"));
      expect(save.split("\n").slice(0, 3).join("\n")).toContain("if: always()");
      // the verdict step comes after the save, so a red check never skips it
      expect(w.indexOf("- name: Verdict")).toBeGreaterThan(w.indexOf("- name: Commit the report"));
    });

    it("only claims a save when a push actually landed", () => {
      const w = wf();
      expect(w).not.toMatch(/nothing new to commit"; exit 0/);
      expect(w).toMatch(/push -q origin "HEAD:\$BRANCH"; then\s+echo "Saved to/);
    });

    /* Reads the actual trigger paths. An earlier draft of this test used a
       regex that could never match, so it passed whatever the file said. */
    it("triggers only on PulseRN paths", () => {
      const w = wf();
      const block = w.slice(w.indexOf("    paths:"), w.indexOf("\npermissions:"));
      const paths = [...block.matchAll(/^\s+- "([^"]+)"$/gm)].map((m) => m[1]);
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) {
        expect(p, `trigger path ${p} reaches outside PulseRN`).toMatch(/^!?pulsern\/|^\.github\/workflows\/pulsern-/);
      }
    });

    it("fails the check when Astra fails or the review does not finish", () => {
      const w = wf();
      expect(w).toMatch(/1\) echo "::error::Astra: FAIL[^"]*"; exit 1/);
      expect(w).toMatch(/\*\) echo "::error::Astra review did not complete[^"]*"; exit 1/);
    });
  });
});

