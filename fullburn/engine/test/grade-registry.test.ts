import { describe, expect, it } from "vitest";
import { GRADE_AREAS } from "@fullburn/config/grade-thresholds";
import { computeGrades, enforcement, publishGradeReport, type MetricSnapshot } from "../src/grade-registry.ts";

const ALL_A: MetricSnapshot = {
  "marketing-engine": { reconciliation_drift_pct: 1.3, cap_breaches: 0, policy_strikes: 0 },
  "model-layer": { roles_below_eval_threshold: 0, family_diversity_holds: true },
  "adversary-layer": { decisions_with_verdicts_pct: 100, unreviewed_fails: 0 },
  "data-truth": { stripe_warehouse_drift_pct: 1.3 },
  "wordpress-seo": {
    organic_clicks_vs_baseline_pct: 18,
    cwv_pass_rate_pct: 86,
    indexation_health_pct: 98,
    mutations_reversible_pct: 100,
    verdicts_before_window_close: 0,
  },
  "dummy-proof": { red_button_drill_seconds: 41, client_screens: 4 },
  "security-isolation": { cross_tenant_events: 0, token_leaks: 0 },
  "business-health": {
    per_client_cogs_under_margin_floor: true,
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
    expect(g.missing).toEqual(["token_leaks"]);
  });

  it("an entirely absent area is BELOW_A", () => {
    const { "data-truth": _omitted, ...rest } = ALL_A;
    const g = computeGrades(rest).find((x) => x.area === "data-truth")!;
    expect(g.grade).toBe("BELOW_A");
  });
});
