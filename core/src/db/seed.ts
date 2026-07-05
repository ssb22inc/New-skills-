import type { Kysely } from 'kysely';
import type { Database } from './types.js';

/**
 * Seed data mirrors packs/context/jm.yaml (P3); the pack stays the source of
 * truth for behavior — this row just registers the market for FK scoping.
 * Idempotent: safe to run on every deploy.
 */
export async function seedMarkets(db: Kysely<Database>): Promise<void> {
  await db
    .insertInto('markets')
    .values({
      market_id: 'jm',
      name: 'Jamaica',
      currency_code: 'JMD',
      timezone: 'America/Jamaica',
    })
    .onConflict((oc) => oc.column('market_id').doNothing())
    .execute();
}
