import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { PRODUCTION_ENDPOINT, READ_ADDENDUM, REVIEWER_MODEL, buildReviewRequest, bundleFiles, crossVerdict, nextCrossRound, parseReview, preflightRefusal, renderCrossReport, servedModelAcceptable } from "../scripts/cross-family-lib.mjs";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { checkAdversaryReport, selectPhaseReports } from "../scripts/gate-lib.mjs";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { isNonClaudeFamily, reviewerFamily } from "../scripts/done-lib.mjs";

/** THE CROSS-FAMILY READ'S DECISIONS, DRIVEN. Every function here has a
 * negative case, and the rendered report is judged by the REAL gate parsers —
 * the ones `done.mjs` C3 runs — not by a regex written to match this file.
 *
 * Human ruling 2026-09-22: the read runs in CI on GPT Astra through OpenRouter,
 * router-bound (§2.4), and C3 stays FAIL until a report carries the
 * `Reviewer-family:` line naming a non-Claude family against the exact tree. */

const TREE = "0ef1ce04a421813705b32f00559b067950a969cf";
const clean = { verdict: "PASS", findings: [], invariants_checked: ["caps immutable: yes"], limitations: ["cannot execute"] };
const oneFinding = { ...clean, verdict: "PASS", findings: [{ id: "X-01", severity: 1, title: "t", file: "engine/src/gateway.ts", evidence: "e", reproduction: "r" }] };
const render = (review: unknown, verdict: { verdict: string; why: string }, extra: Record<string, unknown> = {}) =>
  renderCrossReport({
    phase: "0",
    round: "x1",
    tree: TREE,
    commit: "abc1234",
    branch: "b",
    requestedModel: REVIEWER_MODEL,
    servedModel: REVIEWER_MODEL,
    endpoint: PRODUCTION_ENDPOINT,
    review,
    verdict,
    bundle: { included: [{ path: "a", content: "x" }], omitted: [], bytes: 1 },
    usage: { prompt_tokens: 1, completion_tokens: 1 },
    responseId: "id",
    addendumHash: "h1",
    definitionHash: "h2",
    startedAt: "now",
    ...extra,
  }) as string;

describe("cross-family read — the reviewer is pinned, read back, and cannot be forged", () => {
  it("the pinned reviewer is an exact non-Claude OpenRouter id, never a floating alias", () => {
    expect(REVIEWER_MODEL).toBe("openai/gpt-6-astra");
    expect(REVIEWER_MODEL).not.toMatch(/latest|~/);
    expect(isNonClaudeFamily(REVIEWER_MODEL)).toBe(true);
  });

  /** MUTATION: XF-01 — accept a served model that differs from the request. */
  it("the served model must equal the request; a substitution or a Claude answer writes no report", () => {
    expect(servedModelAcceptable(REVIEWER_MODEL, REVIEWER_MODEL).ok).toBe(true);
    expect(servedModelAcceptable(REVIEWER_MODEL, "openai/gpt-6-astra-pro").ok).toBe(false);
    expect(servedModelAcceptable(REVIEWER_MODEL, "anthropic/claude-opus-5").ok).toBe(false);
    expect(servedModelAcceptable(REVIEWER_MODEL, "").ok).toBe(false);
    expect(servedModelAcceptable(REVIEWER_MODEL, undefined).ok).toBe(false);
    // A pin that somehow named Claude would be refused even when echoed back.
    expect(servedModelAcceptable("anthropic/claude-x", "anthropic/claude-x").ok).toBe(false);
  });

  it("the answer must be the contract, exactly", () => {
    expect(parseReview(JSON.stringify(clean)).ok).toBe(true);
    expect(parseReview("```json\n" + JSON.stringify(clean) + "\n```").ok).toBe(true);
    expect(parseReview("").ok).toBe(false);
    expect(parseReview("not json").ok).toBe(false);
    expect(parseReview("[]").ok).toBe(false);
    expect(parseReview(JSON.stringify({ ...clean, verdict: "MAYBE" })).ok).toBe(false);
    expect(parseReview(JSON.stringify({ ...clean, findings: "none" })).ok).toBe(false);
    expect(parseReview(JSON.stringify({ ...oneFinding, findings: [{ ...oneFinding.findings[0], severity: 9 }] })).ok).toBe(false);
    expect(parseReview(JSON.stringify({ ...oneFinding, findings: [{ ...oneFinding.findings[0], evidence: "" }] })).ok).toBe(false);
    expect(parseReview(JSON.stringify({ ...clean, limitations: [1] })).ok).toBe(false);
    // Extra keys are dropped, not trusted.
    const p = parseReview(JSON.stringify({ ...clean, approved_by_human: true }));
    expect(p.ok && "approved_by_human" in p.value).toBe(false);
  });

  /** MUTATION: XF-02 — a PASS with findings passes. */
  it("a PASS with any finding is a FAIL; a FAIL that names nothing is still a FAIL", () => {
    expect(crossVerdict(clean).verdict).toBe("PASS");
    expect(crossVerdict(oneFinding).verdict).toBe("FAIL");
    expect(crossVerdict({ ...clean, verdict: "FAIL" }).verdict).toBe("FAIL");
  });

  /** MUTATION: XF-03 — a stand-in endpoint may mint a PASS. */
  it("any endpoint but the production router forces FAIL, whatever the reviewer said", () => {
    expect(crossVerdict(clean, PRODUCTION_ENDPOINT).verdict).toBe("PASS");
    expect(crossVerdict(clean, "http://127.0.0.1:9/v1/chat/completions").verdict).toBe("FAIL");
    expect(crossVerdict(clean, "https://openrouter.ai/api/v1/chat/completions/").verdict).toBe("FAIL");
  });

  /** MUTATION: XF-04 — the Reviewer-family line is dropped from the header. */
  it("the rendered report is read by the REAL gate parsers: family on line 5, tree bound, verdict honoured", () => {
    const pass = render(clean, crossVerdict(clean));
    const lines = pass.split("\n");
    expect(lines[0]).toBe("# ADVERSARY REPORT phase0.x1");
    expect(lines[1]).toBe("Verdict: PASS");
    expect(lines[2]).toBe(`verified-tree: ${TREE}`);
    expect(lines[4]).toMatch(/^Reviewer-family: /);
    expect(isNonClaudeFamily(reviewerFamily(pass))).toBe(true);
    // The file name the runner uses is one the checker's selector picks up.
    expect(selectPhaseReports("0", ["ADVERSARY_REPORT_phase0.x1.md", "ADVERSARY_REPORT_phase0.x1.raw.json", "other.md"])).toEqual(["ADVERSARY_REPORT_phase0.x1.md"]);
    // Judged by gate-lib against the same tree: PASS. Against another tree: stale, not PASS.
    expect(checkAdversaryReport({ phase: "0", reports: [{ name: "ADVERSARY_REPORT_phase0.x1.md", content: pass }], currentTreeHash: TREE }).ok).toBe(true);
    expect(checkAdversaryReport({ phase: "0", reports: [{ name: "ADVERSARY_REPORT_phase0.x1.md", content: pass }], currentTreeHash: "f".repeat(40) }).ok).toBe(false);
    // A FAIL report bound to this tree BLOCKS.
    const fail = render(oneFinding, crossVerdict(oneFinding));
    const j = checkAdversaryReport({ phase: "0", reports: [{ name: "ADVERSARY_REPORT_phase0.x1.md", content: fail }], currentTreeHash: TREE });
    expect(j.ok).toBe(false);
    expect(j.reason).toMatch(/verdict is not PASS/);
    expect(fail).toContain("### X-01 — severity 1 — t");
  });

  it("the report's family line never contains the builder's family, even though the body names it", () => {
    const pass = render(clean, crossVerdict(clean));
    expect(reviewerFamily(pass)).not.toMatch(/claude|anthropic/i);
    expect(pass).toMatch(/Builder family: .*Claude/);
  });

  /** MUTATION: XF-06 — allow-dirty is honoured on the production router. */
  it("a dirty tree refuses; allow-dirty is honoured only off the production router", () => {
    expect(preflightRefusal({ dirty: false })).toBe(null);
    expect(preflightRefusal({ dirty: true })).toMatch(/dirty/);
    expect(preflightRefusal({ dirty: true, endpoint: PRODUCTION_ENDPOINT, allowDirty: true })).toMatch(/dirty/);
    expect(preflightRefusal({ dirty: true, endpoint: "http://127.0.0.1:9/x", allowDirty: true })).toBe(null);
    expect(preflightRefusal({ dirty: true, endpoint: "http://127.0.0.1:9/x", allowDirty: false })).toMatch(/dirty/);
    // A dry run sends and writes nothing, so it may look at a working tree.
    expect(preflightRefusal({ dirty: true, dryRun: true })).toBe(null);
  });

  it("rounds are x1, x2, … and never collide with the same-family r-series", () => {
    expect(nextCrossRound([])).toBe("x1");
    expect(nextCrossRound(["ADVERSARY_REPORT_phase0.r14.md", "ADVERSARY_REPORT_phase0.x3.md", "ADVERSARY_REPORT_phase0.x1.md"])).toBe("x4");
    expect(nextCrossRound(["ADVERSARY_REPORT_phase1.x9.md"], 0)).toBe("x1");
  });

  it("the bundle keeps every text file, names every binary one, and sorts deterministically", () => {
    const b = bundleFiles(
      [
        { path: "z.ts", bytes: Buffer.from("b") },
        { path: "a.png", bytes: Buffer.from("\u0000PNG") },
        { path: "a.ts", bytes: Buffer.from("a") },
      ],
      (c: Buffer) => c.includes(0),
    );
    expect(b.included.map((f: { path: string }) => f.path)).toEqual(["a.ts", "z.ts"]);
    expect(b.omitted).toEqual([{ path: "a.png", why: "binary" }]);
    expect(b.bytes).toBe(2);
  });

  it("the request carries the human-owned definition verbatim as system, the addendum, the tree, and no fallback", () => {
    const b = bundleFiles([{ path: "a.ts", bytes: Buffer.from("const a = 1;") }], () => false);
    const r = buildReviewRequest({ definition: "DEFINITION TEXT", bundle: b, tree: TREE, phase: "0" });
    expect(r.model).toBe(REVIEWER_MODEL);
    expect(r.messages[0].role).toBe("system");
    expect(r.messages[0].content.startsWith("DEFINITION TEXT\n")).toBe(true);
    expect(r.messages[0].content).toContain(READ_ADDENDUM);
    expect(r.messages[1].content).toContain(`VERIFIED-TREE: ${TREE}`);
    expect(r.messages[1].content).toContain("===== FILE: a.ts");
    expect(r.provider).toEqual({ allow_fallbacks: false });
  });
});
