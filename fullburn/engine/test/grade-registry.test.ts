import { describe, expect, it } from "vitest";
import { GRADE_AREAS } from "@fullburn/config/grade-thresholds";
import { computeGrades, enforcement, gradeAndEnforce, publishGradeReport, type MetricSnapshot } from "../src/grade-registry.ts";
import { MemoryTraceSink, TraceContext, TraceEmitError } from "../src/tracing.ts";
import { CANARY_SECRET } from "./helpers.ts";

const ALL_A: MetricSnapshot = {
  "marketing-engine": {
    cac_beats_baseline_by_day_90: true,
    blended_roas: 5.1,
    reconciliation_drift_pct: 1.3,
    cap_breaches: 0,
    policy_strikes: 0,
  },
  "model-layer": { roles_below_eval_threshold: 0, family_diversity_holds: true, monthly_failover_drill_passed: true },
  "adversary-layer": { decisions_with_verdicts_pct: 100, unreviewed_fails: 0, injection_drills_passed: true },
  "data-truth": { stripe_warehouse_drift_pct: 1.3, incrementality_gap_stated: true },
  "wordpress-seo": {
    organic_clicks_vs_baseline_pct: 18,
    cwv_pass_rate_pct: 86,
    indexation_health_pct: 98,
    mutations_reversible_pct: 100,
    verdicts_before_window_close: 0,
  },
  "dummy-proof": { unassisted_onboarding_completion_pct: 93, red_button_drill_seconds: 41, client_screens: 4 },
  "security-isolation": {
    cross_tenant_events: 0,
    bot_filtration_pct: 98.7,
    wp_credentials_admin_wide: false,
    token_leaks: 0,
  },
  "business-health": {
    per_client_cogs_under_margin_floor: true,
    our_cac_within_target: true,
    our_churn_within_target: true,
    human_queue_sev12_median_latency_hours: 6,
    human_queue_median_latency_hours: 18,
    human_queue_shrinking_mom: true,
    guarantee_exposure_within_cap: true,
    continuity_drills_passed: true,
  },
};

describe("grade registry (AC 3, §12, Law 14)", () => {
  it("covers every area §12 enumerates", () => {
    // Adversary finding F12: an area with no thresholds is never computed and
    // can never drop below A, so its autonomy never freezes.
    expect(GRADE_AREAS.map((a) => a.area).sort()).toEqual(
      [
        "adversary-layer",
        "business-health",
        "data-truth",
        "dummy-proof",
        "marketing-engine",
        "model-layer",
        "security-isolation",
        "wordpress-seo",
      ],
    );
  });

  it("computes and publishes a grade from seeded data", () => {
    const grades = computeGrades(ALL_A);
    expect(grades).toHaveLength(GRADE_AREAS.length);
    expect(grades.every((g) => g.grade === "A")).toBe(true);
    const report = JSON.parse(publishGradeReport(grades, 1_755_000_000_000)) as { grades: unknown[] };
    expect(report.grades).toHaveLength(GRADE_AREAS.length);
  });

  it("a below-A dip triggers step-down, improvement halt, and human alert", () => {
    const dipped = { ...ALL_A, "data-truth": { stripe_warehouse_drift_pct: 6.2 } };
    const grades = computeGrades(dipped);
    const dataTruth = grades.find((g) => g.area === "data-truth")!;
    expect(dataTruth.grade).toBe("BELOW_A");
    expect(dataTruth.failing).toEqual(["stripe_warehouse_drift_pct"]);
    expect(enforcement(grades)).toEqual([
      { type: "STEP_DOWN_TRUST_LADDER", area: "data-truth" },
      { type: "HALT_AUTO_IMPROVEMENTS", area: "data-truth" },
      { type: "ALERT_HUMAN", area: "data-truth" },
    ]);
  });

  it("guarantee exposure over its cap drops business health below A (§14, Law 17)", () => {
    const exposed = {
      ...ALL_A,
      "business-health": { ...ALL_A["business-health"]!, guarantee_exposure_within_cap: false },
    };
    const g = computeGrades(exposed).find((x) => x.area === "business-health")!;
    expect(g.grade).toBe("BELOW_A");
    expect(g.failing).toEqual(["guarantee_exposure_within_cap"]);
  });

  it("missing metrics are BELOW_A, never assumed fine (fail closed)", () => {
    const partial = { ...ALL_A, "security-isolation": { cross_tenant_events: 0 } };
    const g = computeGrades(partial).find((x) => x.area === "security-isolation")!;
    expect(g.grade).toBe("BELOW_A");
    expect(g.missing).toEqual(["bot_filtration_pct", "wp_credentials_admin_wide", "token_leaks"]);
  });

  it("every §12 A-criterion has a threshold, so none can be silently unenforceable (R2-21)", () => {
    // Nine criteria the spec states were absent from the table entirely: an
    // area with no threshold for a criterion can never drop below A on it.
    const keys = new Set(GRADE_AREAS.flatMap((a) => a.metrics.map((m) => m.key)));
    for (const required of [
      "cac_beats_baseline_by_day_90",
      "blended_roas",
      "monthly_failover_drill_passed",
      "injection_drills_passed",
      "incrementality_gap_stated",
      "unassisted_onboarding_completion_pct",
      "bot_filtration_pct",
      "wp_credentials_admin_wide",
      "our_cac_within_target",
      "our_churn_within_target",
      // DT-05: §5.1's severity 1–2 same-day SLA needs its own threshold; a
      // median under 72h is satisfied by a month where every sev-1 breached.
      "human_queue_sev12_median_latency_hours",
    ]) {
      expect(keys).toContain(required);
    }
  });

  it("out-of-domain readings fail CLOSED, not open (R2-20)", () => {
    // -Infinity satisfied every "<" threshold and +Infinity every ">=" one, so
    // an impossible number graded A and suppressed enforcement entirely.
    for (const bad of [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NaN]) {
      const spoofed = { ...ALL_A, "data-truth": { stripe_warehouse_drift_pct: bad, incrementality_gap_stated: true } };
      const g = computeGrades(spoofed).find((x) => x.area === "data-truth")!;
      expect(g.grade).toBe("BELOW_A");
      expect(g.failing).toContain("stripe_warehouse_drift_pct");
    }
    const negative = { ...ALL_A, "dummy-proof": { ...ALL_A["dummy-proof"]!, red_button_drill_seconds: -5 } };
    expect(computeGrades(negative).find((x) => x.area === "dummy-proof")!.grade).toBe("BELOW_A");
  });

  it("an entirely absent area is BELOW_A", () => {
    const { "data-truth": _omitted, ...rest } = ALL_A;
    const g = computeGrades(rest).find((x) => x.area === "data-truth")!;
    expect(g.grade).toBe("BELOW_A");
  });

  /** X2-14 (cross-family, 2026-09-24): grade decisions produced step-downs,
   * halts and alerts with no trace. The boundary now traces every decision
   * and fails closed. MUTATION: GR-01, GR-02, GR-03, GR-04. */
  it("gradeAndEnforce traces the snapshot, grades and actions before returning them", async () => {
    const sink = new MemoryTraceSink();
    const dipped = { ...ALL_A, "data-truth": { stripe_warehouse_drift_pct: 6.2 } };
    const out = await gradeAndEnforce(dipped, { sink, trace: new TraceContext("grades-1", "engine"), now: () => 42 });
    expect(out.actions.map((a) => a.type)).toEqual(["STEP_DOWN_TRUST_LADDER", "HALT_AUTO_IMPROVEMENTS", "ALERT_HUMAN"]);
    expect(sink.events).toHaveLength(1);
    const e = sink.events[0]!;
    expect(e).toMatchObject({ traceId: "grades-1", role: "grade-registry", outcome: "ok", startedAtMs: 42, costUsd: 0 });
    // X3-07: the trace carries the GRADED metrics only — the dipped area's
    // missing readings appear as null, never the caller's raw object.
    expect((e.input as Record<string, Record<string, unknown>>)["data-truth"]).toMatchObject({ stripe_warehouse_drift_pct: 6.2 });
    expect(e.input).not.toBe(dipped);
    expect((e.output as { actions: unknown[] }).actions).toEqual(out.actions);
    expect(JSON.parse(out.report).grades).toHaveLength(GRADE_AREAS.length);
  });

  it("a sink outage refuses the decision — nothing is returned untraced", async () => {
    const sink = new MemoryTraceSink();
    sink.setFailing(true);
    await expect(gradeAndEnforce(ALL_A, { sink, trace: new TraceContext("grades-2", "engine"), now: () => 0 })).rejects.toThrow(TraceEmitError);
  });

  it("no TraceContext, no decision", async () => {
    const sink = new MemoryTraceSink();
    await expect(gradeAndEnforce(ALL_A, { sink, trace: null as unknown as TraceContext, now: () => 0 })).rejects.toThrow(/requires a TraceContext/);
    expect(sink.events).toHaveLength(0);
  });

  it("a failure inside the computation is traced as an error and re-thrown", async () => {
    const sink = new MemoryTraceSink();
    const boom = () => { throw new RangeError("hostile snapshot"); };
    const hostile = new Proxy({}, { ownKeys: boom, get: boom, has: boom, getOwnPropertyDescriptor: boom }) as MetricSnapshot;
    await expect(gradeAndEnforce(hostile, { sink, trace: new TraceContext("grades-3", "engine"), now: () => 0 })).rejects.toThrow();
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]!.outcome).toBe("error");
    expect(sink.events[0]!.errorMessage).not.toContain("hostile snapshot");
  });

  it("the Worker entry exports the traced boundary and not the untraced decision helpers", async () => {
    const entry = (await import("../src/index.ts")) as Record<string, unknown>;
    expect(typeof entry["gradeAndEnforce"]).toBe("function");
    expect(entry["enforcement"], "an untraced enforcement path is on the Worker surface").toBeUndefined();
    expect(entry["publishGradeReport"], "an untraced publication path is on the Worker surface").toBeUndefined();
  });

  /** X3-07 (cross-family, 2026-10-04): the trace copied the caller's snapshot,
   * so an ungraded extra field carrying a credential reached the sink; and the
   * error path re-threw the thrower's own error. MUTATION: X3-07. */
  it("an ungraded field never reaches the trace, and a hostile error never reaches the caller", async () => {
    const sink = new MemoryTraceSink();
    const withExtra = { ...ALL_A, "data-truth": { ...ALL_A["data-truth"], api_key: CANARY_SECRET } } as unknown as MetricSnapshot;
    await gradeAndEnforce(withExtra, { sink, trace: new TraceContext("grades-x3", "engine"), now: () => 0 });
    expect(JSON.stringify(sink.events), "an ungraded credential field was traced").not.toContain(CANARY_SECRET);
    const hostileArea = {} as Record<string, unknown>;
    Object.defineProperty(hostileArea, "stripe_warehouse_drift_pct", { enumerable: true, get() { const e = new Error(`boom ${CANARY_SECRET}`); (e as unknown as { cause: unknown }).cause = CANARY_SECRET; throw e; } });
    const hostile = { ...ALL_A, "data-truth": hostileArea } as unknown as MetricSnapshot;
    const sink2 = new MemoryTraceSink();
    // X4-11: the accessor is never RUN — grading uses the traced plain copy,
    // where an accessor-backed reading is null — so the area grades BELOW_A,
    // the trace and the grade agree, and nothing the getter would throw exists.
    const out = await gradeAndEnforce(hostile, { sink: sink2, trace: new TraceContext("grades-x3b", "engine"), now: () => 0 });
    expect(out.grades.find((g) => g.area === "data-truth")!.grade).toBe("BELOW_A");
    expect((sink2.events[0]!.input as Record<string, Record<string, unknown>>)["data-truth"]!["stripe_warehouse_drift_pct"]).toBe(null);
    expect(JSON.stringify(sink2.events)).not.toContain(CANARY_SECRET);
  });
});
