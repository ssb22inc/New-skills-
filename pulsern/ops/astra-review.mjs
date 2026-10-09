#!/usr/bin/env node
/* GPT Astra reviews every PulseRN change before it is trusted.
   ------------------------------------------------------------------
   Owner's standing instruction: all AI review and adversarial action is GPT
   Astra's, never same-family. The code in this repository is written by a
   Claude model, so it is judged by a model from a different lab — the point of
   a second reader is that it does not share the first one's blind spots.

   Four rules shape this file. Each exists because the alternative produces a
   review that looks like assurance and is not, and two of them were added
   after Astra's own first review of this file found the gap:

   1. ASTRA FINDS, CODE DECIDES. The model returns findings with severities.
      The verdict is computed from those findings by verdictFor(), not taken
      from the model's summary.

   2. NOTHING IN PULSERN IS EXEMPT. An earlier version skipped generated public
      pages by path, which meant a PR could add a hand-written page under one
      of those directories and ship it unreviewed. Generated pages are now
      reviewed in a compact form — their visible text, scripts and links — and
      the lockfile as a list of dependency changes. Only files outside PulseRN
      and earlier review reports are left out, and both are named.

   3. NOTHING IS SILENTLY CUT. Whole-file context is shed before any diff is;
      if the diffs alone do not fit, the review FAILS and says so.

   4. EVERY PAID REVIEW IS KEPT. A checkpoint report is written BEFORE the paid
      call, so a run killed mid-request still leaves a record that it was
      attempted and did not finish.

   This script reads the change under review as DATA (git blobs and diffs). It
   never executes anything from the change: in CI it runs from the base branch
   while the pull request is only read, so a PR cannot alter its own review.

   Usage (from the repository root of the checkout under review):
     node <trusted>/pulsern/ops/astra-review.mjs --base <sha> --head <sha> [--pr <n>] [--out <dir>]
   Env: OPENROUTER_API_KEY
   Exit: 0 PASS · 1 FAIL · 2 the review itself could not be completed */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { llmCall } from "./llm.mjs";
import { REVIEW_MODEL, assertCrossFamily } from "./models.mjs";

/* The author of the code under review, so the cross-family check is real. */
export const AUTHOR_MODEL_FAMILY_PROBE = "anthropic/claude";

/* ---------------------------------------------------------------------------
   What gets reviewed, and how
   --------------------------------------------------------------------------- */

/* Only PulseRN. The repository holds other projects, and the owner's rule is
   no cross-contamination: this reviewer neither reads nor judges them. */
const IN_SCOPE = [/^pulsern\//, /^\.github\/workflows\/pulsern-[^/]+\.ya?ml$/];

/* Pages a generator writes. Reviewed as a digest, not skipped: the digest is
   what a student would read plus every script and link the page carries,
   which is where a harmful change would be. Raw minified markup changes on
   every regeneration and would fill the budget with noise. Kept in step with
   the generators by tests/astra-review.test.js. */
const GENERATED_PAGE = /^pulsern\/public\/(compare|learn|pricing|methodology|how-it-works|editorial-policy|free-nclex-practice-test)\/.*\.html$|^pulsern\/public\/sitemap\.xml$/;
const LOCKFILE = /(^|\/)package-lock\.json$/;
const OWN_REPORTS = /^pulsern\/reports\/astra\//;

export function classifyPath(path) {
  if (!IN_SCOPE.some((re) => re.test(path))) return { mode: "skip", why: "outside PulseRN" };
  if (OWN_REPORTS.test(path)) return { mode: "skip", why: "earlier review reports" };
  if (LOCKFILE.test(path)) return { mode: "lockfile", why: "reviewed as a dependency-change summary" };
  if (GENERATED_PAGE.test(path)) return { mode: "page", why: "generated page: reviewed as visible text, scripts and links" };
  return { mode: "review", why: null };
}

/* Roughly 4 characters per token; about $2 of Astra input at the ceiling. */
export const MAX_PROMPT_CHARS = 800_000;
export const MAX_FULL_FILE_CHARS = 60_000;

/* ---------------------------------------------------------------------------
   Compact forms for generated pages and the lockfile
   --------------------------------------------------------------------------- */

const decode = (s) => s
  .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/* One line per thing a browser sees, in document order, so a line diff of
   two digests shows exactly what changed for a reader — and for a browser.

   Exact where it matters: script and style bodies, comments, and every
   quoted attribute value are kept byte-for-byte (JSON-escaped onto one
   line), because whitespace there can change behaviour — a newline ends a
   // comment and activates the code after it (Astra, PR #134 review,
   finding 3). Whitespace is collapsed only where HTML ignores it: between
   attributes, inside the tag name, and in text. An earlier digest kept only
   what it recognised, so an unquoted <script src=…> vanished from review
   (PR #133 review, finding 2). */
const TAG = /<(?:"[^"]*"|'[^']*'|[^'">])*>/y;
const squash = (s) => s.replace(/\s+/g, " ").trim();
const exact = (s) => JSON.stringify(s);
/* Collapse whitespace OUTSIDE quotes only; quoted values stay exact. */
function normaliseTag(tag) {
  let out = "";
  for (const part of tag.match(/"[^"]*"|'[^']*'|[^"']+/g) ?? []) {
    out += part[0] === '"' || part[0] === "'" ? exact(part.slice(1, -1)) : part.replace(/\s+/g, " ");
  }
  return out.replace(/\s+>/g, ">").replace(/<\s+/g, "<").replace(/\s*=\s*/g, "=");
}
export function pageDigest(html) {
  const src = String(html ?? "");
  const out = [];
  let i = 0, text = "";
  const flushText = () => { const t = squash(decode(text)); if (t) out.push(`TEXT ${t}`); text = ""; };
  while (i < src.length) {
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      const stop = end < 0 ? src.length : end + 3;
      flushText();
      out.push(`COMMENT ${exact(src.slice(i, stop))}`);
      i = stop;
      continue;
    }
    if (src[i] === "<" && /[A-Za-z\/!?]/.test(src[i + 1] ?? "")) {
      TAG.lastIndex = i;
      const m = TAG.exec(src);
      if (m) {
        flushText();
        const tag = m[0];
        out.push(`TAG ${normaliseTag(tag)}`);
        i += tag.length;
        /* Raw-text elements: the body is code or CSS, kept exactly. */
        const raw = /^<(script|style)\b/i.exec(tag)?.[1]?.toLowerCase();
        if (raw) {
          const close = src.toLowerCase().indexOf(`</${raw}`, i);
          const end = close < 0 ? src.length : close;
          const body = src.slice(i, end);
          if (body.length) out.push(`${raw.toUpperCase()}-BODY ${exact(body)}`);
          i = end;
        }
        continue;
      }
    }
    text += src[i];
    i += 1;
  }
  flushText();
  return out.join("\n") + "\n";
}

/* What a reviewer needs from a lockfile change: every package's full
   identity. The complete `resolved` value is kept — host, path AND any git
   revision fragment — with the complete integrity, so a git dependency moved
   from #commitA to #commitB at the same version shows up (Astra, PR #133
   review, finding 3). Install-affecting flags are kept too. */
const LOCK_FIELDS = ["version", "resolved", "integrity", "link", "hasInstallScript", "bin", "os", "cpu", "engines", "dependencies", "optionalDependencies", "peerDependencies"];
export function lockDigest(jsonText) {
  let lock;
  try { lock = JSON.parse(jsonText ?? "{}"); } catch { return "UNPARSEABLE package-lock.json\n"; }
  const pkgs = lock.packages ?? {};
  return Object.keys(pkgs).sort().map((k) => {
    const p = pkgs[k] ?? {};
    const kept = {};
    for (const f of LOCK_FIELDS) if (p[f] !== undefined) kept[f] = p[f];
    return `${k === "" ? "(root)" : k.replace(/^node_modules\//, "")} ${JSON.stringify(kept)}`;
  }).join("\n") + "\n";
}

/* Line diff of two strings via git's own diff engine, on temporary files.
   Runs git as a tool over data; nothing from the change is executed. */
export function textDiff(before, after, label) {
  const dir = mkdtempSync(join(tmpdir(), "astra-"));
  try {
    const a = join(dir, "before"), b = join(dir, "after");
    writeFileSync(a, before ?? "");
    writeFileSync(b, after ?? "");
    try {
      execFileSync("git", ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "-U2", "--", a, b], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      return "";
    } catch (e) {
      if (e.status === 1) return String(e.stdout).replace(/^(---|\+\+\+) .*$/gm, (m) => `${m.slice(0, 3)} ${label}`);
      throw e;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ---------------------------------------------------------------------------
   Collecting the change from git
   --------------------------------------------------------------------------- */

const gitIn = (cwd) => (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

/* -z output: NUL-separated status/path records, paths verbatim. The display
   form quotes paths with non-ASCII characters, tabs or newlines, and an
   earlier version parsed that form — so a file named with an accent arrived
   as a quoted string, matched nothing, and was silently left unreviewed. */
export function parseNameStatusZ(out) {
  const parts = String(out ?? "").split("\0");
  const entries = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const status = parts[i];
    const path = parts[i + 1];
    if (!status) break;
    entries.push({ status: status[0], path });
  }
  return entries;
}

export function collectChanges(base, head, { cwd = process.cwd() } = {}) {
  const git = gitIn(cwd);
  const entries = parseNameStatusZ(git("diff", "--name-status", "--no-renames", "-z", `${base}...${head}`));
  const mergeBase = git("merge-base", base, head).trim();
  const blob = (rev, path) => { try { return git("show", `${rev}:${path}`); } catch { return null; } };

  const files = [];
  const skipped = [];
  for (const e of entries) {
    const c = classifyPath(e.path);
    if (c.mode === "skip") { if (c.why !== "outside PulseRN") skipped.push({ path: e.path, why: c.why }); continue; }
    const before = e.status === "A" ? null : blob(mergeBase, e.path);
    const after = e.status === "D" ? null : blob(head, e.path);

    if (c.mode === "page") {
      files.push({ status: e.status, path: e.path, form: "page digest", diff: textDiff(before == null ? "" : pageDigest(before), after == null ? "" : pageDigest(after), e.path), full: null });
    } else if (c.mode === "lockfile") {
      files.push({ status: e.status, path: e.path, form: "dependency summary", diff: textDiff(before == null ? "" : lockDigest(before), after == null ? "" : lockDigest(after), e.path), full: null });
    } else {
      const diff = git("diff", "--no-renames", "--no-ext-diff", "--no-textconv", "-U25", `${base}...${head}`, "--", e.path);
      files.push({ status: e.status, path: e.path, form: "diff", diff, full: after });
    }
  }
  return { files, skipped };
}

/* Fits the change into the budget without ever dropping part of the change. */
export function planContext(files, budget = MAX_PROMPT_CHARS, fixedOverhead = 0) {
  const diffs = files.reduce((n, f) => n + f.diff.length, 0);
  if (diffs + fixedOverhead > budget) {
    return { ok: false, reason: `the diff alone is ${diffs.toLocaleString()} characters, over the ${budget.toLocaleString()}-character review budget`, files: [] };
  }
  let room = budget - fixedOverhead - diffs;
  const planned = files.map((f) => ({ ...f, includeFull: false }));
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

export function buildPrompt({ rules, files, skipped, meta }) {
  const parts = [];
  parts.push(`You are the adversarial reviewer for PulseRN, an NCLEX-RN exam-preparation platform used by nursing students. The change below was written by a Claude model. You are from a different lab precisely so that you do not share its blind spots. Your job is to find what is actually wrong before it reaches students — not to be agreeable, and not to pad the list.

WHAT COUNTS
- blocker: wrong clinical or exam content could reach a student; scoring, grading, readiness or ability maths is wrong; data loss or corruption; a security hole (secret exposure, auth bypass, personal data leak, a way for a change to bypass this review); any violation of a NON-NEGOTIABLE rule in the project rules below; a user-facing claim the code does not make true; a test that passes for the wrong reason while covering critical logic.
- major: a real defect on a plausible path; new critical logic with no test that would catch its failure; behaviour that contradicts its own comments or documentation.
- minor: maintainability or clarity problems that make a future defect likely.

HOW TO REPORT
- Every finding names a file and, where possible, a line in the post-change file. State the concrete failure: what input or state, and what goes wrong.
- No style preferences, no restating what the code does, no generic advice. If the code is correct, say so and return no findings for it.
- If you are unsure, say exactly what you could not verify and lower the confidence — do not inflate severity to be safe, and do not omit a real concern to be polite.
- Check the tests as hard as the code: a test that cannot fail is worse than no test, because it reports safety that does not exist.

FORMS YOU WILL SEE
- "diff": a normal unified diff, sometimes followed by the whole file after the change.
- "page digest": a generated public page reduced to one line per visible text block, script, link, meta tag and event handler, diffed before/after. Judge what a reader sees and what a browser would run.
- "dependency summary": the lockfile reduced to package@version, source host and integrity prefix, diffed before/after.`);

  parts.push(`\n=== PROJECT RULES (the standard you review against) ===\n${rules}`);

  parts.push(`\n=== CHANGE ===\nbase ${meta.base}  head ${meta.head}${meta.pr ? `  PR #${meta.pr}` : ""}\n${files.length} file(s) under review.`);
  if (skipped.length) {
    parts.push(`Not sent (named so you know they changed): ${skipped.map((e) => `${e.path} [${e.why}]`).join("; ")}`);
  }

  for (const f of files) {
    parts.push(`\n----- ${f.status} ${f.path} (${f.form ?? "diff"}) -----\n${f.diff || "(no textual change)"}`);
    if (f.includeFull && f.full != null) parts.push(`--- full file after the change ---\n${f.full}`);
    else if (f.full != null) parts.push(`(full file not attached: over the per-file context limit; review from the diff)`);
  }
  return parts.join("\n");
}

/* ---------------------------------------------------------------------------
   What the answer means
   --------------------------------------------------------------------------- */

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
  lines.push(`| Reviewer | \`${r.model}\`${r.mode ? ` · ${r.mode === "trusted" ? "run from the base branch; the change was read as data" : r.mode}` : ""} |`);
  lines.push(`| Change | \`${r.meta.base.slice(0, 12)}..${r.meta.head.slice(0, 12)}\`${r.meta.pr ? ` · PR #${r.meta.pr}` : ""} |`);
  lines.push(`| Reviewed at | ${r.reviewedAt} |`);
  lines.push(`| Files | ${r.filesReviewed.length} reviewed${r.skipped?.length ? `, ${r.skipped.length} not sent` : ""} |`);
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
    [...r.findings].sort((a, b) => rank(a.severity) - rank(b.severity)).forEach((f, i) => {
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
  if (r.skipped?.length) {
    lines.push("");
    lines.push(`## Not sent`);
    lines.push("");
    for (const e of r.skipped) lines.push(`- \`${e.path}\` — ${esc(e.why)}`);
  }
  return lines.join("\n") + "\n";
}

export const reportBaseName = ({ head, pr, reviewedAt }) =>
  `${reviewedAt.slice(0, 10)}-${pr ? `pr${pr}-` : ""}${head.slice(0, 7)}`;

/* ---------------------------------------------------------------------------
   Running it
   --------------------------------------------------------------------------- */

/* The whole review as one function with its paid call injectable, so the
   checkpoint-before-spending guarantee can be tested with a call that never
   returns — the case a cancelled or timed-out CI run produces. */
export async function runReview({ base, head, pr = null, outDir, rulesPath, cwd = process.cwd(), mode = "local", now = () => new Date() }, { callModel = llmCall } = {}) {
  const git = gitIn(cwd);
  const reviewedAt = now().toISOString();
  const meta = { base: git("rev-parse", base).trim(), head: git("rev-parse", head).trim(), pr };
  const report = { model: REVIEW_MODEL, mode, meta, reviewedAt, filesReviewed: [], skipped: [], findings: [], usage: null, error: null };
  const name = reportBaseName({ head: meta.head, pr, reviewedAt });

  const save = () => {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${name}.md`), renderMarkdown(report));
    writeFileSync(join(outDir, `${name}.raw.json`), JSON.stringify(report, null, 2) + "\n");
    return join(outDir, `${name}.md`);
  };

  try {
    assertCrossFamily(AUTHOR_MODEL_FAMILY_PROBE, REVIEW_MODEL);
    const rules = existsSync(rulesPath) ? readFileSync(rulesPath, "utf8") : "(project rules file not found)";
    const { files, skipped } = collectChanges(meta.base, meta.head, { cwd });
    report.skipped = skipped;
    report.filesReviewed = files.map((f) => f.path);

    if (!files.length) {
      report.assessment = "No PulseRN files changed in this range; nothing to review.";
      Object.assign(report, verdictFor([]));
      save();
      return { code: 0, report };
    }

    const overhead = buildPrompt({ rules, files: [], skipped, meta }).length;
    const plan = planContext(files, MAX_PROMPT_CHARS, overhead);
    if (!plan.ok) {
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
      return { code: 1, report };
    }

    /* Checkpoint BEFORE spending. If this process is killed during the paid
       call — a cancelled run, a timeout, a lost runner — this is the report
       that survives, and it says plainly that the review did not finish. */
    report.error = "The review was started but did not finish: the run was stopped while waiting for Astra. Recorded as a failure.";
    report.verdict = "FAIL";
    save();

    const prompt = buildPrompt({ rules, files: plan.files, skipped, meta });
    const res = await callModel({ model: REVIEW_MODEL, prompt, maxTokens: 64000, reasoningEffort: "high", responseFormat: FINDINGS_SCHEMA });
    report.usage = res.usage;
    report.model = res.model || REVIEW_MODEL;

    let parsed;
    try { parsed = validateResult(JSON.parse(res.text)); }
    catch (e) {
      report.error = `Astra's answer could not be read as a review (${e.message}). The raw answer is kept in the .raw.json report.`;
      report.rawAnswer = res.text;
      report.verdict = "FAIL";
      save();
      return { code: 2, report };
    }

    report.error = null;
    report.assessment = parsed.assessment;
    report.findings = parsed.findings;
    Object.assign(report, verdictFor(parsed.findings));
    save();
    return { code: report.verdict === "PASS" ? 0 : 1, report };
  } catch (e) {
    report.error = `The review could not be completed: ${e.message}`;
    report.verdict = "FAIL";
    try { save(); } catch (se) { console.error(`Could not save the report either: ${se.message}`); }
    return { code: 2, report };
  }
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const here = dirname(fileURLToPath(import.meta.url));
  const base = arg("--base");
  const head = arg("--head");
  if (!base || !head) { console.error("usage: astra-review.mjs --base <sha> --head <sha> [--pr <n>] [--out <dir>]"); process.exit(2); }
  runReview({
    base, head, pr: arg("--pr"),
    outDir: arg("--out", join(here, "..", "reports", "astra")),
    rulesPath: join(here, "..", "CLAUDE.md"),
    mode: process.env.ASTRA_REVIEW_MODE || "local",
  }).then(({ code, report }) => {
    console.log(`Astra review: ${report.verdict}${report.counts ? ` (${report.counts.blocker} blocker, ${report.counts.major} major, ${report.counts.minor} minor)` : ""}`);
    process.exit(code);
  }, (e) => { console.error(e); process.exit(2); });
}
