import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/**
 * P36c — the eviction fast path (amends P35b).
 *
 * When the primary door closes, the recovery plan is no longer one blast
 * and a hope. Sellers who installed the client are already holding a
 * door we own: they are reachable by web push into that client, with no
 * dependency on SMS deliverability, carrier queues, or a link they must
 * choose to tap. Everyone else falls back to the P35 SMS blast.
 *
 * This is a PLAN, not a send: it hands each recipient to the channel
 * adapter that can reach them, and the drill measures which lane
 * actually recovered them.
 */

export type FastPathLane = 'installed_client' | 'sms_blast';

export interface EvictionRecipient {
  userId: string;
  sellerId: string | null;
  phone: string;
  lane: FastPathLane;
  /**
   * The door to land on — the seller's own, always ours. Null for buyers,
   * who have no door of their own: the blast composes the link of the
   * seller they were dealing with (P35's behaviour, unchanged).
   */
  link: string | null;
}

export interface EvictionPlan {
  installed: EvictionRecipient[];
  sms: EvictionRecipient[];
  /** Share of sellers reachable without any SMS dependency at all. */
  fastPathShare: number;
}

/**
 * Build the recovery plan for a market. Sellers with an installed client
 * take the fast lane; every other identity — sellers who never installed
 * and all buyers — takes the SMS lane exactly as P35 specified. Buyers
 * are never in the fast lane because buyers are never asked to install.
 */
export async function planEvictionRecovery(
  db: Kysely<Database>,
  marketId: string,
  appOrigin: string,
): Promise<EvictionPlan> {
  const rows = await db
    .selectFrom('users')
    .leftJoin('sellers', (join) =>
      join
        .onRef('sellers.user_id', '=', 'users.id')
        .onRef('sellers.market_id', '=', 'users.market_id'),
    )
    .where('users.market_id', '=', marketId)
    .select([
      'users.id as user_id',
      'users.phone',
      'sellers.id as seller_id',
      'sellers.install_prompt_state',
    ])
    .execute();

  const installed: EvictionRecipient[] = [];
  const sms: EvictionRecipient[] = [];
  for (const row of rows) {
    const isInstalledSeller = row.seller_id !== null && row.install_prompt_state === 'installed';
    const recipient: EvictionRecipient = {
      userId: row.user_id,
      sellerId: row.seller_id,
      phone: row.phone,
      lane: isInstalledSeller ? 'installed_client' : 'sms_blast',
      link: row.seller_id ? `${appOrigin}/s/${marketId}/${row.seller_id}` : null,
    };
    (isInstalledSeller ? installed : sms).push(recipient);
  }

  const sellerCount = rows.filter((r) => r.seller_id !== null).length;
  return {
    installed,
    sms,
    fastPathShare: sellerCount === 0 ? 0 : installed.length / sellerCount,
  };
}
