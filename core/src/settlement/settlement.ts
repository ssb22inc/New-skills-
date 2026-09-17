import type { Kysely } from 'kysely';
import type { ContextPack } from '@sycamore/packs';
import { formatAmount, translator } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import type { PaymentAdapter } from '@sycamore/adapters';
import { ledgerService, type SplitBps } from '../ledger/ledger.js';
import { payoutService, type PayoutState } from './payouts.js';
import { DISPUTE_WINDOW_MS } from '../trust/disputes.js';

/**
 * Why a release is refused. A settlement that cannot say why is a
 * settlement nobody can appeal (Constitution §4 — show me why).
 */
export type ReleaseRefusal =
  'not_completed' | 'no_evidence' | 'dispute_window_open' | 'dispute_open' | 'market_frozen';

export class SettlementError extends Error {
  readonly reason: ReleaseRefusal;
  constructor(reason: ReleaseRefusal, message: string) {
    super(message);
    this.name = 'SettlementError';
    this.reason = reason;
  }
}

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
  const say = translator(pack);
  const ledger = ledgerService(db, marketId);

  return {
    ledger,

    /**
     * Whether this order may release, and why not when it may not.
     *
     * The external review of 2026-09-16 found `releaseForOrder` moving
     * money on nothing but the row existing: no completion check, no
     * evidence, no dispute window, no freeze. The eligibility rules
     * existed — in `disputeService.releaseEligible` — and a caller
     * reaching this function simply went around them. Rules that live
     * beside the door instead of in it are decoration, so they are in
     * the door now, and the other entrypoint stays for the callers that
     * only want to ask.
     */
    async releaseEligibility(
      orderId: string,
      now = new Date(),
    ): Promise<{ ok: true } | { ok: false; reason: ReleaseRefusal; detail: string }> {
      const order = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('id', '=', orderId)
        .selectAll()
        .executeTakeFirstOrThrow();
      if (order.status !== 'completed' || !order.completed_at) {
        return {
          ok: false,
          reason: 'not_completed',
          detail: `order ${orderId} is ${order.status}; escrow releases on completion`,
        };
      }
      // Completion is a claim; evidence is what makes it a fact (P9).
      const evidence = await db
        .selectFrom('completion_evidence')
        .where('market_id', '=', marketId)
        .where('order_id', '=', orderId)
        .select('id')
        .executeTakeFirst();
      if (!evidence) {
        return {
          ok: false,
          reason: 'no_evidence',
          detail: `order ${orderId} is marked completed with no verified evidence behind it`,
        };
      }
      // A market in a storm or a blackout does not move money on
      // information that may be days stale (P32, P34d).
      const frozen = await db
        .selectFrom('hurricane_states')
        .where('market_id', '=', marketId)
        .where('active', '=', true)
        .select('market_id')
        .executeTakeFirst();
      if (frozen) {
        return {
          ok: false,
          reason: 'market_frozen',
          detail: `${marketId} is under Hurricane Mode; releases are frozen`,
        };
      }
      // Blackout shares hurricane_states: one row per market, two
      // switches — a storm freezes bookings, a blackout only pauses
      // money (P34d: record now, settle later).
      const blackout = await db
        .selectFrom('hurricane_states')
        .where('market_id', '=', marketId)
        .where('blackout', '=', true)
        .select('market_id')
        .executeTakeFirst();
      if (blackout) {
        return {
          ok: false,
          reason: 'market_frozen',
          detail: `${marketId} is in Blackout Mode; escrow release is paused`,
        };
      }
      const open = await db
        .selectFrom('disputes')
        .where('market_id', '=', marketId)
        .where('order_id', '=', orderId)
        .where('status', 'in', ['open', 'under_review'])
        .select('id')
        .executeTakeFirst();
      if (open) {
        return {
          ok: false,
          reason: 'dispute_open',
          detail: `order ${orderId} has an open dispute`,
        };
      }
      const elapsed = now.getTime() - new Date(order.completed_at).getTime();
      if (elapsed < DISPUTE_WINDOW_MS) {
        const hours = Math.ceil((DISPUTE_WINDOW_MS - elapsed) / 3_600_000);
        return {
          ok: false,
          reason: 'dispute_window_open',
          detail: `order ${orderId} is ${hours}h short of the 48h dispute window`,
        };
      }
      return { ok: true };
    },

    /** Release escrow for an eligible completed order, split per the pack. */
    async releaseForOrder(orderId: string, now = new Date()) {
      const eligible = await this.releaseEligibility(orderId, now);
      if (!eligible.ok) throw new SettlementError(eligible.reason, eligible.detail);
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
     * Batch payouts: one INTENT per seller with a balance, submitted to
     * the provider, settled only when the provider says the money left.
     *
     * This used to post `seller_payable` → `external` and tell the
     * seller they had been paid, without asking any provider to move
     * anything (C05). The message a seller gets now matches what has
     * actually happened: "on its way" when the provider accepts it,
     * "landed" when the provider confirms it.
     */
    async runPayoutBatch(
      batchKey: string,
      adapter?: PaymentAdapter,
    ): Promise<
      {
        sellerId: string;
        intentId: string;
        amountMinor: number;
        state: PayoutState;
        message: string;
      }[]
    > {
      const payouts = payoutService(db, marketId);
      const sellers = await db
        .selectFrom('ledger_entries')
        .where('market_id', '=', marketId)
        .where('seller_id', 'is not', null)
        .where('currency', '=', pack.currency.code)
        .select('seller_id')
        .distinct()
        .execute();
      const results: {
        sellerId: string;
        intentId: string;
        amountMinor: number;
        state: PayoutState;
        message: string;
      }[] = [];
      for (const row of sellers) {
        const sellerId = row.seller_id!;
        const intent = await payouts.reserve({
          sellerId,
          currency: pack.currency.code,
          batchKey,
        });
        if (!intent) continue;
        // Somebody else's open intent: this batch neither created it nor
        // owns it, and reporting it would look like a second payment in
        // the results. It is already in flight and already visible in
        // the exception queue if it stays there.
        if (!intent.created) continue;
        let state = intent.state;
        if (adapter && state === 'reserved') {
          state = (await payouts.submit(intent.id, adapter)).state;
        }
        results.push({
          sellerId,
          intentId: intent.id,
          amountMinor: intent.amountMinor,
          state,
          // Plain numbers, pack currency — never a chart (Constitution §3).
          message: say('settlement.payout', {
            amount: formatAmount(pack, intent.amountMinor),
          }),
        });
      }
      return results;
    },

    /** The provider conversation, for callers that need it directly. */
    payouts: payoutService(db, marketId),
  };
}

export type SettlementService = ReturnType<typeof settlementService>;
