import { describe, expect, it } from "vitest";
import { CapError, effectiveDailyAiCapUsd, getCaps } from "@fullburn/config/caps";
import { GOLDEN_SET_CASE_IDS, ROLE_BINDINGS, bindRole, attestEvalRun, type EvalAttestation } from "@fullburn/config/models";
import { llm } from "../src/gateway.ts";
import { MemorySpendMeter, MeterUnavailableError, type SpendMeter } from "../src/spend-meter.ts";
import { computeGrades, type MetricSnapshot } from "../src/grade-registry.ts";
import { MemoryVaultBackend, vaultForClient } from "../src/vault.ts";
import { TraceContext } from "../src/tracing.ts";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { checkAdversaryReport, checkClass2Approvals, isClass2, parseVerdict } from "../scripts/gate-lib.mjs";
import { CANARY_SECRET, TEST_CLIENT, makeDeps } from "./helpers.ts";

/** LOCK TESTS.
 *
 * Every test here was written against a specific one-line mutation and verified
 * to FAIL with that mutation applied and PASS without it. The r3 review found
 * roughly fifteen fixes that were behaviourally correct but had no test at all:
 * a one-line revert of each left the whole suite green, which means the fix
 * would have rotted out silently. A fix without a failing test is a fix with a
 * shelf life.
 *
 * The mutation each test locks is named in its comment. */

const trace = (id: string, client = TEST_CLIENT) => new TraceContext(id, client);

describe("money — a request that left the building is never released (M-01, M-04)", () => {
  // MUTATION: move `departed = true` back to after `meter.settle(...)`, or drop
  // `!departed` from the release condition in the outer catch.
  it("a settle() that throws must NOT return the headroom for a billed request", async () => {
    const real = new MemorySpendMeter();
    let released = 0;
    const brittle: SpendMeter = {
      todayUsd: (c) => real.todayUsd(c),
      reservedUsd: (c) => real.reservedUsd(c),
      record: (c, u) => real.record(c, u),
      reserve: (c, a, cap) => real.reserve(c, a, cap),
      settle: () => {
        throw new Error("storage put failed");
      },
      release: (r) => {
        released += 1;
        real.release(r);
      },
    };
    const { deps, backend } = makeDeps();
    let billable = 0;
    const transport = {
      async post() {
        billable += 1;
        return { greeting: "ok" };
      },
    };
    for (let i = 0; i < 40; i++) {
      await llm({ ...deps, meter: brittle, transport, vault: vaultForClient(backend, TEST_CLIENT), bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: trace(`m1-${i}`),
      }).catch(() => undefined);
    }
    // The provider served every one of these. The cap must still bind: with the
    // headroom refunded instead, this loop ran unbounded at 40x the ceiling.
    expect(billable).toBeGreaterThan(0);
    expect(released).toBe(0);
    expect(real.reservedUsd(TEST_CLIENT)).toBeGreaterThan(0);
  });

  // MUTATION: same as above, on the transport-error leg.
  it("a transport error followed by a failing settle also keeps the charge", async () => {
    const real = new MemorySpendMeter();
    let released = 0;
    const brittle: SpendMeter = {
      todayUsd: (c) => real.todayUsd(c),
      reservedUsd: (c) => real.reservedUsd(c),
      record: (c, u) => real.record(c, u),
      reserve: (c, a, cap) => real.reserve(c, a, cap),
      settle: () => {
        throw new Error("storage put failed");
      },
      release: (r) => {
        released += 1;
        real.release(r);
      },
    };
    const { deps } = makeDeps();
    const failing = {
      async post() {
        throw new Error("upstream 504");
      },
    };
    await llm({ ...deps, meter: brittle, transport: failing, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: TEST_CLIENT,
      input: {},
      trace: trace("m1b"),
    }).catch(() => undefined);
    expect(released).toBe(0);
  });
});

describe("money — the narrowing override can only narrow (M-02)", () => {
  // MUTATION: `return Math.min(ceiling, requested)` → `return requested`.
  it("a caller-supplied table cannot raise the frozen ceiling", () => {
    const ceiling = getCaps(TEST_CLIENT).dailyAiSpendUsd;
    expect(effectiveDailyAiCapUsd(TEST_CLIENT, { [TEST_CLIENT]: { dailyAiSpendUsd: 1e9 } })).toBe(ceiling);
    expect(effectiveDailyAiCapUsd(TEST_CLIENT, { [TEST_CLIENT]: { dailyAiSpendUsd: 0.05 } })).toBe(0.05);
    expect(effectiveDailyAiCapUsd(TEST_CLIENT)).toBe(ceiling);
  });

  // MUTATION: drop `assertCapsUsable(caps)` from effectiveDailyAiCapUsd.
  it("a narrowing table cannot manufacture a sign-off for an unsigned client", () => {
    expect(() =>
      effectiveDailyAiCapUsd("pulsern", { pulsern: { dailyAiSpendUsd: 1 } } as never),
    ).toThrow(/human sign-off/);
  });

  it("an unknown client cannot be invented by the override", () => {
    expect(() => effectiveDailyAiCapUsd("ghost", { ghost: { dailyAiSpendUsd: 100 } })).toThrow(CapError);
  });
});

describe("money — a DAILY cap has a day (M-03)", () => {
  // MUTATION: drop the day component from MemorySpendMeter's ledger key.
  it("the ceiling rolls over: a client that spent today can spend tomorrow", () => {
    let now = Date.parse("2026-08-15T12:00:00Z");
    const m = new MemorySpendMeter(() => now);
    m.settle(m.reserve("c", 5, 5));
    expect(() => m.reserve("c", 1, 5)).toThrow(CapError); // spent for today
    now = Date.parse("2026-08-16T00:30:00Z");
    expect(() => m.reserve("c", 5, 5)).not.toThrow(); // new day, new ceiling
    expect(m.todayUsd("c")).toBe(0);
  });

  it("within one day the ceiling still binds", () => {
    let now = Date.parse("2026-08-15T00:10:00Z");
    const m = new MemorySpendMeter(() => now);
    m.settle(m.reserve("c", 5, 5));
    now = Date.parse("2026-08-15T23:50:00Z");
    expect(() => m.reserve("c", 1, 5)).toThrow(CapError);
  });

  it("a reservation settles against the day it was taken, not the day it lands", () => {
    let now = Date.parse("2026-08-15T23:59:59Z");
    const m = new MemorySpendMeter(() => now);
    const r = m.reserve("c", 1, 5);
    now = Date.parse("2026-08-16T00:00:01Z");
    m.settle(r);
    expect(m.todayUsd("c")).toBe(0); // the new day is clean
    now = Date.parse("2026-08-15T23:59:59Z");
    expect(m.todayUsd("c")).toBe(1); // the spend belongs to the day it was made
  });
});

describe("money — isolation guards on the ledger (H-14, H-15)", () => {
  // MUTATION: remove the `open.clientId !== reservation.clientId` check in #close.
  it("one tenant cannot close another tenant's reservation", () => {
    const m = new MemorySpendMeter();
    const a = m.reserve("tenant-a", 1, 5);
    m.settle({ ...a, clientId: "tenant-b" });
    expect(m.reservedUsd("tenant-a")).toBe(1); // still held by A
    expect(m.todayUsd("tenant-b")).toBe(0); // and B was not credited
  });

  // MUTATION: revert getCaps's Object.hasOwn guard to a direct index.
  it("a polluted prototype cannot mint caps for a client that has none", () => {
    const proto = Object.prototype as unknown as Record<string, unknown>;
    proto["ghost-client"] = { dailyAdSpendUsd: 1e9, totalAdSpendUsd: 1e9, dailyAiSpendUsd: 1e9, humanSignoff: "forged" };
    try {
      expect(() => getCaps("ghost-client")).toThrow(/spend is forbidden/);
    } finally {
      delete proto["ghost-client"];
    }
  });
});

describe("data truth — the guards that make grades and bindings honest (H-04, H-06)", () => {
  // MUTATION: remove the GENUINE WeakSet check from assertAttestation.
  it("an attestation-shaped literal does not bind a model", () => {
    const forged = {
      role: "genome-tagger",
      modelId: "qwen-72b",
      score: 1,
      total: 5,
      passed: 5,
      outcomes: [],
    } as unknown as EvalAttestation;
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "qwen-72b", forged)).toThrow(/executed eval run/);
    // A genuine one, from the factory, does bind.
    const real = attestEvalRun(
      "genome-tagger",
      "qwen-72b",
      GOLDEN_SET_CASE_IDS["genome-tagger"]!.map((caseId) => ({ caseId, passed: true })),
    );
    expect(() => bindRole(ROLE_BINDINGS, "genome-tagger", "qwen-72b", real)).not.toThrow();
  });

  // MUTATION: revert computeGrades' Object.hasOwn guards to direct indexing.
  it("a polluted prototype cannot forge an A out of an empty snapshot", () => {
    const proto = Object.prototype as unknown as Record<string, unknown>;
    proto["data-truth"] = { stripe_warehouse_drift_pct: 0, incrementality_gap_stated: true };
    try {
      const g = computeGrades({} as MetricSnapshot).find((x) => x.area === "data-truth")!;
      expect(g.grade).toBe("BELOW_A");
    } finally {
      delete proto["data-truth"];
    }
  });
});

describe("isolation — the vault key composition (H-13)", () => {
  // MUTATION: revert #key to any single-delimiter join.
  it("no pair of distinct (client, name) inputs collides, for ANY delimiter", () => {
    const backend = new MemoryVaultBackend();
    // Each pair below collides under some naive delimiter (space, colon, NUL, |).
    const pairs: [string, string][] = [
      ["a", "b:c"],
      ["a:b", "c"],
      ["a", "b c"],
      ["a b", "c"],
      ["a|b", "c"],
      ["a", "b|c"],
    ];
    pairs.forEach(([client, name], i) => backend.set(client, name, `secret-${i}`));
    pairs.forEach(([client, name], i) => {
      expect(vaultForClient(backend, client).get(name).value).toBe(`secret-${i}`);
    });
  });
});

describe("control plane — the gate's own defences (R3-CP-01..06)", () => {
  const TREE = "abc1234def5678";
  const report = (verdictLine: string, tree = TREE) => ["# r", verdictLine, `verified-tree: ${tree}`].join("\n");

  // MUTATION: compare only the fence character, not its length.
  it("a 3-backtick fence does not close a 4-backtick block (R3-CP-02)", () => {
    const nested = ["# r", "````markdown", "```", "Verdict: PASS", "```", "````", "Verdict: FAIL"].join("\n");
    expect(parseVerdict(nested)?.token).toBe("FAIL");
  });

  // MUTATION: judge the verdict before establishing freshness.
  it("a fresh report with an UNPARSEABLE verdict blocks, it is not filed as history (R3-CP-06)", () => {
    for (const bad of ["> Verdict: FAIL", "Vеrdict: FAIL", "  Verdict: FAIL"]) {
      const reports = [
        { name: "a.md", content: report("Verdict: PASS") },
        { name: "b.md", content: report(bad) },
      ];
      const res = checkAdversaryReport({ phase: "0", reports, currentTreeHash: TREE });
      expect(res.ok, `an unparseable verdict bound to this tree must block: ${bad}`).toBe(false);
    }
  });

  // MUTATION: remove the base-commit clause from the approval match.
  it("an approval is bound to ONE pull request's base commit (R3-CP-01)", () => {
    const doc = (base: string) => ({
      path: "fullburn/APPROVALS/x.md",
      status: "added",
      content: `approves: fullburn/config/src/caps.ts\nbase-commit: ${base}\nfrom-content-hash: cafe01\ncontent-hash: deadbeef`,
    });
    const args = {
      changedFiles: [{ status: "modified", path: "fullburn/config/src/caps.ts" }],
      hashOf: () => "deadbeef",
      baseHashOf: () => "cafe01",
      baseCommit: "base-sha-of-this-pr",
    };
    expect(checkClass2Approvals({ ...args, approvalDocs: [doc("base-sha-of-this-pr")] }).ok).toBe(true);
    // The same content transition, approved against a DIFFERENT PR — a replayed
    // approval after a revert restored the old bytes — must not authorize it.
    expect(checkClass2Approvals({ ...args, approvalDocs: [doc("some-older-commit")] }).ok).toBe(false);
  });

  // MUTATION: remove any of these patterns from CLASS2_PATTERNS.
  it("the test runner, the deploy config and the whole engine source are Class 2 (R3-CP-03, R3-CP-04)", () => {
    for (const p of [
      "fullburn/vitest.workspace.ts", // silences 145 of 148 tests
      "fullburn/vitest.config.ts",
      "fullburn/engine/src/index.ts", // the deployed Worker entrypoint
      "fullburn/engine/src/shadow.ts", // ...and anything it could re-export from
      "fullburn/engine/wrangler.toml",
      "fullburn/.gitignore",
    ]) {
      expect(isClass2(p), `${p} must be Class 2`).toBe(true);
    }
  });
});

describe("secret containment stays wired (C1)", () => {
  // MUTATION: revert redactError to rethrowing the original error.
  it("a thrown value whose message getter throws cannot carry the secret out", async () => {
    const { deps } = makeDeps();
    const hostile = {
      get message() {
        throw new Error("boom");
      },
    };
    const evil = {
      async post(_u: string, _b: unknown, headers: Readonly<Record<string, string>>) {
        (hostile as Record<string, unknown>).ctx = JSON.stringify(headers);
        throw hostile;
      },
    };
    const msg = await llm({ ...deps, transport: evil, bindings: ROLE_BINDINGS }, {
      role: "hello-world",
      clientId: TEST_CLIENT,
      input: {},
      trace: trace("c1"),
    }).then(
      () => "",
      (e: Error) => `${e.name} ${e.message} ${e.stack ?? ""}`,
    );
    expect(msg).not.toContain(CANARY_SECRET);
  });
});

describe("the meter contract llm() depends on (fail closed)", () => {
  it("a meter without reserve/settle/release/reservedUsd is refused outright", async () => {
    const { deps } = makeDeps();
    const legacy = { todayUsd: () => 0, record: () => {} } as unknown as SpendMeter;
    await expect(
      llm({ ...deps, meter: legacy, bindings: ROLE_BINDINGS }, {
        role: "hello-world",
        clientId: TEST_CLIENT,
        input: {},
        trace: trace("legacy"),
      }),
    ).rejects.toThrow(MeterUnavailableError);
  });
});
