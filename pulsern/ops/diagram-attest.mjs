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
import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import { join, posix, resolve, sep } from "node:path";

export const REVIEW_INDEX = "reports/diagram-review/index.json";
/* Generated data, not drawing code: excluded so writing the map or the
   narration manifest does not invalidate the approvals they depend on. */
const NOT_DRAWING = new Set(["item-map.json", "narration.json"]);

export function themeBlock(appSource) {
  const m = /\.app\{([\s\S]*?)\}\s*\.app\[data-theme="dim"\]\{([\s\S]*?)\}/.exec(appSource);
  if (!m) throw new Error("diagram-attest: could not find the theme tokens in src/App.jsx");
  return m[1] + m[2];
}

/* Everything a diagram's drawing depends on, as one reviewable text: its
   own file, every local module it imports (followed transitively — kit.jsx
   draws the gauges, chips and frames), the explainer that plays it, and
   the app's theme tokens. This text goes into the review request AND its
   cache key, so an approval is reused only while all of it is unchanged
   (Astra, PR #134 review, round 20: a change to kit.jsx kept a cached PASS
   that never saw it). */
export function diagramSources(id, root = ".") {
  /* Only the project's own source tree may be read: a path that leaves
     src/ — by "../" or through a symlink — is refused before anything is
     read, so nothing outside it (a git config, /proc, a secret) can be
     pulled into a paid request (round 22). */
  const allowed = realpathSync(resolve(root, "src"));
  const inside = (rel) => {
    const real = realpathSync(resolve(root, rel));
    if (real !== allowed && !real.startsWith(allowed + sep)) throw new Error(`diagramSources: ${rel} resolves outside src/ — refusing to read it`);
  };
  const seen = new Set();
  const parts = [];
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    inside(rel);
    const buf = readFileSync(join(root, rel));
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { throw new Error(`diagramSources: ${rel} is not text, so the reviewer cannot be shown it — refusing to review without it`); }
    parts.push(`// ===== ${rel} =====\n${text}`);
    if (!/\.(jsx?|mjs)$/.test(rel)) return;   // data (JSON, CSS…) is shown but has no imports
    /* Every way a module can pull in another: import … from, export … from,
       a bare side-effect import, and import("…"). A computed import path
       cannot be followed, so it is refused rather than missed (round 21:
       an imported JSON threshold was outside the review). */
    if (/\bimport\s*\(\s*(?!["'][^"']+["']\s*\))/.test(text)) throw new Error(`diagramSources: ${rel} has an import() whose path is computed — refusing to review without knowing what it loads`);
    const specs = [
      ...text.matchAll(/^\s*(?:import|export)\s[^;]*?\bfrom\s+["']([^"']+)["']/gm),
      ...text.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
      ...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    for (const spec of specs) {
      if (!spec.startsWith(".")) continue;   // packages (react) are not project code
      const target = posix.normalize(posix.join(posix.dirname(rel), spec));
      if (target.startsWith("../") || target === "..") throw new Error(`diagramSources: ${rel} imports ${spec}, which leaves the project — refusing to read it`);
      const found = [target, `${target}.jsx`, `${target}.js`, `${target}.mjs`, `${target}.json`].find((p) => existsSync(join(root, p)));
      if (!found) throw new Error(`diagramSources: ${rel} imports ${spec}, which was not found — refusing to review without it`);
      visit(found);
    }
  };
  visit(`src/diagrams/${id}.jsx`);
  visit("src/explainer.jsx");
  parts.push(`// ===== src/App.jsx (theme tokens) =====\n${themeBlock(readFileSync(join(root, "src/App.jsx"), "utf8"))}`);
  return parts.join("\n\n");
}

/* The diagrams: every .jsx under src/diagrams except the drawing kit. */
export const diagramIds = (root = ".") => readdirSync(join(root, "src/diagrams")).filter((f) => /\.jsx$/.test(f) && f !== "kit.jsx").map((f) => f.slice(0, -4)).sort();

export function sourceKey(root = ".") {
  const h = createHash("sha256");
  const dir = join(root, "src/diagrams");
  for (const f of readdirSync(dir).filter((f) => /\.(jsx?|json)$/.test(f) && !NOT_DRAWING.has(f)).sort()) {
    h.update(`\0${f}\0`).update(readFileSync(join(dir, f)));
  }
  h.update("\0explainer.jsx\0").update(readFileSync(join(root, "src/explainer.jsx")));
  h.update("\0theme\0").update(themeBlock(readFileSync(join(root, "src/App.jsx"), "utf8")));
  /* And exactly what each diagram's reviewer was shown: its full resolved
     dependency set, wherever in src/ it lives (round 22: a .mjs or nested
     dependency changed without invalidating an approval). */
  for (const id of diagramIds(root)) h.update(`\0sources:${id}\0`).update(diagramSources(id, root));
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

/* A map with pairings is current only if it was built against today's
   drawing code. Rebuilding (ops/map-diagrams.mjs, cached decisions cost
   nothing) re-checks approval, content and extracted values for every
   pairing. An empty map needs no rebuild. */
export function mapIsCurrent(map, key) {
  const n = Object.values(map?.pairs ?? {}).flat().length;
  return n === 0 || map.sourceKey === key;
}
