import { sql, type Kysely } from 'kysely';
import type { Database } from './types.js';

/**
 * THE DURABLE INBOX (C03 — external review, 2026-09-16).
 *
 * "The inbound worker writes a Redis 'processed' marker before invoking
 * the handler. A failure leaves the marker in place, so a retry returns
 * without doing the work." Acknowledged input, lost — while every
 * duplicate-prevention test passes, because suppressing the retry is
 * precisely what the code was written to do.
 *
 * The shape that survives a crash is claim → do → confirm:
 *
 *   claim     insert a row for this (channel, message id). Somebody else
 *             holding it means skip; a row already `done` means this is
 *             a genuine duplicate delivery and there is nothing to do.
 *   do        run the handler.
 *   confirm   mark it done. Only now is the message spent.
 *   release   on failure, hand the claim back so a retry can pick it up.
 *
 * A worker that dies between `do` and `confirm` leaves the claim behind.
 * After the lease expires another worker takes it over and runs the
 * handler again — at-least-once, deliberately, because losing a booking
 * is worse than repeating an idempotent effect. Handlers must therefore
 * be idempotent, and the money ones are: a capture and a release carry
 * their own keys, completing a completed order is refused.
 */
export type InboxClaim =
  | { outcome: 'claimed'; id: string; attempts: number }
  | { outcome: 'duplicate' }
  | { outcome: 'in_flight'; since: Date };

/** How long a claim may sit unfinished before another worker may take it. */
export const INBOX_LEASE_MS = 5 * 60_000;

export async function claimInbound(
  db: Kysely<Database>,
  input: { channel: string; messageId: string; marketId?: string | null; leaseMs?: number },
): Promise<InboxClaim> {
  const claimed = await db
    .insertInto('inbound_inbox')
    .values({
      channel: input.channel,
      message_id: input.messageId,
      market_id: input.marketId ?? null,
      status: 'in_flight',
    })
    .onConflict((oc) => oc.columns(['channel', 'message_id']).doNothing())
    .returning(['id', 'attempts'])
    .executeTakeFirst();
  if (claimed) return { outcome: 'claimed', id: claimed.id, attempts: claimed.attempts };

  const existing = await db
    .selectFrom('inbound_inbox')
    .where('channel', '=', input.channel)
    .where('message_id', '=', input.messageId)
    .select(['id', 'status', 'claimed_at', 'attempts'])
    .executeTakeFirstOrThrow();
  if (existing.status === 'done') return { outcome: 'duplicate' };

  // Someone claimed it and did not finish. Before the lease expires that
  // is simply work in progress; after it, the worker is gone and the
  // message would otherwise be stuck in flight for ever.
  const since = new Date(existing.claimed_at);
  const lease = input.leaseMs ?? INBOX_LEASE_MS;
  if (Date.now() - since.getTime() < lease) return { outcome: 'in_flight', since };

  const takenOver = await db
    .updateTable('inbound_inbox')
    .set({ claimed_at: sql`now()`, attempts: sql`attempts + 1` })
    .where('id', '=', existing.id)
    .where('status', '=', 'in_flight')
    .where('claimed_at', '=', existing.claimed_at)
    .returning(['id', 'attempts'])
    .executeTakeFirst();
  if (!takenOver) return { outcome: 'in_flight', since };
  return { outcome: 'claimed', id: takenOver.id, attempts: takenOver.attempts };
}

/** The effect happened. Only now is this message spent. */
export async function confirmInbound(db: Kysely<Database>, id: string): Promise<void> {
  await db
    .updateTable('inbound_inbox')
    .set({ status: 'done', completed_at: sql`now()` })
    .where('id', '=', id)
    .execute();
}

/**
 * The effect did NOT happen. Hand the claim straight back rather than
 * making the next delivery wait out the lease — the failure is known
 * now, and a retry should be able to start immediately.
 */
export async function releaseInbound(db: Kysely<Database>, id: string): Promise<void> {
  await db
    .updateTable('inbound_inbox')
    .set({ claimed_at: new Date(0) })
    .where('id', '=', id)
    .where('status', '=', 'in_flight')
    .execute();
}

/**
 * Claims that have been in flight too long: the number an alarm watches
 * and an operator reads. A queue that is quietly losing work looks
 * exactly like a healthy one until somebody counts these.
 */
export async function stalledInbound(
  db: Kysely<Database>,
  olderThanMs = INBOX_LEASE_MS,
): Promise<{ channel: string; messageId: string; attempts: number; since: Date }[]> {
  const rows = await db
    .selectFrom('inbound_inbox')
    .where('status', '=', 'in_flight')
    .where('claimed_at', '<', new Date(Date.now() - olderThanMs))
    .orderBy('claimed_at', 'asc')
    .select(['channel', 'message_id', 'attempts', 'claimed_at'])
    .execute();
  return rows.map((r) => ({
    channel: r.channel,
    messageId: r.message_id,
    attempts: r.attempts,
    since: new Date(r.claimed_at),
  }));
}
