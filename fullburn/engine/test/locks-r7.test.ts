import { describe, expect, it } from "vitest";
import { CapError, effectiveAiCapsUsd, getCaps } from "@fullburn/config/caps";
import { MemorySpendMeter, MeterUnavailableError, zoneDayKey } from "../src/spend-meter.ts";
import { capsOf } from "./helpers.ts";

/** LOCK TESTS — the cross-family review (r7). Each names the one-line revert it
 * dies on. These findings came from a NON-Claude reviewer reading source that
 * six Claude rounds had passed over, which is the reason §2.4 requires family
 * diversity at all. */

/** Client zero's real ceilings and its real accounting zone. */
const pulsern = () => effectiveAiCapsUsd("pulsern");

describe("money — the daily cap buckets on the client's day, not on UTC (R7-02)", () => {
  /** `ClientCaps.dailyAiSpendUsd` promised a client-local day while the ledger
   * keyed on UTC. $10 at 23:59Z and $10 at 00:01Z are two ledger days and ONE
   * New York day, so $20 landed under a $10/day cap. Ledger L14 had disclosed
   * the mismatch for three rounds; a disclosed wrong cap is still a wrong cap.
   *
   * MUTATION: key the periods on UTC again (Date#toISOString slices). */
  it("$20 cannot land in one New York day under a $10 ceiling", () => {
    let now = Date.parse("2026-08-16T23:59:00Z"); // 19:59 ET
    const m = new MemorySpendMeter(() => now, pulsern);
    m.settle(m.reserve("pulsern", 10));
    now = Date.parse("2026-08-17T00:01:00Z"); // 20:01 ET — still Aug 16 in New York
    expect(() => m.reserve("pulsern", 10), "UTC midnight opened a second daily ceiling").toThrow(CapError);
  });

  /** MUTATION: as above. The other half — the cap must still roll over on the
   * client's OWN midnight, or a UTC-keyed ledger would pass the test above by
   * simply never rolling over. */
  it("the ceiling does roll over at the client's midnight", () => {
    let now = Date.parse("2026-08-16T23:59:00Z");
    const m = new MemorySpendMeter(() => now, pulsern);
    m.settle(m.reserve("pulsern", 10));
    now = Date.parse("2026-08-17T04:01:00Z"); // 00:01 ET on Aug 17
    expect(() => m.reserve("pulsern", 10)).not.toThrow();
  });

  /** MUTATION: replace the IANA zone with a fixed offset. Eastern is UTC-5 in
   * winter and UTC-4 in summer; a fixed offset is wrong for half the year, and
   * a cap that is wrong for half the year is one nobody can reason about. */
  it("the zone handles its own daylight-saving transition", () => {
    const winter = Date.parse("2026-01-15T04:30:00Z"); // 23:30 ET Jan 14 (EST, -5)
    const summer = Date.parse("2026-07-15T03:30:00Z"); // 23:30 ET Jul 14 (EDT, -4)
    expect(zoneDayKey(winter, "America/New_York")).toBe("2026-01-14");
    expect(zoneDayKey(summer, "America/New_York")).toBe("2026-07-14");
  });

  /** MUTATION: drop assertUsableZone, or make ianaTimeZone optional. */
  it("a client with no resolvable accounting zone cannot spend", async () => {
    const { assertUsableZone } = await import("@fullburn/config/caps");
    expect(() => assertUsableZone("Mars/Olympus", "x")).toThrow(CapError);
    expect(() => assertUsableZone("", "x")).toThrow(/no accounting timezone/);
    expect(() => assertUsableZone(undefined, "x")).toThrow(CapError);
    // Every shipped client declares one.
    for (const id of ["pulsern", "fixture-testco", "fixture-unsigned"]) {
      expect(() => getCaps(id), `${id} has no usable zone`).not.toThrow();
    }
    const meter = new MemorySpendMeter(() => Date.now(), () => ({ dailyUsd: 5, monthlyUsd: 5, timeZone: "Mars/Olympus" }));
    expect(() => meter.reserve("x", 1)).toThrow();
  });

  it("the approved zone is the one the human declared", () => {
    expect(getCaps("pulsern").ianaTimeZone, "client zero's accounting zone changed").toBe("America/New_York");
  });
});

describe("money — the injected clock cannot mint fresh ceilings (R7-03)", () => {
  /** The cap is keyed by a caller-supplied assertion about time. Moving the
   * clock backwards re-enters a closed day that still has headroom.
   *
   * MUTATION: drop #assertForward, or make it compare with > instead of <. */
  it("a clock moving backwards into a closed day is refused", () => {
    let now = Date.parse("2026-08-17T16:00:00Z");
    const m = new MemorySpendMeter(() => now, pulsern);
    m.settle(m.reserve("pulsern", 10));
    now = Date.parse("2026-08-16T16:00:00Z");
    expect(() => m.reserve("pulsern", 10), "an older day was re-entered").toThrow(/backwards/);
    // Returning to the day it was on is fine; only going back is refused.
    now = Date.parse("2026-08-17T18:00:00Z");
    expect(() => m.reserve("pulsern", 1)).toThrow(CapError); // spent, not corrupt
  });

  /** MUTATION: drop the Number.isFinite check from zoneDayKey. */
  it("a non-finite instant refuses spend rather than throwing somewhere else", () => {
    expect(() => zoneDayKey(Number.NaN, "UTC")).toThrow(MeterUnavailableError);
    expect(() => zoneDayKey(Number.POSITIVE_INFINITY, "UTC")).toThrow(/non-finite/);
    const m = new MemorySpendMeter(() => Number.NaN, pulsern);
    expect(() => m.reserve("pulsern", 1)).toThrow(MeterUnavailableError);
  });

  it("the high-water mark is per client — one client's clock is not another's", () => {
    let now = Date.parse("2026-08-17T16:00:00Z");
    const m = new MemorySpendMeter(() => now, capsOf(10, 10));
    m.settle(m.reserve("a", 1));
    now = Date.parse("2026-08-16T16:00:00Z");
    // "b" has never been seen, so it has no closed day to re-enter.
    expect(() => m.reserve("b", 1)).not.toThrow();
  });
});

describe("money — ceilings are the meter's, never the caller's (R7-06)", () => {
  /** `reserve()` took its ceilings as arguments, so a direct caller could hand
   * itself $1,000/$1,000 for a real client; and `record()` wrote committed day
   * and month values with no cap lookup at all — an unrestricted money-write
   * primitive on the interface this file told the Phase 5/6 path to adopt
   * unchanged. "No caller does that today" is not a safety property.
   *
   * MUTATION: restore the ceilings parameter on reserve, or re-add record(). */
  it("a caller cannot widen its own ceiling, and record() does not exist", () => {
    const meter = new MemorySpendMeter(() => Date.parse("2026-08-17T16:00:00Z"), pulsern);
    expect(typeof (meter as unknown as Record<string, unknown>)["record"], "record() is back").toBe("undefined");
    // A ceilings argument is ignored, not honoured: the $10/day ceiling holds.
    const widen = meter.reserve.bind(meter) as unknown as (c: string, a: number, caps?: unknown) => unknown;
    const forged = { dailyUsd: 1000, monthlyUsd: 1000 };
    widen("pulsern", 10, forged);
    expect(() => widen("pulsern", 1, forged), "a caller widened its own ceiling").toThrow(CapError);
  });

  /** MUTATION: drop the resolver requirement from the constructor. */
  it("a meter cannot be built without a caps resolver", () => {
    const build = MemorySpendMeter as unknown as new (...a: unknown[]) => MemorySpendMeter;
    expect(() => new build(() => 0)).toThrow(MeterUnavailableError);
    expect(() => new build(() => 0, "not a function")).toThrow(/caps resolver/);
  });
});

describe("money — the committed figure is the provider's charge when there is one (R7-05)", () => {
  /** The ledger committed the RESERVED estimate and called it spend. Human
   * ruling 2026-08-16: meter the best-available number per call and true it up
   * by daily reconciliation; do not gate Phase 0 on a real-time provider cost
   * the API may not expose. So when the transport CAN produce the actual
   * charge, that is what lands — in both directions — and ledger L26 records
   * that the live figure is an estimate until reconciliation runs.
   *
   * MUTATION: commit `open.micros` unconditionally and ignore `actualUsd`. */
  it("an actual charge above the estimate is what consumes the ceiling", () => {
    const m = new MemorySpendMeter(() => Date.parse("2026-08-17T16:00:00Z"), pulsern);
    // Reserve $1, but the provider actually billed $9.50.
    m.settle(m.reserve("pulsern", 1), 9.5);
    expect(m.todayUsd("pulsern"), "the estimate was committed instead of the real charge").toBe(9.5);
    // $0.60 more would break the $10 ceiling; the estimate would have left $9.
    expect(() => m.reserve("pulsern", 0.6), "an under-estimate widened the day").toThrow(CapError);
  });

  it("an actual charge below the estimate returns the difference", () => {
    const m = new MemorySpendMeter(() => Date.parse("2026-08-17T16:00:00Z"), pulsern);
    m.settle(m.reserve("pulsern", 9), 0.25);
    expect(m.todayUsd("pulsern")).toBe(0.25);
    expect(() => m.reserve("pulsern", 9), "headroom the client never spent stayed consumed").not.toThrow();
  });

  it("with no actual available the estimate stands — and it is the reserved amount", () => {
    const m = new MemorySpendMeter(() => Date.parse("2026-08-17T16:00:00Z"), pulsern);
    m.settle(m.reserve("pulsern", 2.5));
    expect(m.todayUsd("pulsern")).toBe(2.5);
  });

  /** An unusable actual must not silently fall back to the estimate: that is a
   * wrong number presented as a measured one. */
  it("a non-finite actual is refused rather than rounded away", () => {
    const m = new MemorySpendMeter(() => Date.parse("2026-08-17T16:00:00Z"), pulsern);
    expect(() => m.settle(m.reserve("pulsern", 1), Number.NaN)).toThrow();
    expect(() => m.settle(m.reserve("pulsern", 1), -1)).toThrow();
  });

  /** The disclosure is load-bearing (Law 10): the ledger must SAY the live
   * number is an estimate trued up daily, or the reconciliation is folklore.
   *
   * MUTATION: delete L26 from the ledger. */
  it("the ledger records that the live figure is an estimate", async () => {
    const { readFileSync } = await import("node:fs");
    const ledger = readFileSync(new URL("../../reports/LIVE_VERIFICATION_LEDGER.md", import.meta.url), "utf8");
    const l26 = /\|\s*L26\s*\|[\s\S]*?\n\|/.exec(ledger)?.[0] ?? "";
    expect(l26, "L26 is missing from the ledger").not.toBe("");
    expect(l26.toLowerCase(), "L26 no longer calls the metered figure an estimate").toContain("estimate");
    expect(l26.toLowerCase(), "L26 no longer promises daily reconciliation").toContain("reconcil");
  });
});

describe("control plane — an approval cannot be minted by the agent it restrains (R7-07)", () => {
  /** The gate verified the bytes and never the author, so the same agent
   * changing caps could add a conforming approval file and satisfy the rule
   * forbidding it. This is the in-repo half only: a committer name is
   * self-asserted, so it raises the cost without proving a human. Ledger L27
   * records that every approval predating branch protection is unverified.
   *
   * MUTATION: drop the authorship check, or empty AUTOMATION_AUTHORS. */
  it("an approval committed by the automation principal is refused", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { checkClass2Approvals, checkApprovalAuthorship } = await import("../scripts/gate-lib.mjs");
    const capsPath = "fullburn/config/src/caps.ts";
    const doc = (authoredBy: string) => ({
      path: "fullburn/APPROVALS/x.md",
      status: "added",
      authoredBy,
      content: `approves: ${capsPath}\nbase-commit: b\nfrom-content-hash: old\ncontent-hash: new`,
    });
    const args = {
      changedFiles: [{ status: "modified", path: capsPath }],
      hashOf: () => "new",
      baseHashOf: () => "old",
      baseCommit: "b",
    };
    for (const who of ["Claude <noreply@anthropic.com>", "github-actions[bot] <bot@github.com>", "Claude Opus 5 <x@y.z>"]) {
      const res = checkClass2Approvals({ ...args, approvalDocs: [doc(who)] });
      expect(res.ok, `${who} minted its own approval`).toBe(false);
      expect(res.reason).toMatch(/automation principal/);
    }
    // A human-authored one is honoured.
    expect(checkClass2Approvals({ ...args, approvalDocs: [doc("A Human <a@example.com>")] }).ok).toBe(true);
    // …and an approval with no recorded author is not refused on that ground
    // alone — the gate has nothing to judge, which L27 is the record of.
    expect(checkApprovalAuthorship([{ path: "p", content: "" }]).ok).toBe(true);
  });

  /** MUTATION: delete .github/CODEOWNERS. Inert until branch protection is on,
   * but its absence is what makes the whole mechanism honour-system. */
  it("CODEOWNERS covers the approval mechanism and everything it protects", async () => {
    const { readFileSync } = await import("node:fs");
    const owners = readFileSync(new URL("../../../.github/CODEOWNERS", import.meta.url), "utf8");
    for (const path of [
      "/fullburn/APPROVALS/",
      "/fullburn/config/src/caps.ts",
      "/fullburn/CLAUDE.md",
      "/fullburn/engine/src/",
      "/fullburn/engine/scripts/",
      "/.github/",
    ]) {
      expect(owners, `${path} has no CODEOWNER`).toContain(path);
    }
  });
});

describe("observability — a refusal that was not recorded says so (R7-09)", () => {
  /** `traceFailure` swallowed every sink error while the file claimed every
   * exit is traced. Law 11 calls an untraced decision a bug, so the loss is now
   * surfaced on the error that reaches the caller.
   *
   * MUTATION: restore the bare `catch {}` in traceFailure. */
  it("a failed trace emission is reported on the thrown error", async () => {
    const { makeDeps: mk, TEST_CLIENT: C } = await import("./helpers.ts");
    const { llm } = await import("../src/gateway.ts");
    const { TraceContext } = await import("../src/tracing.ts");
    const { ROLE_BINDINGS } = await import("@fullburn/config/models");
    const { deps, sink } = mk({
      transport: {
        async post() {
          throw new Error("upstream 500");
        },
      },
    });
    sink.setFailing(true);
    const message = await llm({ ...deps, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: C,
      input: {},
      trace: new TraceContext("t-untraced", C),
    }).then(() => "", (e: Error) => e.message);
    expect(message, "an untraced refusal claimed nothing was wrong").toContain("UNTRACED");
  });

  /** MUTATION: emit the mismatched context's traceId instead of a fresh id.
   * One event naming two clients, into a sink keyed by traceId. */
  it("a cross-scoped trace context never lends its identity to another client", async () => {
    const { makeDeps: mk, TEST_CLIENT: C } = await import("./helpers.ts");
    const { llm } = await import("../src/gateway.ts");
    const { TraceContext } = await import("../src/tracing.ts");
    const { ROLE_BINDINGS } = await import("@fullburn/config/models");
    const { deps, sink } = mk();
    await llm({ ...deps, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: C,
      input: {},
      trace: new TraceContext("other-clients-trace", "someone-else"),
    }).catch(() => undefined);
    const emitted = sink.events.map((e) => e.traceId);
    expect(emitted, "the other client's traceId was reused").not.toContain("other-clients-trace");
    expect(emitted.every((id) => id.startsWith("unscoped-")), "the refusal kept a borrowed identity").toBe(true);
    // Two mismatches do not collide with each other.
    await llm({ ...deps, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: C,
      input: {},
      trace: new TraceContext("other-clients-trace", "someone-else"),
    }).catch(() => undefined);
    expect(new Set(sink.events.map((e) => e.traceId)).size, "two refusals shared an event identity").toBe(
      sink.events.length,
    );
  });
});

describe("grade registry — enforcement acts on evidence, not on assertion (R7-10)", () => {
  /** `enforcement([])` froze nothing, and a caller could pass an A for a
   * failing area or hand-build an AreaGrade. The registry did not guarantee
   * that below-A freezes autonomy; it translated an untrusted list.
   *
   * MUTATION: drop the COMPUTED WeakSet check from enforcement. */
  it("a fabricated or empty grade list cannot be enforced", async () => {
    const { computeGrades, enforcement, publishGradeReport, GradeRegistryError, gradeAndEnforce } = await import(
      "../src/grade-registry.ts"
    );
    expect(() => enforcement([]), "an empty list froze nothing, silently").toThrow(GradeRegistryError);
    const fabricated = [{ area: "marketing-engine", grade: "A" as const, failing: [], missing: [] }];
    expect(() => enforcement(fabricated), "a hand-built A was enforced").toThrow(GradeRegistryError);
    expect(() => publishGradeReport(fabricated, 0), "a fabricated report was published").toThrow(GradeRegistryError);

    // The genuine article works, and an empty snapshot freezes every area.
    const real = computeGrades({});

    // THE ATTACK THAT MATTERS: a fabrication of the RIGHT SHAPE. Rejecting the
    // empty list and the one-element list only proves the length check works —
    // a full-length hand-built all-A list is what an improver wanting its
    // autonomy back would actually pass, and only object identity refuses it.
    const forged = real.map((g: { area: string }) => ({ area: g.area, grade: "A" as const, failing: [], missing: [] }));
    expect(forged.length, "the forgery is not the same shape as the genuine article").toBe(real.length);
    expect(() => enforcement(forged), "a full-length fabricated all-A list was enforced").toThrow(GradeRegistryError);
    expect(() => publishGradeReport(forged, 0), "a full-length fabrication was published").toThrow(GradeRegistryError);
    // Nor does copying a genuine result launder it: the array is the evidence.
    expect(() => enforcement([...real]), "a shallow copy passed as the genuine result").toThrow(GradeRegistryError);

    expect(() => enforcement(real)).not.toThrow();
    expect(enforcement(real).length).toBeGreaterThan(0);
    expect(publishGradeReport(real, 0)).toContain("BELOW_A");

    // A truncated copy of a genuine result is not the genuine result.
    expect(() => enforcement(real.slice(0, 1))).toThrow(GradeRegistryError);
    const { actions } = gradeAndEnforce({});
    expect(actions.length).toBeGreaterThan(0);
  });
});
