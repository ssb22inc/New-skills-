#!/usr/bin/env node
/* Renders every concept diagram, every step, in both themes, to PNG.
   ------------------------------------------------------------------
   A diagram is only as good as what it looks like on a phone, and that
   cannot be checked by reading SVG. This loads the REAL components through
   Vite (the same transform the app uses), renders each step to static
   markup inside the app's own colour tokens and fonts, and screenshots it
   at phone width with a real browser.

   The images are what a human looks at before sign-off, and what the
   adversarial reviewer sees when it judges a diagram visually.

   Usage: node ops/render-diagrams.mjs [--out dir] [--only id] [--width 360]
   Output: <out>/<id>/<theme>-step<N>.png, plus <out>/index.html */
import { createServer } from "vite";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchBrowser } from "./browser.mjs";


/* The theme tokens are read from App.jsx itself, so the render can never
   drift from what students actually see. */
export function themeTokens() {
  const src = readFileSync("src/App.jsx", "utf8");
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

export async function renderDiagrams({ outDir, only = null, width = 360 } = {}) {
const OUT = outDir, ONLY = only, WIDTH = width;
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  /* React and react-dom are CommonJS: loaded by Node itself, so the app's
     components (loaded through Vite below) share the same React instance. */
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { DIAGRAMS } = await vite.ssrLoadModule("/src/diagrams/index.js");
  const { DIAGRAM_CSS } = await vite.ssrLoadModule("/src/diagrams/kit.jsx");
  /* The real player, not a reconstruction of it: a preview that differs
     from the app is a preview that misleads. */
  const { Explainer } = await vite.ssrLoadModule("/src/explainer.jsx");
  const tokens = themeTokens();

  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const gallery = [];
  const lintFailures = [];

  for (const d of Object.values(DIAGRAMS)) {
    if (ONLY && d.id !== ONLY) continue;
    const dir = join(OUT, d.id);
    mkdirSync(dir, { recursive: true });
    const frames = [null, ...d.steps.map((_, i) => i)];   // null = inline (as in a rationale)
    for (const theme of ["light", "dark"]) {
      for (let i = 0; i < frames.length; i++) {
        const el = frames[i] == null
          ? React.createElement(Explainer, { diagram: d })
          : React.createElement(Explainer, { diagram: d, startInPlayer: true, initialStep: frames[i] });
        const body = `<div class="shot">${renderToStaticMarkup(el)}</div>`;
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
          if (issues.length) { lintFailures.push(...issues.map((m) => `${d.id} [${where}]: ${m}`)); }
        }
        const file = join(dir, `${theme}-step${i}.png`);
        await pg.locator(".shot").screenshot({ path: file });
        gallery.push({ id: d.id, theme, step: i, key: frames[i] == null ? "static" : d.steps[frames[i]].key, file });
      }
    }
    console.log(`rendered ${d.id}: ${frames.length} frames × 2 themes`);
  }
  writeFileSync(join(OUT, "index.json"), JSON.stringify(gallery, null, 2));
  await browser.close();
  return { gallery, lintFailures };
} finally {
  await vite.close();
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
