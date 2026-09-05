import type { Kysely, Transaction } from 'kysely';
import type { Database } from './types.js';

export interface OutboxEvent {
  marketId: string;
  topic: string;
  payload: unknown;
}

/**
 * Outbox pattern: domain mutations and their events commit in the SAME
 * transaction; a worker publishes unpublished rows later. Pass the
 * transaction you are already inside — never a separate connection.
 */
export async function emitEvent(
  db: Kysely<Database> | Transaction<Database>,
  event: OutboxEvent,
): Promise<void> {
  await db
    .insertInto('events_outbox')
    .values({
      market_id: event.marketId,
      topic: event.topic,
      payload: JSON.stringify(event.payload),
    })
    .execute();
}
