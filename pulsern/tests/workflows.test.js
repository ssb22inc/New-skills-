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
     pin the properties that make it trustworthy — each one a finding from
     Astra's own review of the first version — so an edit that quietly removes
     one fails here rather than in production. */
  describe("Astra review workflow", () => {
    const wf = () => readFileSync(join(LIVE_DIR, "pulsern-astra-review.yml"), "utf8");

    it("is live at the repository root", () => {
      expect(readdirSync(LIVE_DIR)).toContain("pulsern-astra-review.yml");
    });

    /* Finding #1 (blocker): on pull_request GitHub runs the PR's copy of the
       workflow, so a PR could report a pass without calling Astra. */
    it("runs on pull_request_target, so the base branch's workflow judges every PR", () => {
      const w = wf();
      expect(w).toMatch(/^  pull_request_target:/m);
      expect(w).not.toMatch(/^  pull_request:/m);
    });

    it("never installs, builds or runs anything from the pull request", () => {
      const w = wf();
      expect(w).not.toMatch(/\bnpm\b|\byarn\b|\bpnpm\b|\bnpx\b/);
      const nodeCalls = [...w.matchAll(/^\s*node\s+(\S+)/gm)].map((m) => m[1]);
      expect(nodeCalls.length).toBeGreaterThan(0);
      for (const c of nodeCalls) expect(c, `node runs ${c}`).toMatch(/^"\$GITHUB_WORKSPACE\/trusted\//);
      // the PR is fetched with plain git as data, never checked out by an action
      expect(w).not.toMatch(/ref: \$\{\{ github\.event\.pull_request\.head/);
      expect(w).toContain("+refs/pull/$PR/head:refs/remotes/pr/head");
    });

    it("takes the reviewer from the base branch, without credentials left on disk", () => {
      const w = wf();
      const trusted = w.slice(w.indexOf("- name: Check out the trusted reviewer"));
      expect(trusted.split("\n").slice(0, 8).join("\n")).toMatch(/ref: \$\{\{ github\.sha \}\}/);
      expect(trusted.split("\n").slice(0, 8).join("\n")).toContain("persist-credentials: false");
      // No path left where a PR is judged by its own copy of the reviewer.
      expect(w).not.toMatch(/ASTRA_REVIEW_MODE: bootstrap|mode=bootstrap|target\/pulsern\/ops\/astra-review/);
    });

    /* Finding #2: a skipped job counts as green. Forks and drafts must end red
       or pending on the commit, never silently passed. */
    it("fails a fork PR closed until a maintainer labels it, and holds drafts at pending", () => {
      const w = wf();
      expect(w).toMatch(/IS_FORK[\s\S]*LABELED[\s\S]*state=failure/);
      expect(w).toMatch(/IS_DRAFT[\s\S]*state=pending/);
      expect(w).not.toMatch(/^\s+if: github\.event\.pull_request\.head\.repo\.full_name == github\.repository/m);
    });

    it("binds the verdict to the reviewed commit as a status, whatever happened", () => {
      const w = wf();
      const post = w.slice(w.indexOf("- name: Post the verdict on the reviewed commit"));
      expect(post.split("\n").slice(0, 3).join("\n")).toContain("if: always()");
      expect(post).toContain('context:"pulsern/astra-review"');
      expect(post).toContain("statuses/$HEAD_SHA");
      expect(w).toContain("statuses: write");
    });

    /* Finding #5: cancelling a run mid-call threw away a paid review. */
    it("never cancels a review that is already being paid for", () => {
      expect(wf()).toMatch(/cancel-in-progress: false/);
    });

    it("finds and keeps the report by looking for it, not by trusting step outputs", () => {
      const w = wf();
      const save = w.slice(w.indexOf("- name: Commit the report to the reviews branch"));
      expect(save.split("\n").slice(0, 3).join("\n")).toContain("if: always() && hashFiles('astra-out/*.md') != ''");
      expect(w.indexOf("- name: Post the verdict")).toBeGreaterThan(w.indexOf("- name: Commit the report"));
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
      const block = w.slice(w.indexOf("    paths:"), w.indexOf("  workflow_dispatch:"));
      const paths = [...block.matchAll(/^\s+- "([^"]+)"$/gm)].map((m) => m[1]);
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) {
        expect(p, `trigger path ${p} reaches outside PulseRN`).toMatch(/^!?pulsern\/|^\.github\/workflows\/pulsern-/);
      }
    });

    /* PR #133 review, finding 1 (blocker): a dispatch with base = head for
       any commit posted a pass without a review, and a dispatch from a
       feature branch ran that branch's reviewer as if trusted. */
    describe("manual re-review", () => {
      const resolve = () => {
        const w = wf();
        return w.slice(w.indexOf("- name: Resolve what to review"), w.indexOf("- name: Mark the commit under review as pending"));
      };
      it("only runs the reviewer from the default branch", () => {
        expect(resolve()).toMatch(/"\$GITHUB_REF" != "refs\/heads\/\$DEFAULT_BRANCH"[\s\S]*exit 1/);
      });
      it("reads a PR's range from GitHub and refuses a head that is not the PR's", () => {
        const r = resolve();
        expect(r).toContain("api.github.com/repos/$REPO/pulls/$IN_PR");
        expect(r).toMatch(/"\$IN_HEAD" != "\$pr_head"[\s\S]*exit 1/);
        expect(r).toContain('echo "BASE_SHA=$pr_base"');
        expect(r).not.toMatch(/BASE_SHA=\$IN_BASE"; echo "PR=\$IN_PR/);
      });
      it("never posts a status for a report-only range", () => {
        const w = wf();
        expect(resolve()).toMatch(/echo "PR="; echo "POST_STATUS=false"/);
        for (const step of ["- name: Mark the commit under review as pending", "- name: Post the verdict on the reviewed commit"]) {
          const head = w.slice(w.indexOf(step)).split("\n").slice(0, 3).join("\n");
          expect(head, step).toMatch(/env\.POST_STATUS == 'true'/);
        }
        // and its verdict still fails the run
        expect(w).toMatch(/- name: Report-only verdict\s+if: always\(\) && env\.POST_STATUS != 'true'/);
      });
      it("takes inputs through the environment, never pasted into the script", () => {
        expect(resolve()).not.toMatch(/run:[\s\S]*\$\{\{ inputs\./);
      });
    });

    it("does not spend money on unrelated labels", () => {
      expect(wf()).toMatch(/github\.event\.action != 'labeled' \|\| github\.event\.label\.name == 'astra-review'/);
    });
  });
});


/* The review workflows commit their records back. If git ignores the path,
   every one of those commits fails — and the paid results go with it. That
   was true of all three until this test existed. */
describe("records the workflows commit are committable", () => {
  const { execFileSync } = require("node:child_process");
  const files = ["pulsern-diagram-map.yml", "pulsern-narrate.yml", "pulsern-diagram-review.yml"];
  it.each(files)("%s commits only paths git will accept", (f) => {
    const w = readFileSync(join(LIVE_DIR, f), "utf8");
    const line = /for p in ([^;]+); do \[ -e "\$p" \] && git add -- "\$p"; done/.exec(w);
    expect(line, "save step adds what exists, never fails on a missing path").not.toBeNull();
    for (const p of line[1].trim().split(/\s+/)) {
      const probe = p.endsWith("/") ? `${p}probe.json` : p;
      let ignored = true;
      try { execFileSync("git", ["check-ignore", "-q", probe], { cwd: join(LIVE_DIR, "../../pulsern") }); } catch { ignored = false; }
      expect(ignored, `${probe} is git-ignored`).toBe(false);
    }
  });
});
