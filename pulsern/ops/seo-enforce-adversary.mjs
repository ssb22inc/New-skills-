#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";
import { parseReview } from "./seo-adversary-ai.mjs";

export async function enforceAdversary(filename = "reports/seo/adversary.json") {
  let raw;
  try { raw = await fs.readFile(filename, "utf8"); } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`Required adversarial evidence is missing: ${filename}`);
    throw error;
  }
  const review = parseReview(raw);
  if (review.verdict !== "PASS") throw new Error(`Adversarial release gate failed with ${review.releaseBlockers.length} blocker(s).`);
  return review;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await enforceAdversary(process.argv[2]);
  console.log(`adversarial gate ${result.verdict}`);
}
