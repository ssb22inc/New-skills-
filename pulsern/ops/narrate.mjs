#!/usr/bin/env node
/* Records narration for every explainer step — and checks each recording.
   ------------------------------------------------------------------
   For each step with a narration script:
     1. synthesise it with OpenAI TTS (owner's choice of provider);
     2. transcribe the result and compare it with the script — a clip that
        skipped a clause or said a wrong number is NOT shipped;
     3. upload passing clips to the public `explainers` storage bucket under a
        content-addressed name, so a URL never changes meaning;
     4. write src/diagrams/narration.json, which the app reads.

   Re-runs only record clips whose words, voice or delivery changed. A clip
   whose script has changed is dropped from the manifest even if its new
   recording fails, so old audio is never played over new words.

   Usage: node ops/narrate.mjs [--voice marin] [--only diagramId] [--dry-run]
   Env:   OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (not needed for --dry-run) */
import { createServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { TTS, QA_MODEL, QA_THRESHOLD, clipId, textFp, speechSimilarity, narratedSteps } from "./narrate-lib.mjs";

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry-run");
const VOICE = arg("--voice", "marin");
const ONLY = arg("--only");
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
  writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
  writeFileSync(`${REPORT}.json`, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(`${REPORT}.md`, [
    `# Narration run — voice \`${VOICE}\``, "",
    `- Model: \`${TTS.model}\` · audio check: \`${QA_MODEL}\`, pass at ≥ ${QA_THRESHOLD} similarity`,
    `- Recorded and shipped: ${report.recorded.length} · unchanged, skipped: ${report.skippedUnchanged}`,
    `- Characters synthesised: ${report.characters.toLocaleString()} (OpenAI does not return a cost; this is what it bills on)`,
    report.failedQa.length ? `- **Failed the audio check — not shipped:**\n${report.failedQa.map((f) => `  - ${f.diagram}/${f.step}: similarity ${f.similarity.toFixed(3)} — heard: “${f.heard}”`).join("\n")}` : "- Failed the audio check: none",
    report.errors.length ? `- Errors: ${report.errors.map((e) => `${e.diagram}/${e.step}: ${e.error}`).join("; ")}` : "- Errors: none",
    "",
  ].join("\n"));
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let code = 0;
try {
  const { DIAGRAMS } = await vite.ssrLoadModule("/src/diagrams/index.js");
  const work = [];
  for (const d of Object.values(DIAGRAMS)) {
    if (ONLY && d.id !== ONLY) continue;
    manifest.clips[d.id] ??= {};
    for (const s of narratedSteps(d)) {
      const id = clipId({ text: s.narration, voice: VOICE });
      if (manifest.clips[d.id][s.key]?.id === id) { report.skippedUnchanged++; continue; }
      /* The script changed (or was never recorded): drop any old clip NOW, so
         a failure below can never leave stale audio attached to new words. */
      delete manifest.clips[d.id][s.key];
      work.push({ d, s, id });
    }
    // steps that no longer exist lose their clips
    const live = new Set(narratedSteps(d).map((s) => s.key));
    for (const k of Object.keys(manifest.clips[d.id])) if (!live.has(k)) delete manifest.clips[d.id][k];
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
    for (const { d, s, id } of work) {
      try {
        const mp3 = await synthesise(s.narration);
        report.characters += s.narration.length;
        const heard = await transcribe(mp3);
        const similarity = speechSimilarity(s.narration, heard);
        if (similarity < QA_THRESHOLD) {
          report.failedQa.push({ diagram: d.id, step: s.key, similarity, heard });
          console.log(`  ✗ ${d.id}/${s.key}: audio check ${similarity.toFixed(3)} — not shipped`);
          save();
          continue;
        }
        const path = `${d.id}/${s.key}-${id}.mp3`;
        const { error } = await sb.storage.from(BUCKET).upload(path, mp3, { contentType: "audio/mpeg", cacheControl: "31536000", upsert: true });
        if (error) throw new Error(`upload: ${error.message}`);
        manifest.clips[d.id][s.key] = {
          id, voice: VOICE, model: TTS.model, textFp: textFp(s.narration), similarity: Math.round(similarity * 1000) / 1000,
          url: `${process.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`, bytes: mp3.length,
        };
        report.recorded.push({ diagram: d.id, step: s.key, similarity, bytes: mp3.length });
        console.log(`  ✓ ${d.id}/${s.key}: ${(mp3.length / 1024).toFixed(0)} KB, audio check ${similarity.toFixed(3)}`);
        save();   // after every clip: a stopped run keeps what it paid for
      } catch (e) {
        report.errors.push({ diagram: d.id, step: s.key, error: e.message.slice(0, 200) });
        console.log(`  ✗ ${d.id}/${s.key}: ${e.message.slice(0, 160)}`);
        save();
        if (/ 401| 403|insufficient_quota|billing/i.test(e.message)) { code = 1; break; }
      }
    }
    save();
    if (report.failedQa.length || report.errors.length) code = 1;
    console.log(`Done. Report: ${REPORT}.md`);
  }
} catch (e) {
  console.error(e.message);
  code = 1;
} finally {
  await vite.close();
}
process.exit(code);
