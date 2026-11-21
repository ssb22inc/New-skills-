import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { LIVE_CHECKS, liveReportName, liveVerdict, parseLiveReport, pickLiveReportForTree, redactObserved, renderLiveReport } from "../scripts/live-lib.mjs";

/** The live check's decisions, in the default suite (R14-06). The runner is
 * engine/test/live/services.live.ts, run only by fullburn-live.yml.
 * MUTATION: LV-01..LV-05. */
const all = (pass = true) => (LIVE_CHECKS as { id: string }[]).map((c) => ({ id: c.id, pass, observed: "x" }));

describe("live check decisions", () => {
  it("passes only when every check is observed exactly once and passed", () => {
    expect(liveVerdict(all()).ok).toBe(true);
    expect(liveVerdict(all().slice(1)).ok, "a missing check passed").toBe(false);
    expect(liveVerdict([...all(), all()[0]]).ok, "a duplicated check passed").toBe(false);
    expect(liveVerdict([...all(), { id: "made-up", pass: true, observed: "" }]).ok, "an unknown check passed").toBe(false);
    const oneFails = all();
    oneFails[1] = { ...oneFails[1]!, pass: false, observed: "HTTP 401" };
    expect(liveVerdict(oneFails)).toEqual({ ok: false, failing: [`${oneFails[1]!.id}: HTTP 401`] });
    expect(liveVerdict(undefined).ok).toBe(false);
    expect((LIVE_CHECKS as { id: string }[]).map((c) => c.id)).toEqual(["cloudflare-token", "gateway-hello-world", "langfuse-trace", "clickhouse-query", "airbyte-token"]);
  });

  it("no secret reaches the report, in plain, URL-encoded or base64 form", () => {
    const secret = "sk-lf-very-secret-value/+=";
    expect(redactObserved(`a ${secret} b`, [secret])).toBe("a [REDACTED] b");
    expect(redactObserved(encodeURIComponent(secret), [secret])).toBe("[REDACTED]");
    expect(redactObserved(Buffer.from(secret).toString("base64"), [secret])).toBe("[REDACTED]");
    expect(redactObserved("short ab", ["ab"]), "a 2-char value shredded ordinary text").toBe("short ab");
    const obs = all();
    obs[0] = { ...obs[0]!, observed: `token ${secret} leaked` };
    const report = renderLiveReport({ phase: "0", tree: "a".repeat(40), commit: "abc1234", startedAt: "t", observations: obs, secrets: [secret] });
    expect(report).not.toContain(secret);
    expect(report).toContain("[REDACTED]");
  });

  it("the report's line 2 is the verdict and line 3 binds the tree; its name binds the tree too", () => {
    const pass = renderLiveReport({ phase: "0", tree: "b".repeat(40), commit: "c", startedAt: "t", observations: all(), secrets: [] }).split("\n");
    expect(pass[1]).toBe("Verdict: PASS");
    expect(pass[2]).toBe(`verified-tree: ${"b".repeat(40)}`);
    const fail = renderLiveReport({ phase: "0", tree: "b".repeat(40), commit: "c", startedAt: "t", observations: all(false), secrets: [] });
    expect(fail.split("\n")[1]).toBe("Verdict: FAIL");
    expect(liveReportName("0", "d".repeat(40), "2026-10-22T07:39:59.567Z")).toBe(`LIVE_CHECK_phase0_${"d".repeat(12)}_20261022T073959Z.md`);
    expect(liveReportName("0", "d".repeat(40), "2026-10-22T07:40:00.000Z"), "two runs at one tree shared a report name").not.toBe(liveReportName("0", "d".repeat(40), "2026-10-22T07:39:59.567Z"));
    expect(() => liveReportName("0", "short", "2026-10-22T07:39:59.567Z")).toThrow();
    expect(() => liveReportName("0", "d".repeat(40), "not a time")).toThrow();
  });
});

describe("diagnostics are reported, redacted, and never change the verdict", () => {
  it("renders diagnostics under their own heading with secrets removed", () => {
    const secret = "cf-api-token-value-123";
    const r = renderLiveReport({ phase: "0", tree: "e".repeat(40), commit: "c", startedAt: "t", observations: all(), secrets: [secret], diagnostics: [{ name: "rest-route", observed: `HTTP 200 with ${secret}` }] });
    expect(r.split("\n")[1], "a diagnostic changed the verdict").toBe("Verdict: PASS");
    expect(r).toContain("Diagnostics (informational, not checks):");
    expect(r).toContain("- rest-route: HTTP 200 with [REDACTED]");
    expect(r).not.toContain(secret);
  });
});

describe("the live report reads back (2026-10-23: the completion checker consumes it)", () => {
  const tree = "a".repeat(40);
  const obs = LIVE_CHECKS.map((c: { id: string }) => ({ id: c.id, pass: true, observed: "ok | fine" }));
  const md = renderLiveReport({ phase: "0", tree, commit: "abc", startedAt: "2026-10-23T01:02:03.000Z", observations: obs, secrets: [] });

  it("parses what renderLiveReport writes, unknown rows dropped", () => {
    const p = parseLiveReport(`${md}| injected-row | x | PASS | y |\n`);
    expect(p.verdict).toBe("PASS");
    expect(p.tree).toBe(tree);
    expect(p.started).toBe("2026-10-23T01:02:03.000Z");
    expect(p.rows.map((r: { id: string }) => r.id)).toEqual(LIVE_CHECKS.map((c: { id: string }) => c.id));
    expect(p.rows[0].observed).toBe("ok | fine");
    expect(parseLiveReport("# not a report\nVerdict: PASS")).toBeNull();
  });

  it("picks the newest report at exactly this tree, never another tree's", () => {
    const at = (t: string, stamp: string) => `LIVE_CHECK_phase0_${t.slice(0, 12)}_${stamp}.md`;
    const other = "b".repeat(40);
    const names = [at(tree, "20261022T000000Z"), at(tree, "20261023T000000Z"), at(other, "20261024T000000Z"), `LIVE_CHECK_phase0_${tree.slice(0, 12)}.md`];
    expect(pickLiveReportForTree(names, tree)).toBe(at(tree, "20261023T000000Z"));
    expect(pickLiveReportForTree([at(other, "20261024T000000Z")], tree)).toBeNull();
    expect(pickLiveReportForTree(names, "short")).toBeNull();
  });
});
