import { GRADE_AREAS, type MetricThreshold } from "@fullburn/config/grade-thresholds";

/** Grade Registry scaffold (ENGINE_BUILD.md §12, Law 14). Grades are code:
 * computed from metrics against Class-2 thresholds. Below-A triggers typed
 * enforcement actions — the trust ladder steps down, auto-improvements halt
 * for the area, the human is alerted. The registry never mutates thresholds. */

export type Grade = "A" | "BELOW_A";

export interface AreaGrade {
  readonly area: string;
  readonly grade: Grade;
  readonly failing: readonly string[];
  /** Metrics required by thresholds but absent from the snapshot. Missing data
   * is BELOW_A, never assumed-fine (fail closed). */
  readonly missing: readonly string[];
}

export type EnforcementAction =
  | { readonly type: "STEP_DOWN_TRUST_LADDER"; readonly area: string }
  | { readonly type: "HALT_AUTO_IMPROVEMENTS"; readonly area: string }
  | { readonly type: "ALERT_HUMAN"; readonly area: string };

export type MetricSnapshot = Readonly<Record<string, Readonly<Record<string, number | boolean>>>>;

function metricPasses(t: MetricThreshold, actual: number | boolean): boolean {
  switch (t.op) {
    case "<": return typeof actual === "number" && actual < (t.value as number);
    case "<=": return typeof actual === "number" && actual <= (t.value as number);
    case ">=": return typeof actual === "number" && actual >= (t.value as number);
    case "==": return actual === t.value;
    case "==0": return actual === 0;
    case "==true": return actual === true;
  }
}

export function computeGrades(snapshot: MetricSnapshot): AreaGrade[] {
  return GRADE_AREAS.map((areaDef) => {
    const metrics = snapshot[areaDef.area];
    const failing: string[] = [];
    const missing: string[] = [];
    for (const t of areaDef.metrics) {
      const actual = metrics?.[t.key];
      if (actual === undefined) missing.push(t.key);
      else if (!metricPasses(t, actual)) failing.push(t.key);
    }
    const grade: Grade = failing.length === 0 && missing.length === 0 ? "A" : "BELOW_A";
    return { area: areaDef.area, grade, failing, missing };
  });
}

export function enforcement(grades: readonly AreaGrade[]): EnforcementAction[] {
  const actions: EnforcementAction[] = [];
  for (const g of grades) {
    if (g.grade === "BELOW_A") {
      actions.push(
        { type: "STEP_DOWN_TRUST_LADDER", area: g.area },
        { type: "HALT_AUTO_IMPROVEMENTS", area: g.area },
        { type: "ALERT_HUMAN", area: g.area },
      );
    }
  }
  return actions;
}

/** Published grade report (monthly + continuous, §12). */
export function publishGradeReport(grades: readonly AreaGrade[], generatedAtMs: number): string {
  return JSON.stringify({ generatedAtMs, grades }, null, 2);
}
