import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EvalAttestation, ROLE_BINDINGS, attestEvalRun, bindRole } from "@fullburn/config/models";
import { CapError, getCaps } from "@fullburn/config/caps";
import { PreDispatchError, llm } from "../src/gateway.ts";
import { MemorySpendMeter, MeterUnavailableError, SpendReservation, type SpendCeilings } from "../src/spend-meter.ts";
import { TraceContext } from "../src/tracing.ts";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { checkAdversaryReport, isClass2, parseVerdict } from "../scripts/gate-lib.mjs";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { scanContent } from "../scripts/scan-lib.mjs";
import { TEST_CLIENT, makeDeps, testClock, capsOf, fixedCaps } from "./helpers.ts";

/** LOCK TESTS — r4 findings (N-01 … N-11) plus the one r3 lock the r4 review
 * proved was not load-bearing.
 *
 * Every test below names the exact one-line revert it dies on. A fix without
 * such a test is not protected, and the r4 review demonstrated that precisely
 * once out of fourteen — which is the reason this file exists rather than a
 * prose claim that the fixes work. */

const DAY = 86_400_000;
const TREE = "abc1234def5678";

describe("money — a DAILY cap cannot be constructed without a day (N-01)", () => {
  /** The clock defaulted to `() => 0`, pinning every day key to 1970-01-01.
   * Thirteen of sixteen construction sites took that default, so M-03's
   * rollover fix was opt-in and the default was the original bug — still live,
   * in the commit that claimed to have closed it.
   *
   * MUTATION: restore `constructor(now: () => number = () => 0)`. */
  it("a meter cannot be built with no clock at all", () => {
    const build = MemorySpendMeter as unknown as new (...a: unknown[]) => MemorySpendMeter;
    expect(() => new build()).toThrow(MeterUnavailableError);
    expect(() => new build(undefined)).toThrow(/requires a clock/);
    expect(() => new build(12345)).toThrow(/requires a clock/);
  });

  /** MUTATION: as above — with the epoch default restored, `llm()` built on a
   * default meter never rolls over and the second day is refused. */
  it("the cap rolls over on the day boundary, driven through the real llm() path", async () => {
    let nowMs = Date.UTC(2026, 7, 15, 12, 0, 0);
    const { deps, meter } = makeDeps({ now: () => nowMs });
    const cap = getCaps(TEST_CLIENT).dailyAiSpendUsd;
    const call = () =>
      llm({ ...deps, bindings: ROLE_BINDINGS }, { clientId: TEST_CLIENT, role: "hello-world", input: { q: "hi" }, trace: new TraceContext("t", TEST_CLIENT) });

    let day1 = 0;
    for (;;) {
      try {
        await call();
        day1 += 1;
      } catch {
        break;
      }
      if (day1 > 10_000) throw new Error("cap never bit — the ceiling is not enforced");
    }
    expect(meter.todayUsd(TEST_CLIENT)).toBeCloseTo(cap, 6);

    nowMs += DAY;
    await expect(call()).resolves.toBeDefined();
    expect(meter.todayUsd(TEST_CLIENT)).toBeGreaterThan(0);
    expect(meter.todayUsd(TEST_CLIENT)).toBeLessThan(cap);
  });
});

describe("money — held money is never invisible (N-09)", () => {
  /** `reservedUsd` was scoped to the current day, so a reservation taken at
   * 23:59 and still open at 00:01 read $0 in `todayUsd()` AND $0 in
   * `reservedUsd()`. That reading exists precisely so an operator can see where
   * the headroom went when every call is being refused.
   *
   * MUTATION: revert reservedUsd to `#read(this.#reservedMicros, this.#key(id))`. */
  it("an in-flight reservation survives a UTC midnight in reservedUsd()", () => {
    let nowMs = Date.UTC(2026, 7, 15, 23, 59, 0);
    const meter = new MemorySpendMeter(() => nowMs, fixedCaps);
    const held = meter.reserve(TEST_CLIENT, 3);
    expect(meter.reservedUsd(TEST_CLIENT)).toBeCloseTo(3, 6);

    nowMs += 2 * 60_000; // 00:01 the next day
    expect(meter.reservedUsd(TEST_CLIENT), "held money vanished across midnight").toBeCloseTo(3, 6);

    // And the accounting still lands on the day the spend was made.
    meter.settle(held);
    expect(meter.reservedUsd(TEST_CLIENT)).toBe(0);
    expect(meter.todayUsd(TEST_CLIENT)).toBe(0); // the new day is clean
  });

  it("another client's reservation is not visible on this client's reading", () => {
    const meter = new MemorySpendMeter(testClock, fixedCaps);
    meter.reserve("fixture-other", 2);
    expect(meter.reservedUsd(TEST_CLIENT)).toBe(0);
  });
});

describe("money — a request that never departed is not billable (N-07, N-08)", () => {
  /** SEMANTICS INVERTED BY R7-04, and the reversal is the point.
   *
   * N-08 concluded a synchronous throw meant nothing had left the building and
   * should release. The cross-family review showed that rests on a promise the
   * `GatewayTransport` interface never makes: a conforming transport may
   * dispatch and then throw during its own bookkeeping. Repeated, releasing on
   * that returned headroom for calls the provider had already served.
   *
   * Releasing a departed request breaches the cap; settling an undeparted one
   * overcharges by one call and is caught by daily reconciliation (L26). The
   * errors are not symmetric, so the conservative direction is settle.
   *
   * MUTATION: move `departed = true` back below the post() call. */
  it("a synchronous transport throw is SETTLED — it may have dispatched", async () => {
    const ops: string[] = [];
    const { deps, meter } = makeDeps({
      transport: {
        post() {
          throw new Error("dns failure before any I/O");
        },
      },
    });
    trackOps(meter, ops);
    await expect(
      llm({ ...deps, bindings: ROLE_BINDINGS }, { clientId: TEST_CLIENT, role: "hello-world", input: { q: "hi" }, trace: new TraceContext("t", TEST_CLIENT) }),
    ).rejects.toThrow();
    expect(ops, "a throw that may have dispatched released the headroom").toEqual(["settle"]);
    expect(meter.todayUsd(TEST_CLIENT)).toBeGreaterThan(0);
    expect(meter.reservedUsd(TEST_CLIENT)).toBe(0);
  });

  /** The other half: a transport that KNOWS it did not dispatch says so with a
   * typed PreDispatchError, and only that reopens the release path. Proof from
   * the transport, not inference from the shape of the failure.
   *
   * MUTATION: drop the `instanceof PreDispatchError` branch, or stop resetting
   * `departed` inside it. */
  it("a typed PreDispatchError releases, because the transport asserts nothing was sent", async () => {
    const ops: string[] = [];
    const { deps, meter } = makeDeps({
      transport: {
        post() {
          throw new PreDispatchError("url rejected before any socket was opened");
        },
      },
    });
    trackOps(meter, ops);
    await expect(
      llm({ ...deps, bindings: ROLE_BINDINGS }, { clientId: TEST_CLIENT, role: "hello-world", input: { q: "hi" }, trace: new TraceContext("t", TEST_CLIENT) }),
    ).rejects.toThrow();
    expect(ops, "a proven-undispatched request was charged").toEqual(["release"]);
    expect(meter.todayUsd(TEST_CLIENT)).toBe(0);
    expect(meter.reservedUsd(TEST_CLIENT)).toBe(0);
  });

  /** MUTATION: as above. An absent transport is the same class of never-departed
   * failure and was also charged. */
  it("an absent transport is refused before anything is charged", async () => {
    const ops: string[] = [];
    const { deps, meter } = makeDeps({ transport: {} });
    trackOps(meter, ops);
    await expect(
      llm({ ...deps, bindings: ROLE_BINDINGS }, { clientId: TEST_CLIENT, role: "hello-world", input: { q: "hi" }, trace: new TraceContext("t", TEST_CLIENT) }),
    ).rejects.toThrow();
    expect(ops).not.toContain("settle");
    expect(meter.todayUsd(TEST_CLIENT)).toBe(0);
  });

  /** A rejected promise DID depart, so it stays billable — the provider may
   * well have served it. This is the other half of the boundary: N-08's fix
   * must not turn into M-01's unbounded-breach regression.
   *
   * MUTATION: move `departed = true` below the `await`. */
  it("a rejected in-flight request is still settled — the provider may have billed it", async () => {
    const ops: string[] = [];
    const { deps, meter } = makeDeps({
      transport: {
        async post() {
          throw new Error("502 from the gateway");
        },
      },
    });
    trackOps(meter, ops);
    await expect(
      llm({ ...deps, bindings: ROLE_BINDINGS }, { clientId: TEST_CLIENT, role: "hello-world", input: { q: "hi" }, trace: new TraceContext("t", TEST_CLIENT) }),
    ).rejects.toThrow();
    expect(ops).toEqual(["settle"]);
    expect(meter.todayUsd(TEST_CLIENT)).toBeGreaterThan(0);
  });

  /** A `release()` that throws leaks the reservation: headroom stays consumed
   * for a request that never departed, and repeating it burns the whole daily
   * ceiling with zero provider calls while `todayUsd()` reads $0.00. The catch
   * was silent, so the leak was invisible in the trace as well as the meter.
   *
   * MUTATION: restore the bare `catch {}` in the release branch. */
  it("a release() that throws is recorded in the failure trace, not swallowed", async () => {
    const { deps, sink, meter } = makeDeps({
      transport: {
        post() {
          // Typed, so the release path is reached at all (R7-04).
          throw new PreDispatchError("never departs");
        },
      },
    });
    meter.release = () => {
      throw new Error("durable object write failed");
    };
    await expect(
      llm({ ...deps, bindings: ROLE_BINDINGS }, { clientId: TEST_CLIENT, role: "hello-world", input: { q: "hi" }, trace: new TraceContext("t", TEST_CLIENT) }),
    ).rejects.toThrow();
    const traced = JSON.stringify(sink.events);
    expect(traced, "the leaked reservation left no trace").toContain("reservation leaked");
    expect(traced).toContain("never departed");
  });
});

describe("control plane — the Class-2 surface an attacker actually reaches (N-02, N-11)", () => {
  /** vitest resolves a workspace from {vitest.workspace, vitest.projects} ×
   * {.ts,.mts,.cts,.js,.mjs,.cjs,.json}. The pattern enumerated four
   * extensions, so `vitest.workspace.mts` was Class-1 and silenced 165 of 168
   * tests with every gate green — R3-CP-03's original attack, unchanged,
   * through an extension the widened pattern still missed.
   *
   * MUTATION: narrow the vitest/vite pattern back to an extension list. */
  it("every filename vitest would honour as a workspace is Class 2", () => {
    for (const name of ["workspace", "projects", "config"]) {
      for (const ext of ["ts", "mts", "cts", "js", "mjs", "cjs", "json"]) {
        const p = `fullburn/vitest.${name}.${ext}`;
        expect(isClass2(p), `${p} is Class 1 — it can silence the suite`).toBe(true);
      }
    }
    for (const p of ["fullburn/vite.config.ts", "fullburn/vite.config.mts"]) {
      expect(isClass2(p), `${p} is Class 1`).toBe(true);
    }
  });

  /** MUTATION: drop the package-lock / nested .gitignore / nested wrangler
   * patterns. `npm ci` resolves strictly from the lockfile — `resolved` and
   * `integrity` both live there — so the lockfile decides what `vitest` is. */
  it("everything that decides what CI installs or ignores is Class 2", () => {
    for (const p of [
      "fullburn/package-lock.json",
      "fullburn/engine/.gitignore",
      "fullburn/config/.gitignore",
      "fullburn/engine/deploy/wrangler.toml",
      "fullburn/engine/wrangler.jsonc",
    ]) {
      expect(isClass2(p), `${p} is Class 1`).toBe(true);
    }
  });
});

describe("control plane — the approval binding cannot be skipped (N-03)", () => {
  /** `(baseCommit === undefined || b.base === baseCommit)` meant an omitted
   * argument disabled the pull-request binding entirely and restored full
   * approval replay. No test imported the CLI, so renaming the property at its
   * single call site left the suite green with the binding silently gone.
   *
   * MUTATION: restore the `baseCommit === undefined ||` disjunct. */
  it("omitting the base commit refuses the change instead of waving it through", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { checkClass2Approvals } = await import("../scripts/gate-lib.mjs");
    const capsPath = "fullburn/config/src/caps.ts";
    const doc = {
      path: "fullburn/APPROVALS/x.md",
      status: "added",
      content: `approves: ${capsPath}\nbase-commit: b\nfrom-content-hash: old\ncontent-hash: new`,
    };
    const args = {
      changedFiles: [{ status: "modified", path: capsPath }],
      approvalDocs: [doc],
      hashOf: () => "new",
      baseHashOf: () => "old",
    };
    // With the binding supplied, the approval is honoured.
    expect(checkClass2Approvals({ ...args, baseCommit: "b" }).ok).toBe(true);
    // Without it, the gate refuses — it does not fall back to "approved".
    for (const missing of [undefined, null, "", 0, {}]) {
      const res = checkClass2Approvals({ ...args, baseCommit: missing });
      expect(res.ok, `baseCommit ${JSON.stringify(missing)} waved the change through`).toBe(false);
      expect(res.reason).toMatch(/without a base commit/);
    }
  });

  /** MUTATION: rename the `baseCommit:` property in class2-gate.mjs. The CLI is
   * the only wiring between the library and CI and no test imported it, which
   * is exactly how leg B survived. Reading the source is a weaker lock than
   * executing it, so this is deliberately paired with the fail-closed test
   * above: with both in place, breaking the wiring turns CI red rather than
   * silently green. */
  it("the CLI passes a base commit to the library", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../scripts/class2-gate.mjs", import.meta.url), "utf8");
    expect(src).toMatch(/baseCommit:\s*resolvedBase/);
    expect(src).toMatch(/rev-parse/);
  });
});

describe("control plane — the verdict a human sees is the verdict the gate reads (N-04, N-05)", () => {
  const bind = (body: string[]) => body.join("\n");

  /** `readTreeBinding` was a near-copy of `parseVerdict` that compared fence
   * CHARACTERS without length, so an odd fence count made a correctly bound
   * `Verdict: FAIL` read as unbound. It was filed as history and a sibling PASS
   * opened the gate — with the FAIL report never named in the output.
   *
   * MUTATION: give readTreeBinding its own fence loop comparing only fenceMatch[1][0]. */
  it("a FAIL bound past a mismatched fence still blocks, and a sibling PASS cannot override it", () => {
    const failReport = bind([
      "# ADVERSARY REPORT phase0.r5",
      "Verdict: FAIL",
      `verified-tree: ${TREE}`,
      "",
      "The verdict line format, for reference:",
      "````markdown",
      "```",
      "````",
      "Nineteen severity-1 findings remain open. Do not merge.",
    ]);
    const passReport = bind(["# earlier", "Verdict: PASS", `verified-tree: ${TREE}`]);
    expect(parseVerdict(failReport)?.token).toBe("FAIL");
    const res = checkAdversaryReport({
      phase: "0",
      reports: [
        { name: "ADVERSARY_REPORT_phase0.r5.md", content: failReport },
        { name: "ADVERSARY_REPORT_phase0.r4.md", content: passReport },
      ],
      currentTreeHash: TREE,
    });
    expect(res.ok).toBe(false);
    expect(res.reason, "the gate did not even name the FAIL report").toContain("r5");
  });

  /** `<details>` renders collapsed by default in every renderer including
   * GitHub, so a PASS inside one opened the gate while the visible prose said
   * "do not merge".
   *
   * MUTATION: delete stripConcealed, or drop `details` from CONCEALING_BLOCKS. */
  it("a verdict hidden in a collapsed block is not a verdict", () => {
    for (const tag of ["details", "script", "template"]) {
      const hidden = bind([
        "# r",
        "The engine is NOT safe. Do not merge.",
        `<${tag}><summary>appendix</summary>`,
        "",
        "Verdict: PASS",
        "",
        `</${tag}>`,
        `verified-tree: ${TREE}`,
      ]);
      expect(parseVerdict(hidden)?.token, `a PASS inside <${tag}> was read`).not.toBe("PASS");
      const res = checkAdversaryReport({
        phase: "0",
        reports: [{ name: "ADVERSARY_REPORT_phase0.z.md", content: hidden }],
        currentTreeHash: TREE,
      });
      expect(res.ok).toBe(false);
    }
  });

  /** The durable half of the fix: both fields must live in the header, where a
   * human opening the file sees them without scrolling. A hiding place can only
   * exist in text the reader skips.
   *
   * MUTATION: raise HEADER_LINES, or drop the slice. */
  it("a verdict buried below the header is not read at all", () => {
    const buried = bind([...Array.from({ length: 12 }, (_, i) => `line ${i}`), "Verdict: PASS", `verified-tree: ${TREE}`]);
    expect(parseVerdict(buried)).toBeNull();
    const res = checkAdversaryReport({
      phase: "0",
      reports: [{ name: "ADVERSARY_REPORT_phase0.z.md", content: buried }],
      currentTreeHash: TREE,
    });
    expect(res.ok).toBe(false);
    // And the header form every real report already uses still works.
    const real = bind(["# ADVERSARY REPORT phase0", "Verdict: PASS", "", `verified-tree: ${TREE}`]);
    expect(parseVerdict(real)?.token).toBe("PASS");
    expect(
      checkAdversaryReport({
        phase: "0",
        reports: [{ name: "ADVERSARY_REPORT_phase0.z.md", content: real }],
        currentTreeHash: TREE,
      }).ok,
    ).toBe(true);
  });
});

describe("secrets — the fixture allowlist is not a hiding place (N-06)", () => {
  /** `content.split(fixture).join(...)` ran BEFORE the secret rules, so the
   * allowlist worked as a general token splitter: inserting a declared fixture
   * into any live token broke the pattern while the material stayed greppable.
   *
   * MUTATION: restore withoutFixtures() and scan the substituted text. */
  it("a declared fixture spliced into live key material does not launder it", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { DECLARED_FIXTURES } = await import("../scripts/scan-lib.mjs");
    const P = "fullburn/reports/r.md";
    // Every declared fixture, on its own, is still excused — that is the whole
    // point of declaring it.
    for (const f of DECLARED_FIXTURES as string[]) {
      expect(scanContent(P, f), `declared fixture ${f} was flagged`).toHaveLength(0);
    }
    const live = "LIVEKEYMATERIAL1234567890abcdef";
    for (const f of DECLARED_FIXTURES as string[]) {
      // Splicing a fixture into live material must never launder it. These hold
      // for EVERY declared fixture, whatever its shape, because the surrounding
      // token is what the rule matches.
      for (const [label, sample] of [
        ["spliced into an anthropic key", `sk-ant-api0${f}3-${live}`],
        ["spliced into a bearer literal", `Bearer zzzz9999${f}${live}`],
      ] as const) {
        expect(scanContent(P, sample).length, `${label} with "${f}" scanned clean`).toBeGreaterThan(0);
      }
    }
    // The token-shaped fixture is the dangerous one — it is a prefix of a live
    // pattern, which is what makes it materially different from an obviously
    // synthetic canary. Both consequences N-06 named are checked here: a live
    // key whose body merely BEGINS with it, and it used as a splitter inside a
    // charset the canary's hyphens could never have broken.
    const shaped = "sk-" + "ant-" + "ABCDEFGH12345678";
    expect((DECLARED_FIXTURES as string[]).includes(shaped), "the shaped fixture is no longer declared").toBe(true);
    expect(scanContent(P, `${shaped}${live}`).length, "a live key beginning with the fixture").toBeGreaterThan(0);
    expect(scanContent(P, `AKIA${shaped}ABCDEFGHIJKLMNOP`).length, "the fixture splitting an AWS key").toBeGreaterThan(0);
  });
});

describe("secrets — a quoted-evidence exemption cannot travel (N-06)", () => {
  /** An append-only report had to keep the token-shaped strings the r4 review
   * executed to prove the splitter, so those exact strings are excused — in
   * that one file. Declaring them globally instead would have reopened N-06
   * with the fix still in place, because one of them is the declared fixture
   * plus sixteen upper-case characters, which is an AWS key by shape.
   *
   * MUTATION: move QUOTED_EVIDENCE's entries into DECLARED_FIXTURES, or ignore
   * the `path` argument in isDeclaredFixture. */
  it("the r4 evidence is clean in its own report and flagged everywhere else", async () => {
    const EVIDENCE = fileURLToPath(new URL("../../reports/ADVERSARY_REPORT_phase0.r4.md", import.meta.url));
    const quoted = readFileSync(EVIDENCE, "utf8");
    expect(scanContent("fullburn/reports/ADVERSARY_REPORT_phase0.r4.md", quoted)).toHaveLength(0);
    // The very same bytes in any other file are a leak.
    for (const elsewhere of [
      "fullburn/engine/src/thing.ts",
      "fullburn/reports/ADVERSARY_REPORT_phase0.r5.md",
      "fullburn/HUMAN_TASKS.md",
    ]) {
      expect(scanContent(elsewhere, quoted).length, `${elsewhere} was excused too`).toBeGreaterThan(0);
    }
  });

  /** MUTATION: delete the containment check at the bottom of the fixture list.
   * A declared fixture that contains another is a splitter by construction. */
  it("no declared fixture contains another", async () => {
    // @ts-expect-error — plain .mjs module, typed loosely on purpose
    const { DECLARED_FIXTURES } = await import("../scripts/scan-lib.mjs");
    for (const a of DECLARED_FIXTURES as string[]) {
      for (const b of DECLARED_FIXTURES as string[]) {
        expect(a === b || !a.includes(b), `"${a}" contains "${b}" — that is a splitter`).toBe(true);
      }
    }
  });
});

describe("money — the range guards on the way in (R6-05)", () => {
  /** MUTATION: drop the safe-integer check from toMicros. */
  it("an amount too large for micro-dollar accounting refuses spend", () => {
    const m = new MemorySpendMeter(() => Date.UTC(2026, 7, 16), capsOf(1e14, 1e14));
    expect(() => m.reserve("pulsern", 1e15)).toThrow(MeterUnavailableError);
    expect(() => m.reserve("pulsern", 1)).toThrow(/out of range/);
  });

  /** MUTATION: neuter assertSaneCap's body. A caller-supplied narrowing is the
   * one number on this path that does not come from the frozen table. */
  it("a narrowing that is not a positive finite number is refused", async () => {
    const { effectiveAiCapsUsd } = await import("@fullburn/config/caps");
    for (const bad of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => effectiveAiCapsUsd(TEST_CLIENT, { [TEST_CLIENT]: { dailyAiSpendUsd: bad } }), `${bad} was accepted`).toThrow(
        CapError,
      );
      expect(() => effectiveAiCapsUsd(TEST_CLIENT, { [TEST_CLIENT]: { monthlyAiSpendUsd: bad } })).toThrow(CapError);
    }
  });
});

describe("caps — the H8 ceilings are coherent, not merely present", () => {
  /** Individually sane, collectively nonsense: a hard ceiling below its own
   * pacing target means the pacing is never reached, and a daily sub-limit above
   * its own month means the sub-limit never bites. Nothing errors and nothing
   * overspends — the engine quietly enforces a figure the human did not approve.
   *
   * `getCaps` accepts no caller-supplied table by design (R2-03), so the
   * relationships are driven through the exported check.
   *
   * MUTATION: neuter either branch of assertCapsCoherent, or stop calling it
   * from getCaps. */
  it("a hard ceiling below its pacing target, or a day above its month, is refused", async () => {
    const { assertCapsCoherent, getCaps: get } = await import("@fullburn/config/caps");
    const ok = get("pulsern");
    expect(() => assertCapsCoherent(ok, "pulsern")).not.toThrow();
    expect(() => assertCapsCoherent({ ...ok, hardDailyAdSpendUsd: ok.dailyAdSpendUsd - 1 }, "x")).toThrow(
      /below the daily pacing target/,
    );
    expect(() => assertCapsCoherent({ ...ok, dailyAiSpendUsd: ok.monthlyAiSpendUsd + 1 }, "x")).toThrow(
      /exceeds the monthly AI ceiling/,
    );
    // And getCaps actually runs it — every shipped client is coherent.
    for (const id of ["pulsern", "fixture-testco", "fixture-unsigned"]) {
      expect(() => get(id), `${id} has incoherent caps`).not.toThrow();
    }
  });

  /** MUTATION: drop the Math.min against monthlyUsd in effectiveAiCapsUsd. */
  it("narrowing the month tightens the day with it", async () => {
    const { effectiveAiCapsUsd } = await import("@fullburn/config/caps");
    const c = effectiveAiCapsUsd(TEST_CLIENT, { [TEST_CLIENT]: { monthlyAiSpendUsd: 0.5 } });
    expect(c.monthlyUsd).toBe(0.5);
    expect(c.dailyUsd, "the daily sub-limit outlived its own month").toBeLessThanOrEqual(0.5);
    // And the pair is never incoherent, whatever combination is narrowed.
    for (const n of [{ dailyAiSpendUsd: 1 }, { monthlyAiSpendUsd: 2 }, { dailyAiSpendUsd: 9, monthlyAiSpendUsd: 3 }]) {
      const eff = effectiveAiCapsUsd(TEST_CLIENT, { [TEST_CLIENT]: n });
      expect(eff.dailyUsd, `daily above month for ${JSON.stringify(n)}`).toBeLessThanOrEqual(eff.monthlyUsd);
    }
  });

  /** The values the human approved on 2026-08-16, asserted by number. A cap that
   * drifts from its approval is the defect the whole Class-2 mechanism exists to
   * prevent, and a content hash catches that only at review time. */
  it("client zero carries exactly the approved H8 values", async () => {
    const { getCaps: get } = await import("@fullburn/config/caps");
    const c = get("pulsern");
    expect(c.dailyAdSpendUsd, "daily ad pacing").toBe(66);
    expect(c.hardDailyAdSpendUsd, "hard daily ad ceiling").toBe(75);
    expect(c.totalAdSpendUsd, "total ad spend").toBe(2000);
    expect(c.dailyAiSpendUsd, "daily AI sub-limit").toBe(10);
    expect(c.monthlyAiSpendUsd, "monthly AI ceiling").toBe(200);
    expect(c.humanSignoff, "H8 sign-off").toMatch(/^H8 approved 2026-08-16/);
  });
});

describe("money — a reservation handle is an identity, not a shape (R5-01, R5-08)", () => {
  const CAPS10 = capsOf(10, 10);
  const AUG = () => Date.UTC(2026, 7, 16, 12, 0, 0);

  /** Handles were matched on `id` + `clientId`, and ids count `r1, r2, r3…`
   * from a per-instance counter — guessable by construction. A literal released
   * live reservations: 200 forged releases deleted the open records, the 200
   * genuine settles for departed requests committed nothing, the freed headroom
   * admitted another $200, and $400 of real spend landed against a $200 ceiling
   * while `monthUsd()` read exactly $200 throughout — a cap breach and a data
   * lie in one operation.
   *
   * MUTATION: replace the `instanceof` + `#minted.has()` check in #close with
   * the old `open.clientId !== reservation.clientId` test. */
  it("a forged literal releases nothing, and the real spend still settles", () => {
    const m = new MemorySpendMeter(AUG, fixedCaps);
    const real = Array.from({ length: 200 }, () => m.reserve("pulsern", 1));
    expect(m.reservedUsd("pulsern")).toBe(200);
    for (let i = 1; i <= 200; i++) {
      m.release({ id: `r${i}`, clientId: "pulsern", amountUsd: 0 } as never);
    }
    expect(m.reservedUsd("pulsern"), "forged releases freed headroom").toBe(200);
    expect(() => m.reserve("pulsern", 1), "the ceiling stopped binding").toThrow(CapError);
    for (const r of real) m.settle(r);
    expect(m.monthUsd("pulsern"), "$200 of departed billable spend was recorded as $0").toBe(200);
    expect(() => m.reserve("pulsern", 1), "a second $200 was admitted").toThrow(CapError);
  });

  /** MUTATION: as above. This is the production shape and needs no forgery at
   * all — ledger L14 documents a restarted meter minting `r1` again. */
  it("a handle minted by another meter moves nothing here", () => {
    const a = new MemorySpendMeter(AUG, fixedCaps);
    const b = new MemorySpendMeter(AUG, fixedCaps);
    const live = a.reserve("pulsern", 200);
    const foreign = b.reserve("pulsern", 200);
    a.release(foreign);
    expect(a.reservedUsd("pulsern"), "a foreign handle released a live reservation").toBe(200);
    a.settle(foreign);
    expect(a.todayUsd("pulsern"), "a foreign handle settled against this ledger").toBe(0);
    a.settle(live);
    expect(a.todayUsd("pulsern")).toBe(200);
  });

  /** R6-04: the ledger was keyed by `id`, so re-pointing that one field on a
   * GENUINE handle closed other live reservations — $20 against a $10/day
   * ceiling with `todayUsd()` reading $10, nothing forged, one meter. The only
   * thing standing in the way was `Object.freeze`, which carried no test and
   * looked like hygiene rather than cap enforcement.
   *
   * MUTATION: key #open by `reservation.id` again instead of the handle. */
  it("re-pointing id on a genuine handle closes nothing", () => {
    const m = new MemorySpendMeter(AUG, CAPS10);
    const live = Array.from({ length: 5 }, () => m.reserve("pulsern", 2));
    expect(m.reservedUsd("pulsern")).toBe(10);
    expect(() => m.reserve("pulsern", 1)).toThrow(CapError);

    // The attacker holds one genuine handle and forges nothing.
    const mine = live[0]! as unknown as { id: string };
    for (const other of live) {
      try {
        mine.id = (other as unknown as { id: string }).id;
      } catch {
        // frozen — the write is refused, which is also fine
      }
      m.release(live[0]!);
    }
    // Exactly one reservation closed: the handle's own, once. Not five.
    expect(m.reservedUsd("pulsern"), "re-pointed id closed other reservations").toBe(8);
    // And the ceiling still binds for the rest.
    expect(() => m.reserve("pulsern", 3)).toThrow(CapError);
  });

  /** MUTATION: drop `Object.freeze(this)` from the constructor. The freeze is
   * no longer load-bearing — identity keying is — but a handle is a value and
   * immutability is asserted directly rather than left to be inferred. */
  it("a minted handle is frozen", () => {
    const m = new MemorySpendMeter(AUG, CAPS10);
    const h = m.reserve("pulsern", 1);
    expect(Object.isFrozen(h), "a handle is mutable").toBe(true);
  });

  /** MUTATION: key #open by id again. A Proxy forwards every field perfectly
   * and is still not the key. */
  it("a Proxy wrapping a genuine handle is not that handle", () => {
    const m = new MemorySpendMeter(AUG, CAPS10);
    const real = m.reserve("pulsern", 10);
    const proxy = new Proxy(real, {}) as SpendReservation;
    m.release(proxy);
    expect(m.reservedUsd("pulsern"), "a Proxy released the real reservation").toBe(10);
    m.settle(proxy);
    expect(m.todayUsd("pulsern"), "a Proxy settled the real reservation").toBe(0);
    // The genuine handle still works exactly once.
    m.settle(real);
    expect(m.todayUsd("pulsern")).toBe(10);
    m.settle(real);
    expect(m.todayUsd("pulsern"), "settling twice charged twice").toBe(10);
  });

  /** MUTATION: as above. A subclass instance passes `instanceof` and is still
   * not a key. */
  it("a subclass instance and a prototype-forged object close nothing", () => {
    const m = new MemorySpendMeter(AUG, CAPS10);
    const real = m.reserve("pulsern", 10);
    const forged = Object.create(Object.getPrototypeOf(real)) as SpendReservation;
    Object.assign(forged, { id: real.id, clientId: real.clientId, amountUsd: real.amountUsd });
    expect(forged instanceof SpendReservation, "the forgery no longer clears instanceof").toBe(true);
    m.release(forged);
    m.settle(forged);
    expect(m.reservedUsd("pulsern"), "a prototype forgery moved the ledger").toBe(10);
    expect(m.todayUsd("pulsern")).toBe(0);
  });

  /** MUTATION: remove the brand check from the SpendReservation constructor. */
  it("a reservation cannot be constructed outside a meter", () => {
    const Ctor = SpendReservation as unknown as new (...a: unknown[]) => SpendReservation;
    expect(() => new Ctor(Symbol("fake"), "r1", "pulsern", 1)).toThrow(/only be minted by a meter/);
    expect(() => new Ctor(undefined, "r1", "pulsern", 1)).toThrow(MeterUnavailableError);
  });

  /** Reading the clock twice split one reservation across two periods: $7 on
   * the August 31 day and the September month, a tick apart (R5-08).
   *
   * MUTATION: call this.#now() separately for each key in #periods. */
  it("both period keys come from one clock read", () => {
    const BOUNDARY = Date.UTC(2026, 7, 31, 23, 59, 59, 999);
    const NEXT = Date.UTC(2026, 8, 1, 0, 0, 0);
    let pinned: number | null = null;
    let advanced = false;
    // Advances across a month boundary between consecutive reads — what a real
    // clock does at 23:59:59.999 on the last of the month.
    const clock = () => {
      if (pinned !== null) return pinned;
      if (advanced) return NEXT;
      advanced = true;
      return BOUNDARY;
    };
    const m = new MemorySpendMeter(clock, fixedCaps);
    m.settle(m.reserve("c", 7));
    // Read from the instant the reservation was taken. One clock read puts the
    // $7 on the August day AND the August month; two reads split it across
    // August's day and September's month, so the month ledger loses it.
    pinned = BOUNDARY;
    expect(m.todayUsd("c"), "the spend left the day it was made").toBe(7);
    expect(m.monthUsd("c"), "the day and month ledgers disagree about the same $7").toBe(7);
  });
});

describe("model layer — a forged attestation cannot bind a model (r4 lock 8 / H-04)", () => {
  /** The r3 lock passed a plain object literal, which `instanceof` alone
   * already rejects — so the WeakSet, which IS the fix, was never exercised.
   * The r4 review removed `|| !GENUINE.has(att)` and bound genome-tagger to a
   * model that never ran an eval, with the suite 168/168 green.
   *
   * MUTATION: remove `|| !GENUINE.has(att)` from assertAttestation. */
  it("an object built on EvalAttestation.prototype is refused, though it passes instanceof", () => {
    const forged = Object.create(EvalAttestation.prototype) as EvalAttestation;
    Object.assign(forged, {
      role: "genome-tagger",
      modelId: "llama-70b",
      score: 1,
      total: 5,
      passed: 5,
      outcomes: [],
    });
    // The premise the lock rests on: the forgery is indistinguishable by class.
    expect(forged instanceof EvalAttestation, "the forgery no longer clears instanceof").toBe(true);
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "llama-70b", forged)).toThrow(/executed eval run/);
  });

  /** MUTATION: delete the brand check from the EvalAttestation constructor.
   * Defence in depth for the same surface — a directly-constructed instance. */
  it("a directly constructed attestation is refused", () => {
    const Ctor = EvalAttestation as unknown as new (...a: unknown[]) => EvalAttestation;
    expect(() => new Ctor("genome-tagger", "llama-70b", 1, 5, 5, [])).toThrow();
  });

  it("and the genuine article, from an executed run, still binds", () => {
    const real = attestEvalRun(
      "genome-tagger",
      "qwen-72b",
      ["g1", "g2", "g3", "g4", "g5"].map((caseId) => ({ caseId, passed: true })),
    );
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "qwen-72b", real)).not.toThrow();
  });
});

/** Records the terminal meter operations `llm()` performs, so a test can assert
 * that a reservation is settled or released but never both and never neither. */
/** Records which of settle/release the gateway chose, and in what order.
 *
 * `reserve` is deliberately NOT wrapped. `llm()` pins it to the prototype's own
 * method, because it is the one that reads a ceiling and a replaced `reserve`
 * is the R8-01 seam wearing a test's clothes. It cost these assertions nothing:
 * a settle or a release proves a reservation existed to close, so the
 * "reserve" entry was never carrying information. */
function trackOps(meter: MemorySpendMeter, ops: string[]): void {
  const settle = meter.settle.bind(meter);
  const release = meter.release.bind(meter);
  meter.settle = (r: SpendReservation) => {
    ops.push("settle");
    settle(r);
  };
  meter.release = (r: SpendReservation) => {
    ops.push("release");
    release(r);
  };
}
