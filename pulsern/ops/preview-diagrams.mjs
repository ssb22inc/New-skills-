#!/usr/bin/env node
/* A single-file, playable preview of the concept explainers.
   ------------------------------------------------------------------
   Screenshots (render-diagrams.mjs) show every step's finished picture, but
   not the motion — and motion is half of what an explainer is. This builds
   the REAL player and diagrams (the same components the app ships) into one
   self-contained HTML file that anyone can open, switch theme, and press
   Play. With --video it also records a diagram playing through, for
   reviewing on a phone without opening anything.

   Usage:
     node ops/preview-diagrams.mjs [--out reports/diagram-preview.html]
     node ops/preview-diagrams.mjs --video pressure-injury [--theme light|dim] [--video-dir dir]
   Nothing here ships to students; it is a sign-off tool. */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { themeTokens } from "./render-diagrams.mjs";
import { launchBrowser } from "./browser.mjs";

const ROOT = resolve(".");

const ENTRY = (root) => `
import React from "react";
import { createRoot } from "react-dom/client";
import { DIAGRAMS } from "${root}/src/diagrams/index.js";
import { Explainer } from "${root}/src/explainer.jsx";

function Preview() {
  const params = new URLSearchParams(location.search);
  const [theme, setTheme] = React.useState(params.get("theme") === "dim" ? "dim" : "light");
  const only = params.get("only");
  const list = Object.values(DIAGRAMS).filter((d) => !only || d.id === only);
  return (
    <div className="app" data-theme={theme}>
      <header className="pv-head">
        <strong>PulseRN explainers · preview</strong>
        <button type="button" className="dg-btn ghost" onClick={() => setTheme(theme === "dim" ? "light" : "dim")}>
          {theme === "dim" ? "Light theme" : "Dark theme"}
        </button>
      </header>
      <p className="pv-note">The real player and diagrams, as built for the app. Press “Watch the explainer” to see each one move.</p>
      {list.map((d) => <Explainer key={d.id} diagram={d} />)}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<Preview />);
`;

const HTML = (tokens) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Explainer preview</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
.app{${tokens.light}} .app[data-theme="dim"]{${tokens.dark}}
body{margin:0;background:#E9EEEB}
.app{max-width:560px;margin:0 auto;min-height:100vh;padding:12px 16px 40px;box-sizing:border-box;background:var(--paper);color:var(--ink);font-family:'Archivo',system-ui,sans-serif}
.pv-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:4px 0 6px}
.pv-note{font-size:13px;color:var(--muted);margin:0 0 6px}
</style></head><body><div id="root"></div><script type="module" src="./entry.jsx"></script></body></html>`;

export async function buildPreview({ out }) {
  /* Inside the project (not /tmp) so the build resolves the project's own
     react and react-dom. */
  const cache = join(ROOT, "node_modules", ".cache");
  mkdirSync(cache, { recursive: true });
  const work = mkdtempSync(join(cache, "pulsern-preview-"));
  try {
    writeFileSync(join(work, "entry.jsx"), ENTRY(ROOT));
    writeFileSync(join(work, "index.html"), HTML(themeTokens()));
    await build({
      configFile: false, root: work, logLevel: "error", plugins: [react()],
      resolve: { dedupe: ["react", "react-dom"] },
      build: { outDir: join(work, "dist"), assetsInlineLimit: 100_000_000, modulePreload: false, cssCodeSplit: false },
    });
    /* One file: the built script inlined, so it opens anywhere. */
    let html = readFileSync(join(work, "dist", "index.html"), "utf8");
    const assets = join(work, "dist", "assets");
    for (const f of readdirSync(assets)) {
      const code = readFileSync(join(assets, f), "utf8");
      if (f.endsWith(".js")) {
        html = html.replace(new RegExp(`<script[^>]*src="[^"]*${f.replace(/[.]/g, "\\.")}"[^>]*></script>`),
          () => `<script type="module">${code.replace(/<\/script/gi, "<\\/script")}</script>`);
      }
    }
    if (/src="\.?\/?assets\//.test(html)) throw new Error("preview still references an external asset");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    return out;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/* Record one diagram playing through every step, at phone width. */
export async function recordVideo({ html, id, theme = "light", dir }) {
  mkdirSync(dir, { recursive: true });
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    recordVideo: { dir, size: { width: 390, height: 844 } },
  });
  const pg = await ctx.newPage();
  await pg.goto(`${pathToFileURL(html).href}?only=${encodeURIComponent(id)}&theme=${theme}`);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(600);
  await pg.getByRole("button", { name: /Watch the explainer/ }).click();
  /* Play until the last step's caption has run: the dots tell us where we are. */
  const n = await pg.locator(".dg-dot").count();
  await pg.locator(".dg-dot").nth(n - 1).and(pg.locator(".on")).waitFor({ timeout: 180_000 });
  await pg.getByRole("button", { name: "Play" }).waitFor({ timeout: 60_000 });
  await pg.waitForTimeout(800);
  const video = pg.video();
  await ctx.close();
  await browser.close();
  const file = join(dir, `${id}-${theme}.webm`);
  renameSync(await video.path(), file);
  return file;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
  const out = resolve(arg("--out", "reports/diagram-preview.html"));
  await buildPreview({ out });
  console.log(`preview: ${out}`);
  const id = arg("--video", null);
  if (id) {
    const file = await recordVideo({ html: out, id, theme: arg("--theme", "light"), dir: resolve(arg("--video-dir", dirname(out))) });
    console.log(`video: ${file}`);
  }
}
