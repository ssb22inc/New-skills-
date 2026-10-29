#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";
import { parseReview } from "./seo-adversary-ai.mjs";

/* The review must have run and produced a complete, well-formed report;
   a missing or malformed report always fails, in either mode. */
async function readReview(filename) {
  let raw;
  try { raw = await fs.readFile(filename, "utf8"); } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`Required adversarial evidence is missing: ${filename}`);
    throw error;
  }
  return parseReview(raw);
}

export async function enforceAdversary(filename = "reports/seo/adversary.json") {
  const review = await readReview(filename);
  if (review.verdict !== "PASS") throw new Error(`Adversarial release gate failed with ${review.releaseBlockers.length} blocker(s).`);
  return review;
}

/* Owner decision 2026-10-29 (CLAUDE.md): for the public pages the model
   review is advisory. A completed FAIL review is reported, not blocking.
   A review that did not run, or left no valid report, still fails. */
export async function adviseAdversary(filename = "reports/seo/adversary.json") {
  const review = await readReview(filename);
  return { review, warning: review.verdict === "PASS" ? null : `Adversarial model review did not pass (${review.releaseBlockers.length} blocker(s)); advisory by owner decision.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const advisory = args.includes("--advisory");
  const file = args.find((a) => !a.startsWith("--"));
  if (advisory) {
    const { review, warning } = await adviseAdversary(file);
    if (warning) console.log(`::warning title=Adversarial model review (advisory)::${warning} Findings are in the review step's log and the pulsern-search-audit artifact.`);
    console.log(`adversarial review ${review.verdict} (advisory)`);
  } else {
    const result = await enforceAdversary(file);
    console.log(`adversarial gate ${result.verdict}`);
  }
}
