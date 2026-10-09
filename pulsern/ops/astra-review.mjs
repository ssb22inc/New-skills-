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
import { createHash } from "node:crypto";
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


/* One line per thing a browser sees, in document order, so a line diff of
   two digests shows exactly what changed — for a reader and for a browser.

   LOSSLESS. Every tag, comment, script/style body and run of text is kept
   byte-for-byte (JSON-escaped onto one line); the digest only splits the
   page into lines so the diff is readable. Five rounds of review each found
   a way that "insignificant" normalisation hid an executable change —
   unquoted attributes, whitespace in handlers, a newline after a //
   comment, a false </scriptx> close (Astra, PR #133–#134 reviews) — so
   nothing is normalised any more. A regenerated page whose markup really
   changed is a real change and is shown. */
const exact = (s) => JSON.stringify(s);
const TAG = /<(?:"[^"]*"|'[^']*'|[^'">])*>/y;
/* Tags are kept VERBATIM (JSON-escaped onto one line). Every attempt to
   normalise whitespace inside a tag eventually hid a behaviour change —
   last, "onerror=window.x =alert(1)" vs "onerror=window.x=alert(1)",
   where one space moves an unquoted attribute boundary (Astra, PR #134
   review, round 4). Only text between tags is whitespace-normalised. */
export function pageDigest(html) {
  const src = String(html ?? "");
  const out = [];
  let i = 0, text = "";
  const flushText = () => { if (text.length) out.push(`TEXT ${exact(text)}`); text = ""; };
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
        out.push(`TAG ${exact(tag)}`);
        i += tag.length;
        /* Raw-text elements: the body is code or CSS, kept exactly. */
        const raw = /^<(script|style)\b/i.exec(tag)?.[1]?.toLowerCase();
        if (raw) {
          /* A real end tag only: "</script" followed by whitespace, "/" or ">".
             "</scriptx>" does not close a script (Astra, PR #134, round 5). */
          const closeRe = new RegExp(`</${raw}(?=[\\s/>])`, "ig");
          closeRe.lastIndex = i;
          const close = closeRe.exec(src)?.index ?? -1;
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

/* What a reviewer needs from a lockfile change: EVERYTHING npm reads.
   Each package entry is kept whole, with keys sorted so the digest is
   deterministic — a field allowlist kept missing install-affecting flags
   (git revisions, then dev/optional/devOptional: Astra, PR #133 review,
   finding 3; PR #134 review, round 4). Top-level fields are kept too, and
   an unreadable lockfile is reported, never passed as empty. */
const sortedJson = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
export function lockDigest(jsonText) {
  let lock;
  try { lock = JSON.parse(jsonText ?? "{}"); } catch { return "UNPARSEABLE package-lock.json\n"; }
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) return "UNPARSEABLE package-lock.json\n";
  const { packages = {}, ...top } = lock;
  const lines = [`(lockfile) ${sortedJson(top)}`];
  for (const k of Object.keys(packages).sort()) {
    lines.push(`${k === "" ? "(root)" : k.replace(/^node_modules\//, "")} ${sortedJson(packages[k])}`);
  }
  return lines.join("\n") + "\n";
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

/* Characters a model cannot see are shown as visible markers, so nothing in
   a changed file is silently invisible: C0 controls (NUL, ESC…), DEL, and the
   invisible format characters — zero-width, byte-order mark, bidirectional
   overrides — that can make text read differently from how it runs. */
export const visibleControls = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, (c) => `\\u{${c.charCodeAt(0).toString(16).padStart(2, "0")}}`);

/* Exact bytes to text, or null. Decoding is fatal — an invalid byte is never
   replaced with U+FFFD — and a byte-order mark is kept, so two different
   byte sequences can never become the same text (Astra, PR #134 review,
   round 8: lossy decoding let a non-UTF-8 page change its script while its
   digest stayed the same). Valid UTF-8 decodes one-to-one. */
export function exactText(buf) {
  if (buf == null) return null;
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf); } catch { return undefined; }
}

/* Raster images Astra can look at, recognised by their bytes, never by the
   file name. */
export function imageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (/^GIF8[79]a/.test(buf.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGES = 24;
export const MAX_IMAGE_TOTAL_BYTES = 16 * 1024 * 1024;
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/* What each changed file is, decided by its bytes. Text — whatever its
   extension — is diffed. A raster image is shown to Astra itself, both
   versions, each bound to its exact bytes by hash. Anything else (audio, PDF,
   fonts, archives, text in another encoding) cannot be put in front of the
   reviewer, so the review fails closed rather than certifying a hash
   (Astra, PR #134 review, round 8: a hash names a change, it does not show
   whether a clinical image or document is right). */
export function collectChanges(base, head, { cwd = process.cwd() } = {}) {
  const git = gitIn(cwd);
  const blob = (rev, path) => { try { return execFileSync("git", ["show", `${rev}:${path}`], { cwd, maxBuffer: 256 * 1024 * 1024 }); } catch { return null; } };
  const entries = parseNameStatusZ(git("diff", "--name-status", "--no-renames", "-z", `${base}...${head}`));
  const mergeBase = git("merge-base", base, head).trim();

  const files = [];
  const skipped = [];
  const unrepresentable = [];
  const images = [];
  for (const e of entries) {
    const c = classifyPath(e.path);
    if (c.mode === "skip") { if (c.why !== "outside PulseRN") skipped.push({ path: e.path, why: c.why }); continue; }
    const wasBuf = e.status === "A" ? null : blob(mergeBase, e.path);
    const nowBuf = e.status === "D" ? null : blob(head, e.path);
    const before = exactText(wasBuf), after = exactText(nowBuf);
    const isText = before !== undefined && after !== undefined;

    if (!isText) {
      const sides = [["before", wasBuf], ["after", nowBuf]].filter(([, b]) => b != null);
      const ok = sides.every(([, b]) => imageType(b) && b.length <= MAX_IMAGE_BYTES);
      if (!ok) { unrepresentable.push(e.path); continue; }
      const lines = [`image ${e.path} (shown to you as attached images)`];
      lines.push(`- ${wasBuf == null ? "(absent)" : `sha256 ${sha256(wasBuf)} · ${wasBuf.length} bytes · ${imageType(wasBuf)}`}`);
      lines.push(`+ ${nowBuf == null ? "(absent)" : `sha256 ${sha256(nowBuf)} · ${nowBuf.length} bytes · ${imageType(nowBuf)}`}`);
      for (const [side, b] of sides) images.push({ path: e.path, side, mime: imageType(b), sha256: sha256(b), bytes: b });
      files.push({ status: e.status, path: e.path, form: "image", diff: lines.join("\n") + "\n", full: null });
    } else if (c.mode === "page") {
      files.push({ status: e.status, path: e.path, form: "page digest", diff: textDiff(before == null ? "" : pageDigest(before), after == null ? "" : pageDigest(after), e.path), full: null });
    } else if (c.mode === "lockfile") {
      files.push({ status: e.status, path: e.path, form: "dependency summary", diff: textDiff(before == null ? "" : lockDigest(before), after == null ? "" : lockDigest(after), e.path), full: null });
    } else {
      /* --text: never let git decide a source file is "binary" and replace
         its changes with a one-line marker (Astra, PR #134 review, round 7:
         a NUL in a comment hid every other change in the file). Both sides
         are valid UTF-8 (checked above), so the diff decodes exactly. */
      const raw = execFileSync("git", ["diff", "--text", "--no-renames", "--no-ext-diff", "--no-textconv", "-U25", `${base}...${head}`, "--", e.path], { cwd, maxBuffer: 256 * 1024 * 1024 });
      const diff = exactText(raw);
      if (diff === undefined) { unrepresentable.push(e.path); continue; }
      files.push({ status: e.status, path: e.path, form: "diff", diff: visibleControls(diff), full: after == null ? null : visibleControls(after) });
    }
  }
  /* Fail closed: a change git could only describe as "Binary files differ"
     has not been represented either. */
  for (const f of files) if (f.form !== "image" && /^Binary files .* differ$/m.test(f.diff)) unrepresentable.push(f.path);
  if (unrepresentable.length) throw new Error(`cannot put these changes in front of the reviewer, so the change cannot pass: ${unrepresentable.join(", ")} (not valid UTF-8 text and not a reviewable PNG/JPEG/GIF/WebP image under ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`);
  const total = images.reduce((n, i) => n + i.bytes.length, 0);
  if (images.length > MAX_IMAGES || total > MAX_IMAGE_TOTAL_BYTES) throw new Error(`${images.length} image versions (${total.toLocaleString()} bytes) changed; at most ${MAX_IMAGES} images and ${MAX_IMAGE_TOTAL_BYTES / 1024 / 1024} MB can be shown in one review — split the change`);
  return { files, skipped, images };
}

/* The request: the text prompt, then each image labelled with its path,
   side and hash, so Astra reviews exactly the bytes that will ship. */
export function buildMessages(prompt, images = []) {
  if (!images.length) return [{ role: "user", content: prompt }];
  const content = [{ type: "text", text: prompt }];
  images.forEach((img, i) => {
    content.push({ type: "text", text: `Image ${i + 1} of ${images.length}: ${img.path} — ${img.side} the change · sha256 ${img.sha256}` });
    content.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${Buffer.from(img.bytes).toString("base64")}` } });
  });
  return [{ role: "user", content }];
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
- "dependency summary": the lockfile reduced to package@version, source host and integrity prefix, diffed before/after.
- "image": a changed raster image. Both versions are attached after this text, each labelled with its path and sha256. Review what they show as strictly as text: a wrong value, label or clinical detail in an image is wrong content.`);

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
    const { files, skipped, images } = collectChanges(meta.base, meta.head, { cwd });
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
    const res = await callModel({ model: REVIEW_MODEL, prompt, messages: buildMessages(prompt, images), maxTokens: 64000, reasoningEffort: "high", responseFormat: FINDINGS_SCHEMA });
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
