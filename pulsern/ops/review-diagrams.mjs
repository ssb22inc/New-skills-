#!/usr/bin/env node
/* Renders every concept diagram and has GPT Astra review each one visually
   and clinically. Unchanged diagrams keep their earlier verdict; every paid
   review is saved, PASS or FAIL.

   Usage: node ops/review-diagrams.mjs [--only id] [--force]
   Env:   OPENROUTER_API_KEY
   Exit:  0 all PASS · 1 any FAIL or review error */
import { createServer } from "vite";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { renderDiagrams } from "./render-diagrams.mjs";
import { review, parseJson, lastReviewCost } from "./review.mjs";
import { REVIEW_MODEL } from "./models.mjs";
import { sourceKey } from "./diagram-attest.mjs";
import { imagePlan, DIAGRAM_REVIEW_SCHEMA, canReuse, reviewAndRecord, diagramRequest, diagramSources } from "./review-diagrams-lib.mjs";

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const ONLY = arg("--only");
const FORCE = process.argv.includes("--force");
const DIR = "reports/diagram-review";
const INDEX = join(DIR, "index.json");

/* The rules a diagram is judged against: the design and claims sections of
   CLAUDE.md, not the whole file. */
function rulesExcerpt() {
  const md = readFileSync("CLAUDE.md", "utf8");
  const keep = md.split("\n").filter((l) => /design system|coral|amber|teal|claims hygiene|compare, never equate|ai content|labeled|labelled|verify against|medical content register|dosing|accessib|contrast|reduced-motion/i.test(l));
  return keep.join("\n");
}

const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : {};
/* The code this review approves. The pairing step accepts an approval only
   while the code still has this key (ops/diagram-attest.mjs). */
const SOURCE_KEY = sourceKey();
const outDir = resolve(tmpdir(), `pulsern-diagram-review-${Date.now()}`);
const { gallery, lintFailures } = await renderDiagrams({ outDir, only: ONLY });
if (lintFailures.length) {
  console.error("Layout lint failed — fix these before spending on a review:");
  for (const f of lintFailures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

/* No new paid review starts after this, so a run inside the job's 60
   minutes always reaches its save steps. */
const RUN_DEADLINE = Date.now() + 40 * 60 * 1000;
const write = (p, s) => { mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, s); };

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let failed = 0;
try {
  const { DIAGRAMS } = await vite.ssrLoadModule("/src/diagrams/index.js");
  const rules = rulesExcerpt();
  for (const d of Object.values(DIAGRAMS)) {
    if (ONLY && d.id !== ONLY) continue;
    const plan = imagePlan(d, gallery);
    const pngs = plan.map((p) => readFileSync(p.file));
    /* The reviewer sees the source too, so a change to logic that the
       example does not exercise is still in front of it. */
    const { prompt, key } = diagramRequest(d, plan, rules, pngs, (id) => diagramSources(id));
    const prev = index[d.id];
    if (canReuse(prev, key, FORCE)) {
      /* Every reviewed image is byte-identical, so the verdict still describes
         what students see: carry it to the current code without re-paying. */
      if (prev.sourceKey !== SOURCE_KEY) { prev.sourceKey = SOURCE_KEY; mkdirSync(DIR, { recursive: true }); writeFileSync(INDEX, JSON.stringify(index, null, 2) + "\n"); }
      console.log(`${d.id}: unchanged since ${prev.reviewedAt} — ${prev.verdict}`);
      if (prev.verdict !== "PASS") failed++;
      continue;
    }
    if (prev && prev.key === key && !prev.completed) console.log(`${d.id}: the last attempt did not complete (${prev.verdict}) — retrying`);
    if (Date.now() > RUN_DEADLINE) { console.log(`${d.id}: not started — the run is near its time limit; re-run to review it`); failed++; continue; }
    const r = await reviewAndRecord({
      d, key, images: plan.length, model: REVIEW_MODEL, cost: lastReviewCost, dir: DIR, index, sourceKey: SOURCE_KEY, write,
      ask: async () => parseJson(await review(prompt, 32000, { images: pngs, responseFormat: DIAGRAM_REVIEW_SCHEMA, effort: "high" })),
    });
    console.log(`${d.id}: ${r.verdict}${r.counts ? ` (${r.counts.blocker}B ${r.counts.major}M ${r.counts.minor}m)` : ""}${r.error ? ` — ${r.error}` : ""}`);
    if (r.verdict !== "PASS") failed++;
  }
} finally {
  await vite.close();
}
process.exit(failed ? 1 : 0);
