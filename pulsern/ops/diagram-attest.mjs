/* Has this diagram passed its visual review — as it is NOW?
   ------------------------------------------------------------------
   A pairing can attach a diagram to a question only if GPT Astra's visual
   review passed it, and only for the exact code that was reviewed (Astra,
   PR #133 review, finding 6: the mapper published pairings for diagrams
   whose drawing had failed review).

   "As it is now" is a hash of everything that decides what a student sees:
   every diagram module, the drawing kit, the explainer player, and the
   app's theme colours. Change any of them and every approval is stale until
   the review job runs again — which re-pays only for diagrams whose
   rendering actually changed. Missing, failed or stale: not approved.
   Fail closed. */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export const REVIEW_INDEX = "reports/diagram-review/index.json";
/* Generated data, not drawing code: excluded so writing the map or the
   narration manifest does not invalidate the approvals they depend on. */
const NOT_DRAWING = new Set(["item-map.json", "narration.json"]);

export function themeBlock(appSource) {
  const m = /\.app\{([\s\S]*?)\}\s*\.app\[data-theme="dim"\]\{([\s\S]*?)\}/.exec(appSource);
  if (!m) throw new Error("diagram-attest: could not find the theme tokens in src/App.jsx");
  return m[1] + m[2];
}

export function sourceKey(root = ".") {
  const h = createHash("sha256");
  const dir = join(root, "src/diagrams");
  for (const f of readdirSync(dir).filter((f) => /\.(jsx?|json)$/.test(f) && !NOT_DRAWING.has(f)).sort()) {
    h.update(`\0${f}\0`).update(readFileSync(join(dir, f)));
  }
  h.update("\0explainer.jsx\0").update(readFileSync(join(root, "src/explainer.jsx")));
  h.update("\0theme\0").update(themeBlock(readFileSync(join(root, "src/App.jsx"), "utf8")));
  return h.digest("hex").slice(0, 24);
}

export function readReviewIndex(root = ".") {
  const p = join(root, REVIEW_INDEX);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}

/* { ok, why } for one diagram id. */
export function approval(index, id, key) {
  const e = index[id];
  if (!e) return { ok: false, why: "never reviewed" };
  if (e.verdict !== "PASS") return { ok: false, why: `review verdict ${e.verdict}` };
  if (e.sourceKey !== key) return { ok: false, why: "changed since its review" };
  return { ok: true, why: null };
}
