import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/types.js';
import { emitEvent } from '../db/outbox.js';

/**
 * P28 — the Listener. One monthly one-tap survey per user, in the chat
 * they already use (Constitution §1); complaint text mines into named
 * pain lanes the Scout can act on.
 */
export const COMPLAINT_LANES: Record<string, string[]> = {
  payment: ['payment', 'pay link', 'card', 'money never reach'],
  delivery: ['delivery', 'late', 'never come', 'no show'],
  quality: ['cold', 'broken', 'wrong order', 'not what'],
  communication: ['no reply', 'ignored', 'no answer', 'cannot reach'],
};

export interface ComplaintPattern {
  lane: string;
  count: number;
  examples: string[];
}

export function listenerService(db: Kysely<Database>, marketId: string) {
  return {
    /** The monthly ask — one tap, optional voice note. Idempotent per month. */
    async sendMonthlySurvey(userId: string, monthKey: string) {
      const already = await db
        .selectFrom('events_outbox')
        .where('market_id', '=', marketId)
        .where('topic', '=', 'listener.survey_sent')
        .where(sql`payload->>'userId'`, '=', userId)
        .where(sql`payload->>'monthKey'`, '=', monthKey)
        .select('id')
        .executeTakeFirst();
      if (already) return { sent: false };
      await emitEvent(db, {
        marketId,
        topic: 'listener.survey_sent',
        payload: { userId, monthKey },
      });
      return { sent: true };
    },

    async recordResponse(input: {
      userId: string;
      thumbsUp: boolean;
      comment?: string | undefined;
    }) {
      return db
        .insertInto('surveys')
        .values({
          market_id: marketId,
          user_id: input.userId,
          thumbs_up: input.thumbsUp,
          comment: input.comment ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** Mine unhappy responses into pain lanes, biggest first. */
    async minePatterns(): Promise<ComplaintPattern[]> {
      const unhappy = await db
        .selectFrom('surveys')
        .where('market_id', '=', marketId)
        .where('thumbs_up', '=', false)
        .where('comment', 'is not', null)
        .select('comment')
        .execute();
      const patterns: ComplaintPattern[] = [];
      for (const [lane, keywords] of Object.entries(COMPLAINT_LANES)) {
        const hits = unhappy
          .map((r) => r.comment as string)
          .filter((c) => keywords.some((k) => c.toLowerCase().includes(k)));
        if (hits.length > 0)
          patterns.push({ lane, count: hits.length, examples: hits.slice(0, 3) });
      }
      return patterns.sort((a, b) => b.count - a.count);
    },
  };
}

export type ListenerService = ReturnType<typeof listenerService>;
