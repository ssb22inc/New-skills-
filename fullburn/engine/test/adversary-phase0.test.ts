/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROLE_BINDINGS } from "@fullburn/config/models";
import { effectiveAiCapsUsd, type ClientCaps } from "@fullburn/config/caps";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { isClass2 } from "../scripts/gate-lib.mjs";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { checkAdversaryReport } from "../scripts/gate-lib.mjs";
import { llm, type GatewayTransport } from "../src/gateway.ts";
import { computeGrades, type MetricSnapshot } from "../src/grade-registry.ts";
import { FrozenCapsSpendMeter, type SpendMeter } from "../src/spend-meter.ts";
import { MemoryTraceSink, TraceContext } from "../src/tracing.ts";
import { MemoryVaultBackend, vaultForClient } from "../src/vault.ts";
import { CANARY_SECRET, TEST_CLIENT, makeDeps, testClock, capsOf, fixedCaps } from "./helpers.ts";

/** ADVERSARY PHASE 0 — Phase B lock tests.
 *
 * Every test in this file reproduces a finding from
 * reports/ADVERSARY_REPORT_phase0.md. They are EXPECTED TO FAIL until the
 * builder fixes the underlying defect (adversary mandate: the adversary never
 * fixes builder code). All are deterministic: no timers, no randomness, no
 * wall-clock or network dependency. */

const LOW_AI_CAP: Readonly<Record<string, ClientCaps>> = {
  [TEST_CLIENT]: { ianaTimeZone: "UTC", dailyAdSpendUsd: 66, hardDailyAdSpendUsd: 75, totalAdSpendUsd: 2000, dailyAiSpendUsd: 0.05, monthlyAiSpendUsd: 0.05, humanSignoff: "test-fixture-signoff" },
};

/** Deterministic "slow" transport: yields the microtask queue a fixed number of
 * times so parallel llm() calls interleave identically on every run. */
class YieldingTransport implements GatewayTransport {
  calls = 0;
  response: unknown = { greeting: "ok" };
  async post(): Promise<unknown> {
    this.calls += 1;
    await Promise.resolve();
    await Promise.resolve();
    return this.response;
  }
}

function depsWith(meter: SpendMeter, transport: GatewayTransport, sink = new MemoryTraceSink()) {
  const backend = new MemoryVaultBackend();
  backend.set(TEST_CLIENT, "ai-gateway-key", CANARY_SECRET);
  return {
    deps: {
      transport,
      vault: vaultForClient(backend, TEST_CLIENT),
      meter,
      sink,
      gatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/test-account/fullburn/",
      now: () => 1_755_000_000_000,
      bindings: ROLE_BINDINGS,
    },
    sink,
  };
}

const req = (i: number) => ({
  role: "hello-world",
  clientId: TEST_CLIENT,
  input: { i },
  trace: new TraceContext(`adv-${i}`, TEST_CLIENT),
});

/** The narrowed ceilings these findings drive, resolved by the METER — a
 * caller cannot pass ceilings to reserve() any more (R7-06). */

describe("FINDING F1 (money loss) — the AI cap check races the meter", () => {
  it("concurrent calls must not collectively exceed the daily AI cap", async () => {
    const meter = new FrozenCapsSpendMeter(LOW_AI_CAP);
    const transport = new YieldingTransport();
    const { deps } = depsWith(meter, transport);

    // Cap $0.05, hello-world costs $0.01/call → at most 5 calls may ever be
    // permitted. read-then-await-then-record lets all 20 pass the same check.
    const settled = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => llm(deps, req(i))));
    const permitted = settled.filter((r) => r.status === "fulfilled").length;

    expect(permitted).toBeLessThanOrEqual(5);
    expect(meter.todayUsd(TEST_CLIENT)).toBeLessThanOrEqual(LOW_AI_CAP[TEST_CLIENT]!.dailyAiSpendUsd);
  });
});

describe("FINDING F2 (money loss) — a non-numeric meter reading fails OPEN", () => {
  const cases: [string, number][] = [
    ["NaN", Number.NaN],
    ["undefined", undefined as unknown as number],
  ];
  for (const [label, reading] of cases) {
    it(`a meter returning ${label} must refuse spend, not permit it`, async () => {
      const meter: SpendMeter = { todayUsd: () => reading };
      const { deps } = depsWith(meter, new YieldingTransport());
      // `NaN > cap` and `undefined + n > cap` are both false → the guard passes.
      await expect(llm(deps, req(0))).rejects.toThrow();
    });
  }
});

describe("FINDING F3 (money loss) — billable calls that fail after the transport are never metered", () => {
  it("a provider call that returns schema-invalid output still consumes the cap", async () => {
    const meter = new FrozenCapsSpendMeter(LOW_AI_CAP);
    const transport = new YieldingTransport();
    transport.response = { not_the_schema: true }; // provider billed us; validation rejects
    const { deps } = depsWith(meter, transport);

    for (let i = 0; i < 20; i++) {
      await llm(deps, req(i)).catch(() => undefined);
    }

    // ┌─ BUILDER MODIFICATION — flagged for adversary re-review ──────────────┐
    // │ Original assertion: `expect(transport.calls).toBe(20)`.               │
    // │ That encoded the DEFECT's symptom: 20 billable calls escaping a       │
    // │ $0.05 / $0.01-per-call cap. The fix (reserve-then-settle) makes the   │
    // │ cap refuse calls 6-20 BEFORE they leave, so only 5 can ever reach the │
    // │ transport — strictly stronger than metering all 20. The finding's     │
    // │ actual contract — "a billable call is metered even when the response  │
    // │ fails validation" — is asserted below and is what F3 was about.       │
    // └───────────────────────────────────────────────────────────────────────┘
    expect(transport.calls).toBeGreaterThan(0); // calls did leave the building
    expect(transport.calls).toBeLessThanOrEqual(5); // and the cap bounded them
    expect(meter.todayUsd(TEST_CLIENT)).toBeGreaterThan(0); // ...and they were charged
    expect(meter.todayUsd(TEST_CLIENT)).toBeCloseTo(transport.calls * 0.01, 10); // every one of them
  });
});

describe("FINDING F4 (control plane) — the adversary-report gate accepts a FAIL report", () => {
  const TREE = "abc123";

  it("a fenced example verdict must not open the gate for a FAIL report", () => {
    const report = ["# ADVERSARY_REPORT_phase0", "```", "Verdict: PASS", "```", "Verdict: FAIL", `verified-tree: ${TREE}`].join("\n");
    const res = checkAdversaryReport({ phase: "0", reportContent: report, currentTreeHash: TREE });
    expect(res.ok).toBe(false);
  });

  it("a prose decoy line above the real verdict must not open the gate", () => {
    const report = [
      "# ADVERSARY_REPORT_phase0",
      "  Verdict: PASS (this line is an example, not the verdict)",
      "Verdict: FAIL",
      `verified-tree: ${TREE}`,
    ].join("\n");
    expect(checkAdversaryReport({ phase: "0", reportContent: report, currentTreeHash: TREE }).ok).toBe(false);
  });

  it("a hyphen-suffixed verdict token must not read as PASS", () => {
    const report = ["# ADVERSARY_REPORT_phase0", "Verdict: PASS-PENDING-FIXES", `verified-tree: ${TREE}`].join("\n");
    expect(checkAdversaryReport({ phase: "0", reportContent: report, currentTreeHash: TREE }).ok).toBe(false);
  });
});

describe("FINDING F5 (control plane) — Class-2 protection omits the grading code and the money paths", () => {
  // Drives isClass2, the enforcement authority. These assertions used to name a
  // list nothing read (H-03), which is coverage in appearance only.
  const files = { toContain: (p: string) => expect(isClass2(p), `${p} is not Class 2`).toBe(true) };

  it("§12: the grading CODE is Class 2, not only its thresholds", () => {
    files.toContain("fullburn/engine/src/grade-registry.ts");
  });

  it("Law 15 / H17: money paths are Class 2", () => {
    files.toContain("fullburn/engine/src/gateway.ts");
    files.toContain("fullburn/engine/src/spend-meter.ts");
  });

  it("the CI leak/structural scanner is a gate and must be protected like the other gates", () => {
    files.toContain("fullburn/engine/scripts/leak-check.mjs");
  });

  it("the immutability primitive behind Law 2 is Class 2", () => {
    files.toContain("fullburn/config/src/freeze.ts");
  });

  it("the test-runner config can disable the invariant suite, so it is Class 2", () => {
    files.toContain("fullburn/vitest.config.ts");
  });
});

describe("FINDING F6 (data lies) — grades resolve through the prototype chain", () => {
  it("a polluted prototype must not forge an A out of an empty snapshot", () => {
    const proto = Object.prototype as unknown as Record<string, unknown>;
    proto["data-truth"] = { stripe_warehouse_drift_pct: 0 };
    try {
      const grade = computeGrades({} as MetricSnapshot).find((g) => g.area === "data-truth")!;
      expect(grade.grade).toBe("BELOW_A"); // fail closed: no snapshot, no A
    } finally {
      delete proto["data-truth"];
    }
  });
});

describe("FINDING F7 (isolation) — the vault secret escapes through a transport error", () => {
  it("no error leaving llm() may carry the secret, whatever the transport puts in its message", async () => {
    const meter = new FrozenCapsSpendMeter(LOW_AI_CAP);
    const leakyTransport: GatewayTransport = {
      async post(_url, _body, headers) {
        // Realistic: HTTP clients commonly attach request context to errors.
        throw new Error(`upstream 401 unauthorized: ${JSON.stringify(headers)}`);
      },
    };
    const { deps } = depsWith(meter, leakyTransport);
    const message = await llm(deps, req(0)).then(
      () => "",
      (e: Error) => `${e.name} ${e.message} ${e.stack ?? ""}`,
    );
    expect(message).not.toContain(CANARY_SECRET);
  });
});

describe("FINDING F8 (observability, Law 11) — failed calls emit no trace at all", () => {
  it("a call that reaches the provider and then fails must still be traced", async () => {
    const { deps, sink } = depsWith(new FrozenCapsSpendMeter(LOW_AI_CAP), {
      async post() {
        throw new Error("upstream 500");
      },
    });
    await llm(deps, req(0)).catch(() => undefined);
    expect(sink.events).toHaveLength(1);
  });
});

describe("FINDING F10 (honesty) — the live-verification ledger omits unmet Phase 0 deliverables", () => {
  const ledger = readFileSync(new URL("../../reports/LIVE_VERIFICATION_LEDGER.md", import.meta.url), "utf8");

  it("ClickHouse Cloud + Airbyte provisioning (Phase 0 deliverables, H3/H4) are tracked", () => {
    expect(ledger).toMatch(/ClickHouse/i);
    expect(ledger).toMatch(/Airbyte/i);
  });

  it("the vault's unmet 'encrypted, auto-rotated' half is tracked", () => {
    expect(ledger).toMatch(/encrypt/i);
    expect(ledger).toMatch(/rotat/i);
  });
});

describe("AC 2 (lock) — a real frontier → open-source rebind serves with zero code change", () => {
  it("routes to the open-source gateway path after rebinding, same llm() call site", async () => {
    // Encoded because the existing eval-rebind test rebinds qwen-72b → qwen-72b,
    // which is a no-op and does not demonstrate AC 2's frontier → open-source move.
    const { deps, transport } = makeDeps({ capsTable: LOW_AI_CAP });
    const frontier = { ...ROLE_BINDINGS, "genome-tagger": "gpt-5" };
    transport.response = { hook: "h", angle: "a", emotion: "e", format: "f", offer: "o" };
    await llm({ ...deps, bindings: frontier }, {
      role: "genome-tagger",
      clientId: TEST_CLIENT,
      input: { ad: "x" },
      trace: new TraceContext("ac2-frontier", TEST_CLIENT),
    });
    expect(transport.requests.at(-1)!.url).toContain("openai/gpt-5");

    const openSource = { ...frontier, "genome-tagger": "qwen-72b" };
    await llm({ ...deps, bindings: openSource }, {
      role: "genome-tagger",
      clientId: TEST_CLIENT,
      input: { ad: "x" },
      trace: new TraceContext("ac2-oss", TEST_CLIENT),
    });
    expect(transport.requests.at(-1)!.url).toContain("workers-ai/qwen-72b");
  });
});

describe("FINDING F13 (honesty) — §10.2 checklist entries labelled LIVE that assert nothing", () => {
  const checklist = readFileSync(new URL("./invariants/invariants.test.ts", import.meta.url), "utf8");

  it("no LIVE checklist entry may be a tautology", () => {
    // Two entries — "spend caps present, immutable, breach-tested" and "tokens
    // exist only in the vault" — are `expect(true).toBe(true)`. They pass on a
    // repo with the caps and the leak scan deleted.
    expect(checklist).not.toMatch(/expect\(true\)\.toBe\(true\)/);
  });

  it("the checklist's own arithmetic matches the file (it claims 4 LIVE, there are 5)", () => {
    const claimed = Number(/(\d+) are live below/.exec(checklist)?.[1] ?? -1);
    const actual = (checklist.match(/it\("LIVE — /g) ?? []).length;
    expect(claimed).toBe(actual);
  });
});
