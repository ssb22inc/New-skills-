#!/usr/bin/env node
/* GPT Astra reviews every PulseRN change before it is trusted.
   ------------------------------------------------------------------
   Owner's standing instruction: all AI review and adversarial action is GPT
   Astra's, never same-family. The code in this repository is written by a
   Claude model, so it is judged by a model from a different lab — the point of
   a second reader is that it does not share the first one's blind spots.

   Three rules shape this file, and each one exists because the alternative
   produces a review that looks like assurance and is not:

   1. ASTRA FINDS, CODE DECIDES. The model returns findings with severities.
      The verdict is computed from those findings by verdictFor(), not taken
      from the model's own summary. A reviewer that writes "PASS" above three
      blocker findings would otherwise get the last word.

   2. NOTHING IS SILENTLY CUT. If the change is too large to send whole, the
      review FAILS with a blocker that says so, instead of quietly reviewing
      the half that fit and reporting on it as though it were everything.

   3. EVERY PAID REVIEW IS KEPT. Owner's instruction: a review whose report is
      lost is money wasted. The report — PASS, FAIL, or a run that broke
      partway — is written before the exit code is decided.

   Usage (from the repository root):
     node pulsern/ops/astra-review.mjs --base <sha> --head <sha> [--pr <n>] [--out <dir>]
   Env: OPENROUTER_API_KEY
   Exit: 0 PASS · 1 FAIL · 2 the review itself could not be completed */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { llmCall } from "./llm.mjs";
import { REVIEW_MODEL, assertCrossFamily } from "./models.mjs";

/* The author of the code under review. Recorded so the cross-family check is
   real rather than assumed. */
export const AUTHOR_MODEL_FAMILY_PROBE = "anthropic/claude";

/* ---------------------------------------------------------------------------
   What gets reviewed
   --------------------------------------------------------------------------- */

/* Only PulseRN. The repository holds other projects, and the owner's rule is
   no cross-contamination: this reviewer neither reads nor judges them. */
const IN_SCOPE = [/^pulsern\//, /^\.github\/workflows\/pulsern-[^/]+\.ya?ml$/];

/* Excluded and NAMED in the prompt, so the reviewer knows they exist and can
   ask about them. Each is either machine output whose source is reviewed
   instead, or a past review report — reviewing the reviews would only feed the
   reviewer its own earlier words. */
const EXCLUDED = [
  { re: /^pulsern\/reports\/astra\//, why: "earlier review reports" },
  { re: /(^|\/)package-lock\.json$/, why: "lockfile" },
  { re: /^pulsern\/dist\//, why: "build output" },
  /* Only the pages a generator writes. The hand-written ones — the owner
     dashboard, the review console (where the approval gate lives), about and
     legal — are reviewed like any other code. A blanket "public HTML" rule
     would have exempted exactly the two files where a mistake does the most
     damage; the owner dashboard has already been taken down once by a single
     duplicate declaration. Kept in step with ops/build-public-pages.mjs and
     ops/build-learn.mjs by tests/astra-review.test.js. */
  { re: /^pulsern\/public\/(compare|learn|pricing|methodology|how-it-works|editorial-policy|free-nclex-practice-test)\/.*\.html$/, why: "generated public page (its generator is reviewed instead)" },
  { re: /^pulsern\/public\/sitemap\.xml$/, why: "generated sitemap" },
  { re: /^pulsern\/public\/(comparison-evidence|commercial-search-intents|release|search-intents|content-provenance)\.json$/, why: "generated manifest" },
];

export function classifyPath(path) {
  if (!IN_SCOPE.some((re) => re.test(path))) return { include: false, why: "outside PulseRN" };
  const hit = EXCLUDED.find((e) => e.re.test(path));
  return hit ? { include: false, why: hit.why } : { include: true, why: null };
}

/* Roughly 4 characters per token. The ceiling keeps one review to a known,
   bounded cost; at Astra's input price it is about $2 of input. */
export const MAX_PROMPT_CHARS = 800_000;
/* A whole file is sent alongside its diff so the reviewer can see callers and
   surrounding invariants. Very large files are sent as diff only. */
export const MAX_FULL_FILE_CHARS = 60_000;

/* Fits the change into the budget without ever dropping part of the change.
   Full-file context is the only thing that may be shed; the diffs themselves
   never are. If the diffs alone do not fit, that is reported, not hidden. */
export function planContext(files, budget = MAX_PROMPT_CHARS, fixedOverhead = 0) {
  const diffs = files.reduce((n, f) => n + f.diff.length, 0);
  if (diffs + fixedOverhead > budget) {
    return { ok: false, reason: `the diff alone is ${diffs.toLocaleString()} characters, over the ${budget.toLocaleString()}-character review budget`, files: [] };
  }
  let room = budget - fixedOverhead - diffs;
  const planned = files.map((f) => ({ ...f, includeFull: false }));
  /* Smallest files first: the most context for the least budget. */
  const order = planned
    .map((f, i) => ({ i, len: f.full?.length ?? Infinity }))
    .filter((x) => Number.isFinite(x.len) && x.len <= MAX_FULL_FILE_CHARS)
    .sort((a, b) => a.len - b.len);
  for (const { i, len } of order) {
    if (len > room) break;
    planned[i].includeFull = true;
    room -= len;
  }
  return { ok: true, reason: null, files: planned };
}

/* ---------------------------------------------------------------------------
   What Astra is asked
   --------------------------------------------------------------------------- */

export const SEVERITIES = ["blocker", "major", "minor"];

export const FINDINGS_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "pulsern_review",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["assessment", "findings"],
      properties: {
        assessment: { type: "string" },
        findings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["severity", "file", "line", "title", "problem", "failure_scenario", "fix", "confidence"],
            properties: {
              severity: { type: "string", enum: SEVERITIES },
              file: { type: "string" },
              line: { type: ["integer", "null"] },
              title: { type: "string" },
              problem: { type: "string" },
              failure_scenario: { type: "string" },
              fix: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
          },
        },
      },
    },
  },
};

export function buildPrompt({ rules, files, excluded, meta }) {
  const parts = [];
  parts.push(`You are the adversarial reviewer for PulseRN, an NCLEX-RN exam-preparation platform used by nursing students. The change below was written by a Claude model. You are from a different lab precisely so that you do not share its blind spots. Your job is to find what is actually wrong before it reaches students — not to be agreeable, and not to pad the list.

WHAT COUNTS
- blocker: wrong clinical or exam content could reach a student; scoring, grading, readiness or ability maths is wrong; data loss or corruption; a security hole (secret exposure, auth bypass, personal data leak); any violation of a NON-NEGOTIABLE rule in the project rules below; a user-facing claim the code does not make true; a test that passes for the wrong reason while covering critical logic.
- major: a real defect on a plausible path; new critical logic with no test that would catch its failure; behaviour that contradicts its own comments or documentation.
- minor: maintainability or clarity problems that make a future defect likely.

HOW TO REPORT
- Every finding names a file and, where possible, a line in the post-change file. State the concrete failure: what input or state, and what goes wrong.
- No style preferences, no restating what the code does, no generic advice. If the code is correct, say so and return no findings for it.
- If you are unsure, say exactly what you could not verify and lower the confidence — do not inflate severity to be safe, and do not omit a real concern to be polite.
- Check the tests as hard as the code: a test that cannot fail is worse than no test, because it reports safety that does not exist.`);

  parts.push(`\n=== PROJECT RULES (the standard you review against) ===\n${rules}`);

  parts.push(`\n=== CHANGE ===\nbase ${meta.base}  head ${meta.head}${meta.pr ? `  PR #${meta.pr}` : ""}\n${files.length} file(s) under review.`);
  if (excluded.length) {
    parts.push(`Excluded from this review (named so you know they changed): ${excluded.map((e) => `${e.path} [${e.why}]`).join("; ")}`);
  }

  for (const f of files) {
    parts.push(`\n----- ${f.status} ${f.path} -----\n--- diff ---\n${f.diff || "(no textual diff)"}`);
    if (f.includeFull && f.full != null) parts.push(`--- full file after the change ---\n${f.full}`);
    else if (f.full != null) parts.push(`(full file not attached: over the per-file context limit; review from the diff)`);
  }
  return parts.join("\n");
}

/* ---------------------------------------------------------------------------
   What the answer means
   --------------------------------------------------------------------------- */

/* Rejects anything that does not match the schema, rather than coercing it.
   A malformed finding silently dropped is a defect silently waved through. */
export function validateResult(obj) {
  if (!obj || typeof obj !== "object") throw new Error("review result is not an object");
  if (typeof obj.assessment !== "string") throw new Error("review result has no assessment");
  if (!Array.isArray(obj.findings)) throw new Error("review result has no findings array");
  obj.findings.forEach((f, i) => {
    if (!SEVERITIES.includes(f?.severity)) throw new Error(`finding ${i} has invalid severity ${JSON.stringify(f?.severity)}`);
    for (const k of ["file", "title", "problem", "fix"]) {
      if (typeof f[k] !== "string" || !f[k].trim()) throw new Error(`finding ${i} is missing ${k}`);
    }
  });
  return obj;
}

/* The verdict is arithmetic over severities. The model's prose does not vote. */
export function verdictFor(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of findings) counts[f.severity] += 1;
  return { verdict: counts.blocker + counts.major > 0 ? "FAIL" : "PASS", counts };
}

const rank = (s) => SEVERITIES.indexOf(s);
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function renderMarkdown(r) {
  const lines = [];
  lines.push(`# Astra review — ${r.verdict}`);
  lines.push("");
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| Reviewer | \`${r.model}\`${r.mode ? ` · ${r.mode === "bootstrap" ? "**bootstrap — this PR was reviewed by its own copy of the reviewer**" : r.mode === "trusted" ? "run from the base branch" : r.mode}` : ""} |`);
  lines.push(`| Change | \`${r.meta.base.slice(0, 12)}..${r.meta.head.slice(0, 12)}\`${r.meta.pr ? ` · PR #${r.meta.pr}` : ""} |`);
  lines.push(`| Reviewed at | ${r.reviewedAt} |`);
  lines.push(`| Files | ${r.filesReviewed.length} reviewed${r.excluded.length ? `, ${r.excluded.length} excluded` : ""} |`);
  lines.push(`| Cost | ${r.usage?.costUsd != null ? `$${r.usage.costUsd.toFixed(4)}` : "unknown"}${r.usage?.promptTokens != null ? ` (${r.usage.promptTokens.toLocaleString()} in / ${(r.usage.completionTokens ?? 0).toLocaleString()} out)` : ""} |`);
  if (r.counts) lines.push(`| Findings | ${r.counts.blocker} blocker · ${r.counts.major} major · ${r.counts.minor} minor |`);
  lines.push("");
  if (r.error) {
    lines.push(`## The review did not complete`);
    lines.push("");
    lines.push(r.error);
    lines.push("");
    lines.push(`This is recorded as a failure: an unfinished review is not a pass.`);
    return lines.join("\n") + "\n";
  }
  lines.push(`## Assessment`);
  lines.push("");
  lines.push(r.assessment || "_(none given)_");
  lines.push("");
  if (r.findings.length) {
    lines.push(`## Findings`);
    lines.push("");
    const sorted = [...r.findings].sort((a, b) => rank(a.severity) - rank(b.severity));
    sorted.forEach((f, i) => {
      lines.push(`### ${i + 1}. [${f.severity}] ${f.title}`);
      lines.push("");
      lines.push(`- **Where:** \`${f.file}${f.line != null ? `:${f.line}` : ""}\` · confidence ${f.confidence}`);
      lines.push(`- **Problem:** ${f.problem}`);
      lines.push(`- **How it fails:** ${f.failure_scenario}`);
      lines.push(`- **Fix:** ${f.fix}`);
      lines.push("");
    });
  } else {
    lines.push(`_No findings._`);
    lines.push("");
  }
  lines.push(`## Files reviewed`);
  lines.push("");
  for (const f of r.filesReviewed) lines.push(`- \`${f}\``);
  if (r.excluded.length) {
    lines.push("");
    lines.push(`## Excluded`);
    lines.push("");
    for (const e of r.excluded) lines.push(`- \`${e.path}\` — ${esc(e.why)}`);
  }
  return lines.join("\n") + "\n";
}

export const reportBaseName = ({ head, pr, reviewedAt }) =>
  `${reviewedAt.slice(0, 10)}-${pr ? `pr${pr}-` : ""}${head.slice(0, 7)}`;

/* ---------------------------------------------------------------------------
   Running it
   --------------------------------------------------------------------------- */

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

function collectChanges(base, head) {
  const raw = git("diff", "--name-status", "--no-renames", `${base}...${head}`).trim();
  const entries = raw ? raw.split("\n").map((l) => { const [status, ...p] = l.split("\t"); return { status, path: p.join("\t") }; }) : [];
  const files = [];
  const excluded = [];
  for (const e of entries) {
    const c = classifyPath(e.path);
    if (!c.include) { if (c.why !== "outside PulseRN") excluded.push({ path: e.path, why: c.why }); continue; }
    const diff = git("diff", "--no-renames", "-U25", `${base}...${head}`, "--", e.path);
    let full = null;
    if (e.status !== "D") { try { full = git("show", `${head}:${e.path}`); } catch { full = null; } }
    files.push({ status: e.status, path: e.path, diff, full });
  }
  return { files, excluded };
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const base = arg("--base");
  const head = arg("--head");
  const pr = arg("--pr");
  const outDir = arg("--out", join(here, "..", "reports", "astra"));
  if (!base || !head) { console.error("usage: astra-review.mjs --base <sha> --head <sha> [--pr <n>] [--out <dir>]"); process.exit(2); }

  const reviewedAt = new Date().toISOString();
  const meta = { base: git("rev-parse", base).trim(), head: git("rev-parse", head).trim(), pr };
  /* Which copy of the reviewer ran. "trusted" means the base branch's
     reviewer judged this change; "bootstrap" means the PR was judged by its own
     copy because the base had none yet, and the report must say so. */
  const mode = process.env.ASTRA_REVIEW_MODE || "local";
  const report = { model: REVIEW_MODEL, mode, meta, reviewedAt, filesReviewed: [], excluded: [], findings: [], usage: null, error: null };

  const save = () => {
    mkdirSync(outDir, { recursive: true });
    const name = reportBaseName({ head: meta.head, pr, reviewedAt });
    writeFileSync(join(outDir, `${name}.md`), renderMarkdown(report));
    writeFileSync(join(outDir, `${name}.raw.json`), JSON.stringify(report, null, 2) + "\n");
    console.log(`Report: ${join(outDir, `${name}.md`)}`);
    return name;
  };

  try {
    assertCrossFamily(AUTHOR_MODEL_FAMILY_PROBE, REVIEW_MODEL);

    const rulesPath = join(here, "..", "CLAUDE.md");
    const rules = existsSync(rulesPath) ? readFileSync(rulesPath, "utf8") : "(project rules file not found)";
    const { files, excluded } = collectChanges(meta.base, meta.head);
    report.excluded = excluded;

    if (!files.length) {
      report.assessment = "No PulseRN files changed in this range; nothing to review.";
      Object.assign(report, verdictFor([]), { verdict: "PASS" });
      save();
      return 0;
    }

    const overhead = buildPrompt({ rules, files: [], excluded, meta }).length;
    const plan = planContext(files, MAX_PROMPT_CHARS, overhead);
    report.filesReviewed = files.map((f) => f.path);
    if (!plan.ok) {
      /* Recorded as a blocker finding so the verdict maths stays the single
         source of truth: a review that could not see everything cannot pass. */
      report.findings = [{
        severity: "blocker", file: "(whole change)", line: null, title: "Change too large to review in full",
        problem: `Not reviewed: ${plan.reason}.`,
        failure_scenario: "Approving a change no reviewer has read end to end.",
        fix: "Split the change into smaller pull requests and review each one.",
        confidence: "high",
      }];
      report.assessment = "Refused to review a partial change as if it were the whole change.";
      Object.assign(report, verdictFor(report.findings));
      save();
      return 1;
    }

    const prompt = buildPrompt({ rules, files: plan.files, excluded, meta });
    console.log(`Reviewing ${files.length} file(s), ${prompt.length.toLocaleString()} chars, with ${REVIEW_MODEL}…`);
    const res = await llmCall({
      model: REVIEW_MODEL,
      prompt,
      maxTokens: 64000,
      reasoningEffort: "high",
      responseFormat: FINDINGS_SCHEMA,
    });
    report.usage = res.usage;
    report.model = res.model || REVIEW_MODEL;

    let parsed;
    try { parsed = validateResult(JSON.parse(res.text)); }
    catch (e) {
      report.error = `Astra's answer could not be read as a review (${e.message}). The raw answer is kept in the .raw.json report.`;
      report.rawAnswer = res.text;
      report.verdict = "FAIL";
      save();
      return 2;
    }

    report.assessment = parsed.assessment;
    report.findings = parsed.findings;
    Object.assign(report, verdictFor(parsed.findings));
    save();
    return report.verdict === "PASS" ? 0 : 1;
  } catch (e) {
    report.error = `The review could not be completed: ${e.message}`;
    report.verdict = "FAIL";
    try { save(); } catch (se) { console.error(`Could not save the report either: ${se.message}`); }
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
