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
import { imagePlan, diagramReviewPrompt, validateReview, verdictFor, reviewKey, renderReviewMarkdown, DIAGRAM_REVIEW_SCHEMA } from "./review-diagrams-lib.mjs";

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
const outDir = resolve(tmpdir(), `pulsern-diagram-review-${Date.now()}`);
const { gallery, lintFailures } = await renderDiagrams({ outDir, only: ONLY });
if (lintFailures.length) {
  console.error("Layout lint failed — fix these before spending on a review:");
  for (const f of lintFailures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let failed = 0;
try {
  const { DIAGRAMS } = await vite.ssrLoadModule("/src/diagrams/index.js");
  const rules = rulesExcerpt();
  for (const d of Object.values(DIAGRAMS)) {
    if (ONLY && d.id !== ONLY) continue;
    const plan = imagePlan(d, gallery);
    const pngs = plan.map((p) => readFileSync(p.file));
    const key = reviewKey(d, pngs);
    const prev = index[d.id];
    if (!FORCE && prev?.key === key) {
      console.log(`${d.id}: unchanged since ${prev.reviewedAt} — ${prev.verdict}`);
      if (prev.verdict !== "PASS") failed++;
      continue;
    }
    const r = { id: d.id, title: d.title, model: REVIEW_MODEL, reviewedAt: new Date().toISOString(), images: plan.length, key, findings: [], usage: null, error: null };
    try {
      const raw = await review(diagramReviewPrompt(d, plan, rules), 32000, { images: pngs, responseFormat: DIAGRAM_REVIEW_SCHEMA, effort: "high" });
      r.usage = { costUsd: lastReviewCost() };
      const parsed = validateReview(parseJson(raw));
      r.assessment = parsed.assessment;
      r.findings = parsed.findings;
      Object.assign(r, verdictFor(parsed.findings));
    } catch (e) {
      r.error = e.message;
      r.verdict = "FAIL";
    }
    mkdirSync(join(DIR, d.id), { recursive: true });
    const base = join(DIR, d.id, `${r.reviewedAt.slice(0, 10)}-${key}`);
    writeFileSync(`${base}.md`, renderReviewMarkdown(r));
    writeFileSync(`${base}.json`, JSON.stringify(r, null, 2) + "\n");
    index[d.id] = { key, verdict: r.verdict, reviewedAt: r.reviewedAt, report: `${base}.md`, counts: r.counts ?? null };
    writeFileSync(INDEX, JSON.stringify(index, null, 2) + "\n");   // after every diagram
    console.log(`${d.id}: ${r.verdict}${r.counts ? ` (${r.counts.blocker}B ${r.counts.major}M ${r.counts.minor}m)` : ""}${r.error ? ` — ${r.error}` : ""}`);
    if (r.verdict !== "PASS") failed++;
  }
} finally {
  await vite.close();
}
process.exit(failed ? 1 : 0);
