/* The reviewer's own logic.
   ------------------------------------------------------------------
   A review gate has three ways to give false assurance, and each has a test:

     - letting the model's prose decide the verdict, so "looks good" outvotes
       a blocker it listed;
     - quietly reviewing part of a change and reporting as if it were all;
     - judging files it should not (other projects) or wasting money on files
       that are machine output. */
import { describe, it, expect } from "vitest";
import {
  classifyPath, planContext, buildPrompt, validateResult, verdictFor,
  renderMarkdown, reportBaseName, FINDINGS_SCHEMA, MAX_FULL_FILE_CHARS,
} from "../ops/astra-review.mjs";

const finding = (severity, extra = {}) => ({
  severity, file: "pulsern/src/x.js", line: 3, title: "t", problem: "p",
  failure_scenario: "f", fix: "fx", confidence: "high", ...extra,
});

describe("scope", () => {
  it("reviews PulseRN source and its own workflows", () => {
    expect(classifyPath("pulsern/src/ngn.js").include).toBe(true);
    expect(classifyPath("pulsern/ops/llm.mjs").include).toBe(true);
    expect(classifyPath(".github/workflows/pulsern-astra-review.yml").include).toBe(true);
  });

  /* Owner's rule: no cross-contamination. The reviewer neither reads nor
     judges another project's files. */
  it("never touches another project", () => {
    expect(classifyPath("fullburn/engine/scripts/done.mjs")).toEqual({ include: false, why: "outside PulseRN" });
    expect(classifyPath("haven/app/page.tsx").include).toBe(false);
    expect(classifyPath(".github/workflows/fullburn-gates.yml").include).toBe(false);
    expect(classifyPath(".github/workflows/cross-family-read.yml").include).toBe(false);
  });

  it("skips machine output but says why, so the reviewer knows it changed", () => {
    expect(classifyPath("pulsern/package-lock.json")).toEqual({ include: false, why: "lockfile" });
    expect(classifyPath("pulsern/public/pricing/index.html").why).toMatch(/generator is reviewed/);
    expect(classifyPath("pulsern/reports/astra/2026-10-08-abc.md").why).toBe("earlier review reports");
  });

  /* The two files where a mistake costs most are hand-written HTML under
     public/: the owner dashboard and the review console that holds the
     approval gate. An earlier draft of this test asserted they were EXCLUDED
     — it passed, and it was endorsing the bug. */
  it("reviews the hand-written pages: owner dashboard, review console, about, legal", () => {
    for (const p of ["pulsern/public/owner/index.html", "pulsern/public/review/index.html",
                     "pulsern/public/about/index.html", "pulsern/public/legal/index.html", "pulsern/public/app-sw.js"]) {
      expect(classifyPath(p).include, p).toBe(true);
    }
  });

  it("skips every page a generator writes", () => {
    for (const p of ["pulsern/public/compare/pulsern-vs-uworld/index.html", "pulsern/public/learn/bow-tie-questions/index.html",
                     "pulsern/public/pricing/index.html", "pulsern/public/methodology/index.html", "pulsern/public/sitemap.xml"]) {
      expect(classifyPath(p).include, p).toBe(false);
    }
  });

  /* Keeps the exclusion list honest against the generators themselves: every
     directory they write must be excluded, and nothing else under public/. */
  it("matches the directories the generators actually write", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const pub = readFileSync("ops/build-public-pages.mjs", "utf8");
    const learn = readFileSync("ops/build-learn.mjs", "utf8");
    const generated = new Set([...pub.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]));
    if (/const OUT = "public\/learn"/.test(learn)) generated.add("learn");
    if (/COMMERCIAL_PAGES/.test(pub)) generated.add("compare");
    const htmlDirs = readdirSync("public", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
      .filter((d) => { try { return readdirSync(`public/${d}`).includes("index.html"); } catch { return false; } });
    for (const d of htmlDirs) {
      const excluded = !classifyPath(`pulsern/public/${d}/index.html`).include;
      expect(excluded, `public/${d}: generated=${generated.has(d)} excluded=${excluded}`).toBe(generated.has(d));
    }
  });
});

describe("fitting a change into one review", () => {
  const file = (path, diffLen, fullLen) => ({ path, status: "M", diff: "d".repeat(diffLen), full: fullLen == null ? null : "f".repeat(fullLen) });

  it("keeps every diff and adds whole files while there is room", () => {
    const plan = planContext([file("a", 100, 500), file("b", 100, 400)], 10_000);
    expect(plan.ok).toBe(true);
    expect(plan.files.every((f) => f.includeFull)).toBe(true);
  });

  it("sheds whole-file context, smallest-first, before ever dropping a diff", () => {
    const plan = planContext([file("big", 100, 5000), file("small", 100, 300)], 1000);
    expect(plan.ok).toBe(true);
    expect(plan.files.find((f) => f.path === "small").includeFull).toBe(true);
    expect(plan.files.find((f) => f.path === "big").includeFull).toBe(false);
  });

  /* The core guarantee: a diff that does not fit is a refusal, not a cut. */
  it("refuses when the diffs alone exceed the budget", () => {
    const plan = planContext([file("a", 600, null), file("b", 600, null)], 1000);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/over the 1,000-character review budget/);
  });

  it("counts fixed overhead (rules, instructions) against the budget", () => {
    expect(planContext([file("a", 500, null)], 1000, 600).ok).toBe(false);
  });

  it("never attaches a file over the per-file limit, however much room there is", () => {
    const plan = planContext([file("huge", 10, MAX_FULL_FILE_CHARS + 1)], 10_000_000);
    expect(plan.files[0].includeFull).toBe(false);
  });
});

describe("the prompt", () => {
  const files = [{ path: "pulsern/src/ngn.js", status: "M", diff: "+new line", full: "whole file", includeFull: true }];
  const p = buildPrompt({ rules: "RULE: the approval gate is sacred", files, excluded: [{ path: "pulsern/package-lock.json", why: "lockfile" }], meta: { base: "b", head: "h", pr: "9" } });

  it("judges against the project's own rules", () => {
    expect(p).toContain("RULE: the approval gate is sacred");
  });
  it("tells the reviewer who wrote the code, so it knows why it is there", () => {
    expect(p).toMatch(/written by a Claude model/);
  });
  it("names excluded files instead of hiding them", () => {
    expect(p).toContain("pulsern/package-lock.json [lockfile]");
  });
  it("sends both the diff and the whole file when planned", () => {
    expect(p).toContain("+new line");
    expect(p).toContain("whole file");
  });
  it("tells the reviewer to attack the tests too", () => {
    expect(p).toMatch(/test that cannot fail/);
  });
});

describe("reading the answer", () => {
  it("accepts a well-formed review", () => {
    expect(() => validateResult({ assessment: "ok", findings: [finding("minor")] })).not.toThrow();
  });

  /* A malformed finding silently dropped is a defect silently waved through. */
  it("rejects a finding with an unknown severity rather than ignoring it", () => {
    expect(() => validateResult({ assessment: "ok", findings: [finding("critical")] })).toThrow(/invalid severity/);
  });
  it("rejects a finding with no file or fix", () => {
    expect(() => validateResult({ assessment: "ok", findings: [finding("major", { file: "" })] })).toThrow(/missing file/);
    expect(() => validateResult({ assessment: "ok", findings: [finding("major", { fix: " " })] })).toThrow(/missing fix/);
  });
  it("rejects an answer with no findings array", () => {
    expect(() => validateResult({ assessment: "looks good" })).toThrow(/no findings/);
  });

  it("asks for a strict schema the model cannot wander from", () => {
    expect(FINDINGS_SCHEMA.json_schema.strict).toBe(true);
    expect(FINDINGS_SCHEMA.json_schema.schema.additionalProperties).toBe(false);
  });
});

describe("the verdict is arithmetic, not opinion", () => {
  it("fails on any blocker", () => {
    expect(verdictFor([finding("blocker")]).verdict).toBe("FAIL");
  });
  it("fails on any major", () => {
    expect(verdictFor([finding("minor"), finding("major")]).verdict).toBe("FAIL");
  });
  it("passes with only minor findings", () => {
    expect(verdictFor([finding("minor"), finding("minor")]).verdict).toBe("PASS");
  });
  it("passes with no findings", () => {
    expect(verdictFor([])).toEqual({ verdict: "PASS", counts: { blocker: 0, major: 0, minor: 0 } });
  });
});

describe("the saved report", () => {
  const base = {
    model: "openai/gpt-6-astra", meta: { base: "a".repeat(40), head: "b".repeat(40), pr: "12" },
    reviewedAt: "2026-10-08T20:00:00.000Z", filesReviewed: ["pulsern/src/x.js"], excluded: [],
    usage: { costUsd: 0.4123, promptTokens: 30000, completionTokens: 2000 },
  };

  it("leads with the verdict and records what it cost", () => {
    const md = renderMarkdown({ ...base, verdict: "FAIL", counts: { blocker: 1, major: 0, minor: 0 }, assessment: "a", findings: [finding("blocker")] });
    expect(md.split("\n")[0]).toBe("# Astra review — FAIL");
    expect(md).toContain("$0.4123");
    expect(md).toContain("1 blocker · 0 major · 0 minor");
  });

  it("lists blockers before minors whatever order they arrived in", () => {
    const md = renderMarkdown({ ...base, verdict: "FAIL", counts: { blocker: 1, major: 0, minor: 1 }, assessment: "a",
      findings: [finding("minor", { title: "small thing" }), finding("blocker", { title: "big thing" })] });
    expect(md.indexOf("big thing")).toBeLessThan(md.indexOf("small thing"));
  });

  /* An interrupted review is kept AND recorded as a failure. */
  it("records a broken run as a failure, not a pass", () => {
    const md = renderMarkdown({ ...base, verdict: "FAIL", error: "timeout", findings: [] });
    expect(md).toContain("The review did not complete");
    expect(md).toContain("an unfinished review is not a pass");
  });

  /* The bootstrap PR is judged by its own copy of the reviewer. That must be
     impossible to miss when reading the report. */
  it("flags a bootstrap review in bold, and names a trusted one plainly", () => {
    const boot = renderMarkdown({ ...base, mode: "bootstrap", verdict: "PASS", counts: { blocker: 0, major: 0, minor: 0 }, assessment: "", findings: [] });
    expect(boot).toContain("**bootstrap — this PR was reviewed by its own copy of the reviewer**");
    const trusted = renderMarkdown({ ...base, mode: "trusted", verdict: "PASS", counts: { blocker: 0, major: 0, minor: 0 }, assessment: "", findings: [] });
    expect(trusted).toContain("run from the base branch");
  });

  it("says unknown when the cost was not reported, never $0", () => {
    const md = renderMarkdown({ ...base, usage: null, verdict: "PASS", counts: { blocker: 0, major: 0, minor: 0 }, assessment: "", findings: [] });
    expect(md).toContain("| Cost | unknown |");
  });

  it("names reports so two reviews of the same commit cannot overwrite each other across days", () => {
    expect(reportBaseName({ head: "abcdef1234", pr: "12", reviewedAt: "2026-10-08T20:00:00Z" })).toBe("2026-10-08-pr12-abcdef1");
  });
});
