/* The reviewer's own logic — including every gap Astra found in it.
   ------------------------------------------------------------------
   Astra's first review of this file returned 1 blocker and 4 majors. Each
   test block below names the finding it pins, so a later edit that reopens
   one fails here rather than in a review nobody reads. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import {
  classifyPath, planContext, buildPrompt, validateResult, verdictFor, renderMarkdown, reportBaseName,
  FINDINGS_SCHEMA, MAX_FULL_FILE_CHARS, pageDigest, lockDigest, textDiff, parseNameStatusZ,
  collectChanges, runReview, exactText, reviewableImage, reviewText, fromReviewText,
} from "../ops/astra-review.mjs";
import { encodeCanonicalPng, canonicalDeflate, canonicalPng } from "../ops/png-canonical.mjs";

const finding = (severity, extra = {}) => ({
  severity, file: "pulsern/src/x.js", line: 3, title: "t", problem: "p",
  failure_scenario: "f", fix: "fx", confidence: "high", ...extra,
});

/* A throwaway repository so collection is tested against real git output,
   not against what we assume git prints. */
let repo;
const g = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8" });
function write(rel, body) { mkdirSync(join(repo, rel, ".."), { recursive: true }); writeFileSync(join(repo, rel), body); }
beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "astra-test-"));
  g("init", "-q", "-b", "main");
  g("config", "user.email", "t@t"); g("config", "user.name", "t");
  write("pulsern/src/a.js", "export const a = 1;\n");
  write("pulsern/public/learn/bow-tie/index.html", "<html><head><title>Bow tie</title></head><body><p>Old guide text.</p></body></html>");
  write("pulsern/package-lock.json", JSON.stringify({ packages: { "": {}, "node_modules/left-pad": { version: "1.0.0", resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.0.0.tgz", integrity: "sha512-AAAA" } } }));
  write("fullburn/x.js", "1\n");
  g("add", "-A"); g("commit", "-q", "-m", "base");
  g("tag", "base");
  write("pulsern/src/a.js", "export const a = 2;\n");
  write("pulsern/public/révision.html", "<p>hand-written, accented name</p>");
  write("pulsern/src/tab\tname.js", "export const t = 1;\n");
  write("pulsern/src/new\nline.js", "export const n = 1;\n");
  write("pulsern/public/learn/bow-tie/index.html", "<html><head><title>Bow tie</title><script src=\"https://evil.example/x.js\"></script></head><body><p>New guide text.</p></body></html>");
  write("pulsern/public/learn/sneaky/index.html", "<p>A page no generator writes</p>");
  write("pulsern/package-lock.json", JSON.stringify({ packages: { "": {}, "node_modules/left-pad": { version: "1.0.0", resolved: "https://evil.example/left-pad-1.0.0.tgz", integrity: "sha512-BBBB" } } }));
  write("fullburn/x.js", "2\n");
  write("pulsern/reports/astra/old.md", "old report");
  g("add", "-A"); g("commit", "-q", "-m", "head");
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("scope (no cross-contamination; nothing in PulseRN exempt)", () => {
  it("reviews PulseRN source, its workflows, and the hand-written pages", () => {
    for (const p of ["pulsern/src/ngn.js", "pulsern/ops/llm.mjs", ".github/workflows/pulsern-astra-review.yml",
                     "pulsern/public/owner/index.html", "pulsern/public/review/index.html", "pulsern/public/app-sw.js"]) {
      expect(classifyPath(p).mode, p).toBe("review");
    }
  });

  it("never touches another project", () => {
    for (const p of ["fullburn/engine/scripts/done.mjs", "haven/app/page.tsx", ".github/workflows/fullburn-gates.yml", ".github/workflows/cross-family-read.yml"]) {
      expect(classifyPath(p), p).toEqual({ mode: "skip", why: "outside PulseRN" });
    }
  });

  /* Astra finding #4: generated pages were exempt by path. They are now
     reviewed as a digest, and nothing inside PulseRN is skipped except the
     reviewer's own past reports. */
  it("reviews generated pages as digests instead of exempting them", () => {
    expect(classifyPath("pulsern/public/learn/bow-tie-questions/index.html").mode).toBe("page");
    expect(classifyPath("pulsern/public/compare/pulsern-vs-uworld/index.html").mode).toBe("page");
    expect(classifyPath("pulsern/public/sitemap.xml").mode).toBe("page");
  });

  it("reviews the lockfile as a dependency summary instead of exempting it", () => {
    expect(classifyPath("pulsern/package-lock.json").mode).toBe("lockfile");
  });

  it("skips only the reviewer's own past reports inside PulseRN", () => {
    expect(classifyPath("pulsern/reports/astra/2026-10-08-x.md")).toEqual({ mode: "skip", why: "earlier review reports" });
  });

  it("keeps the generated-page list in step with what the generators write", () => {
    const pub = readFileSync("ops/build-public-pages.mjs", "utf8");
    const learn = readFileSync("ops/build-learn.mjs", "utf8");
    const generated = new Set([...pub.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]));
    if (/const OUT = "public\/learn"/.test(learn)) generated.add("learn");
    if (/COMMERCIAL_PAGES/.test(pub)) generated.add("compare");
    const htmlDirs = readdirSync("public", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
      .filter((d) => { try { return readdirSync(`public/${d}`).includes("index.html"); } catch { return false; } });
    for (const d of htmlDirs) {
      const mode = classifyPath(`pulsern/public/${d}/index.html`).mode;
      expect(mode, `public/${d}`).toBe(generated.has(d) ? "page" : "review");
    }
  });
});

describe("collecting from real git output (Astra finding #3)", () => {
  it("parses NUL-delimited records verbatim", () => {
    expect(parseNameStatusZ("M\0pulsern/a b.js\0A\0pulsern/é.js\0")).toEqual([
      { status: "M", path: "pulsern/a b.js" }, { status: "A", path: "pulsern/é.js" },
    ]);
  });

  /* The display form quotes these names; the old parser dropped them and could
     return PASS with "no PulseRN files changed". */
  it("collects accented, tab and newline filenames — none silently dropped", () => {
    const { files } = collectChanges("base", "HEAD", { cwd: repo });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("pulsern/public/révision.html");
    expect(paths).toContain("pulsern/src/tab\tname.js");
    expect(paths).toContain("pulsern/src/new\nline.js");
    const accented = files.find((f) => f.path === "pulsern/public/révision.html");
    expect(accented.diff).toContain("hand-written, accented name");
  });

  it("collects nothing from other projects and names the skipped report", () => {
    const { files, skipped } = collectChanges("base", "HEAD", { cwd: repo });
    expect(files.some((f) => f.path.startsWith("fullburn/"))).toBe(false);
    expect(skipped).toEqual([{ path: "pulsern/reports/astra/old.md", why: "earlier review reports" }]);
  });

  /* The bypass Astra described: a page dropped into a generated directory. */
  it("reviews a new hand-added page inside a generated directory", () => {
    const { files } = collectChanges("base", "HEAD", { cwd: repo });
    const sneaky = files.find((f) => f.path === "pulsern/public/learn/sneaky/index.html");
    expect(sneaky).toBeDefined();
    expect(sneaky.diff).toContain("A page no generator writes");
  });

  it("shows an injected script in a generated page's digest", () => {
    const { files } = collectChanges("base", "HEAD", { cwd: repo });
    const page = files.find((f) => f.path === "pulsern/public/learn/bow-tie/index.html");
    expect(page.form).toBe("page digest");
    expect(page.diff).toContain(`+TAG ${JSON.stringify('<script src="https://evil.example/x.js">')}`);
    expect(page.diff).toContain(`-TEXT ${JSON.stringify("Old guide text.")}`);
    expect(page.diff).toContain(`+TEXT ${JSON.stringify("New guide text.")}`);
  });

  it("shows a swapped download source in the lockfile summary", () => {
    const { files } = collectChanges("base", "HEAD", { cwd: repo });
    const lock = files.find((f) => f.path === "pulsern/package-lock.json");
    expect(lock.form).toBe("dependency summary");
    expect(lock.diff).toMatch(/^\+left-pad .*"resolved":"https:\/\/evil\.example\/left-pad-1\.0\.0\.tgz"/m);
  });
});

describe("digests", () => {
  it("captures what a reader sees and what a browser runs", () => {
    const d = pageDigest(`<title>T</title><meta name="description" content="D"><script type="application/ld+json">{"a":1}</script><script>alert(1)</script><a href="/x" onclick="steal()">go</a><iframe src="https://x"></iframe><p>Body &amp; text</p>`);
    expect(d).toContain('TEXT "T"');
    expect(d).toContain(`TAG ${JSON.stringify('<meta name="description" content="D">')}`);
    expect(d).toContain('SCRIPT-BODY "{\\"a\\":1}"');
    expect(d).toContain('SCRIPT-BODY "alert(1)"');
    expect(d).toContain(`TAG ${JSON.stringify('<a href="/x" onclick="steal()">')}`);
    expect(d).toContain(`TAG ${JSON.stringify('<iframe src="https://x">')}`);
    expect(d).toContain('TEXT "Body &amp; text"');
  });

  /* PR #133 review, finding 2: an unquoted script source with an empty
     body produced no digest change at all. */
  it("shows an added script however it is written", () => {
    const before = "<html><body><p>Hello</p></body></html>";
    for (const tag of ["<script src=https://evil.example/p.js></script>", "<SCRIPT SRC='//evil.example/p.js'></SCRIPT>", "<img src=x onerror=alert(1)>", "<link rel=preload href=//evil.example/x.js as=script>"]) {
      const after = before.replace("</body>", `${tag}</body>`);
      const diff = textDiff(pageDigest(before), pageDigest(after), "page.html");
      expect(diff, tag).not.toBe("");
      expect(diff, tag).toContain(tag.includes("evil") ? "evil.example" : "onerror=alert(1)");
    }
  });

  it("shows a changed attribute, a changed style and a changed comment", () => {
    const base = '<div class="a" data-x=1><style>.a{color:red}</style><!-- note --></div>';
    expect(textDiff(pageDigest(base), pageDigest(base.replace("data-x=1", "data-x=2")), "p")).not.toBe("");
    expect(textDiff(pageDigest(base), pageDigest(base.replace("color:red", "background:url(//x)")), "p")).not.toBe("");
    expect(textDiff(pageDigest(base), pageDigest(base.replace("note", "[if IE]><script src=x></script><![endif]")), "p")).not.toBe("");
  });

  /* PR #134 review, finding 3: whitespace inside code is behaviour. */
  it("shows a newline that activates commented-out code", () => {
    const a = "<script>// disabled alert(1)</script>", b = "<script>// disabled\nalert(1)</script>";
    expect(textDiff(pageDigest(a), pageDigest(b), "p")).not.toBe("");
  });
  it("shows a whitespace change that alters automatic semicolon insertion", () => {
    const a = "<script>return\n42</script>", b = "<script>return 42</script>";
    expect(textDiff(pageDigest(a), pageDigest(b), "p")).not.toBe("");
  });
  it("keeps quoted attribute values exactly", () => {
    const a = '<a onclick="x()// y\nz()">go</a>', b = '<a onclick="x()// y z()">go</a>';
    expect(textDiff(pageDigest(a), pageDigest(b), "p")).not.toBe("");
    expect(textDiff(pageDigest('<p title="a  b">x</p>'), pageDigest('<p title="a b">x</p>'), "p")).not.toBe("");
  });
  /* PR #134 review (round 3): replacements over the whole tag rewrote
     quoted code, so "= =" and "==" digested the same. */
  it("keeps every character of a quoted handler, including around =", () => {
    const a = '<a onclick="if (1 = = 1) alert(1)">x</a>', b = '<a onclick="if (1 == 1) alert(1)">x</a>';
    expect(pageDigest(a)).not.toBe(pageDigest(b));
    expect(textDiff(pageDigest(a), pageDigest(b), "p")).not.toBe("");
  });
  it("shows that handler change end to end, through a real git change", () => {
    const dir = mkdtempSync(join(tmpdir(), "astra-eq-"));
    const run = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
    run("init", "-q"); run("config", "user.email", "t@t"); run("config", "user.name", "t");
    const page = "pulsern/public/learn/x/index.html";
    mkdirSync(join(dir, "pulsern/public/learn/x"), { recursive: true });
    writeFileSync(join(dir, page), '<p><a onclick="if (1 = = 1) alert(1)">x</a></p>');
    run("add", "-A"); run("commit", "-qm", "base"); run("tag", "b");
    writeFileSync(join(dir, page), '<p><a onclick="if (1 == 1) alert(1)">x</a></p>');
    run("add", "-A"); run("commit", "-qm", "head");
    const { files } = collectChanges("b", "HEAD", { cwd: dir });
    const f = files.find((x) => x.path === page);
    expect(f.form).toBe("page digest");
    expect(f.diff).toContain("1 == 1");
    rmSync(dir, { recursive: true, force: true });
  });

  /* Round 4: one space inside an UNQUOTED attribute moves its boundary —
     "onerror=window.x =alert(1)" runs nothing, "...x=alert(1)" runs alert.
     Tags are therefore kept byte-for-byte; only text is normalised. */
  it("shows a one-space change inside a tag that moves an unquoted attribute boundary", () => {
    const a = "<img src=x onerror=window.x =alert(1)>", b = "<img src=x onerror=window.x=alert(1)>";
    expect(pageDigest(a)).not.toBe(pageDigest(b));
    const dir = mkdtempSync(join(tmpdir(), "astra-ws-"));
    const run = (...x) => execFileSync("git", x, { cwd: dir, encoding: "utf8" });
    run("init", "-q"); run("config", "user.email", "t@t"); run("config", "user.name", "t");
    const page = "pulsern/public/learn/y/index.html";
    mkdirSync(join(dir, "pulsern/public/learn/y"), { recursive: true });
    writeFileSync(join(dir, page), `<p>${a}</p>`); run("add", "-A"); run("commit", "-qm", "b"); run("tag", "b");
    writeFileSync(join(dir, page), `<p>${b}</p>`); run("add", "-A"); run("commit", "-qm", "h");
    const f = collectChanges("b", "HEAD", { cwd: dir }).files.find((x) => x.path === page);
    expect(f.diff).toContain("window.x=alert(1)");
    rmSync(dir, { recursive: true, force: true });
  });
  /* Round 5: nothing is normalised any more — a false "</scriptx>"
     turned code into "text", and text whitespace was then collapsed. */
  it("shows code activated behind a false </scriptx> close, end to end", () => {
    const a = "<script>/* </scriptx> */ // disabled alert(1)</script>";
    const b = "<script>/* </scriptx> */ // disabled\nalert(1)</script>";
    expect(pageDigest(a)).not.toBe(pageDigest(b));
    const dir = mkdtempSync(join(tmpdir(), "astra-sx-"));
    const run = (...x) => execFileSync("git", x, { cwd: dir, encoding: "utf8" });
    run("init", "-q"); run("config", "user.email", "t@t"); run("config", "user.name", "t");
    const page = "pulsern/public/learn/z/index.html";
    mkdirSync(join(dir, "pulsern/public/learn/z"), { recursive: true });
    writeFileSync(join(dir, page), a); run("add", "-A"); run("commit", "-qm", "b"); run("tag", "b");
    writeFileSync(join(dir, page), b); run("add", "-A"); run("commit", "-qm", "h");
    const f = collectChanges("b", "HEAD", { cwd: dir }).files.find((x) => x.path === page);
    expect(f.diff).toContain("disabled\\nalert(1)");
    rmSync(dir, { recursive: true, force: true });
  });
  /* Round 7: git treated a source file with a NUL in a comment as binary,
     and its diff became one "Binary files differ" line. */
  it("shows every change in a source file git would call binary, even when too big to attach", () => {
    const dir = mkdtempSync(join(tmpdir(), "astra-bin-"));
    const run = (...x) => execFileSync("git", x, { cwd: dir, encoding: "utf8" });
    run("init", "-q"); run("config", "user.email", "t@t"); run("config", "user.name", "t");
    mkdirSync(join(dir, "pulsern/src"), { recursive: true });
    const file = "pulsern/src/app.js";
    const pad = "// " + "x".repeat(70_000) + "\n";
    writeFileSync(join(dir, file), `/* \u0000 */\n${pad}export const dose = () => 1;\n`);
    run("add", "-A"); run("commit", "-qm", "b"); run("tag", "b");
    writeFileSync(join(dir, file), `/* \u0000 */\n${pad}export const dose = () => 1000;\n`);
    run("add", "-A"); run("commit", "-qm", "h");
    const f = collectChanges("b", "HEAD", { cwd: dir }).files.find((x) => x.path === file);
    expect(f.form).toBe("diff");
    expect(f.diff).not.toMatch(/Binary files/);
    expect(f.diff).toContain("+export const dose = () => 1000;");
    expect(f.diff).toContain("⟦U+0000⟧");
    expect(f.full.length).toBeGreaterThan(MAX_FULL_FILE_CHARS);   // too big to attach: the diff alone must carry it
    rmSync(dir, { recursive: true, force: true });
  });
  /* Rounds 8 and 9: what reaches the reviewer is decided by bytes, decoded
     exactly, and shown one-to-one. (Characters are built with
     String.fromCodePoint so this file itself holds no invisible ones.) */
  describe("changes are judged by their bytes", () => {
    const ch = (cp) => String.fromCodePoint(cp);
    const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
      const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
      return Buffer.concat([len, body, sum]);
    };
    const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrOf = (colour, depth = 8) => { const h = Buffer.alloc(13); h.writeUInt32BE(1, 0); h.writeUInt32BE(1, 4); h[8] = depth; h[9] = colour; return chunk("IHDR", h); };
    /* A canonical 1x1 RGB PNG whose one pixel is (n, n, n). */
    const PNG = (n) => encodeCanonicalPng({ width: 1, height: 1, colour: 2, pixels: Buffer.from([n, n, n]) });
    /* The same pixels as an ordinary encoder writes them: decodable, valid,
       but not canonical. */
    const libPng = (n) => Buffer.concat([SIG, ihdrOf(2), chunk("IDAT", deflateSync(Buffer.from([0, n, n, n]))), chunk("IEND", Buffer.alloc(0))]);
    /* A chunk inserted right after IHDR (8-byte signature + 25-byte IHDR). */
    const afterIhdr = (png, type, data) => Buffer.concat([png.subarray(0, 33), chunk(type, data), png.subarray(33)]);
    /* The same pixels with a chunk added just before IEND. */
    const withChunk = (png, type, data) => Buffer.concat([png.subarray(0, png.length - 12), chunk(type, data), png.subarray(png.length - 12)]);
    const secret = Buffer.from("Comment\0SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiJ9.service");
    /* Valid zlib data with bytes after the end of the stream. */
    const trailingIdat = (n) => {
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
      const z = Buffer.concat([deflateSync(Buffer.from([0, n, n, n])), Buffer.from("patient: Jane Doe")]);
      return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", z), chunk("IEND", Buffer.alloc(0))]);
    };
    function repoWith(changes) {
      const dir = mkdtempSync(join(tmpdir(), "astra-bytes-"));
      const run = (...x) => execFileSync("git", x, { cwd: dir, encoding: "utf8" });
      run("init", "-q"); run("config", "user.email", "t@t"); run("config", "user.name", "t");
      const put = (path, body) => {
        const full = Buffer.concat([Buffer.from(dir + "/"), Buffer.isBuffer(path) ? path : Buffer.from(path)]);
        mkdirSync(join(dir, String(path).split("/").slice(0, -1).join("/")), { recursive: true });
        writeFileSync(full, body);
      };
      writeFileSync(join(dir, "keep"), "x");
      for (const [path, a] of changes) if (a != null) put(path, a);
      run("add", "-A"); run("commit", "-qm", "b"); run("tag", "b");
      for (const [path, , b] of changes) put(path, b);
      run("add", "-A"); run("commit", "-qm", "h");
      return dir;
    }
    const ok = (findings = []) => ({ text: JSON.stringify({ assessment: "ok", findings }), usage: {}, model: "m" });

    /* Through the production adapter, with only the HTTP boundary faked:
       the request that leaves must carry both versions of the image. */
    it("sends both versions of a changed image in the actual review request", async () => {
      const path = "pulsern/public/diagram.png";
      const dir = repoWith([[path, PNG(10), PNG(200)]]);
      const sent = [];
      const realFetch = globalThis.fetch, realKey = process.env.OPENROUTER_API_KEY;
      process.env.OPENROUTER_API_KEY = "test-key";
      globalThis.fetch = async (url, init) => {
        sent.push(JSON.parse(init.body));
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ model: "openai/gpt-6-astra", choices: [{ message: { content: JSON.stringify({ assessment: "ok", findings: [] }) } }], usage: { cost: 0 } }) };
      };
      try {
        const outDir = mkdtempSync(join(tmpdir(), "astra-out-"));
        const { report } = await runReview({ base: "b", head: "HEAD", outDir, rulesPath: "CLAUDE.md", cwd: dir });
        expect(report.error, report.error).toBeNull();
      } finally {
        globalThis.fetch = realFetch;
        if (realKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = realKey;
        rmSync(dir, { recursive: true, force: true });
      }
      expect(sent).toHaveLength(1);
      const content = sent[0].messages[0].content;
      expect(Array.isArray(content)).toBe(true);
      const urls = content.filter((c) => c.type === "image_url").map((c) => c.image_url.url);
      expect(urls).toEqual([`data:image/png;base64,${PNG(10).toString("base64")}`, `data:image/png;base64,${PNG(200).toString("base64")}`]);
      const labels = content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
      expect(labels).toContain(createHash("sha256").update(PNG(200)).digest("hex"));
      expect(content[0].text).toContain("(image)");
    });

    it("diffs text stored under an image name", () => {
      const path = "pulsern/public/notes.png";
      const dir = repoWith([[path, "dose: 1 mg\n", "dose: 10 mg\n"]]);
      const f = collectChanges("b", "HEAD", { cwd: dir }).files.find((x) => x.path === path);
      expect(f.form).toBe("diff");
      expect(f.diff).toContain("+dose: 10 mg");
      rmSync(dir, { recursive: true, force: true });
    });

    it("refuses what it cannot show, and never asks the model", async () => {
      const html = Buffer.concat([PNG(1), Buffer.from("<script>fetch('/steal')</script>")]);
      for (const [path, a, b] of [
        ["pulsern/public/clip.mp3", Buffer.from([0xff, 0xfb, 0x90, 1, 2, 3]), Buffer.from([0xff, 0xfb, 0x90, 4, 5, 6])],
        ["pulsern/public/guide.pdf", Buffer.from("%PDF-1.7\n\xe2\xe3\xcf\xd3 a", "latin1"), Buffer.from("%PDF-1.7\n\xe2\xe3\xcf\xd3 b", "latin1")],
        ["pulsern/public/fake.png", Buffer.from([0x89, 0x50, 0, 1, 2]), Buffer.from([0x89, 0x50, 0, 9, 9, 9])],
        // Astra's case: valid pixels with a script appended, saved as a page
        ["pulsern/public/learn/example/index.html", null, html],
        ["pulsern/src/widget.js", null, html],
        // the same bytes under an image name: the extra bytes are refused too
        ["pulsern/public/tail.png", PNG(1), html],
        // a real PNG under another image name
        ["pulsern/public/photo.jpg", PNG(1), PNG(2)],
        // round 10: the pixels are identical, only metadata changed — a
        // secret in a text chunk with a valid CRC, then the same in EXIF
        ["pulsern/public/same.png", PNG(1), withChunk(PNG(1), "tEXt", secret)],
        ["pulsern/public/exif.png", PNG(1), withChunk(PNG(1), "eXIf", secret)],
        ["pulsern/public/private.png", PNG(1), withChunk(PNG(1), "prVt", secret)],
        // bytes hidden after the end of the compressed image data
        ["pulsern/public/idat.png", PNG(1), trailingIdat(1)],
        // round 11, Astra's case: a "suggested palette" in an RGB PNG is
        // never drawn, so a key padded to a palette length hides there
        ["pulsern/public/plte.png", PNG(1), afterIhdr(PNG(1), "PLTE", Buffer.concat([secret, Buffer.alloc((3 - (secret.length % 3)) % 3)]))],
        // the colour of a fully transparent pixel is never drawn either
        ["pulsern/public/alpha.png", PNG(1), Buffer.concat([SIG, ihdrOf(6), chunk("IDAT", canonicalDeflate(Buffer.from([0, 0x4b, 0x45, 0x59, 0]))), chunk("IEND", Buffer.alloc(0))])],
        // 16-bit samples: the low byte does not show on screen
        ["pulsern/public/deep.png", PNG(1), Buffer.concat([SIG, ihdrOf(2, 16), chunk("IDAT", canonicalDeflate(Buffer.from([0, 1, 0x4b, 1, 0x45, 1, 0x59]))), chunk("IEND", Buffer.alloc(0))])],
        // same pixels, ordinary encoder: compression choices can carry bits
        ["pulsern/public/lib.png", PNG(1), libPng(2)],
        // WebP is no longer accepted at all
        ["pulsern/public/pic.webp", null, Buffer.concat([Buffer.from("RIFF"), Buffer.from([16, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.from([4, 0, 0, 0, 0x9d, 0x01, 0x2a, 0xff])])],
      ]) {
        const dir = repoWith([[path, a, b]]);
        expect(() => collectChanges("b", "HEAD", { cwd: dir }), path).toThrow(/cannot pass/);
        const outDir = mkdtempSync(join(tmpdir(), "astra-out-"));
        let called = false;
        const { code, report } = await runReview({ base: "b", head: "HEAD", outDir, rulesPath: "CLAUDE.md", cwd: dir }, { callModel: async () => { called = true; return ok(); } });
        expect(called, path).toBe(false);
        expect(report.verdict, path).toBe("FAIL");
        expect(code, path).not.toBe(0);
        rmSync(dir, { recursive: true, force: true });
      }
    }, 60000);

    /* Round 8, Astra's case: a windows-1252 page whose script compares 0xE9
       with 0xEA, changed to compare 0xE9 with 0xE9. */
    it("refuses a page whose bytes are not valid UTF-8 instead of digesting replacement characters", () => {
      const page = (x) => Buffer.concat([Buffer.from('<meta charset="windows-1252"><script>if ("'), Buffer.from([0xe9]), Buffer.from('" === "'), Buffer.from([x]), Buffer.from('") go()</script>')]);
      const path = "pulsern/public/learn/z/index.html";
      const dir = repoWith([[path, page(0xea), page(0xe9)]]);
      expect(() => collectChanges("b", "HEAD", { cwd: dir })).toThrow(/learn\/z\/index\.html/);
      rmSync(dir, { recursive: true, force: true });
    });

    /* Round 9: a name with an invalid byte was decoded lossily, the read of
       that "other" path failed quietly, and the file reached review empty. */
    it("refuses a changed path whose name is not valid UTF-8", () => {
      const name = Buffer.concat([Buffer.from("pulsern/src/a"), Buffer.from([0xff]), Buffer.from(".js")]);
      const dir = repoWith([[name, null, "export const dose = 1000;\n"]]);
      expect(() => collectChanges("b", "HEAD", { cwd: dir })).toThrow(/path is not valid UTF-8/);
      rmSync(dir, { recursive: true, force: true });
    });

    it("reads paths literally: a name with glob characters shows only its own change", () => {
      const dir = repoWith([["pulsern/src/*.js", "a = 1;\n", "a = 2;\n"], ["pulsern/src/x.js", "x = 1;\n", "x = 2;\n"]]);
      const files = collectChanges("b", "HEAD", { cwd: dir }).files;
      const star = files.find((f) => f.path === "pulsern/src/*.js");
      expect(star.diff).toContain("+a = 2;");
      expect(star.diff).not.toContain("x = 2");
      rmSync(dir, { recursive: true, force: true });
    });

    /* Round 9, Astra's case: a line comment ending in the six characters
       \u{2028} keeps the call commented out; an actual U+2028 ends the
       comment and the call runs. The two must not look the same. */
    it("keeps a literal escape and the real character apart, end to end", () => {
      const LS = ch(0x2028);
      const before = "let r = 0; // note \\u{2028} r = 1;\nexport default r;\n";
      const after = `let r = 0; // note ${LS} r = 1;\nexport default r;\n`;
      const run = (src) => new Function(src.replace("export default r;", "return r;"))();
      expect(run(before)).toBe(0);
      expect(run(after)).toBe(1);
      const path = "pulsern/src/flag.js";
      const dir = repoWith([[path, before, after]]);
      const f = collectChanges("b", "HEAD", { cwd: dir }).files.find((x) => x.path === path);
      const minus = f.diff.split("\n").find((l) => l.startsWith("-let"));
      const plus = f.diff.split("\n").find((l) => l.startsWith("+let"));
      expect(minus.slice(1)).not.toBe(plus.slice(1));
      expect(plus).toContain("⟦U+2028⟧");
      expect(f.full).toContain("⟦U+2028⟧");
      expect(f.full).not.toContain(LS);
      rmSync(dir, { recursive: true, force: true });
    });

    it("encodes one-to-one: nothing typed in a file can pass for an invisible character", () => {
      const samples = [
        `${ch(0x2028)}`, "\\u{2028}", "⟦U+2028⟧", "⟦U+27E6⟧",
        `${ch(0xfeff)}a${ch(0x202e)}b${ch(0x200b)}c${ch(0xe0041)}${ch(0)}${ch(13)}`,
      ];
      const shown = samples.map(reviewText);
      expect(new Set(shown).size).toBe(samples.length);
      for (const [i, s] of samples.entries()) expect(fromReviewText(shown[i])).toBe(s);
      expect(reviewText(`${ch(0xfeff)}a${ch(0x202e)}b`)).toBe("⟦U+FEFF⟧a⟦U+202E⟧b");
      // nothing invisible survives
      expect(shown.join("")).not.toMatch(new RegExp(`[${ch(0x2028)}${ch(0xfeff)}${ch(0x202e)}${ch(0x200b)}${ch(0)}${ch(13)}]`));
    });

    it("decodes exactly: invalid bytes are rejected and a byte-order mark is kept", () => {
      expect(exactText(Buffer.from([0x61, 0xe9]))).toBeUndefined();
      expect(exactText(Buffer.from([0xef, 0xbb, 0xbf, 0x61]))).toBe(`${ch(0xfeff)}a`);
      expect(exactText(null)).toBeNull();
    });

    it("accepts only the canonical PNG of the pixels, under its own extension", () => {
      expect(reviewableImage("a/b.png", PNG(1))).toBe("image/png");
      expect(reviewableImage("a/b.PNG", PNG(1))).toBe("image/png");
      expect(reviewableImage("a/b.html", PNG(1))).toBeNull();
      expect(reviewableImage("a/b.png", Buffer.concat([PNG(1), Buffer.from("x")]))).toBeNull();
      const bad = PNG(1); bad[bad.length - 20] ^= 1;
      expect(reviewableImage("a/b.png", bad)).toBeNull();
      // a valid PNG from an ordinary encoder is refused until canonicalised
      expect(reviewableImage("a/b.png", libPng(7))).toBeNull();
      expect(canonicalPng(libPng(7)).equals(PNG(7))).toBe(true);
      expect(reviewableImage("a/b.png", canonicalPng(libPng(7)))).toBe("image/png");
      // even a harmless pixel-description chunk is refused: one file per image
      expect(reviewableImage("a/b.png", withChunk(PNG(1), "pHYs", Buffer.from([0, 0, 11, 19, 0, 0, 11, 19, 1])))).toBeNull();
      expect(reviewableImage("a/b.png", withChunk(PNG(1), "tEXt", secret))).toBeNull();
      expect(reviewableImage("a/b.png", trailingIdat(1))).toBeNull();
    });
  });

  it("is lossless: any byte that changes shows", () => {
    for (const [a, b] of [["<p>Hi  there</p>", "<p>Hi there</p>"], ["<p>x</p>", "<p>x</p>\n"], ["<b>a</b>", "<b >a</b>"]]) {
      expect(pageDigest(a), `${a} vs ${b}`).not.toBe(pageDigest(b));
    }
  });

  /* PR #133 review, finding 3: a git dependency moved to another commit at
     the same version, with no integrity field, was invisible. */
  it("shows a git dependency moved to a different commit", () => {
    const lock = (rev) => JSON.stringify({ packages: { "": { name: "x" }, "node_modules/pkg": { version: "1.0.0", resolved: `git+ssh://git@github.com/org/pkg.git#${rev}` } } });
    expect(textDiff(lockDigest(lock("aaaa1111")), lockDigest(lock("bbbb2222")), "package-lock.json")).toContain("bbbb2222");
  });

  /* Round 4: dev/optional flags decide whether npm installs a package
     (and runs its install script) under --omit=dev. */
  it.each([["dev", { dev: true }, {}], ["optional", { optional: true }, {}], ["devOptional", { devOptional: true }, {}]])(
    "shows a change to the %s flag", (_, before, after) => {
      const lock = (flags) => JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/p": { version: "1.0.0", hasInstallScript: true, ...flags } } });
      expect(textDiff(lockDigest(lock(before)), lockDigest(lock(after)), "l")).not.toBe("");
    });
  it("shows a change to any top-level lockfile field", () => {
    const a = JSON.stringify({ lockfileVersion: 3, requires: true, packages: {} });
    expect(textDiff(lockDigest(a), lockDigest(a.replace("true", "false")), "l")).not.toBe("");
  });
  it("is deterministic whatever order npm writes keys in", () => {
    const a = JSON.stringify({ packages: { "node_modules/p": { version: "1", dev: true } } });
    const b = JSON.stringify({ packages: { "node_modules/p": { dev: true, version: "1" } } });
    expect(lockDigest(a)).toBe(lockDigest(b));
  });

  it("shows a changed integrity hash in full and a new install script", () => {
    const lock = (integ, scripts) => JSON.stringify({ packages: { "node_modules/p": { version: "1.0.0", resolved: "https://registry.npmjs.org/p/-/p-1.0.0.tgz", integrity: integ, ...(scripts ? { hasInstallScript: true } : {}) } } });
    const a = "sha512-" + "A".repeat(80), b = "sha512-" + "A".repeat(60) + "B".repeat(20);
    expect(textDiff(lockDigest(lock(a)), lockDigest(lock(b)), "l")).not.toBe("");
    expect(textDiff(lockDigest(lock(a)), lockDigest(lock(a, true)), "l")).toContain("hasInstallScript");
  });

  it("reports a lockfile it cannot read instead of passing it as empty", () => {
    expect(lockDigest("{not json")).toBe("UNPARSEABLE package-lock.json\n");
  });

  it("produces no diff when nothing meaningful changed", () => {
    expect(textDiff("a\nb\n", "a\nb\n", "x")).toBe("");
  });
});

describe("fitting a change into one review", () => {
  const file = (path, diffLen, fullLen) => ({ path, status: "M", diff: "d".repeat(diffLen), full: fullLen == null ? null : "f".repeat(fullLen) });

  it("keeps every diff and adds whole files while there is room", () => {
    const plan = planContext([file("a", 100, 500), file("b", 100, 400)], 10_000);
    expect(plan.files.every((f) => f.includeFull)).toBe(true);
  });
  it("sheds whole-file context, smallest-first, before ever dropping a diff", () => {
    const plan = planContext([file("big", 100, 5000), file("small", 100, 300)], 1000);
    expect(plan.files.find((f) => f.path === "small").includeFull).toBe(true);
    expect(plan.files.find((f) => f.path === "big").includeFull).toBe(false);
  });
  it("refuses when the diffs alone exceed the budget", () => {
    const plan = planContext([file("a", 600, null), file("b", 600, null)], 1000);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/over the 1,000-character review budget/);
  });
  it("counts fixed overhead against the budget", () => {
    expect(planContext([file("a", 500, null)], 1000, 600).ok).toBe(false);
  });
  it("never attaches a file over the per-file limit", () => {
    expect(planContext([file("huge", 10, MAX_FULL_FILE_CHARS + 1)], 10_000_000).files[0].includeFull).toBe(false);
  });
});

describe("the prompt", () => {
  const files = [{ path: "pulsern/src/ngn.js", status: "M", form: "diff", diff: "+new line", full: "whole file", includeFull: true }];
  const p = buildPrompt({ rules: "RULE: the approval gate is sacred", files, skipped: [{ path: "pulsern/reports/astra/x.md", why: "earlier review reports" }], meta: { base: "b", head: "h", pr: "9" } });
  it("judges against the project's own rules", () => { expect(p).toContain("RULE: the approval gate is sacred"); });
  it("tells the reviewer who wrote the code", () => { expect(p).toMatch(/written by a Claude model/); });
  it("names what was not sent", () => { expect(p).toContain("pulsern/reports/astra/x.md [earlier review reports]"); });
  it("sends the diff, the whole file, and the form", () => { expect(p).toContain("+new line"); expect(p).toContain("whole file"); expect(p).toContain("(diff)"); });
  it("tells the reviewer to attack the tests and to look for review bypasses", () => {
    expect(p).toMatch(/test that cannot fail/);
    expect(p).toMatch(/bypass this review/);
  });
});

describe("reading the answer", () => {
  it("accepts a well-formed review", () => { expect(() => validateResult({ assessment: "ok", findings: [finding("minor")] })).not.toThrow(); });
  it("rejects an unknown severity", () => { expect(() => validateResult({ assessment: "ok", findings: [finding("critical")] })).toThrow(/invalid severity/); });
  it("rejects a finding with no file or fix", () => {
    expect(() => validateResult({ assessment: "ok", findings: [finding("major", { file: "" })] })).toThrow(/missing file/);
    expect(() => validateResult({ assessment: "ok", findings: [finding("major", { fix: " " })] })).toThrow(/missing fix/);
  });
  it("rejects an answer with no findings array", () => { expect(() => validateResult({ assessment: "looks good" })).toThrow(/no findings/); });
  it("asks for a strict schema", () => {
    expect(FINDINGS_SCHEMA.json_schema.strict).toBe(true);
    expect(FINDINGS_SCHEMA.json_schema.schema.additionalProperties).toBe(false);
  });
});

describe("the verdict is arithmetic, not opinion", () => {
  it("fails on any blocker", () => { expect(verdictFor([finding("blocker")]).verdict).toBe("FAIL"); });
  it("fails on any major", () => { expect(verdictFor([finding("minor"), finding("major")]).verdict).toBe("FAIL"); });
  it("passes with only minors", () => { expect(verdictFor([finding("minor")]).verdict).toBe("PASS"); });
  it("passes with none", () => { expect(verdictFor([])).toEqual({ verdict: "PASS", counts: { blocker: 0, major: 0, minor: 0 } }); });
});

describe("running a review end to end (Astra finding #5)", () => {
  const out = () => mkdtempSync(join(tmpdir(), "astra-out-"));
  const opts = (outDir) => ({ base: "base", head: "HEAD", pr: "7", outDir, rulesPath: "CLAUDE.md", cwd: repo, mode: "trusted", now: () => new Date("2026-10-08T21:00:00Z") });

  /* The paid call never returns — what a cancelled or timed-out run looks
     like from inside. A report must already exist, and say it did not finish. */
  it("writes a failure checkpoint before the paid call starts", async () => {
    const dir = out();
    let release;
    const pending = runReview(opts(dir), { callModel: () => new Promise((r) => { release = r; }) });
    await new Promise((r) => setTimeout(r, 50));
    const md = readFileSync(join(dir, "2026-10-08-pr7-" + g("rev-parse", "HEAD").trim().slice(0, 7) + ".md"), "utf8");
    expect(md).toContain("# Astra review — FAIL");
    expect(md).toContain("did not finish");
    release({ text: JSON.stringify({ assessment: "ok", findings: [] }), usage: { costUsd: 0.1 }, model: "openai/gpt-6-astra" });
    await pending;
  });

  it("replaces the checkpoint with the real verdict when the call completes", async () => {
    const dir = out();
    const { code, report } = await runReview(opts(dir), { callModel: async () => ({ text: JSON.stringify({ assessment: "clean", findings: [] }), usage: { costUsd: 0.5 }, model: "openai/gpt-6-astra" }) });
    expect(code).toBe(0);
    expect(report.verdict).toBe("PASS");
    const [md] = readdirSync(dir).filter((f) => f.endsWith(".md"));
    const text = readFileSync(join(dir, md), "utf8");
    expect(text).toContain("# Astra review — PASS");
    expect(text).not.toContain("did not finish");
  });

  it("sends every PulseRN change — including the awkward names — to the model", async () => {
    const dir = out();
    let prompt = "";
    await runReview(opts(dir), { callModel: async (a) => { prompt = a.prompt; return { text: JSON.stringify({ assessment: "x", findings: [] }), usage: {}, model: "m" }; } });
    expect(prompt).toContain("pulsern/public/révision.html");
    expect(prompt).toContain("pulsern/public/learn/sneaky/index.html");
    expect(prompt).toContain(`+TAG ${JSON.stringify('<script src="https://evil.example/x.js">')}`);
    expect(prompt).not.toContain("fullburn/x.js");
  });

  it("fails, and keeps the raw answer, when the model's answer cannot be read", async () => {
    const dir = out();
    const { code, report } = await runReview(opts(dir), { callModel: async () => ({ text: "not json", usage: {}, model: "m" }) });
    expect(code).toBe(2);
    expect(report.rawAnswer).toBe("not json");
    expect(existsSync(dir)).toBe(true);
  });

  it("fails on findings regardless of a cheerful assessment", async () => {
    const dir = out();
    const { code } = await runReview(opts(dir), { callModel: async () => ({ text: JSON.stringify({ assessment: "Looks great!", findings: [finding("major")] }), usage: {}, model: "m" }) });
    expect(code).toBe(1);
  });
});

describe("the saved report", () => {
  const base = {
    model: "openai/gpt-6-astra", mode: "trusted", meta: { base: "a".repeat(40), head: "b".repeat(40), pr: "12" },
    reviewedAt: "2026-10-08T20:00:00.000Z", filesReviewed: ["pulsern/src/x.js"], skipped: [],
    usage: { costUsd: 0.4123, promptTokens: 30000, completionTokens: 2000 },
  };
  it("leads with the verdict and records the cost", () => {
    const md = renderMarkdown({ ...base, verdict: "FAIL", counts: { blocker: 1, major: 0, minor: 0 }, assessment: "a", findings: [finding("blocker")] });
    expect(md.split("\n")[0]).toBe("# Astra review — FAIL");
    expect(md).toContain("$0.4123");
  });
  it("says the change was read as data by the trusted reviewer", () => {
    const md = renderMarkdown({ ...base, verdict: "PASS", counts: { blocker: 0, major: 0, minor: 0 }, assessment: "", findings: [] });
    expect(md).toContain("run from the base branch; the change was read as data");
  });
  it("lists blockers before minors", () => {
    const md = renderMarkdown({ ...base, verdict: "FAIL", counts: { blocker: 1, major: 0, minor: 1 }, assessment: "a", findings: [finding("minor", { title: "small thing" }), finding("blocker", { title: "big thing" })] });
    expect(md.indexOf("big thing")).toBeLessThan(md.indexOf("small thing"));
  });
  it("records a broken run as a failure", () => {
    const md = renderMarkdown({ ...base, verdict: "FAIL", error: "timeout", findings: [] });
    expect(md).toContain("an unfinished review is not a pass");
  });
  it("says unknown, never $0, when no cost was reported", () => {
    const md = renderMarkdown({ ...base, usage: null, verdict: "PASS", counts: { blocker: 0, major: 0, minor: 0 }, assessment: "", findings: [] });
    expect(md).toContain("| Cost | unknown |");
  });
  it("names reports by date, PR and head", () => {
    expect(reportBaseName({ head: "abcdef1234", pr: "12", reviewedAt: "2026-10-08T20:00:00Z" })).toBe("2026-10-08-pr12-abcdef1");
  });
});
