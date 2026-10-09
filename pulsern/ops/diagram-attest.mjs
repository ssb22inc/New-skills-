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

/* The colour tokens the frames are drawn with, light and dark — one
   extraction for the renderer, the reviewer's source and the approval key
   (Astra, PR #134 review, round 29: the key hashed only two blocks while
   the renderer also used the monitor tokens). */
export function themeTokensFrom(src) {
  const blocks = [...src.matchAll(/((?:\s*--[a-z0-9-]+:[^;]+;)+)/g)].map((m) => m[1]);
  const light = blocks.find((b) => /--paper:#F3F6F4/.test(b));
  const dark = blocks.find((b) => /--paper:#151A18/.test(b));
  if (!light || !dark) throw new Error("Could not find the light/dark token blocks in src/App.jsx");
  // ECG/monitor tokens live in a separate block in the light theme.
  const extra = blocks.filter((b) => /--mon:|--read-size:/.test(b) && b !== light && b !== dark).join("");
  /* In the app the dim theme is an override on the same .app element: it
     inherits every light token it does not redefine (the monitor's --mon and
     --ecg among them). Dark renders cascade the same way — without the light
     base they drew black, trace-less ECG strips. */
  const out = { light: light + extra, dark: light + extra + dark };
  for (const [name, css] of Object.entries(out)) {
    if (!/--mon:/.test(css) || !/--ecg:/.test(css)) throw new Error(`${name} theme is missing the monitor tokens`);
  }
  return out;
}
export function themeBlock(appSource) {
  const t = themeTokensFrom(appSource);
  return `light:${t.light}\ndark:${t.dark}`;
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
    /* import.meta loads files the walk cannot see — import.meta.glob
       expands to modules, new URL(…, import.meta.url) to assets — so any
       use of it is refused (round 29). */
    if (n.type === "MetaProperty" && n.meta?.name === "import") throw new Error(`diagramSources: ${rel} uses import.meta, which can load files this walk cannot follow — refusing to review without knowing what it loads`);
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

/* Every project module reachable from these entry points, as text. */
export function moduleClosure(entries, root = ".") {
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
    /* Only formats this walk can fully follow: JavaScript modules are
       parsed and their imports traversed, JSON is data with none. Anything
       else Vite can load — TypeScript, CSS with its own @import, assets —
       is refused rather than shown as a dead end whose own dependencies
       would escape the review and the key (Astra, PR #134 review, round
       25: a .ts module's imports were never followed). */
    if (/\.json$/.test(rel)) return;
    if (!/\.(jsx?|mjs)$/.test(rel)) throw new Error(`diagramSources: ${rel} is not a JavaScript module or JSON, so its own dependencies cannot be followed — refusing to review without them`);
    for (const spec of importsOf(rel, text)) {
      const found = resolveImport(root, rel, spec, packages);
      if (found) visit(found);
    }
  };
  for (const e of entries) visit(e);
  return parts.join("\n\n");
}

export function diagramSources(id, root = ".") {
  requireSupportedBuild(root);
  /* The registry the app and the renderer actually load is followed too,
     with everything it imports: a wrapper or helper added there changes
     what students see without touching the diagram's own file (Astra,
     PR #134 review, round 26). */
  const parts = [moduleClosure([`src/diagrams/${id}.jsx`, "src/diagrams/index.js", "src/explainer.jsx"], root)];
  parts.push(`// ===== src/App.jsx (theme tokens) =====\n${themeBlock(readFileSync(join(root, "src/App.jsx"), "utf8"))}`);
  return parts.join("\n\n");
}

/* Does the production build resolve modules the way this walk and the
   trusted renderer do? The renderer never runs the tree's Vite config, so
   anything in it that could make production load OTHER modules than the
   ones reviewed — an alias, a plugin that resolves, loads or transforms
   code, an identifier replaced at build time, a package "browser" or
   "imports" mapping — is refused rather than trusted (Astra, PR #134
   review, round 30). Read from the syntax tree; nothing is run. */
const CONFIG_FILES = ["vite.config.js", "vite.config.mjs", "vite.config.cjs", "vite.config.ts", "vite.config.mts", "vite.config.cts"];
const CONFIG_IMPORTS = new Set(["vite", "@vitejs/plugin-react", "node:url", "./ops/search-verification.mjs"]);
const RESOLUTION_KEYS = new Set(["resolve", "alias", "resolveId", "load", "transform", "renderChunk", "generateBundle", "config", "configResolved", "esbuild", "oxc", "optimizeDeps", "ssr", "worker"]);
export function buildConfigProblems(root = ".") {
  const out = [];
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const k of ["browser", "imports"]) if (k in pkg) out.push(`package.json has a "${k}" field, which remaps modules`);
  const present = CONFIG_FILES.filter((f) => existsSync(join(root, f)));
  if (present.some((f) => f !== "vite.config.js")) out.push(`only vite.config.js is supported, found ${present.join(", ")}`);
  if (!present.includes("vite.config.js")) return out;
  const text = readFileSync(join(root, "vite.config.js"), "utf8");
  let ast;
  try { ast = parseAst(text, { lang: "js" }); } catch (e) { return [...out, `vite.config.js could not be parsed (${String(e.message).split("\n")[0]})`]; }
  const key = (p) => (p?.type === "Property" && !p.computed ? (p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : null) : null);
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === "ImportDeclaration" && !CONFIG_IMPORTS.has(n.source.value)) out.push(`vite.config.js imports ${n.source.value}`);
    if (n.type === "ImportExpression" || (n.type === "CallExpression" && n.callee?.name === "require")) out.push("vite.config.js loads a module dynamically");
    if (n.type === "Property" && n.computed) out.push("vite.config.js has a computed property name");
    if (n.type === "SpreadElement") out.push("vite.config.js spreads an object or array");
    const k = key(n);
    if (k && RESOLUTION_KEYS.has(k)) out.push(`vite.config.js sets "${k}", which can change which modules are built`);
    if (k === "define" && n.value?.type === "ObjectExpression") {
      for (const d of n.value.properties) if (!/^import\.meta\.env\./.test(key(d) ?? "")) out.push(`vite.config.js defines ${key(d) ?? "a computed name"}, which replaces code at build time`);
    }
    if (k === "plugins" && n.value?.type === "ArrayExpression") {
      for (const el of n.value.elements) {
        const name = el?.type === "CallExpression" && el.callee.type === "Identifier" ? el.callee.name : null;
        const local = name && ast.body.some((b) => b.type === "FunctionDeclaration" && b.id?.name === name);
        const fromReact = name && ast.body.some((b) => b.type === "ImportDeclaration" && b.source.value === "@vitejs/plugin-react" && b.specifiers.some((sp) => sp.local.name === name));
        if (!local && !fromReact) out.push("vite.config.js uses a plugin other than react() or one defined in the file");
      }
    }
    for (const c of Object.keys(n)) if (c !== "parent") walk(n[c]);
  };
  walk(ast);
  return [...new Set(out)];
}
function requireSupportedBuild(root) {
  const p = buildConfigProblems(root);
  if (p.length) throw new Error(`the build configuration could make production load other modules than the ones reviewed — refusing: ${p.join("; ")}`);
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
  requireSupportedBuild(root);
  const h = createHash("sha256");
  /* The build's own inputs: its config and the exact dependencies it
     installs (round 30). */
  for (const f of ["vite.config.js", "package.json", "package-lock.json"]) {
    h.update(`\0build:${f}\0`).update(existsSync(join(root, f)) ? readFileSync(join(root, f)) : "(absent)");
  }
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
  /* And the matcher, with everything it imports: it decides which values a
     pairing draws, so a change anywhere in it re-checks every pairing
     (round 26). */
  h.update("\0matcher\0").update(moduleClosure(["src/diagrams/match.js"], root));
  return h.digest("hex").slice(0, 24);
}

export function readReviewIndex(root = ".") {
  const p = join(root, REVIEW_INDEX);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}

/* Who may say a review happened. The index lives in the branch, so
   anything in it could have been written by the branch (Astra, PR #134
   review, round 25). The paid review job signs each entry it records
   (ops/attest.mjs); a reused verdict and an approval both require that
   signature, checked against the pinned public key (round 26: CI could
   only check the signature's shape). */
const approvalFields = (id, e) => [id, e.key ?? null, e.sourceKey ?? null, e.frames ?? null, e.verdict ?? null, e.completed ?? null, e.reviewedAt ?? null, e.model ?? null, e.report ?? null];
export const signApproval = (id, e, signer) => signer.sign("diagram-review", approvalFields(id, e));
export function verifyApproval(id, e, verifier) {
  if (!verifier || typeof verifier.verify !== "function") throw new Error("verifyApproval: no public key to check the signature with");
  return !!e && verifier.verify("diagram-review", approvalFields(id, e), e.sig);
}

/* { ok, why } for one diagram id. `steps` is the diagram's real step list
   (stepInventory, or the registry): a PASS counts only if its review was
   shown every one of those frames (round 24), and only if the review job
   signed it (round 25). */
export function approval(index, id, key, steps, verifier) {
  if (!Array.isArray(steps)) throw new Error(`approval(${id}): the diagram's real steps are required`);
  const e = index[id];
  if (!e) return { ok: false, why: "never reviewed" };
  if (!verifyApproval(id, e, verifier)) return { ok: false, why: "not signed by the review job" };
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
