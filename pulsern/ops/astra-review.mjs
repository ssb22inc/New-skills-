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
import { inflateSync } from "node:zlib";
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

/* How text reaches the reviewer. Characters a model cannot see — controls,
   line/paragraph separators, zero-width and bidirectional formatting, the
   byte-order mark, variation selectors, tag characters — are written as
   ⟦U+XXXX⟧. A literal ⟦ in the source is itself written ⟦U+27E6⟧, so every
   ⟦ in the output starts a marker and the encoding is one-to-one: text that
   already contains "⟦U+2028⟧" or "\u{2028}" can never look like a real
   U+2028 (Astra, PR #134 review, round 9: the earlier \u{…} markers were
   indistinguishable from the same characters typed literally). Tab and
   newline stay as they are; everything else is shown as written. */
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u2028-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB\u27E6]|\uDB40[\uDC00-\uDDEF]/g;
export const reviewText = (s) => String(s ?? "").replace(INVISIBLE, (c) => `⟦U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}⟧`);
/* The inverse, used by the tests to prove nothing is lost. */
export const fromReviewText = (s) => String(s ?? "").replace(/⟦U\+([0-9A-F]{4,6})⟧/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));

/* Exact bytes to text, or undefined. Decoding is fatal — an invalid byte is
   never replaced with U+FFFD — and a byte-order mark is kept, so two
   different byte sequences can never become the same text (Astra, PR #134
   review, round 8). Valid UTF-8 decodes one-to-one. */
export function exactText(buf) {
  if (buf == null) return null;
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf); } catch { return undefined; }
}

/* ---- Images -------------------------------------------------------------
   Only PNG and WebP, only under their own extension, and only when the
   container parses exactly to its last byte — so no bytes ride along that
   the pixels do not show (Astra, PR #134 review, round 9: a PNG with an
   HTML script appended, saved as .html, was sent as harmless pixels). */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/* Chunks that only describe pixels. Text (tEXt, zTXt, iTXt), EXIF, ICC
   profiles, timestamps and unknown or private chunks can carry bytes a
   picture does not show — a key, a name — so an image holding any of them
   is refused rather than certified by its pixels (Astra, PR #134 review,
   round 10). */
const PNG_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "sBIT", "bKGD", "pHYs"]);
const PNG_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/* The size of the decompressed scanlines IHDR promises, so the image data
   cannot carry anything beyond its pixels either. */
function pngRawSize(width, height, depth, colour, interlace) {
  const ch = PNG_CHANNELS[colour];
  if (!ch || ![1, 2, 4, 8, 16].includes(depth) || !width || !height || width > 16384 || height > 16384) return -1;
  const rowBytes = (w) => (w ? 1 + Math.ceil((w * ch * depth) / 8) : 0);
  if (interlace === 0) return height * rowBytes(width);
  if (interlace !== 1) return -1;
  const passes = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
  let total = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const w = Math.ceil((width - x0) / dx), h = Math.ceil((height - y0) / dy);
    if (w > 0 && h > 0) total += h * rowBytes(w);
  }
  return total;
}
/* Every chunk's length and CRC check out, IHDR comes first, only pixel
   chunks appear, the file ends exactly at IEND, and the image data
   inflates — consuming every byte — to exactly the size IHDR promises. */
export function isStrictPng(buf) {
  if (!buf || buf.length < 8 + 25 + 12 || !buf.subarray(0, 8).equals(PNG_SIG)) return false;
  let at = 8, first = true, ihdr = null;
  const idat = [];
  while (at + 12 <= buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.subarray(at + 4, at + 8).toString("latin1");
    const end = at + 12 + len;
    if (!PNG_CHUNKS.has(type) || end > buf.length) return false;
    if (crc32(buf.subarray(at + 4, at + 8 + len)) !== buf.readUInt32BE(at + 8 + len)) return false;
    const data = buf.subarray(at + 8, at + 8 + len);
    if (first !== (type === "IHDR")) return false;
    if (type === "IHDR") { if (len !== 13) return false; ihdr = data; }
    if (type === "IDAT") idat.push(data);
    first = false;
    if (type === "IEND") {
      if (len !== 0 || end !== buf.length || !ihdr || !idat.length) return false;
      const want = pngRawSize(ihdr.readUInt32BE(0), ihdr.readUInt32BE(4), ihdr[8], ihdr[9], ihdr[12]);
      if (want < 0 || ihdr[10] !== 0 || ihdr[11] !== 0) return false;
      const z = Buffer.concat(idat);
      try {
        const { buffer, engine } = inflateSync(z, { info: true, maxOutputLength: want + 1 });
        return buffer.length === want && engine.bytesWritten === z.length;
      } catch { return false; }
    }
    at = end;
  }
  return false;
}
/* The RIFF size covers the file exactly, the chunks tile it, and they are
   only image data: no EXIF, XMP, ICC profile or unknown chunk, no animation,
   and an extended header that declares none of them. */
const WEBP_CHUNKS = new Set(["VP8 ", "VP8L", "VP8X", "ALPH"]);
export function isStrictWebp(buf) {
  if (!buf || buf.length < 20) return false;
  if (buf.subarray(0, 4).toString("latin1") !== "RIFF" || buf.subarray(8, 12).toString("latin1") !== "WEBP") return false;
  if (buf.readUInt32LE(4) + 8 !== buf.length) return false;
  let at = 12, images = 0;
  while (at < buf.length) {
    if (at + 8 > buf.length) return false;
    const type = buf.subarray(at, at + 4).toString("latin1");
    if (!WEBP_CHUNKS.has(type)) return false;
    const len = buf.readUInt32LE(at + 4);
    if (type === "VP8X" && (len !== 10 || (buf[at + 8] & 0b00101110) !== 0)) return false;   // ICC, EXIF, XMP or animation flagged
    if (type === "VP8 " || type === "VP8L") images += 1;
    at += 8 + len + (len & 1);
    if (at > buf.length) return false;
  }
  return at === buf.length && images === 1;
}
const IMAGE_FORMATS = { png: { mime: "image/png", ok: isStrictPng }, webp: { mime: "image/webp", ok: isStrictWebp } };
/* The image type of this file, or null: the extension names the format and
   the bytes must be exactly that format. */
export function reviewableImage(path, buf) {
  const fmt = IMAGE_FORMATS[(/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? "").toLowerCase()];
  return fmt && buf && buf.length <= MAX_IMAGE_BYTES && fmt.ok(buf) ? fmt.mime : null;
}
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGES = 24;
export const MAX_IMAGE_TOTAL_BYTES = 16 * 1024 * 1024;
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/* What each changed file is, decided by its bytes and never by trust in a
   name alone. UTF-8 text — whatever its extension — is diffed. A strict PNG
   or WebP under its own extension is shown to Astra itself, both versions,
   each bound to its exact bytes by hash. Anything else (audio, PDF, fonts,
   archives, other encodings, images under another name or carrying extra
   bytes) cannot be put in front of the reviewer, so the review fails closed
   rather than certifying a hash (Astra, PR #134 review, round 8). */
export function collectChanges(base, head, { cwd = process.cwd() } = {}) {
  const git = gitIn(cwd);
  const bytes = (...args) => execFileSync("git", ["--literal-pathspecs", ...args], { cwd, maxBuffer: 256 * 1024 * 1024 });
  /* Paths are read as bytes and decoded exactly: a lossy decode once
     turned an unreadable name into a different path whose read "failed"
     quietly, and the file went to review as empty (round 9). */
  const names = exactText(bytes("diff", "--name-status", "--no-renames", "-z", `${base}...${head}`));
  if (names === undefined) throw new Error("a changed path is not valid UTF-8, so it cannot be named to the reviewer and the change cannot pass");
  const entries = parseNameStatusZ(names);
  const mergeBase = git("merge-base", base, head).trim();
  /* A side that should exist must be read; only the known-absent side of
     an addition or deletion is null. */
  const blob = (rev, path) => {
    try { return bytes("cat-file", "blob", `${rev}:${path}`); }
    catch (e) { throw new Error(`could not read ${path} at ${rev.slice(0, 12)} (${String(e.stderr ?? e.message).trim()}), so the change cannot pass`); }
  };

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
      /* The extension must be the image's own, so a page (.html), a
         lockfile or any source file can never be sent as pixels. */
      const ok = sides.every(([, b]) => reviewableImage(e.path, b));
      if (!ok) { unrepresentable.push(e.path); continue; }
      const line = (b) => (b == null ? "(absent)" : `sha256 ${sha256(b)} · ${b.length} bytes · ${reviewableImage(e.path, b)}`);
      for (const [side, b] of sides) images.push({ path: e.path, side, mime: reviewableImage(e.path, b), sha256: sha256(b), bytes: b });
      files.push({ status: e.status, path: e.path, form: "image", diff: `image ${reviewText(e.path)} (shown to you as attached images)\n- ${line(wasBuf)}\n+ ${line(nowBuf)}\n`, full: null });
    } else if (c.mode === "page") {
      files.push({ status: e.status, path: e.path, form: "page digest", diff: reviewText(textDiff(before == null ? "" : pageDigest(before), after == null ? "" : pageDigest(after), e.path)), full: null });
    } else if (c.mode === "lockfile") {
      files.push({ status: e.status, path: e.path, form: "dependency summary", diff: reviewText(textDiff(before == null ? "" : lockDigest(before), after == null ? "" : lockDigest(after), e.path)), full: null });
    } else {
      /* --text: never let git decide a source file is "binary" and replace
         its changes with a one-line marker (Astra, PR #134 review, round 7).
         Both sides are valid UTF-8 (checked above), so the diff decodes
         exactly. */
      const diff = exactText(bytes("diff", "--text", "--no-renames", "--no-ext-diff", "--no-textconv", "-U25", `${base}...${head}`, "--", e.path));
      if (diff === undefined) { unrepresentable.push(e.path); continue; }
      if (!diff && before !== after) throw new Error(`git showed no diff for ${e.path} although it changed, so the change cannot pass`);
      files.push({ status: e.status, path: e.path, form: "diff", diff: reviewText(diff), full: after == null ? null : reviewText(after) });
    }
  }
  /* Fail closed: a change git could only describe as "Binary files differ"
     has not been represented either. */
  for (const f of files) if (f.form !== "image" && /^Binary files .* differ$/m.test(f.diff)) unrepresentable.push(f.path);
  if (unrepresentable.length) throw new Error(`cannot put these changes in front of the reviewer, so the change cannot pass: ${unrepresentable.join(", ")} (not valid UTF-8 text, and not a well-formed PNG/WebP under its own extension and under ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`);
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
- Invisible characters (controls, separators, zero-width and bidirectional formatting, byte-order marks) are written as ⟦U+XXXX⟧, and a literal ⟦ in the file is written ⟦U+27E6⟧, so every ⟦U+…⟧ you see is that exact character in the file — never text that merely looks like it.
- "image": a changed raster image. Both versions are attached after this text, each labelled with its path and sha256. Review what they show as strictly as text: a wrong value, label or clinical detail in an image is wrong content.`);

  parts.push(`\n=== PROJECT RULES (the standard you review against) ===\n${rules}`);

  parts.push(`\n=== CHANGE ===\nbase ${meta.base}  head ${meta.head}${meta.pr ? `  PR #${meta.pr}` : ""}\n${files.length} file(s) under review.`);
  if (skipped.length) {
    parts.push(`Not sent (named so you know they changed): ${skipped.map((e) => `${reviewText(e.path)} [${e.why}]`).join("; ")}`);
  }

  for (const f of files) {
    parts.push(`\n----- ${f.status} ${reviewText(f.path)} (${f.form ?? "diff"}) -----\n${f.diff || "(no textual change)"}`);
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
