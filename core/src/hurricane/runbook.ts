/**
 * P32 — the written Hurricane Mode runbook, with time targets. The
 * rehearsal (staging now; timed PROD rehearsal is the HUMAN GATE) is
 * scored step by step against these targets; a step over target fails
 * the rehearsal — no partial credit, same as every other gate.
 *
 * Targets are wall-clock for the STAGING dataset; the prod rehearsal
 * re-baselines them against real volumes before it counts.
 */
export interface RunbookStep {
  step: 'activate_freeze' | 'rebook_wave' | 'refund_wave' | 'safe_broadcast' | 'reopen';
  description: string;
  targetMs: number;
}

export const HURRICANE_RUNBOOK: RunbookStep[] = [
  {
    step: 'activate_freeze',
    description: 'Freeze new bookings (DB-enforced) and snapshot every in-flight order.',
    targetMs: 5_000,
  },
  {
    step: 'rebook_wave',
    description: 'Move every order that can move to a post-storm window.',
    targetMs: 30_000,
  },
  {
    step: 'refund_wave',
    description: 'Refund everything still pending, to the cent, idempotently.',
    targetMs: 30_000,
  },
  {
    step: 'safe_broadcast',
    description: '"We\'re safe" broadcast queued to every buyer and seller.',
    targetMs: 5_000,
  },
  {
    step: 'reopen',
    description: 'Lift the freeze, "we\'re open" broadcast, recovery promo to Pulse.',
    targetMs: 5_000,
  },
];

export interface RehearsalScore {
  passed: boolean;
  steps: {
    step: RunbookStep['step'];
    elapsedMs: number;
    targetMs: number;
    withinTarget: boolean;
  }[];
  totalMs: number;
}

export function scoreRehearsal(timings: Record<RunbookStep['step'], number>): RehearsalScore {
  const steps = HURRICANE_RUNBOOK.map((rb) => ({
    step: rb.step,
    elapsedMs: timings[rb.step],
    targetMs: rb.targetMs,
    withinTarget: timings[rb.step] <= rb.targetMs,
  }));
  return {
    passed: steps.every((s) => s.withinTarget),
    steps,
    totalMs: steps.reduce((sum, s) => sum + s.elapsedMs, 0),
  };
}
