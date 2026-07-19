import type { Kysely } from 'kysely';
import { loadAllContextPacks } from '@sycamore/packs';
import type { Database } from './types.js';

/**
 * Seeds every market in the pack registry. All markets insert as DARK
 * (the column default); the migration/backfill makes jm live — exactly
 * one live market at v1.0. onConflict does nothing so a re-run never
 * clobbers a status set by a flip ceremony. Idempotent by design.
 */
export async function seedMarkets(db: Kysely<Database>): Promise<void> {
  for (const pack of loadAllContextPacks()) {
    await db
      .insertInto('markets')
      .values({
        market_id: pack.market_id,
        name: pack.name,
        currency_code: pack.currency.code,
        timezone: pack.timezone,
        ...(pack.market_id === 'jm' && { status: 'live' }),
      })
      .onConflict((oc) => oc.column('market_id').doNothing())
      .execute();
  }
}
