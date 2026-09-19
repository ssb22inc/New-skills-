/**
 * Typeset the whole Sycamore source tree as one printable document.
 *
 * Written on 2026-09-16 for an outside reviewer who asked for "all the
 * coding in a PDF" — a listing that can be read on a plane, annotated,
 * and handed to counsel or an auditor without giving anyone repository
 * access. It regenerates from any commit, so the paper copy in `docs/`
 * can be refreshed rather than drifting.
 *
 * Deliberate choices:
 *   * `haven/` and `pulsern/` are EXCLUDED. They are other products in
 *     this repository and are off-limits (scope law §5); putting their
 *     code in a Sycamore listing would misrepresent both.
 *   * Generated and vendored output is excluded: node_modules, .next,
 *     dist, coverage, and the lockfile.
 *   * Highlighting is limited to WHOLE-LINE comments. A regex tokenizer
 *     that tried to find strings would mangle this codebase, which is
 *     full of prose comments containing apostrophes and quotes. Grey
 *     comments give most of the readability and cannot corrupt a line.
 *   * Files appear in the shape of the system, not the alphabet, and
 *     each starts on a new page so it can be found by flipping.
 *
 * Usage:  node scripts/source-listing.mjs [outputDirectory]
 *
 * The HTML is always written. For the PDF it prefers Playwright, which
 * the tests package already installs and whose render of this document
 * is a fifth of the bytes of the same pages through Chromium's own
 * `--print-to-pdf`; that CLI is the fallback, and without any browser
 * the HTML prints to PDF from a desktop one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(process.argv[2] ?? join(ROOT, 'docs'));

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  '.git',
  '.turbo',
  '.vercel',
  'haven',
  'pulsern',
]);
const SKIP_FILES = new Set(['pnpm-lock.yaml', 'package-lock.json']);
// This repository began life as a GitHub tutorial; those workflows are
// not Sycamore's, and listing them pads the document with example code.
const SKIP_PATHS = /^\.github\/workflows\/[0-4]-/;
const EXTS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.mjs',
  '.yaml',
  '.yml',
  '.json',
  '.sql',
  '.css',
]);

/** Reading order: the shape of the system, not the alphabet. */
const ORDER = [
  ['Configuration', (p) => !p.includes('/') || p.startsWith('.github/')],
  ['core — database and migrations', (p) => p.startsWith('core/src/db/')],
  ['core — business logic', (p) => p.startsWith('core/')],
  ['packs — country and industry configuration', (p) => p.startsWith('packs/')],
  ['adapters — every external vendor', (p) => p.startsWith('adapters/')],
  ['design — the design system', (p) => p.startsWith('design/')],
  ['apps/gateway — webhook ingress', (p) => p.startsWith('apps/gateway/')],
  ['apps/web — every page a person sees', (p) => p.startsWith('apps/web/')],
  ['apps/worker — the queue consumer', (p) => p.startsWith('apps/worker/')],
  ['tests — the gates', (p) => p.startsWith('tests/')],
  ['scripts — operator tools', (p) => p.startsWith('scripts/')],
];

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|#(?!!)|--)/;

function esc(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function collect(dir, found) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (EXCLUDE_DIRS.has(entry)) continue;
      if (entry.startsWith('.') && entry !== '.github') continue;
      collect(full, found);
      continue;
    }
    if (SKIP_FILES.has(entry) || !EXTS.has(extname(entry))) continue;
    const rel = relative(ROOT, full).split(sep).join('/');
    if (SKIP_PATHS.test(rel)) continue;
    found.push(rel);
  }
  return found;
}

function renderFile(rel) {
  const lines = readFileSync(join(ROOT, rel), 'utf8').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const body = lines
    .map(
      (line, i) =>
        `<span class="ln">${i + 1}</span>` +
        `<span class="code${COMMENT_LINE.test(line) ? ' c' : ''}">${esc(line) || '&nbsp;'}</span>`,
    )
    .join('\n');
  return [
    `<div class="file"><div class="fhead"><span class="fpath">${esc(rel)}</span>` +
      `<span class="flines">${lines.length} lines</span></div><pre>${body}</pre></div>`,
    lines.length,
  ];
}

function buildHtml() {
  const files = [...new Set(collect(ROOT, []))].sort();
  const claimed = new Set();
  const buckets = [];
  for (const [title, match] of ORDER) {
    const group = files.filter((f) => !claimed.has(f) && match(f));
    group.forEach((f) => claimed.add(f));
    if (group.length > 0) buckets.push([title, group]);
  }
  const leftover = files.filter((f) => !claimed.has(f));
  if (leftover.length > 0) buckets.push(['Everything else', leftover]);

  const commit = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  }).trim();

  let totalLines = 0;
  const contents = [];
  const sections = [];
  for (const [title, group] of buckets) {
    contents.push(`<h3>${esc(title)}</h3><ul class="toc">`);
    const rendered = [];
    for (const rel of group) {
      const [chunk, n] = renderFile(rel);
      totalLines += n;
      rendered.push(chunk);
      contents.push(`<li>${esc(rel)} <span class="n">${n}</span></li>`);
    }
    contents.push('</ul>');
    sections.push(`<h2 class="section">${esc(title)}</h2>` + rendered.join('\n'));
  }

  const generated = new Date().toISOString().slice(0, 10);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Sycamore — Source Code</title>
<style>
  @page { size: A4; margin: 12mm 10mm 14mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, serif; font-size: 10pt; color: #14212b; margin: 0; }
  h1 { font-size: 26pt; margin: 0 0 4pt; letter-spacing: -0.5pt; }
  .sub { font-size: 11pt; color: #4a5c68; margin: 0 0 16pt; }
  .meta { font-size: 9pt; color: #4a5c68; border-top: 0.5pt solid #b9c4cc;
          border-bottom: 0.5pt solid #b9c4cc; padding: 6pt 0; margin-bottom: 14pt; }
  .meta span { display: inline-block; margin-right: 16pt; }
  .note { border: 0.75pt solid #14212b; padding: 8pt 10pt; font-size: 9.5pt;
          margin-bottom: 14pt; }
  .note p { margin: 0 0 6pt; } .note p:last-child { margin: 0; }
  h2.section { page-break-before: always; font-size: 15pt; margin: 0 0 8pt;
               padding-bottom: 4pt; border-bottom: 1.5pt solid #14212b; }
  h3 { font-size: 10.5pt; margin: 10pt 0 3pt; }
  ul.toc { list-style: none; margin: 0 0 8pt; padding: 0; font-family: 'DejaVu Sans Mono',
           monospace; font-size: 7.6pt; column-count: 2; column-gap: 10mm; }
  ul.toc li { break-inside: avoid; color: #29404f; }
  ul.toc .n { color: #7b8e9b; }
  .file { page-break-before: always; }
  .fhead { border-bottom: 1pt solid #14212b; padding-bottom: 2pt; margin-bottom: 4pt;
           display: flex; justify-content: space-between; align-items: baseline; }
  .fpath { font-family: 'DejaVu Sans Mono', monospace; font-size: 9pt; font-weight: bold; }
  .flines { font-size: 8pt; color: #4a5c68; }
  pre { font-family: 'DejaVu Sans Mono', Consolas, monospace; font-size: 6.6pt;
        line-height: 1.32; margin: 0; white-space: pre-wrap; word-break: break-word; }
  .ln { display: inline-block; width: 22pt; text-align: right; padding-right: 6pt;
        color: #a3b1ba; user-select: none; }
  .code { white-space: pre-wrap; }
  .code.c { color: #5d7080; }
</style></head><body>
<h1>Sycamore</h1>
<p class="sub">Complete source listing — every line the project owns.</p>
<div class="meta">
  <span><strong>Commit</strong> ${esc(commit)}</span>
  <span><strong>Files</strong> ${files.length}</span>
  <span><strong>Lines</strong> ${totalLines.toLocaleString('en-US')}</span>
  <span><strong>Generated</strong> ${generated}</span>
</div>
<div class="note">
<p><strong>What is here.</strong> Every source file Sycamore owns: business logic, database
migrations, country and industry configuration, vendor adapters, the web surfaces, the design
system, the full test suite and the operator scripts. Files appear in reading order — the shape of
the system rather than the alphabet — and each begins on its own page.</p>
<p><strong>What is not.</strong> Two other products share this repository and are excluded, because
including their code in a Sycamore listing would misrepresent both. So is everything generated or
vendored: dependencies, build output, coverage reports and the lockfile.</p>
<p><strong>Reading it.</strong> Line numbers match the files exactly. Whole-line comments are set in
grey; nothing else is colourised, because a tokenizer clever enough to find strings would mangle a
codebase this full of prose. The comments are worth reading — most explain <em>why</em>, and several
record the incident that put them there.</p>
</div>
<h2 style="font-size:13pt;margin:14pt 0 6pt;border-bottom:1.5pt solid #14212b;padding-bottom:3pt;">Contents</h2>
${contents.join('\n')}
${sections.join('\n')}
</body></html>`;
  return { html, files: files.length, totalLines, commit };
}

function chromiumBinary() {
  return [process.env.CHROMIUM, '/opt/pw-browsers/chromium']
    .filter(Boolean)
    .find((c) => existsSync(c));
}

/** Playwright lives in the tests package; resolve it from there or give up. */
async function playwright() {
  try {
    const require = createRequire(join(ROOT, 'tests', 'package.json'));
    const mod = await import(require.resolve('playwright'));
    // Playwright is CommonJS: the namespace of a `import()`ed CJS module
    // puts the module.exports object on `default`.
    return mod.chromium ? mod : mod.default;
  } catch {
    return undefined;
  }
}

async function renderPdf(htmlPath, pdfPath, commit) {
  const binary = chromiumBinary();
  const pw = await playwright();
  if (pw) {
    const browser = await pw.chromium.launch({
      ...(binary ? { executablePath: binary } : {}),
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:8pt;color:#4a5c68;padding:0 12mm;' +
        'font-family:Georgia,serif;display:flex;justify-content:space-between;">' +
        `<span>Sycamore — complete source listing — commit ${commit}</span>` +
        '<span class="pageNumber"></span></div>',
      margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' },
    });
    await browser.close();
    return 'playwright';
  }
  if (!binary) return undefined;
  execFileSync(
    binary,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`,
      `file://${htmlPath}`,
    ],
    { stdio: 'ignore' },
  );
  return 'chromium';
}

const { html, files, totalLines, commit } = buildHtml();
mkdirSync(OUT_DIR, { recursive: true });
const htmlPath = join(OUT_DIR, 'sycamore-source-code.html');
writeFileSync(htmlPath, html);
console.log(`${files} files, ${totalLines.toLocaleString('en-US')} lines -> ${htmlPath}`);

const pdfPath = join(OUT_DIR, 'Sycamore-Source-Code.pdf');
const how = await renderPdf(htmlPath, pdfPath, commit);
console.log(
  how
    ? `rendered via ${how} -> ${pdfPath}`
    : 'no browser found (set CHROMIUM) — print the HTML to PDF from any browser',
);
