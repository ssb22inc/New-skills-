import type { Kysely } from 'kysely';
import { loadAllContextPacks } from '@sycamore/packs';
import type { Database } from './types.js';

/**
 * Seeds every market in the pack registry at the status ITS OWN PACK
 * declares. Core does not know which country is live — that would be
 * core changing to enter a market, which the Four Packs rule forbids.
 *
 * A pack may only declare itself live when counsel has verified it;
 * anything else seeds dark, whatever the YAML says. Every change of
 * status AFTER seeding goes through the flip ceremony, which checks the
 * founder flag, counsel, the payment sandbox and the core diff.
 * onConflict does nothing, so a re-run never clobbers a flipped status.
 */
export async function seedMarkets(db: Kysely<Database>): Promise<void> {
  for (const pack of loadAllContextPacks()) {
    const status =
      pack.launch_status === 'live' && pack.compliance.verified_by_counsel ? 'live' : 'dark';
    await db
      .insertInto('markets')
      .values({
        market_id: pack.market_id,
        name: pack.name,
        currency_code: pack.currency.code,
        timezone: pack.timezone,
        status,
      })
      .onConflict((oc) => oc.column('market_id').doNothing())
      .execute();
  }
}
