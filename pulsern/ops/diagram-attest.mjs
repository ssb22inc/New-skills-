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
import { parseAst } from "rolldown/parseAst";
import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from "node:fs";
import { join, posix, resolve, sep } from "node:path";

export const REVIEW_INDEX = "reports/diagram-review/index.json";
/* Generated data, not drawing code: excluded so writing the map or the
   narration manifest does not invalidate the approvals they depend on. */
const NOT_DRAWING = new Set(["item-map.json", "narration.json"]);

/* The frames a diagram's review must show, in order: the inline overview
   and every explainer step, in both themes. */
export const THEMES = ["light", "dark"];
export const expectedFrames = (stepKeys) => THEMES.flatMap((theme) => ["static", ...stepKeys].map((key) => ({ theme, key })));
export const frameLabel = (theme, key) => `${theme} theme — ${key === "static" ? "inline, as shown under a rationale" : `explainer step "${key}"`}`;
export const frameIds = (frames) => frames.map((f) => `${f.theme}/${f.key}`);
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

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
/* Every module a source file loads, read from its syntax tree — not by
   pattern-matching lines, which missed a second import on the same line
   (Astra, PR #134 review, round 23). Static imports, both kinds of
   re-export, import("…") and require("…") with a literal path are
   followed; a computed path, or a file that does not parse, is refused. */
export function importsOf(rel, text) {
  let ast;
  try { ast = parseAst(text, { lang: rel.endsWith(".jsx") ? "jsx" : "js" }); }
  catch (e) { throw new Error(`diagramSources: ${rel} could not be parsed (${String(e.message).split("\n")[0]}) — refusing to review it`); }
  const specs = [];
  const literal = (node, how) => {
    if (node?.type === "Literal" && typeof node.value === "string") specs.push(node.value);
    else throw new Error(`diagramSources: ${rel} has a ${how} whose path is computed — refusing to review without knowing what it loads`);
  };
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { for (const x of n) walk(x); return; }
    if ((n.type === "ImportDeclaration" || n.type === "ExportAllDeclaration" || n.type === "ExportNamedDeclaration") && n.source) literal(n.source, "re-export");
    if (n.type === "ImportExpression") literal(n.source, "import()");
    if (n.type === "CallExpression" && n.callee?.type === "Identifier" && n.callee.name === "require") literal(n.arguments?.[0], "require()");
    for (const k of Object.keys(n)) if (k !== "parent") walk(n[k]);
  };
  walk(ast);
  return specs;
}

/* Where Vite would load an import from, or a refusal. Relative and
   root-relative ("/src/…") paths are project code and are followed; a bare
   name must be a package this project depends on. An extensionless path
   that could mean two files is refused rather than guessed, and the
   extension order is Vite's (Astra, PR #134 review, round 24: "/src/…"
   imports were skipped as packages, and .jsx was preferred over .js). */
const VITE_EXTENSIONS = [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"];
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
function packageNames(root) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
}
export function resolveImport(root, rel, spec, packages = packageNames(root)) {
  if (/[?#]/.test(spec) || spec.includes("\\") || spec.includes("\0")) throw new Error(`diagramSources: ${rel} imports ${spec}, which is not a plain path — refusing to review without knowing what it loads`);
  let target;
  if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") target = posix.normalize(posix.join(posix.dirname(rel), spec));
  else if (spec.startsWith("/")) target = posix.normalize(spec.slice(1));
  else {
    const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    if (packages.has(name)) return null;   // a dependency, not project code
    throw new Error(`diagramSources: ${rel} imports ${spec}, which is neither a project file nor a dependency of this project — refusing to review without knowing what it loads`);
  }
  if (target === ".." || target.startsWith("../") || posix.isAbsolute(target)) throw new Error(`diagramSources: ${rel} imports ${spec}, which leaves the project — refusing to read it`);
  if (isFile(join(root, target))) return target;   // an exact file wins, as in Vite
  const candidates = VITE_EXTENSIONS.map((e) => target + e).filter((p) => isFile(join(root, p)));
  if (isDir(join(root, target))) candidates.push(...VITE_EXTENSIONS.map((e) => `${target}/index${e}`).filter((p) => isFile(join(root, p))));
  if (candidates.length > 1) throw new Error(`diagramSources: ${rel} imports ${spec}, which could mean ${candidates.join(" or ")} — refusing to guess`);
  if (!candidates.length) throw new Error(`diagramSources: ${rel} imports ${spec}, which was not found — refusing to review without it`);
  return candidates[0];
}

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
  const packages = packageNames(root);
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
    for (const spec of importsOf(rel, text)) {
      const found = resolveImport(root, rel, spec, packages);
      if (found) visit(found);
    }
  };
  visit(`src/diagrams/${id}.jsx`);
  visit("src/explainer.jsx");
  parts.push(`// ===== src/App.jsx (theme tokens) =====\n${themeBlock(readFileSync(join(root, "src/App.jsx"), "utf8"))}`);
  return parts.join("\n\n");
}

/* The diagrams: every .jsx under src/diagrams except the drawing kit. */
export const diagramIds = (root = ".") => readdirSync(join(root, "src/diagrams")).filter((f) => /\.jsx$/.test(f) && f !== "kit.jsx").map((f) => f.slice(0, -4)).sort();

/* Each diagram's explainer steps, read from its source's syntax tree by
   trusted code, without running it. A paid job checks the prepared data
   against this, so a branch's prepare step cannot drop a step (and its
   frames) and still have the review record a PASS for the diagram
   (Astra, PR #134 review, round 24). Only a plain literal definition is
   accepted — `export const x = { id: "<file name>", …, steps: [{ key:
   "…" }, …] }` with no spreads or computed names; anything else is refused
   rather than guessed. */
export function diagramSteps(rel, text, id) {
  let ast;
  try { ast = parseAst(text, { lang: rel.endsWith(".jsx") ? "jsx" : "js" }); }
  catch (e) { throw new Error(`stepInventory: ${rel} could not be parsed (${String(e.message).split("\n")[0]})`); }
  const refuse = (why) => { throw new Error(`stepInventory: ${rel} — ${why}; the steps must be a plain literal list`); };
  const propName = (p) => (p.type === "Property" && !p.computed ? (p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : null) : null);
  const found = [];
  for (const node of ast.body) {
    if (node.type !== "ExportNamedDeclaration" || node.declaration?.type !== "VariableDeclaration") continue;
    for (const v of node.declaration.declarations) {
      if (v.init?.type !== "ObjectExpression") continue;
      const idProp = v.init.properties.find((p) => propName(p) === "id");
      if (idProp?.value?.type === "Literal" && idProp.value.value === id) found.push(v.init);
    }
  }
  if (found.length !== 1) refuse(`expected exactly one exported diagram with id "${id}", found ${found.length}`);
  const obj = found[0];
  if (obj.properties.some((p) => p.type !== "Property" || propName(p) == null)) refuse("the diagram object has a spread or computed property");
  const stepsProps = obj.properties.filter((p) => propName(p) === "steps");
  if (stepsProps.length !== 1 || stepsProps[0].value.type !== "ArrayExpression") refuse("expected one literal steps array");
  const keys = stepsProps[0].value.elements.map((el, i) => {
    if (el?.type !== "ObjectExpression" || el.properties.some((p) => p.type !== "Property" || propName(p) == null)) refuse(`step ${i + 1} is not a plain object`);
    const k = el.properties.filter((p) => propName(p) === "key");
    if (k.length !== 1 || k[0].value.type !== "Literal" || typeof k[0].value.value !== "string") refuse(`step ${i + 1} has no literal key`);
    return k[0].value.value;
  });
  if (new Set(keys).size !== keys.length) refuse("two steps share a key");
  return keys;
}
export function stepInventory(root = ".") {
  return Object.fromEntries(diagramIds(root).map((id) => {
    const rel = `src/diagrams/${id}.jsx`;
    return [id, diagramSteps(rel, readFileSync(join(root, rel), "utf8"), id)];
  }));
}

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

/* { ok, why } for one diagram id. `steps` is the diagram's real step list
   (stepInventory, or the registry): a PASS counts only if its review was
   shown every one of those frames (round 24). */
export function approval(index, id, key, steps) {
  if (!Array.isArray(steps)) throw new Error(`approval(${id}): the diagram's real steps are required`);
  const e = index[id];
  if (!e) return { ok: false, why: "never reviewed" };
  if (e.verdict !== "PASS") return { ok: false, why: `review verdict ${e.verdict}` };
  if (e.sourceKey !== key) return { ok: false, why: "changed since its review" };
  if (!sameList(e.frames, frameIds(expectedFrames(steps)))) return { ok: false, why: "its review did not cover every step" };
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
