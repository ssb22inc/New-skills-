import { describe, expect, it } from "vitest";
import { EvalAttestation, ROLE_BINDINGS, attestEvalRun, bindRole } from "@fullburn/config/models";
import { getCaps } from "@fullburn/config/caps";
import { llm } from "../src/gateway.ts";
import { MemorySpendMeter, MeterUnavailableError, type SpendReservation } from "../src/spend-meter.ts";
import { TraceContext } from "../src/tracing.ts";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { checkAdversaryReport, isClass2, parseVerdict } from "../scripts/gate-lib.mjs";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { scanContent } from "../scripts/scan-lib.mjs";
import { TEST_CLIENT, makeDeps, testClock } from "./helpers.ts";

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
    const meter = new MemorySpendMeter(() => nowMs);
    const held = meter.reserve(TEST_CLIENT, 3, 5);
    expect(meter.reservedUsd(TEST_CLIENT)).toBeCloseTo(3, 6);

    nowMs += 2 * 60_000; // 00:01 the next day
    expect(meter.reservedUsd(TEST_CLIENT), "held money vanished across midnight").toBeCloseTo(3, 6);

    // And the accounting still lands on the day the spend was made.
    meter.settle(held);
    expect(meter.reservedUsd(TEST_CLIENT)).toBe(0);
    expect(meter.todayUsd(TEST_CLIENT)).toBe(0); // the new day is clean
  });

  it("another client's reservation is not visible on this client's reading", () => {
    const meter = new MemorySpendMeter(testClock);
    meter.reserve("fixture-other", 2, 5);
    expect(meter.reservedUsd(TEST_CLIENT)).toBe(0);
  });
});

describe("money — a request that never departed is not billable (N-07, N-08)", () => {
  /** `departed = true` was set before the transport call, so a transport that
   * threw synchronously — or had no `post` at all — was settled as billable
   * although it provably never left the building.
   *
   * MUTATION: move `departed = true` back above the `transport.post(...)` call. */
  it("a synchronous transport throw is released, not settled", async () => {
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
    expect(ops).toEqual(["reserve", "release"]);
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
    expect(ops).toEqual(["reserve", "settle"]);
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
          throw new Error("never departs");
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
    const shaped = "sk-ant-ABCDEFGH12345678";
    expect((DECLARED_FIXTURES as string[]).includes(shaped), "the shaped fixture is no longer declared").toBe(true);
    expect(scanContent(P, `sk-ant-ABCDEFGH12345678${live}`).length, "a live key beginning with the fixture").toBeGreaterThan(0);
    expect(scanContent(P, `AKIA${shaped}ABCDEFGHIJKLMNOP`).length, "the fixture splitting an AWS key").toBeGreaterThan(0);
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
function trackOps(meter: MemorySpendMeter, ops: string[]): void {
  const reserve = meter.reserve.bind(meter);
  const settle = meter.settle.bind(meter);
  const release = meter.release.bind(meter);
  meter.reserve = (c: string, a: number, cap: number) => {
    ops.push("reserve");
    return reserve(c, a, cap);
  };
  meter.settle = (r: SpendReservation) => {
    ops.push("settle");
    settle(r);
  };
  meter.release = (r: SpendReservation) => {
    ops.push("release");
    release(r);
  };
}
