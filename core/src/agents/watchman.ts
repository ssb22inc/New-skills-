import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { emitEvent } from '../db/outbox.js';

/**
 * P27 — the Watchman watches direction, not just thresholds: a vital
 * drifting steadily toward trouble raises an incident before any static
 * limit trips. These are the golden vitals it watches.
 */
export const GOLDEN_VITALS = [
  'message_throughput',
  'payment_success_rate',
  'order_confirm_rate',
  'webhook_lag_ms',
] as const;
export type GoldenVital = (typeof GOLDEN_VITALS)[number];

export type DriftDirection = 'up' | 'down' | 'stable';

export interface VitalSeries {
  /** Trailing normal-operation readings (e.g. same hour last 14 days). */
  baseline: number[];
  /** The most recent readings under scrutiny. */
  recent: number[];
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stddev(xs: number[], mu: number): number {
  return Math.sqrt(xs.reduce((s, x) => s + (x - mu) ** 2, 0) / xs.length);
}

/**
 * Directional drift: the recent mean has moved more than 2σ of baseline
 * noise (with a 1% relative floor so a dead-flat baseline still gets a
 * sane band). Returns which way it moved.
 */
export function detectDrift(series: VitalSeries): DriftDirection {
  if (series.baseline.length === 0 || series.recent.length === 0) return 'stable';
  const mu = mean(series.baseline);
  const sigma = stddev(series.baseline, mu);
  const band = Math.max(2 * sigma, Math.abs(mu) * 0.01);
  const shift = mean(series.recent) - mu;
  if (shift > band) return 'up';
  if (shift < -band) return 'down';
  return 'stable';
}

export function watchmanService(db: Kysely<Database>, marketId: string) {
  return {
    /**
     * One patrol pass: examine every vital's series, open one incident
     * per drifting vital (skipping vitals with an incident already open).
     */
    async tick(readings: Partial<Record<GoldenVital, VitalSeries>>) {
      const opened: { id: string; vital: GoldenVital; direction: 'up' | 'down' }[] = [];
      for (const vital of GOLDEN_VITALS) {
        const series = readings[vital];
        if (!series) continue;
        const direction = detectDrift(series);
        if (direction === 'stable') continue;
        const alreadyOpen = await db
          .selectFrom('agent_incidents')
          .where('market_id', '=', marketId)
          .where('vital', '=', vital)
          .where('status', '=', 'open')
          .select('id')
          .executeTakeFirst();
        if (alreadyOpen) continue;
        const incident = await db
          .insertInto('agent_incidents')
          .values({ market_id: marketId, vital, direction })
          .returning('id')
          .executeTakeFirstOrThrow();
        await emitEvent(db, {
          marketId,
          topic: 'agents.incident_opened',
          payload: { incidentId: incident.id, vital, direction },
        });
        opened.push({ id: incident.id, vital, direction });
      }
      return opened;
    },
  };
}

export type WatchmanService = ReturnType<typeof watchmanService>;
