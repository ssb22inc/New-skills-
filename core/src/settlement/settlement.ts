import type { Kysely } from 'kysely';
import type { ContextPack } from '@sycamore/packs';
import { formatAmount } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { ledgerService, type SplitBps } from '../ledger/ledger.js';

function toSplitBps(t: {
  seller_bps: number;
  platform_bps: number;
  referral_bps: number;
  processor_bps: number;
}): SplitBps {
  return {
    sellerBps: t.seller_bps,
    platformBps: t.platform_bps,
    referralBps: t.referral_bps,
    processorBps: t.processor_bps,
  };
}

/**
 * P17 — completion-triggered settlement. The split table comes from the
 * context pack; a referred order settles the incumbent's credit INSIDE
 * the same split. Payouts batch everything a seller is owed into one
 * transaction and one plain-number message.
 */
export function settlementService(db: Kysely<Database>, marketId: string, pack: ContextPack) {
  const ledger = ledgerService(db, marketId);

  return {
    ledger,

    /** Release escrow for a completed order, split per the pack tables. */
    async releaseForOrder(orderId: string) {
      const order = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('id', '=', orderId)
        .selectAll()
        .executeTakeFirstOrThrow();
      const referred = order.referred_by_seller_id !== null;
      const table = referred ? pack.splits.referred : pack.splits.standard;
      return ledger.release({
        orderRef: order.id,
        currency: pack.currency.code,
        split: toSplitBps(table),
        idempotencyKey: `release:${order.id}`,
        sellerId: order.seller_id,
        ...(order.referred_by_seller_id && { referralSellerId: order.referred_by_seller_id }),
      });
    },

    /**
     * Batch payouts: one transaction per seller with a balance, one
     * plain-language message each — "you sold X, your money is Y".
     */
    async runPayoutBatch(
      batchKey: string,
    ): Promise<{ sellerId: string; amountMinor: number; message: string }[]> {
      const sellers = await db
        .selectFrom('ledger_entries')
        .where('market_id', '=', marketId)
        .where('seller_id', 'is not', null)
        .select('seller_id')
        .distinct()
        .execute();
      const results: { sellerId: string; amountMinor: number; message: string }[] = [];
      for (const row of sellers) {
        const sellerId = row.seller_id!;
        const res = await ledger.payoutSeller({
          sellerId,
          currency: pack.currency.code,
          idempotencyKey: `payout:${batchKey}:${sellerId}`,
        });
        if (!res.posted || res.amountMinor <= 0) continue;
        results.push({
          sellerId,
          amountMinor: res.amountMinor,
          // Plain numbers, pack currency — never a chart (Constitution §1.3).
          message: `${formatAmount(pack, res.amountMinor)} is on the way to you today.`,
        });
      }
      return results;
    },
  };
}

export type SettlementService = ReturnType<typeof settlementService>;
