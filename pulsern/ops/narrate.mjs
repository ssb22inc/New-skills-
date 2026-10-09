#!/usr/bin/env node
/* Records narration for every explainer step — and checks each recording.
   ------------------------------------------------------------------
   For each step with a narration script:
     1. synthesise it with OpenAI TTS (owner's choice of provider);
     2. transcribe the result and compare it with the script — a clip that
        skipped a clause or said a wrong number is NOT shipped;
     3. upload passing clips to the public `explainers` storage bucket, named
        by the hash of the AUDIO BYTES and never overwritten — so a published
        URL can never change what it plays. TTS output is not byte-identical
        across runs, so naming by the inputs let a stale branch silently
        replace live audio (Astra, PR #133 review, finding 5). Only a
        reviewed manifest change moves a step to a new recording;
     4. write src/diagrams/narration.json, which the app reads.

   Re-runs only record clips whose words, voice or delivery changed. A clip
   whose script has changed is dropped from the manifest even if its new
   recording fails, so old audio is never played over new words.

   Usage: node ops/narrate.mjs [--voice marin] [--only diagramId] [--dry-run]
          node ops/narrate.mjs --prepare plan.json [--source <tree>/pulsern]   (no secrets: reads the steps)
          node ops/narrate.mjs --prepared plan.json --into <branch>/pulsern [--voice …]
   Env:   OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PULSERN_ATTEST_PRIVATE_KEY,
          PULSERN_ATTEST_PUBLIC_KEY (not needed for --dry-run or --prepare)

   In CI the two halves run in separate jobs: --prepare on the branch with
   no secrets, and --prepared from the default branch's trusted copy of this
   script, reading the plan as data and writing into the branch checkout
   (ops/prepared.mjs). The credentialed job never runs branch code. */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { readPrepared, narrationPlan, headCommit, requireClean } from "./prepared.mjs";
import { resolve } from "node:path";
import { TTS, QA_MODEL, QA_THRESHOLD, QA_VERSION, clipId, textFp, audioCheck, narratedSteps, isCurrentClip, recordAll, isDuplicateUpload, signClip, scriptDigest } from "./narrate-lib.mjs";
import { signerFrom, verifierFrom, PUBLIC_ENV } from "./attest.mjs";

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry-run");
const VOICE = arg("--voice", "marin");
const ONLY = arg("--only");
const PREPARE = arg("--prepare");
const SOURCE = arg("--source");   // with --prepare: the tree to read, by this script, in a browser sandbox
const PREPARED = arg("--prepared");
const INTO = arg("--into");
if (PREPARED && !INTO) throw new Error("--prepared needs --into <branch checkout>/pulsern");
/* Read the plan before moving: its path is relative to where we started. */
const PLAN = PREPARED ? narrationPlan(readPrepared(PREPARED, "narration", { into: INTO })) : null;
if (INTO) process.chdir(INTO);   // every path below is the branch checkout's
/* Clip records are signed by this job and only a signed record counts as
   recorded (round 26). A dry run without the public key treats every clip
   as unrecorded. */
const KEYS = PREPARE ? null : DRY ? (process.env[PUBLIC_ENV] ? verifierFrom() : { verify: () => false, unverifiable: true }) : signerFrom();
if (KEYS?.unverifiable) console.log(`${PUBLIC_ENV} is not set: existing clips cannot be checked, so this dry run lists every clip (nothing is changed).`);
const MANIFEST = "src/diagrams/narration.json";
const BUCKET = "explainers";
const startedAt = new Date().toISOString();
const REPORT = `reports/narration/run-${startedAt.replace(/[:.]/g, "-")}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function openai(path, init, attempts = 4) {
  let last;
  for (let a = 1; a <= attempts; a++) {
    const r = await fetch(`https://api.openai.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...(init.headers ?? {}) } });
    if (r.ok) return r;
    const body = await r.text().catch(() => "");
    last = new Error(`OpenAI ${path} ${r.status}: ${body.slice(0, 300)}`);
    if (![408, 409, 429, 500, 502, 503, 504].includes(r.status)) throw last;
    await sleep(Math.min(30000, 1500 * 2 ** (a - 1)) * Math.random() + 500);
  }
  throw last;
}

async function synthesise(text) {
  const r = await openai("/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: TTS.model, voice: VOICE, input: text, instructions: TTS.instructions, response_format: TTS.format, speed: TTS.speed }),
  });
  return Buffer.from(await r.arrayBuffer());
}

/* No prompt is given to the transcriber: hinting the script would bias it
   toward hearing the script, and the check would pass by agreement. */
async function transcribe(mp3) {
  const form = new FormData();
  form.append("model", QA_MODEL);
  form.append("language", "en");
  form.append("file", new Blob([mp3], { type: "audio/mpeg" }), "clip.mp3");
  const r = await openai("/audio/transcriptions", { method: "POST", body: form });
  return (await r.json()).text ?? "";
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { version: 1, clips: {} };
const report = { startedAt, voice: VOICE, model: TTS.model, qaModel: QA_MODEL, qaThreshold: QA_THRESHOLD,
  recorded: [], skippedUnchanged: 0, failedQa: [], errors: [], characters: 0 };

function save() {
  mkdirSync("reports/narration", { recursive: true });
  const sorted = { version: 1, clips: Object.fromEntries(Object.entries(manifest.clips).sort(([a], [b]) => a.localeCompare(b))) };
  /* A dry run changes no record: only its own report is written (Astra,
     PR #134 review, round 28: a keyless dry run emptied the manifest). */
  if (!DRY) writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
  writeFileSync(`${REPORT}.json`, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(`${REPORT}.md`, [
    `# Narration run — voice \`${VOICE}\``, "",
    `- Model: \`${TTS.model}\` · audio check: \`${QA_MODEL}\`, pass at ≥ ${QA_THRESHOLD} similarity AND every number, negation and direction word exactly as scripted`,
    `- Recorded and shipped: ${report.recorded.length} · unchanged, skipped: ${report.skippedUnchanged}`,
    `- Characters synthesised: ${report.characters.toLocaleString()} (OpenAI does not return a cost; this is what it bills on)`,
    report.stopped ? `- **Stopped:** ${report.stopped}` : "- Stopped early: no",
    report.failedQa.length ? `- **Failed the audio check — not shipped:**\n${report.failedQa.map((f) => `  - ${f.diagram}/${f.step}: ${f.mismatch ? `said “${f.mismatch.heard}” where the script says “${f.mismatch.expected}”; ` : ""}similarity ${f.similarity.toFixed(3)} — heard: “${f.heard}”`).join("\n")}` : "- Failed the audio check: none",
    report.errors.length ? `- Errors: ${report.errors.map((e) => `${e.diagram}/${e.step}: ${e.error}`).join("; ")}` : "- Errors: none",
    "",
  ].join("\n"));
}

/* The diagrams' narration steps: from the prepared plan (data) when
   given one, otherwise from the registry through Vite (local runs, and the
   secret-less --prepare job). */
let vite = null;
let PREPARE_COMMIT = null;
async function loadSteps() {
  if (PLAN) return PLAN;
  if (PREPARE) {
    /* The words are read from the source by this script, inside the
       browser, where the source's code cannot reach this process — so the
       plan is the pinned source's narration, not a branch script's
       (Astra, PR #134 review, round 28). */
    const root = resolve(SOURCE ?? ".");
    requireClean(root);
    const { withSandbox } = await import("./render-diagrams.mjs");
    const raw = await withSandbox(root, async (call) => {
      const out = [];
      for (const id of await call("ids")) out.push(await call("raw", id));
      return out;
    });
    requireClean(root);
    PREPARE_COMMIT = headCommit(root);
    return raw.map((d) => ({ id: d.id, steps: narratedSteps(d).map((s) => ({ key: s.key, narration: s.narration })) }));
  }
  const { createServer } = await import("vite");
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
  const { DIAGRAMS } = await vite.ssrLoadModule("/src/diagrams/index.js");
  return Object.values(DIAGRAMS).map((d) => ({ id: d.id, steps: narratedSteps(d).map((s) => ({ key: s.key, narration: s.narration })) }));
}

let code = 0;
try {
  const diagrams = await loadSteps();
  if (PREPARE) {
    writeFileSync(PREPARE, JSON.stringify({ kind: "narration", commit: PREPARE_COMMIT, diagrams }, null, 2) + "\n");
    console.log(`Prepared ${diagrams.reduce((n, d) => n + d.steps.length, 0)} narration step(s) → ${PREPARE}`);
    process.exit(0);
  }
  const work = [];
  for (const d of diagrams) {
    if (ONLY && d.id !== ONLY) continue;
    manifest.clips[d.id] ??= {};
    for (const s of d.steps) {
      const id = clipId({ text: s.narration, voice: VOICE });
      if (isCurrentClip(manifest.clips[d.id][s.key], id, { diagram: d.id, step: s.key, verifier: KEYS, text: s.narration })) { report.skippedUnchanged++; continue; }
      /* The script changed (or was never recorded): drop any old clip NOW, so
         a failure below can never leave stale audio attached to new words. */
      if (!DRY) delete manifest.clips[d.id][s.key];
      work.push({ d, s, id });
    }
    // steps that no longer exist lose their clips
    const live = new Set(d.steps.map((s) => s.key));
    if (!DRY) for (const k of Object.keys(manifest.clips[d.id])) if (!live.has(k)) delete manifest.clips[d.id][k];
  }
  console.log(`${work.length} clip(s) to record, ${report.skippedUnchanged} unchanged.`);
  if (DRY) { save(); console.log("Dry run: nothing recorded."); }
  else {
    for (const env of ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!process.env[env]) throw new Error(`${env} is not set`);
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: bucket } = await sb.storage.getBucket(BUCKET);
    if (!bucket) {
      const { error } = await sb.storage.createBucket(BUCKET, { public: true, allowedMimeTypes: ["audio/mpeg"], fileSizeLimit: "4MB" });
      if (error) throw new Error(`Could not create the ${BUCKET} bucket: ${error.message}`);
    }
    /* Every paid take, kept for audit under reports/narration-takes (not
       committed: git ignores it), which the workflow uploads as an artifact. */
    const TAKES = `reports/narration-takes/${startedAt.replace(/[:.]/g, "-")}`;
    code = await recordAll(work, {
      synthesise, transcribe, save, report,
      keepTake: ({ d, s, take, mp3, stage, heard, check, error }) => {
        mkdirSync(TAKES, { recursive: true });
        const base = `${TAKES}/${d.id}--${s.key}--take${take}`;
        writeFileSync(`${base}.mp3`, mp3);
        writeFileSync(`${base}.json`, JSON.stringify({ diagram: d.id, step: s.key, take, stage, script: s.narration, heard, pass: check?.pass ?? false, similarity: check?.similarity ?? null, mismatch: check?.mismatch ?? null, error }, null, 2) + "\n");
        return `${base}.mp3`;
      },
      store: async ({ d, s, id }, mp3, check) => {
        const audioHash = createHash("sha256").update(mp3).digest("hex").slice(0, 32);
        const path = `${d.id}/${audioHash}.mp3`;
        const { error } = await sb.storage.from(BUCKET).upload(path, mp3, { contentType: "audio/mpeg", cacheControl: "31536000", upsert: false });
        /* Same name means the same bytes, so an existing object is exactly
           this clip — anything else is a real failure. */
        if (error && !isDuplicateUpload(error)) throw new Error(`upload: ${error.message}`);
        const record = {
          id, script: scriptDigest(s.narration), qa: QA_VERSION, audio: audioHash, voice: VOICE, model: TTS.model, textFp: textFp(s.narration), similarity: Math.round(check.similarity * 1000) / 1000,
          url: `${process.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`, bytes: mp3.length,
        };
        manifest.clips[d.id][s.key] = { ...record, sig: signClip(d.id, s.key, record, KEYS) };
        report.recorded.push({ diagram: d.id, step: s.key, similarity: check.similarity, bytes: mp3.length });
        console.log(`  ✓ ${d.id}/${s.key}: ${(mp3.length / 1024).toFixed(0)} KB, audio check ${check.similarity.toFixed(3)}`);
      },
    });
    save();
    if (report.failedQa.length || report.errors.length) code = 1;
    console.log(`Done. Report: ${REPORT}.md`);
  }
} catch (e) {
  console.error(e.message);
  code = 1;
} finally {
  await vite?.close();
}
process.exit(code);
