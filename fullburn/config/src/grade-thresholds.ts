import { deepFreeze } from "./freeze.ts";

/** CLASS 2 — Grade Registry thresholds (ENGINE_BUILD.md §12, Law 14). Initial
 * values pending H9 sign-off. Human-change-only: edits require an APPROVALS/
 * entry (class2-gate). No agent, including the adversary, may move this bar. */

export type MetricOp = "<" | "<=" | ">=" | "==" | "==0" | "==true";

export interface MetricThreshold {
  readonly key: string;
  readonly op: MetricOp;
  readonly value: number | boolean;
}

export interface AreaThresholds {
  readonly area: string;
  readonly metrics: readonly MetricThreshold[];
}

export const GRADE_AREAS: readonly AreaThresholds[] = deepFreeze([
  {
    area: "marketing-engine",
    metrics: [
      { key: "reconciliation_drift_pct", op: "<", value: 2 },
      { key: "cap_breaches", op: "==0", value: 0 },
      { key: "policy_strikes", op: "==0", value: 0 },
    ],
  },
  {
    area: "model-layer",
    metrics: [
      { key: "roles_below_eval_threshold", op: "==0", value: 0 },
      { key: "family_diversity_holds", op: "==true", value: true },
    ],
  },
  {
    area: "adversary-layer",
    metrics: [
      { key: "decisions_with_verdicts_pct", op: ">=", value: 100 },
      { key: "unreviewed_fails", op: "==0", value: 0 },
    ],
  },
  {
    area: "data-truth",
    metrics: [{ key: "stripe_warehouse_drift_pct", op: "<", value: 2 }],
  },
  {
    // §12 row "WordPress / SEO" (adversary finding F12 — the area existed in the
    // spec's table but had no thresholds, so it could never drop below A).
    area: "wordpress-seo",
    metrics: [
      { key: "organic_clicks_vs_baseline_pct", op: ">=", value: 0 },
      { key: "cwv_pass_rate_pct", op: ">=", value: 75 },
      { key: "indexation_health_pct", op: ">=", value: 95 },
      { key: "mutations_reversible_pct", op: "==", value: 100 },
      { key: "verdicts_before_window_close", op: "==0", value: 0 },
    ],
  },
  {
    // §12 row "Business health (ours)" (F12). Carries the guarantee-exposure cap
    // that auto-pauses sales (§14, Law 17) — an ungraded area never pauses it.
    area: "business-health",
    metrics: [
      { key: "per_client_cogs_under_margin_floor", op: "==true", value: true },
      { key: "human_queue_median_latency_hours", op: "<", value: 72 },
      { key: "human_queue_shrinking_mom", op: "==true", value: true },
      { key: "guarantee_exposure_within_cap", op: "==true", value: true },
      { key: "continuity_drills_passed", op: "==true", value: true },
    ],
  },
  {
    area: "dummy-proof",
    metrics: [
      { key: "red_button_drill_seconds", op: "<", value: 60 },
      { key: "client_screens", op: "==", value: 4 },
    ],
  },
  {
    area: "security-isolation",
    metrics: [
      { key: "cross_tenant_events", op: "==0", value: 0 },
      { key: "token_leaks", op: "==0", value: 0 },
    ],
  },
]);
