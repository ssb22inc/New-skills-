import { deepFreeze } from "./freeze.ts";

/** CLASS 2 — Grade Registry thresholds (ENGINE_BUILD.md §12, Law 14). Initial
 * values pending H9 sign-off. Human-change-only: edits require an APPROVALS/
 * entry (class2-gate). No agent, including the adversary, may move this bar.
 *
 * Every area below carries EVERY "A means" criterion §12 states for it
 * (adversary finding R2-21): nine were missing, and a criterion with no
 * threshold is never computed, never fails, and never freezes autonomy — an
 * area could hold "A" with CAC 4x baseline and injection drills failing. */

export type MetricOp = "<" | "<=" | ">=" | "==" | "==0" | "==true";

export interface MetricThreshold {
  readonly key: string;
  readonly op: MetricOp;
  readonly value: number | boolean;
  /** Domain of the reading itself, independent of the pass/fail threshold
   * (adversary finding R2-20). A drill cannot take -5 seconds and a rate cannot
   * exceed 100%; such a reading is corrupt, and a corrupt reading must fail
   * CLOSED rather than satisfy an ordered comparison by being absurd. */
  readonly domainMin?: number;
  readonly domainMax?: number;
}

export interface AreaThresholds {
  readonly area: string;
  readonly metrics: readonly MetricThreshold[];
}

export const GRADE_AREAS: readonly AreaThresholds[] = deepFreeze([
  {
    area: "marketing-engine",
    metrics: [
      { key: "cac_beats_baseline_by_day_90", op: "==true", value: true },
      { key: "blended_roas", op: ">=", value: 4, domainMin: 0 },
      { key: "reconciliation_drift_pct", op: "<", value: 2, domainMin: 0 },
      { key: "cap_breaches", op: "==0", value: 0 },
      { key: "policy_strikes", op: "==0", value: 0 },
    ],
  },
  {
    area: "model-layer",
    metrics: [
      { key: "roles_below_eval_threshold", op: "==0", value: 0 },
      { key: "family_diversity_holds", op: "==true", value: true },
      { key: "monthly_failover_drill_passed", op: "==true", value: true },
    ],
  },
  {
    area: "adversary-layer",
    metrics: [
      { key: "decisions_with_verdicts_pct", op: ">=", value: 100, domainMin: 0, domainMax: 100 },
      { key: "unreviewed_fails", op: "==0", value: 0 },
      { key: "injection_drills_passed", op: "==true", value: true },
    ],
  },
  {
    area: "data-truth",
    metrics: [
      { key: "stripe_warehouse_drift_pct", op: "<", value: 2, domainMin: 0 },
      // Law 10: the incrementality-vs-last-click gap is stated in every report.
      { key: "incrementality_gap_stated", op: "==true", value: true },
    ],
  },
  {
    // §12 row "WordPress / SEO".
    area: "wordpress-seo",
    metrics: [
      { key: "organic_clicks_vs_baseline_pct", op: ">=", value: 0 },
      { key: "cwv_pass_rate_pct", op: ">=", value: 75, domainMin: 0, domainMax: 100 },
      { key: "indexation_health_pct", op: ">=", value: 95, domainMin: 0, domainMax: 100 },
      { key: "mutations_reversible_pct", op: "==", value: 100, domainMin: 0, domainMax: 100 },
      { key: "verdicts_before_window_close", op: "==0", value: 0 },
    ],
  },
  {
    area: "dummy-proof",
    metrics: [
      { key: "unassisted_onboarding_completion_pct", op: ">=", value: 90, domainMin: 0, domainMax: 100 },
      { key: "red_button_drill_seconds", op: "<", value: 60, domainMin: 0 },
      { key: "client_screens", op: "==", value: 4 },
    ],
  },
  {
    area: "security-isolation",
    metrics: [
      { key: "cross_tenant_events", op: "==0", value: 0 },
      { key: "bot_filtration_pct", op: ">=", value: 95, domainMin: 0, domainMax: 100 },
      { key: "wp_credentials_admin_wide", op: "==", value: false },
      { key: "token_leaks", op: "==0", value: 0 },
    ],
  },
  {
    // §12 row "Business health (ours)" — carries the guarantee-exposure cap that
    // auto-pauses sales (§14, Law 17).
    area: "business-health",
    metrics: [
      { key: "per_client_cogs_under_margin_floor", op: "==true", value: true },
      { key: "our_cac_within_target", op: "==true", value: true },
      { key: "our_churn_within_target", op: "==true", value: true },
      { key: "human_queue_median_latency_hours", op: "<", value: 72, domainMin: 0 },
      { key: "human_queue_shrinking_mom", op: "==true", value: true },
      { key: "guarantee_exposure_within_cap", op: "==true", value: true },
      { key: "continuity_drills_passed", op: "==true", value: true },
    ],
  },
]);
