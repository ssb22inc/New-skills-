import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/types.js';
import { emitEvent } from '../db/outbox.js';
import { identityService } from '../identity/identity.js';

export class AcademyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcademyError';
  }
}

export const SignUpSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'phone must be E.164, e.g. +18765551234'),
  email: z.string().email('a valid email is required'),
  course: z.string().trim().min(1),
  /** Consent is a CHOICE at sign-up, never a default (DPA 2020). */
  marketingOptIn: z.boolean().default(false),
});
export type SignUpInput = z.input<typeof SignUpSchema>;

/** UTC calendar day — the reminder cadence unit. */
function dayOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Academy — consumer sign-up (name + phone + email), one daily study
 * reminder, and consent-gated marketing. Everything rides the existing
 * rails: identity is phone-first, messages leave through the outbox so
 * ANY channel adapter (WhatsApp/SMS/PWA) can deliver them, STOP is
 * honored everywhere, and the reminder/marketing cadence is driven by
 * the WORKER (server-side tick) — never by a live session.
 */
export function academyService(db: Kysely<Database>, marketId: string) {
  const identity = identityService(db, marketId);

  return {
    /**
     * Sign-up that never throws: callers at the edge (the web form) get
     * human-readable problems back instead of importing a validator.
     */
    async trySignUp(raw: SignUpInput) {
      const parsed = SignUpSchema.safeParse(raw);
      if (!parsed.success) {
        return { ok: false as const, problems: parsed.error.issues.map((i) => i.message) };
      }
      return { ok: true as const, result: await this.signUp(parsed.data) };
    },

    /** Sign-up: name, phone, email — plus explicit marketing consent. */
    async signUp(raw: SignUpInput) {
      const input = SignUpSchema.parse(raw);
      const user = await identity.findOrCreateUserByPhone({
        phone: input.phone,
        displayName: input.name,
      });
      await db
        .updateTable('users')
        .set({
          email: input.email,
          marketing_opt_in: input.marketingOptIn,
          updated_at: sql`now()`,
        })
        .where('id', '=', user.id)
        .execute();
      const enrollment = await db
        .insertInto('study_enrollments')
        .values({ market_id: marketId, user_id: user.id, course: input.course })
        .onConflict((oc) =>
          oc
            .column('user_id')
            .doUpdateSet({ course: input.course, active: true, updated_at: sql`now()` }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
      await emitEvent(db, {
        marketId,
        topic: 'academy.signed_up',
        payload: { userId: user.id, course: input.course, marketingOptIn: input.marketingOptIn },
      });
      return { userId: user.id, enrollment };
    },

    /** Studying today resets the clock — no nagging people who showed up. */
    async recordStudySession(userId: string, now = new Date()) {
      await db
        .updateTable('study_enrollments')
        .set({ last_studied_on: dayOf(now), updated_at: sql`now()` })
        .where('market_id', '=', marketId)
        .where('user_id', '=', userId)
        .execute();
    },

    /**
     * The daily reminder tick — run by the WORKER on its interval.
     * Idempotent per day: at most ONE reminder per learner per day,
     * none if they already studied today, none if they said STOP.
     */
    async reminderTick(now = new Date()) {
      const today = dayOf(now);
      const due = await db
        .selectFrom('study_enrollments')
        .innerJoin('users', 'users.id', 'study_enrollments.user_id')
        .leftJoin('conversation_sessions', (join) =>
          join
            .onRef('conversation_sessions.user_id', '=', 'users.id')
            .onRef('conversation_sessions.market_id', '=', 'users.market_id'),
        )
        .where('study_enrollments.market_id', '=', marketId)
        .where('study_enrollments.active', '=', true)
        .where((eb) =>
          eb.or([
            eb('study_enrollments.last_studied_on', 'is', null),
            eb('study_enrollments.last_studied_on', '<', today as unknown as Date),
          ]),
        )
        .where((eb) =>
          eb.or([
            eb('study_enrollments.last_reminded_on', 'is', null),
            eb('study_enrollments.last_reminded_on', '<', today as unknown as Date),
          ]),
        )
        .where((eb) =>
          eb.or([
            eb('conversation_sessions.autopilot', 'is', null),
            eb('conversation_sessions.autopilot', '=', true), // STOP is law
          ]),
        )
        .select([
          'study_enrollments.id as enrollment_id',
          'study_enrollments.course',
          'users.id as user_id',
          'users.phone',
          'users.display_name',
        ])
        .execute();

      let sent = 0;
      for (const learner of due) {
        await emitEvent(db, {
          marketId,
          topic: 'academy.reminder',
          payload: {
            userId: learner.user_id,
            to: learner.phone,
            text: `Hi ${learner.display_name} — a little ${learner.course} today keeps the streak alive. Ready when you are!`,
          },
        });
        await db
          .updateTable('study_enrollments')
          .set({ last_reminded_on: today, updated_at: sql`now()` })
          .where('id', '=', learner.enrollment_id)
          .execute();
        sent++;
      }
      return { sent, day: today };
    },

    /**
     * Marketing broadcast — CONSENT-GATED, exactly once per campaign per
     * person (DB-enforced), STOP honored, and every message carries its
     * own way out. No consent, no message, no exceptions.
     */
    async marketingBroadcast(input: { campaignId: string; text: string }) {
      if (!input.campaignId.trim() || !input.text.trim()) {
        throw new AcademyError('campaignId and text are required');
      }
      const audience = await db
        .selectFrom('users')
        .leftJoin('conversation_sessions', (join) =>
          join
            .onRef('conversation_sessions.user_id', '=', 'users.id')
            .onRef('conversation_sessions.market_id', '=', 'users.market_id'),
        )
        .where('users.market_id', '=', marketId)
        .where('users.marketing_opt_in', '=', true)
        .where((eb) =>
          eb.or([
            eb('conversation_sessions.autopilot', 'is', null),
            eb('conversation_sessions.autopilot', '=', true),
          ]),
        )
        .select(['users.id', 'users.phone'])
        .execute();

      let sent = 0;
      let skipped = 0;
      for (const person of audience) {
        const inserted = await db
          .insertInto('marketing_sends')
          .values({ market_id: marketId, campaign_id: input.campaignId, user_id: person.id })
          .onConflict((oc) => oc.columns(['market_id', 'campaign_id', 'user_id']).doNothing())
          .returning('id')
          .executeTakeFirst();
        if (!inserted) {
          skipped++;
          continue;
        }
        await emitEvent(db, {
          marketId,
          topic: 'academy.marketing',
          payload: {
            userId: person.id,
            to: person.phone,
            campaignId: input.campaignId,
            text: `${input.text}\nReply STOP to opt out of these messages.`,
          },
        });
        sent++;
      }
      return { sent, skipped, audience: audience.length };
    },

    /** One tap out — consent is revocable any time. */
    async optOutMarketing(userId: string) {
      await db
        .updateTable('users')
        .set({ marketing_opt_in: false, updated_at: sql`now()` })
        .where('market_id', '=', marketId)
        .where('id', '=', userId)
        .execute();
    },
  };
}

export type AcademyService = ReturnType<typeof academyService>;
