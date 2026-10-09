#!/usr/bin/env node
/* Renders every concept diagram, every step, in both themes, to PNG.
   ------------------------------------------------------------------
   A diagram is only as good as what it looks like on a phone, and that
   cannot be checked by reading SVG. This builds the REAL components with
   Vite (the same transform the app uses), renders each step to static
   markup inside the app's own colour tokens and fonts, and screenshots it
   at phone width with a real browser.

   The images are what a human looks at before sign-off, and what the
   adversarial reviewer sees when it judges a diagram visually.

   Usage: node ops/render-diagrams.mjs [--out dir] [--only id] [--width 360]
   Output: <out>/<id>/<theme>-step<N>.png, plus <out>/index.html */
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./browser.mjs";


/* The theme tokens are read from App.jsx itself, so the render can never
   drift from what students actually see. */
export function themeTokens(root = ".") {
  const src = readFileSync(join(root, "src/App.jsx"), "utf8");
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

const page = (body, tokens, css, WIDTH) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>:root{${tokens}} body{margin:0;background:var(--paper);color:var(--ink);font-family:'Archivo',system-ui,sans-serif}
.shot{width:${WIDTH}px;padding:12px;box-sizing:border-box;background:var(--paper)} ${css}</style></head>
<body>${body}</body></html>`;

/* The branch's diagram code is built by THIS script with its own pinned
   tools — no config, plugin, environment file or package script from the
   tree being rendered is used — and runs only inside the browser, where it
   cannot touch this process, its files or the frames it writes (Astra,
   PR #134 review, round 25: the frames came from the branch's own render
   script, so nothing proved they showed the pinned source). */
const ENTRY = "\0pulsern-render-entry";
const HERE = fileURLToPath(new URL("..", import.meta.url));   // this script's own project, for its tools
export async function bundleDiagrams(root) {
  const { build } = await import("vite");
  const { default: react } = await import("@vitejs/plugin-react");
  const req = createRequire(join(HERE, "package.json"));
  const out = await build({
    configFile: false, root: resolve(root), envDir: mkdtempSync(join(tmpdir(), "pulsern-noenv-")), publicDir: false,
    logLevel: "error", mode: "production", css: { postcss: { plugins: [] } },
    plugins: [react(), {
      name: "pulsern-render-entry", enforce: "pre",
      resolveId(id) {
        if (id === ENTRY) return id;
        /* A package comes from this script's own install, never the tree's. */
        if (!id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0")) return req.resolve(id);
        return null;
      },
      load(id) {
        if (id !== ENTRY) return null;
        return `import React from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { DIAGRAMS } from "/src/diagrams/index.js";
import { DIAGRAM_CSS } from "/src/diagrams/kit.jsx";
import { Explainer } from "/src/explainer.jsx";
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));
window.__pulsern = {
  css: String(DIAGRAM_CSS),
  ids: () => Object.keys(DIAGRAMS),
  data: (id) => { const d = DIAGRAMS[id]; return plain({ id: d.id, title: d.title, facts: d.facts,
    workedCaption: typeof d.dynamicCaption === "function" ? d.dynamicCaption(d.example) : null,
    steps: d.steps.map((s) => ({ key: s.key, dynamic: !!s.dynamic, focus: s.focus ?? [], caption: s.dynamic ? null : s.caption ?? null, narration: s.dynamic ? null : s.narration ?? null })) }); },
  markup: (id, step) => renderToStaticMarkup(step == null
    ? React.createElement(Explainer, { diagram: DIAGRAMS[id] })
    : React.createElement(Explainer, { diagram: DIAGRAMS[id], startInPlayer: true, initialStep: step })),
};`;
      },
    }],
    build: { write: false, minify: false, modulePreload: false, rollupOptions: { input: ENTRY, output: { format: "iife" } } },
  });
  const chunks = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output).filter((c) => c.type === "chunk");
  if (chunks.length !== 1) throw new Error(`renderDiagrams: expected one bundle, got ${chunks.length}`);
  return chunks[0].code;
}

export async function renderDiagrams({ outDir, only = null, width = 360, root = "." } = {}) {
  const OUT = outDir, ONLY = only, WIDTH = width;
  const code = await bundleDiagrams(root);
  const tokens = themeTokens(root);
  const browser = await launchBrowser();
  try {
    /* Two contexts: the diagram code runs in the first and only returns
       strings; the frames are drawn in the second, with scripts off, from
       that static markup. */
    const run = await (await browser.newContext()).newPage();
    await run.addScriptTag({ content: code });
    const DIAGRAM_CSS = await run.evaluate(() => window.__pulsern.css);
    const ids = await run.evaluate(() => window.__pulsern.ids());
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 2, javaScriptEnabled: false });
    const pg = await ctx.newPage();
    const gallery = [];
    const lintFailures = [];
    const data = {};

    for (const id of ids) {
      if (ONLY && id !== ONLY) continue;
      const d = await run.evaluate((x) => window.__pulsern.data(x), id);
      if (typeof d?.id !== "string" || d.id !== id || !Array.isArray(d.steps)) throw new Error(`renderDiagrams: diagram ${JSON.stringify(id)} did not describe itself`);
      data[id] = d;
      const dir = join(OUT, id);
      mkdirSync(dir, { recursive: true });
      const frames = [null, ...d.steps.map((_, i) => i)];   // null = inline (as in a rationale)
      for (const theme of ["light", "dark"]) {
        for (let i = 0; i < frames.length; i++) {
          const markup = await run.evaluate(([x, n]) => window.__pulsern.markup(x, n), [id, frames[i]]);
          if (typeof markup !== "string") throw new Error(`renderDiagrams: ${id} returned no markup`);
          const body = `<div class="shot">${markup}</div>`;
          await pg.setContent(page(body, tokens[theme], DIAGRAM_CSS, WIDTH), { waitUntil: "networkidle" });
          await pg.evaluate(() => document.fonts.ready);
          /* Layout lint, measured in a real browser with the real fonts: no
             text past the canvas, out of the box it sits in, or on top of other
             text. Checked on every frame in light theme: theme changes only
             colour, but a step can add its own annotations (onset/peak marks,
             a highlighted row), so each step's geometry is its own. */
          if (theme === "light") {
            const issues = await pg.evaluate(() => {
              const svg = document.querySelector(".shot svg");
              const vb = svg.viewBox.baseVal;
              const out = [];
              /* Boxes in the canvas's own units, AFTER any transform: text
                 inside a translated or rotated group (a seesaw, a lift) is
                 measured where it is actually drawn, not where its local
                 coordinates say. */
              const toSvg = svg.getScreenCTM().inverse();
              const boxOf = (el) => {
                const b = el.getBBox();
                const m = toSvg.multiply(el.getScreenCTM());
                const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
                  .map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
                const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
                return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
              };
              const texts = [...svg.querySelectorAll("text")].map((t) => ({ t, b: boxOf(t), s: t.textContent.trim() })).filter((x) => x.s);
              const rects = [...svg.querySelectorAll("rect")].map(boxOf).filter((b) => b.width > 40 && b.height > 20);
              const tol = 0.75;
              for (const { b, s } of texts) {
                if (b.x < vb.x - tol || b.x + b.width > vb.x + vb.width + tol) out.push(`"${s}" runs off the canvas`);
                // the smallest box containing the text's start point is its container
                const home = rects.filter((r) => b.x >= r.x - tol && b.x <= r.x + r.width && b.y + b.height / 2 >= r.y && b.y + b.height / 2 <= r.y + r.height)
                  .sort((p, q) => p.width * p.height - q.width * q.height)[0];
                if (home && b.x + b.width > home.x + home.width + tol) out.push(`"${s}" overflows its box by ${(b.x + b.width - home.x - home.width).toFixed(1)}`);
              }
              for (let a = 0; a < texts.length; a++) for (let c = a + 1; c < texts.length; c++) {
                const p = texts[a].b, q = texts[c].b;
                const ox = Math.min(p.x + p.width, q.x + q.width) - Math.max(p.x, q.x);
                const oy = Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y);
                if (ox > 1.5 && oy > 2.5) out.push(`"${texts[a].s}" overlaps "${texts[c].s}"`);
                /* Same line, not overlapping, but touching: reads as one run-on
                   word ("10–30 min1–2 h"). Overlap alone missed this. */
                else if (oy > Math.min(p.height, q.height) * 0.6 && ox > -4 && ox <= 1.5) out.push(`"${texts[a].s}" crowds "${texts[c].s}" (gap ${(-ox).toFixed(1)})`);
              }
              return out;
            });
            const where = frames[i] == null ? "static" : d.steps[frames[i]].key;
            if (issues.length) { lintFailures.push(...issues.map((m) => `${id} [${where}]: ${m}`)); }
          }
          const file = join(dir, `${theme}-step${i}.png`);
          await pg.locator(".shot").screenshot({ path: file });
          gallery.push({ id, theme, step: i, key: frames[i] == null ? "static" : d.steps[frames[i]].key, file });
        }
      }
      console.log(`rendered ${id}: ${frames.length} frames × 2 themes`);
    }
    writeFileSync(join(OUT, "index.json"), JSON.stringify(gallery, null, 2));
    return { gallery, lintFailures, data };
  } finally {
    await browser.close();
  }
}

/* CLI: render to a folder and fail on any layout problem. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
  const { lintFailures } = await renderDiagrams({
    outDir: resolve(arg("--out", "reports/diagrams")), only: arg("--only", null), width: Number(arg("--width", "360")),
  });
  if (lintFailures.length) {
    console.error(`\nLayout lint: ${lintFailures.length} problem(s)`);
    for (const f of lintFailures) console.error(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("Layout lint: clean");
  }
}
