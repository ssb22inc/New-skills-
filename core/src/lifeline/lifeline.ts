import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { translator, type ContextPack } from '@sycamore/packs';
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
export function liteModeService(db: Kysely<Database>, marketId: string, pack: ContextPack) {
  const say = translator(pack);
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
      return `${message.text}\n${say('lifeline.media_stripped')}`;
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
 * P34c — the PWA's offline queue replays here on reconnect.
 *
 * CLAIM, DO, CONFIRM. This used to commit the dedupe row and then call
 * the handler, so a crash in between left a row saying the action had
 * been applied when it had not: the phone's retry was classified as a
 * duplicate and the booking was gone. The external review of 2026-09-16
 * found it next to the same mistake in the gateway.
 *
 * Now the row is a claim with a lifecycle. `in_flight` means somebody
 * started it; `done` means the effect happened, and only a `done` row
 * makes a later copy a duplicate. A failure hands the claim straight
 * back, and a claim abandoned by a dead worker can be taken over once
 * its lease expires — at-least-once for actions that are idempotent
 * anyway (completing a completed order is refused; recording an install
 * twice is one install), rather than at-most-once for actions somebody
 * is waiting on.
 *
 * Every action gets its own outcome in the result, so the client can
 * acknowledge what actually landed instead of clearing its whole queue
 * on one 200.
 */
export type ReplayOutcome = 'applied' | 'duplicate' | 'in_flight' | 'failed';

export interface ReplayResult {
  applied: number;
  duplicates: number;
  /** Per action, keyed by the client's own idempotency key. */
  results: { idempotencyKey: string; outcome: ReplayOutcome; error?: string }[];
}

/** How long a claim may sit unfinished before another replay may take it. */
export const REPLAY_LEASE_MS = 2 * 60_000;

export async function replayOfflineQueue(
  db: Kysely<Database>,
  marketId: string,
  actions: OfflineAction[],
  handlers: Record<string, (payload: unknown) => Promise<void>>,
  options: { leaseMs?: number } = {},
): Promise<ReplayResult> {
  const results: ReplayResult['results'] = [];
  let applied = 0;
  let duplicates = 0;
  const lease = options.leaseMs ?? REPLAY_LEASE_MS;

  for (const action of actions) {
    const handler = handlers[action.kind];
    if (!handler) throw new LifelineError(`no handler for offline action kind "${action.kind}"`);

    const claimed = await db
      .insertInto('offline_replays')
      .values({
        market_id: marketId,
        idempotency_key: action.idempotencyKey,
        kind: action.kind,
        status: 'in_flight',
        completed_at: null,
      })
      .onConflict((oc) => oc.columns(['market_id', 'idempotency_key']).doNothing())
      .returning('id')
      .executeTakeFirst();

    let claimId = claimed?.id;
    if (!claimId) {
      const existing = await db
        .selectFrom('offline_replays')
        .where('market_id', '=', marketId)
        .where('idempotency_key', '=', action.idempotencyKey)
        .select(['id', 'status', 'claimed_at'])
        .executeTakeFirstOrThrow();
      if (existing.status === 'done') {
        duplicates++;
        results.push({ idempotencyKey: action.idempotencyKey, outcome: 'duplicate' });
        continue;
      }
      const since = new Date(existing.claimed_at).getTime();
      if (Date.now() - since < lease) {
        // Another replay of the same queue is mid-flight. Not a
        // duplicate and not a failure — the client keeps it and asks
        // again, which is why it is not acknowledged here.
        results.push({ idempotencyKey: action.idempotencyKey, outcome: 'in_flight' });
        continue;
      }
      const takenOver = await db
        .updateTable('offline_replays')
        .set({ claimed_at: sql`now()` })
        .where('id', '=', existing.id)
        .where('status', '=', 'in_flight')
        .where('claimed_at', '=', existing.claimed_at)
        .returning('id')
        .executeTakeFirst();
      if (!takenOver) {
        results.push({ idempotencyKey: action.idempotencyKey, outcome: 'in_flight' });
        continue;
      }
      claimId = takenOver.id;
    }

    try {
      await handler(action.payload);
    } catch (err) {
      // Hand the claim back: this action did NOT happen, and the next
      // attempt must be free to do it rather than skip it.
      await db.deleteFrom('offline_replays').where('id', '=', claimId).execute();
      results.push({
        idempotencyKey: action.idempotencyKey,
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    await db
      .updateTable('offline_replays')
      .set({ status: 'done', completed_at: sql`now()` })
      .where('id', '=', claimId)
      .execute();
    applied++;
    results.push({ idempotencyKey: action.idempotencyKey, outcome: 'applied' });
  }
  return { applied, duplicates, results };
}

/**
 * P34d — Blackout Mode. Unlike Hurricane Mode, commerce CONTINUES
 * (record now, settle later): only escrow release pauses (money never
 * auto-moves on stale information), non-essential messaging stops, and
 * dispute windows widen by the outage. Reconnect = replay the queue in
 * order, then lift.
 */
export function blackoutMode(db: Kysely<Database>, marketId: string, pack: ContextPack) {
  const say = translator(pack);
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
          text: say('lifeline.blackout_broadcast'),
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
