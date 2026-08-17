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

/** Ordered comparisons are only meaningful against a real, finite reading.
 * `-Infinity` drift satisfied every `<` threshold and `+Infinity` satisfied
 * every `>=` one, so an impossible number graded A — the grade failed OPEN,
 * the opposite of this file's stated contract (adversary finding R2-20).
 * Out-of-domain readings now fail closed into the enforcement path, exactly as
 * caps, the meter and the model layer already do. */
function isUsableReading(actual: unknown): actual is number {
  return typeof actual === "number" && Number.isFinite(actual);
}

/** A reading outside the metric's declared domain is corrupt, not good news. */
function inDomain(t: MetricThreshold, actual: number): boolean {
  if (t.domainMin !== undefined && actual < t.domainMin) return false;
  if (t.domainMax !== undefined && actual > t.domainMax) return false;
  return true;
}

function metricPasses(t: MetricThreshold, actual: number | boolean): boolean {
  switch (t.op) {
    case "<": return isUsableReading(actual) && inDomain(t, actual) && actual < (t.value as number);
    case "<=": return isUsableReading(actual) && inDomain(t, actual) && actual <= (t.value as number);
    case ">=": return isUsableReading(actual) && inDomain(t, actual) && actual >= (t.value as number);
    // Strict equality is immune to the domain problem by construction.
    case "==": return typeof actual === "number" ? isUsableReading(actual) && inDomain(t, actual) && actual === t.value : actual === t.value;
    case "==0": return actual === 0;
    case "==true": return actual === true;
  }
}

export class GradeRegistryError extends Error {}

export function computeGrades(snapshot: MetricSnapshot): AreaGrade[] {
  const grades = GRADE_AREAS.map((areaDef) => {
    // Own-property lookups only (adversary finding F6): a polluted prototype
    // must never supply metrics for an area the snapshot does not contain, or
    // an empty snapshot could grade itself A.
    const metrics =
      snapshot !== null && typeof snapshot === "object" && Object.hasOwn(snapshot, areaDef.area)
        ? snapshot[areaDef.area]
        : undefined;
    const failing: string[] = [];
    const missing: string[] = [];
    for (const t of areaDef.metrics) {
      const actual =
        metrics !== undefined && metrics !== null && Object.hasOwn(metrics, t.key) ? metrics[t.key] : undefined;
      if (actual === undefined) missing.push(t.key);
      else if (!metricPasses(t, actual)) failing.push(t.key);
    }
    const grade: Grade = failing.length === 0 && missing.length === 0 ? "A" : "BELOW_A";
    return { area: areaDef.area, grade, failing, missing };
  });
  COMPUTED.add(grades);
  return grades;
}

/** Grades this module computed. `enforcement()` accepts nothing else.
 *
 * `enforcement([])` returned no actions, and a caller could pass an A for a
 * failing area, omit configured areas, or hand-build an `AreaGrade` — the
 * registry did not guarantee that below-A freezes autonomy, it only translated
 * an untrusted list (adversary finding R7-10). Freezing autonomy is the whole
 * point of §12, so the input has to be evidence rather than assertion. */
const COMPUTED = new WeakSet<readonly AreaGrade[]>();

/** The one authority: compute, then enforce, on the same snapshot. Callers that
 * want both should use this rather than pairing the two by hand. */
export function gradeAndEnforce(snapshot: MetricSnapshot): {
  grades: AreaGrade[];
  actions: EnforcementAction[];
} {
  const grades = computeGrades(snapshot);
  return { grades, actions: enforcement(grades) };
}

export function enforcement(grades: readonly AreaGrade[]): EnforcementAction[] {
  // Identity, not shape: only an array computeGrades produced is evidence about
  // this engine's state.
  if (!COMPUTED.has(grades)) {
    throw new GradeRegistryError(
      "enforcement requires grades from computeGrades — a caller-supplied list is not evidence (§12, Law 14)",
    );
  }
  // …and it must still cover every configured area, in case a caller mutated
  // the array it was handed.
  if (grades.length !== GRADE_AREAS.length) {
    throw new GradeRegistryError("grade list does not cover every configured area — refusing to enforce (fail closed)");
  }
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
  // A published report is a client-visible number (Law 10). It carries the same
  // provenance requirement as enforcement (R7-10).
  if (!COMPUTED.has(grades)) {
    throw new GradeRegistryError("publishGradeReport requires grades from computeGrades (§12, Law 10)");
  }
  return JSON.stringify({ generatedAtMs, grades }, null, 2);
}
