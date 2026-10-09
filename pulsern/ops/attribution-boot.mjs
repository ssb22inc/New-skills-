/* The public capture file is these functions, not a second tracker.
   ------------------------------------------------------------------
   Guides, the free quiz, comparisons and the other static pages are plain
   documents. They never load the marketing bundle, so an ad that lands on one
   used to die at the next click: the button goes to the bare homepage, and
   the homepage then saw no tags. This writes the same module out as a classic
   script those pages can run before their first link is clickable. First
   touch still lives in the one localStorage key captureAttribution already
   uses, and a visit that arrives later still leaves that key alone. */

import { readFileSync, writeFileSync } from "node:fs";

export const ATTRIBUTION_BOOT_TAG = '<script src="/attribution.js"></script>';

export function renderAttributionBoot(moduleSource) {
  const classic = String(moduleSource)
    .replace(/^export async function /gm, "async function ")
    .replace(/^export function /gm, "function ");
  if (/^export\s/m.test(classic)) {
    throw new Error("src/attribution.js has an export the public capture script does not carry");
  }
  return `(function () {\n${classic.trim()}\n\ntry { captureAttribution(); } catch { /* reporting only */ }\n})();\n`;
}

export function writeAttributionBoot() {
  const source = readFileSync(new URL("../src/attribution.js", import.meta.url), "utf8");
  writeFileSync(new URL("../public/attribution.js", import.meta.url), renderAttributionBoot(source));
}
