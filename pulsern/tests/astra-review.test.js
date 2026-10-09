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
import {
  classifyPath, planContext, buildPrompt, validateResult, verdictFor, renderMarkdown, reportBaseName,
  FINDINGS_SCHEMA, MAX_FULL_FILE_CHARS, pageDigest, lockDigest, textDiff, parseNameStatusZ,
  collectChanges, runReview,
} from "../ops/astra-review.mjs";

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
    expect(page.diff).toMatch(/^\+SCRIPT src=https:\/\/evil\.example\/x\.js$/m);
    expect(page.diff).toMatch(/^-TEXT Old guide text\.$/m);
    expect(page.diff).toMatch(/^\+TEXT New guide text\.$/m);
  });

  it("shows a swapped download source in the lockfile summary", () => {
    const { files } = collectChanges("base", "HEAD", { cwd: repo });
    const lock = files.find((f) => f.path === "pulsern/package-lock.json");
    expect(lock.form).toBe("dependency summary");
    expect(lock.diff).toMatch(/^\+left-pad@1\.0\.0 evil\.example /m);
  });
});

describe("digests", () => {
  it("captures what a reader sees and what a browser runs", () => {
    const d = pageDigest(`<title>T</title><meta name="description" content="D"><script type="application/ld+json">{"a":1}</script><script>alert(1)</script><a href="/x" onclick="steal()">go</a><iframe src="https://x"></iframe><p>Body &amp; text</p>`);
    expect(d).toContain("TITLE T");
    expect(d).toContain('JSON-LD {"a":1}');
    expect(d).toContain("SCRIPT inline alert(1)");
    expect(d).toContain("HREF /x");
    expect(d).toMatch(/HANDLER onclick="steal\(\)"/);
    expect(d).toContain("EMBED <iframe");
    expect(d).toContain("TEXT Body & text");
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
    expect(prompt).toContain("+SCRIPT src=https://evil.example/x.js");
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
