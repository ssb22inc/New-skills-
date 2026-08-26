#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export async function writeEvidenceManifest({ directory = "reports/seo", outputFile = "reports/seo/evidence.json" } = {}) {
  await fs.mkdir(directory, { recursive: true });
  const entries = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === path.basename(outputFile)) continue;
    const body = await fs.readFile(path.join(directory, entry.name));
    entries.push({ file: entry.name, bytes: body.byteLength, sha256: sha256(body) });
  }
  entries.sort((a, b) => a.file.localeCompare(b.file));
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repository: process.env.GITHUB_REPOSITORY ?? null,
    commitSha: process.env.GITHUB_SHA ?? null,
    workflowRunId: process.env.GITHUB_RUN_ID ?? null,
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    productionUrl: "https://www.pulsern.app",
    model: process.env.SEO_ADVERSARY_MODEL ?? null,
    node: process.version,
    files: entries,
  };
  await fs.writeFile(outputFile, JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = await writeEvidenceManifest();
  console.log(JSON.stringify({ commitSha: manifest.commitSha, evidenceFiles: manifest.files.length }, null, 2));
}
