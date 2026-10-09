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
    });

    /* PR #134 review, finding 1: a check inside a dispatchable workflow is
       not a trust boundary. Only the App — whose key is confined to the
       main-only environment — can post the required status. */
    it("posts statuses only with the App token from the main-only environment", () => {
      const w = wf();
      const perms = w.slice(w.indexOf("\npermissions:"), w.indexOf("\nconcurrency:"));
      expect(perms).not.toMatch(/statuses:\s*write/);
      expect(w).toMatch(/^    environment: astra-review$/m);
      const tokenStep = w.slice(w.indexOf("- name: Status publisher token"), w.indexOf("- name: Mark the commit under review as pending"));
      expect(tokenStep).toContain("secrets.ASTRA_APP_KEY");
      expect(tokenStep).toMatch(/permissions:\{statuses:"write"\}/);
      const statusCalls = [...w.matchAll(/Bearer \$(\w+)" -H "Accept: application\/vnd\.github\+json" \\\n\s+"https:\/\/api\.github\.com\/repos\/\$REPO\/statuses/g)].map((m) => m[1]);
      expect(statusCalls).toEqual(["STATUS_TOKEN", "STATUS_TOKEN"]);
    });

    /* PR #134 review, finding 2: a PR aimed at another branch reviews only
       part of a head that a PR into main also carries. */
    it("only lets a review of a PR INTO the default branch post a status", () => {
      const w = wf();
      const r = w.slice(w.indexOf("- name: Resolve what to review"), w.indexOf("- name: Status publisher token"));
      expect(r).toContain('into_default() { [ "$1" = "$DEFAULT_BRANCH" ] && [ "$2" = "$REPO" ]; }');
      expect(r).toMatch(/into_default "\$EV_BASE_REF" "\$EV_BASE_REPO" && post=true/);
      expect(r).toMatch(/into_default "\$pr_base_ref" "\$pr_base_repo" && post=true/);
      expect(r).not.toMatch(/echo "POST_STATUS=true"/);
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
        return w.slice(w.indexOf("- name: Resolve what to review"), w.indexOf("- name: Status publisher token"));
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
        // and an unconfigured App means report-only too, never the workflow token
        expect(w).toMatch(/not configured[\s\S]*echo "POST_STATUS=false" >> "\$GITHUB_ENV"; exit 0/);
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

    /* Round 8: an explicit permissions block disables everything it omits,
       and the resolver reads /pulls/{n} with the workflow token. */
    it("can read the PR it resolves, and gets no more than it needs", () => {
      const w = wf();
      const block = w.slice(w.indexOf("\npermissions:"), w.indexOf("\nconcurrency:"));
      const perms = [...block.matchAll(/^  ([a-z-]+): (\w+)/gm)].map((m) => `${m[1]}=${m[2]}`).sort();
      expect(perms).toEqual(["contents=write", "pull-requests=read"]);
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
    const line = /trusted\/pulsern\/ops\/save-results\.sh" "\$BRANCH" "[^"\n]*" ([^\n]+)\n/.exec(w);
    expect(line, "save step goes through the shared, checked save script").not.toBeNull();
    const paths = line[1].trim().split(/\s+/);
    // the artifact kept before the push holds the same paths
    const art = w.slice(w.indexOf("- name: Keep the results as an artifact"), w.indexOf("id: save"));
    expect(art).toMatch(/if: always\(\) && steps\.links\.outcome == 'success'\s+uses: actions\/upload-artifact@v4/);
    for (const p of paths) expect(art).toContain(`branch/pulsern/${p}`);
    // round 19: every paid narration take is kept in the artifact (never committed)
    if (f === "pulsern-narrate.yml") expect(art).toContain("branch/pulsern/reports/narration-takes/");
    for (const p of paths) {
      const probe = p.endsWith("/") ? `${p}probe.json` : p;
      let ignored = true;
      try { execFileSync("git", ["check-ignore", "-q", probe], { cwd: join(LIVE_DIR, "../../pulsern") }); } catch { ignored = false; }
      expect(ignored, `${probe} is git-ignored`).toBe(false);
    }
  });
});

/* PR #133 review, finding 17: pushes made with the workflow token trigger no
   other workflow, so a bot-pushed commit was never reviewed. Each job that
   pushes asks for the trusted, range-verified review explicitly. */
describe("bot pushes are reviewed", () => {
  const files = ["pulsern-diagram-map.yml", "pulsern-narrate.yml", "pulsern-diagram-review.yml"];
  it.each(files)("%s requests the Astra review of what it pushed", (f) => {
    const w = readFileSync(join(LIVE_DIR, f), "utf8");
    expect(w).toMatch(/^  actions: write/m);
    expect(w).toContain("trusted/pulsern/ops/save-results.sh\" \"$BRANCH\"");
    expect(w).not.toMatch(/pull -q --rebase[^\n]*\|\| true/);
    const step = w.slice(w.indexOf("- name: Request CI and the Astra review of what was just pushed"));
    expect(step).toMatch(/if: always\(\) && steps\.links\.outcome == 'success' && steps\.save\.outputs\.pushed == 'true'/);
    // CI on the pushed head (round 5): a workflow-token push starts no CI by itself
    expect(step).toContain("actions/workflows/pulsern-ci.yml/dispatches");
    expect(step.indexOf("pulsern-ci.yml/dispatches")).toBeLessThan(step.indexOf("pulls?state=open"));
    expect(step).toContain("actions/workflows/pulsern-astra-review.yml/dispatches");
    // through the verified path: the PR number and its head, from the default branch
    expect(step).toMatch(/inputs:\{head:\$head,pr:\$pr\}/);
    expect(step).toContain("--arg ref \"$DEFAULT_BRANCH\"");
  });
  it.each(files)("%s never pastes a dispatch input into a shell script", (f) => {
    const w = readFileSync(join(LIVE_DIR, f), "utf8");
    const scripts = [...w.matchAll(/^(\s+)run: \|\n((?:\1  .*\n|\s*\n)+)/gm)].map((m) => m[2]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const sc of scripts) expect(sc).not.toMatch(/\$\{\{\s*inputs\./);
  });
});

/* PR #134 review, round 6: "refs/heads/main" passed a guard that refused
   only the literal words main/master. Each workflow's real guard script is
   extracted and RUN here against hostile inputs, with the GitHub branch
   lookup stubbed to know two real branches. */
describe("jobs that push refuse the default branch in every spelling", () => {
  const { execFileSync } = require("node:child_process");
  const { mkdtempSync, writeFileSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const guardOf = (f) => {
    const lines = readFileSync(join(LIVE_DIR, f), "utf8").split("\n");
    const i = lines.findIndex((l) => l.trim() === "- name: Refuse to write to main");
    const j = lines.findIndex((l, k) => k > i && l.trim() === "run: |");
    const body = [];
    for (const l of lines.slice(j + 1)) { if (l.trim() && !l.startsWith(" ".repeat(10))) break; body.push(l.slice(10)); }
    const stub = 'curl() { url="${@: -1}"; case "$url" in */branches/feature%2Fx|*/branches/claude%2Fwork) return 0;; *) return 22;; esac; }';
    return `${stub}\n${body.join("\n")}`;
  };
  const accepts = (script, branch) => {
    const dir = mkdtempSync(join(tmpdir(), "guard-"));
    writeFileSync(join(dir, "g.sh"), script);
    try {
      execFileSync("bash", [join(dir, "g.sh")], { env: { ...process.env, BRANCH: branch, DEFAULT_BRANCH: "trunk", REPO: "o/r", GH_TOKEN: "x" }, stdio: "pipe" });
      return true;
    } catch { return false; }
  };
  it.each(["pulsern-diagram-map.yml", "pulsern-narrate.yml", "pulsern-diagram-review.yml"])("%s", (f) => {
    const g = guardOf(f);
    for (const ok of ["feature/x", "claude/work"]) expect(accepts(g, ok), ok).toBe(true);
    for (const bad of ["trunk", "main", "master", "refs/heads/main", "refs/heads/feature/x", "HEAD", "a..b", "x.lock", "has space",
      "2994d8ae53705dc4206507b5daec4812f290372b", "abc1234", "v1.0", "not-a-branch"]) {
      expect(accepts(g, bad), bad).toBe(false);
    }
  });
});

/* Astra, PR #134 review, round 21: the paid jobs checked out the chosen
   branch, installed its dependencies and ran its scripts with the
   production service-role key (narration) or the OpenRouter key in the
   environment. Now the branch's code runs only in a job with no secrets,
   and the job with secrets runs only the default branch's scripts. */
describe("paid workflows never run branch code with secrets", () => {
  const files = ["pulsern-diagram-map.yml", "pulsern-narrate.yml", "pulsern-diagram-review.yml"];
  /* A small structural reader for these files: jobs are the 2-space keys
     under "jobs:", steps the 6-space "- " items within a job. */
  const jobs = (f) => {
    const w = readFileSync(join(LIVE_DIR, f), "utf8");
    const body = w.slice(w.indexOf("\njobs:\n") + 7);
    const out = {};
    const parts = body.split(/^  ([a-z-]+):\n/m);
    for (let i = 1; i < parts.length; i += 2) out[parts[i]] = parts[i + 1];
    return out;
  };
  const steps = (job) => job.slice(job.indexOf("    steps:\n") + 11).split(/^      - /m).slice(1).map((t) => ({
    text: t,
    name: /^(?:name: )?(.*)$/m.exec(t)?.[1]?.replace(/^name: /, "") ?? "",
    uses: /^(?:uses: |\s+uses: )?(actions\/[a-z-]+@v\d+)/m.exec(t)?.[1] ?? null,
    wd: /^\s+working-directory: (\S+)/m.exec(t)?.[1] ?? null,
    run: /run: \|\n([\s\S]*)$/.exec(t)?.[1] ?? (/^\s*run: (.+)$/m.exec(t)?.[1] ?? ""),
  }));
  /* Astra, PR #134 review, round 24: the branch code in the prepare job
     can write to the Actions cache, and the paid job restored the npm
     cache after its trusted checkout — a poisoned archive could replace a
     trusted script. Neither job restores or saves any cache. */
  it.each(files)("%s: no job restores or saves an Actions cache", (f) => {
    for (const [name, job] of Object.entries(jobs(f))) {
      const code = job.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
      expect(code, `${f} ${name}`).not.toMatch(/^\s+cache(-dependency-path)?:/m);
      expect(code, `${f} ${name}`).not.toMatch(/actions\/cache|cache-restore|cache-save|ACTIONS_CACHE/i);
      for (const st of steps(job).filter((s) => /setup-(node|python|go|java)/.test(s.text))) expect(st.text, `${f} ${name}`).not.toMatch(/cache/);
    }
  });
  it.each(files)("%s: secrets appear only in the paid job, which is in the protected environment", (f) => {
    const j = jobs(f);
    expect(Object.keys(j).sort()).toEqual(["paid", "prepare"]);
    expect(j.prepare).not.toMatch(/secrets\.(?!GITHUB_TOKEN)/);
    expect(j.prepare).toMatch(/^    permissions:\n      contents: read\n/m);
    expect(j.paid).toMatch(/^    environment: pulsern-paid$/m);
    expect(j.paid).toMatch(/^    needs: prepare$/m);
    expect(j.paid).toMatch(/secrets\.(OPENAI|OPENROUTER)_API_KEY/);
  });
  it.each(files)("%s: the paid job runs only the trusted checkout's scripts", (f) => {
    const paid = jobs(f).paid;
    expect(paid).toMatch(/^    defaults:\n      run:\n        working-directory: branch\/pulsern$/m);
    const st = steps(paid);
    const checkouts = st.filter((s) => s.text.startsWith("uses: actions/checkout@"));
    expect(checkouts.map((s) => [/path: (\S+)/.exec(s.text)?.[1], /ref: (.+)/.exec(s.text)?.[1]])).toEqual([["trusted", "${{ github.sha }}"], ["branch", "${{ needs.prepare.outputs.sha }}"]]);
    // round 22: no credential stored in either checkout
    for (const c of checkouts) expect(c.text).toMatch(/persist-credentials: false/);
    // links and special files refused before any trusted script runs on the branch
    const refuse = st.findIndex((s) => s.text.startsWith("name: Refuse links and special files in the branch checkout"));
    const work = st.findIndex((s) => /--prepared /.test(s.run));
    expect(refuse).toBeGreaterThan(-1);
    expect(refuse).toBeLessThan(work);
    expect(st[refuse].run).toMatch(/find branch .*-type l/);
    // the push token only in the save step, with the pinned base
    const save = st.find((s) => /\bid: save\b/.test(s.text));
    expect(save.text).toMatch(/EXPECT_BASE: \$\{\{ needs\.prepare\.outputs\.sha \}\}/);
    expect(save.run).toMatch(/GIT_CONFIG_VALUE_0="AUTHORIZATION: basic/);
    expect(paid.replace(save.text, "")).not.toMatch(/extraheader/);
    for (const s of st.filter((x) => x.run)) {
      const where = s.wd ?? "branch/pulsern";
      if (/\bnode ops\/|\bnpm (ci|install|run)\b|\bnpx\b/.test(s.run)) expect(where, s.name).toBe("trusted/pulsern");
      // in the branch checkout only git and the TRUSTED save script run
      if (where === "branch/pulsern") expect(s.run.replace(/"\$GITHUB_WORKSPACE\/trusted\/pulsern\/ops\/save-results\.sh"/g, ""), s.name).not.toMatch(/ops\/[a-z-]+\.(mjs|sh)/);
    }
    expect(paid).toMatch(/--prepared "\$RUNNER_TEMP\/prepared\/[^"]+" --into "\$GITHUB_WORKSPACE\/branch\/pulsern"/);
  });
  it.each(files)("%s: the prepare job runs the branch with no secrets and refuses a non-default dispatch", (f) => {
    const prep = jobs(f).prepare;
    const st = steps(prep);
    const guard = st.findIndex((s) => s.text.startsWith("name: Run only from the default branch"));
    const co = st.findIndex((s) => s.text.startsWith("uses: actions/checkout@"));
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(st[guard].run).toContain('[ "$REF" = "refs/heads/$DEFAULT_BRANCH" ]');
    expect(st[co].text).toMatch(/ref: \$\{\{ inputs\.branch \}\}\n\s+persist-credentials: false/);
    expect(guard).toBeLessThan(co);
    expect(prep).toMatch(/node ops\/[a-z-]+\.mjs --prepare /);
    // round 22: the prepared commit is pinned and handed to the paid job
    expect(prep).toMatch(/outputs:\n      sha: \$\{\{ steps\.pin\.outputs\.sha \}\}/);
    expect(prep).toMatch(/id: pin\n\s+run: echo "sha=\$\(git rev-parse HEAD\)" >> "\$GITHUB_OUTPUT"/);
  });
});

/* Round 22: the link refusal is real shell, run here against real trees —
   a report symlinked at a mock credential must stop the job before any
   upload or trusted step can read through it. */
describe("the paid job refuses links in the branch it was given", () => {
  const { execFileSync, spawnSync } = require("node:child_process");
  const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const script = (f) => {
    const w = readFileSync(join(LIVE_DIR, f), "utf8");
    const i = w.indexOf("- name: Refuse links and special files in the branch checkout and prepared data");
    const block = w.slice(i, w.indexOf("\n      - ", i + 10));
    return block.slice(block.indexOf("run: |\n") + 7).split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
  };
  const tree = () => {
    const ws = mkdtempSync(join(tmpdir(), "paid-ws-"));
    mkdirSync(join(ws, "branch/.git"), { recursive: true });
    writeFileSync(join(ws, "branch/.git/config"), "[http]\n\textraheader = AUTHORIZATION: basic c2VudGluZWw=\n");
    mkdirSync(join(ws, "branch/pulsern/reports/narration"), { recursive: true });
    writeFileSync(join(ws, "branch/pulsern/reports/narration/run.md"), "ok\n");
    mkdirSync(join(ws, "tmp/prepared/review/abg"), { recursive: true });
    writeFileSync(join(ws, "tmp/prepared/review/abg/0.png"), "png");
    return ws;
  };
  const run = (f, ws) => spawnSync("bash", ["-e", "-o", "pipefail", "-c", script(f)], { cwd: ws, encoding: "utf8", env: { ...process.env, RUNNER_TEMP: join(ws, "tmp") } });
  it.each(["pulsern-narrate.yml", "pulsern-diagram-map.yml", "pulsern-diagram-review.yml"])("%s: a symlinked report stops the job; a clean tree passes", (f) => {
    const ws = tree();
    expect(run(f, ws).status).toBe(0);
    symlinkSync("/proc/self/environ", join(ws, "branch/pulsern/reports/narration/run-env.md"));
    const r = run(f, ws);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/run-env\.md/);
    rmSync(join(ws, "branch/pulsern/reports/narration/run-env.md"));
    symlinkSync("/proc/self/environ", join(ws, "tmp/prepared/review/abg/1.png"));
    const p = run(f, ws);
    expect(p.status).toBe(1);
    expect(p.stdout).toMatch(/1\.png/);
    rmSync(ws, { recursive: true, force: true });
  });
});

/* Round 23: the check failed the job, but report, upload and save steps
   marked always() still read the rejected checkout. */
describe("nothing reads the branch after the link check fails", () => {
  const files = ["pulsern-diagram-map.yml", "pulsern-narrate.yml", "pulsern-diagram-review.yml"];
  it.each(files)("%s: every later always() step requires the check to have passed", (f) => {
    const w = readFileSync(join(LIVE_DIR, f), "utf8");
    const paid = w.slice(w.indexOf("\n  paid:\n"));
    const after = paid.slice(paid.indexOf("        id: links\n"));
    const steps = after.split(/^      - /m).slice(1);
    expect(steps.length).toBeGreaterThan(3);
    for (const s of steps) {
      const cond = /^\s+if: (.+)$/m.exec(s)?.[1];
      if (!cond || !/always\(\)/.test(cond)) continue;   // default success(): skipped after a failure
      if (s.startsWith("name: Verdict")) {
        // the verdict reads only step outputs, never the branch
        expect(s).not.toMatch(/branch\/|reports\/|cat /);
        continue;
      }
      expect(cond, s.split("\n")[0]).toContain("steps.links.outcome == 'success'");
    }
    // and the check runs after the prepared data is downloaded, before any trusted script
    expect(paid.indexOf("actions/download-artifact@")).toBeLessThan(paid.indexOf("id: links"));
    expect(paid.indexOf("id: links")).toBeLessThan(paid.indexOf("--prepared "));
  });
});
