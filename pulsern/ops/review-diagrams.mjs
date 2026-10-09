#!/usr/bin/env node
/* Renders every concept diagram and has GPT Astra review each one visually
   and clinically. Unchanged diagrams keep their earlier verdict; every paid
   review is saved, PASS or FAIL.

   Usage: node ops/review-diagrams.mjs [--only id] [--force]
          node ops/review-diagrams.mjs --prepare <dir> [--source <tree>/pulsern]   (no secrets: render + data)
          node ops/review-diagrams.mjs --prepared <dir> --into <branch>/pulsern
   Env:   OPENROUTER_API_KEY, PULSERN_ATTEST_PRIVATE_KEY and PULSERN_ATTEST_PUBLIC_KEY
          (not for --prepare)
   Exit:  0 all PASS · 1 any FAIL or review error

   In CI the branch is rendered by a job with no secrets (--prepare) using
   the DEFAULT branch's copy of this script and its renderer: the branch's
   diagram code runs only inside the browser (render-diagrams.mjs), so the
   frames are this script's pictures of the pinned source. Then
   the review is run by the DEFAULT branch's copy of this script, reading
   the frames and words as data and writing into the branch checkout. The
   prompt, the source shown to the reviewer and the cache key are all built
   here, by trusted code (ops/prepared.mjs). */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { review, parseJson, lastReviewCost } from "./review.mjs";
import { REVIEW_MODEL } from "./models.mjs";
import { sourceKey, signApproval } from "./diagram-attest.mjs";
import { signerFrom } from "./attest.mjs";
import { DIAGRAM_REVIEW_SCHEMA, canReuse, reviewAndRecord, diagramRequest, diagramSources } from "./review-diagrams-lib.mjs";
import { readPrepared, reviewPlan, readFrame, headCommit, reviewEntries, localEntries, checkInventory } from "./prepared.mjs";
import { stepInventory, frameIds } from "./diagram-attest.mjs";

/* Everything that differs from the commit, ignored files included. */
const worktree = (root) => execFileSync("git", ["status", "--porcelain", "--ignored", "--untracked-files=all", "--", "."], { cwd: root, encoding: "utf8" }).split("\n").filter((l) => l && !/^!! (pulsern\/)?node_modules\//.test(l)).join("\n");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const ONLY = arg("--only");
const FORCE = process.argv.includes("--force");
const PREPARE = arg("--prepare") && resolve(arg("--prepare"));
const PREPARED = arg("--prepared") && resolve(arg("--prepared"));
const INTO = arg("--into");
const SOURCE = arg("--source");
/* Reviews are signed, and only signed verdicts are reused (round 25). */
const SIGNER = PREPARE ? null : signerFrom();
if (PREPARED && !INTO) throw new Error("--prepared needs --into <branch checkout>/pulsern");
const DIR = "reports/diagram-review";
const INDEX = join(DIR, "index.json");

/* The rules a diagram is judged against: the design and claims sections of
   CLAUDE.md, not the whole file. Read from THIS checkout (the trusted one
   in CI), before moving into the branch. */
function rulesExcerpt() {
  const md = readFileSync("CLAUDE.md", "utf8");
  const keep = md.split("\n").filter((l) => /design system|coral|amber|teal|claims hygiene|compare, never equate|ai content|labeled|labelled|verify against|medical content register|dosing|accessib|contrast|reduced-motion/i.test(l));
  return keep.join("\n");
}
const RULES = rulesExcerpt();

/* What to review: rendered here (local runs and --prepare), or read as data
   from a prepare job (--prepared). Either way, from here on each diagram is
   only its data and its frames. */
let entries;
if (PREPARED) {
  const prepared = reviewPlan(readPrepared(join(PREPARED, "plan.json"), "diagram-review", { into: INTO }));
  entries = reviewEntries(prepared.map((data) => ({ data, pngs: data.images.map((im) => readFrame(PREPARED, data.id, im.n)) })));
  process.chdir(INTO);   // the branch checkout: its source, index and reports
  /* What the source says the diagrams and their steps are, read by this
     trusted script without running any of it (round 24). */
  checkInventory(prepared, stepInventory("."), ONLY);
} else {
  const { renderDiagrams } = await import("./render-diagrams.mjs");
  const root = SOURCE ? resolve(SOURCE) : ".";
  /* The tree must be exactly the pinned commit, before and after rendering. */
  if (PREPARE && worktree(root) !== "") throw new Error(`${root} has changes beyond its commit — refusing to prepare frames that may not show it`);
  const { gallery, lintFailures, data } = await renderDiagrams({ outDir: resolve(tmpdir(), `pulsern-diagram-review-${Date.now()}`), only: ONLY, root });
  if (lintFailures.length) {
    console.error("Layout lint failed — fix these before spending on a review:");
    for (const f of lintFailures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  entries = localEntries(Object.values(data), gallery, (p) => readFileSync(p), ONLY);
  checkInventory(entries.map((x) => x.data), stepInventory(root), ONLY);
  if (PREPARE) {
    if (worktree(root) !== "") throw new Error(`${root} has changes beyond its commit — refusing to prepare frames that may not show it`);
    mkdirSync(PREPARE, { recursive: true });
    for (const { data, pngs } of entries) {
      mkdirSync(join(PREPARE, data.id), { recursive: true });
      pngs.forEach((b, n) => writeFileSync(join(PREPARE, data.id, `${n}.png`), b));
    }
    writeFileSync(join(PREPARE, "plan.json"), JSON.stringify({ kind: "diagram-review", commit: headCommit(root), diagrams: entries.map((x) => x.data) }, null, 2) + "\n");
    console.log(`Prepared ${entries.length} diagram(s) → ${PREPARE}`);
    process.exit(0);
  }
}

const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : {};
/* The code this review approves. The pairing step accepts an approval only
   while the code still has this key (ops/diagram-attest.mjs). */
const SOURCE_KEY = sourceKey();

/* No new paid review starts after this, so a run inside the job's 60
   minutes always reaches its save steps. */
const RUN_DEADLINE = Date.now() + 40 * 60 * 1000;
const write = (p, s) => { mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, s); };

let failed = 0;
try {
  for (const { data: d, pngs } of entries) {
    if (ONLY && d.id !== ONLY) continue;
    /* Built here, by trusted code: the prompt from the data, the source
       read from the branch's files, and the key from exactly what is sent. */
    const { prompt, key } = diagramRequest(d, d.images, RULES, pngs, (id) => diagramSources(id));
    const prev = index[d.id];
    if (canReuse(prev, key, FORCE, frameIds(d.images), d.id, SIGNER)) {
      /* Everything the verdict rests on is byte-identical, so it still
         describes what students see: carry it to the current code. */
      if (prev.sourceKey !== SOURCE_KEY) { prev.sourceKey = SOURCE_KEY; prev.sig = signApproval(d.id, prev, SIGNER); mkdirSync(DIR, { recursive: true }); writeFileSync(INDEX, JSON.stringify(index, null, 2) + "\n"); }
      console.log(`${d.id}: unchanged since ${prev.reviewedAt} — ${prev.verdict}`);
      if (prev.verdict !== "PASS") failed++;
      continue;
    }
    if (prev && prev.key === key && !prev.completed) console.log(`${d.id}: the last attempt did not complete (${prev.verdict}) — retrying`);
    if (Date.now() > RUN_DEADLINE) { console.log(`${d.id}: not started — the run is near its time limit; re-run to review it`); failed++; continue; }
    const r = await reviewAndRecord({
      d, key, images: pngs.length, model: REVIEW_MODEL, cost: lastReviewCost, dir: DIR, index, sourceKey: SOURCE_KEY, write, signer: SIGNER,
      ask: async () => parseJson(await review(prompt, 32000, { images: pngs, responseFormat: DIAGRAM_REVIEW_SCHEMA, effort: "high" })),
    });
    console.log(`${d.id}: ${r.verdict}${r.counts ? ` (${r.counts.blocker}B ${r.counts.major}M ${r.counts.minor}m)` : ""}${r.error ? ` — ${r.error}` : ""}`);
    if (r.verdict !== "PASS") failed++;
  }
} catch (e) {
  console.error(e.message);
  failed++;
}
process.exit(failed ? 1 : 0);
