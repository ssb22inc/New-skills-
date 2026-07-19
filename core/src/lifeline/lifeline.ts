import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { ContextPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { emitEvent } from '../db/outbox.js';
import { ledgerService, type SplitBps } from '../ledger/ledger.js';

export class LifelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LifelineError';
  }
}

/** Thresholds the Watchman uses to flip a user's sessions to lite mode. */
export const LITE_FLIP = { latencyMs: 8_000, failureRate: 0.25 } as const;

/**
 * P34a/b — the low-bandwidth switch. Same features, degraded transport:
 * text-only sessions, media stripped at the boundary with a "text me
 * instead" prompt, and an automatic flip driven by delivery health.
 */
export function liteModeService(db: Kysely<Database>, marketId: string) {
  return {
    async flip(userId: string, on: boolean) {
      await db
        .updateTable('users')
        .set({ lite_mode: on, updated_at: sql`now()` })
        .where('market_id', '=', marketId)
        .where('id', '=', userId)
        .execute();
    },

    async isLite(userId: string): Promise<boolean> {
      const row = await db
        .selectFrom('users')
        .where('market_id', '=', marketId)
        .where('id', '=', userId)
        .select('lite_mode')
        .executeTakeFirst();
      return row?.lite_mode ?? false;
    },

    /** Watchman hook: flip on bad delivery health, flip back on recovery. */
    async autoFlip(userId: string, health: { latencyMs: number; failureRate: number }) {
      const degraded =
        health.latencyMs > LITE_FLIP.latencyMs || health.failureRate > LITE_FLIP.failureRate;
      await this.flip(userId, degraded);
      return degraded;
    },

    /** Media degrades at the boundary; text always gets through. */
    stripToText(message: { text: string; mediaRefs?: string[] }): string {
      if (!message.mediaRefs || message.mediaRefs.length === 0) return message.text;
      return `${message.text}\n(Photos/voice notes can't reach you right now — text me instead.)`;
    },
  };
}

export type OfflineAction = {
  /** Client-generated; the replay dedupe key. */
  idempotencyKey: string;
  kind: string;
  payload: unknown;
};

/**
 * P34c — the PWA's offline queue replays here on reconnect. Every action
 * applies EXACTLY once: the dedupe row commits before the handler runs a
 * second time, so a queue synced twice (or a phone that crashed mid-sync
 * and resent everything) is harmless.
 */
export async function replayOfflineQueue(
  db: Kysely<Database>,
  marketId: string,
  actions: OfflineAction[],
  handlers: Record<string, (payload: unknown) => Promise<void>>,
): Promise<{ applied: number; duplicates: number }> {
  let applied = 0;
  let duplicates = 0;
  for (const action of actions) {
    const inserted = await db
      .insertInto('offline_replays')
      .values({ market_id: marketId, idempotency_key: action.idempotencyKey, kind: action.kind })
      .onConflict((oc) => oc.columns(['market_id', 'idempotency_key']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!inserted) {
      duplicates++;
      continue;
    }
    const handler = handlers[action.kind];
    if (!handler) throw new LifelineError(`no handler for offline action kind "${action.kind}"`);
    await handler(action.payload);
    applied++;
  }
  return { applied, duplicates };
}

/**
 * P34d — Blackout Mode. Unlike Hurricane Mode, commerce CONTINUES
 * (record now, settle later): only escrow release pauses (money never
 * auto-moves on stale information), non-essential messaging stops, and
 * dispute windows widen by the outage. Reconnect = replay the queue in
 * order, then lift.
 */
export function blackoutMode(db: Kysely<Database>, marketId: string, pack: ContextPack) {
  const ledger = ledgerService(db, marketId);

  async function state() {
    return db
      .selectFrom('hurricane_states')
      .where('market_id', '=', marketId)
      .selectAll()
      .executeTakeFirst();
  }

  return {
    ledger,

    async isActive(): Promise<boolean> {
      return (await state())?.blackout ?? false;
    },

    async activate(reason: string, now = new Date()) {
      await db
        .insertInto('hurricane_states')
        .values({
          market_id: marketId,
          reason,
          blackout: true,
          blackout_started_at: now,
          blackout_ended_at: null,
        })
        .onConflict((oc) =>
          oc.column('market_id').doUpdateSet({
            blackout: true,
            blackout_started_at: now,
            blackout_ended_at: null,
            reason,
            updated_at: sql`now()`,
          }),
        )
        .execute();
      // Non-essential messaging pauses (Pulse + Mentor consume this).
      await emitEvent(db, {
        marketId,
        topic: 'lifeline.pause_nonessential',
        payload: { reason },
      });
      // Buyers holding paid orders hear it plainly, over SMS.
      await emitEvent(db, {
        marketId,
        topic: 'lifeline.blackout_broadcast',
        payload: {
          channel: 'sms',
          text: 'Storm mode — your money is safe and held until this settles.',
        },
      });
    },

    /**
     * Escrow release, blackout-guarded: money never auto-moves on stale
     * information. Timers effectively pause; releases resume on lift.
     */
    async guardedRelease(input: {
      orderRef: string;
      split: SplitBps;
      idempotencyKey: string;
      sellerId?: string;
    }) {
      if (await this.isActive()) {
        throw new LifelineError('blackout active — escrow release is paused');
      }
      return ledger.release({
        orderRef: input.orderRef,
        currency: pack.currency.code,
        split: input.split,
        idempotencyKey: input.idempotencyKey,
        ...(input.sellerId ? { sellerId: input.sellerId } : {}),
      });
    },

    /** Dispute windows widen by however long the island was dark. */
    async extendedDisputeWindowMs(baseWindowMs: number, now = new Date()): Promise<number> {
      const s = await state();
      if (!s?.blackout_started_at) return baseWindowMs;
      const end = s.blackout ? now : new Date(s.blackout_ended_at ?? now);
      const outageMs = Math.max(0, end.getTime() - new Date(s.blackout_started_at).getTime());
      return baseWindowMs + outageMs;
    },

    /**
     * Reconnect: replay the backlog IN ORDER, then lift the blackout and
     * tell everyone. The replay is the reconciliation sweep — idempotency
     * keys make double-delivery harmless.
     */
    async deactivate(
      backlog: OfflineAction[],
      handlers: Record<string, (payload: unknown) => Promise<void>>,
      now = new Date(),
    ) {
      const sweep = await replayOfflineQueue(db, marketId, backlog, handlers);
      await db
        .updateTable('hurricane_states')
        .set({ blackout: false, blackout_ended_at: now, updated_at: sql`now()` })
        .where('market_id', '=', marketId)
        .execute();
      await emitEvent(db, {
        marketId,
        topic: 'lifeline.blackout_lifted',
        payload: { swept: sweep.applied, duplicatesIgnored: sweep.duplicates },
      });
      return sweep;
    },
  };
}

export type BlackoutMode = ReturnType<typeof blackoutMode>;
export type LiteModeService = ReturnType<typeof liteModeService>;
