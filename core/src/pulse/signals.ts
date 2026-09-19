import type { Kysely } from 'kysely';
import type { ContextPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { emitEvent } from '../db/outbox.js';

export class SignalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignalError';
  }
}

/** Boosts fire when an arrival is this many days out. */
export const LEAD_MIN_DAYS = 1;
export const LEAD_MAX_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * P23 — Pulse signal ingestion. Cruise schedules come from the port
 * authority sources the context pack names (the pack also maps port →
 * parish); platform events join the same stream. The matcher emits one
 * boost per (signal × vertical) at 1–3 day lead — idempotent by unique
 * constraint, so re-running a cron never doubles a boost.
 */
export function signalsService(db: Kysely<Database>, marketId: string, pack: ContextPack) {
  const portParish = new Map(pack.signals.cruise_ports.map((p) => [p.id, p.parish]));

  return {
    /** Idempotent schedule ingestion; unknown ports refuse loudly. */
    async ingestCruiseSchedule(
      entries: { portId: string; occursAt: Date; passengers: number }[],
    ): Promise<number> {
      let inserted = 0;
      for (const entry of entries) {
        const parish = portParish.get(entry.portId);
        if (!parish) {
          throw new SignalError(
            `unknown cruise port "${entry.portId}" for market "${marketId}" — add it to the pack`,
          );
        }
        const res = await db
          .insertInto('signals')
          .values({
            market_id: marketId,
            kind: 'cruise_arrival',
            port_id: entry.portId,
            parish,
            occurs_at: entry.occursAt,
            magnitude: entry.passengers,
          })
          .onConflict((oc) => oc.columns(['market_id', 'kind', 'port_id', 'occurs_at']).doNothing())
          .returning('id')
          .executeTakeFirst();
        if (res) inserted++;
      }
      return inserted;
    },

    /**
     * The matcher: vertical × parish × lead time → boost events. Emits to
     * the outbox for Pulse (P24) and records the boost row for idempotency.
     */
    async matchBoosts(verticals: string[], now = new Date()): Promise<number> {
      const windowStart = new Date(now.getTime() + LEAD_MIN_DAYS * DAY_MS);
      const windowEnd = new Date(now.getTime() + LEAD_MAX_DAYS * DAY_MS);
      const upcoming = await db
        .selectFrom('signals')
        .where('market_id', '=', marketId)
        .where('occurs_at', '>=', windowStart)
        .where('occurs_at', '<=', windowEnd)
        .selectAll()
        .execute();
      let emitted = 0;
      for (const signal of upcoming) {
        const leadDays = Math.floor(
          (new Date(signal.occurs_at).getTime() - now.getTime()) / DAY_MS,
        );
        for (const verticalId of verticals) {
          const boost = await db
            .insertInto('pulse_boosts')
            .values({
              market_id: marketId,
              signal_id: signal.id,
              vertical_id: verticalId,
              parish: signal.parish,
              lead_days: leadDays,
            })
            .onConflict((oc) => oc.columns(['signal_id', 'vertical_id']).doNothing())
            .returning('id')
            .executeTakeFirst();
          if (!boost) continue; // already boosted — never double
          await emitEvent(db, {
            marketId,
            topic: 'pulse.boost',
            payload: {
              signalId: Number(signal.id),
              verticalId,
              parish: signal.parish,
              leadDays,
              magnitude: signal.magnitude,
            },
          });
          emitted++;
        }
      }
      return emitted;
    },
  };
}

export type SignalsService = ReturnType<typeof signalsService>;
