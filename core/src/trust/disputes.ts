import { sql, type Kysely } from 'kysely';
import type { ContextPack } from '@sycamore/packs';
import { formatAmount } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { ledgerService } from '../ledger/ledger.js';

export const DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000;
/** BUILD trust rule: 4 claims across 4 sellers inside 30 days = abuse. */
export const ABUSE_CLAIMS = 4;
export const ABUSE_DISTINCT_SELLERS = 4;
export const ABUSE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface EvidenceFile {
  order: {
    id: string;
    sellerId: string;
    buyerUserId: string;
    units: number;
    status: string;
    completionProof: string | null;
    completedAt: string | null;
  };
  money: { captured: number; refunded: number; released: number };
  chatContext: Record<string, unknown>;
  buyerHistory: { orders: number; disputes: number; trustLevel: string };
  sellerHistory: { orders: number; disputes: number };
}

export type DisputeOutcome =
  | { decision: 'auto_refunded'; amountMinor: number; message: string }
  | { decision: 'under_review'; reason: string };

/**
 * P18 — refunds, disputes, evidence. Clear-cut case (no proof of
 * completion, buyer in good standing) auto-refunds immediately; anything
 * else assembles the evidence file and waits for a human. The abuse
 * counter downgrades privileges — restricted buyers never auto-refund.
 */
export function disputeService(db: Kysely<Database>, marketId: string, pack: ContextPack) {
  const ledger = ledgerService(db, marketId);

  async function assembleEvidence(orderId: string): Promise<EvidenceFile> {
    const order = await db
      .selectFrom('orders')
      .where('market_id', '=', marketId)
      .where('id', '=', orderId)
      .selectAll()
      .executeTakeFirstOrThrow();
    const money = await ledger.orderSummary(orderId);
    const session = await db
      .selectFrom('conversation_sessions')
      .where('market_id', '=', marketId)
      .where('user_id', '=', order.buyer_user_id)
      .selectAll()
      .executeTakeFirst();
    const buyer = await db
      .selectFrom('users')
      .where('id', '=', order.buyer_user_id)
      .selectAll()
      .executeTakeFirstOrThrow();
    const [buyerOrders, buyerDisputes, sellerOrders, sellerDisputes] = await Promise.all([
      db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('buyer_user_id', '=', order.buyer_user_id)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('disputes')
        .where('market_id', '=', marketId)
        .where('opened_by_user_id', '=', order.buyer_user_id)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', order.seller_id)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('disputes')
        .innerJoin('orders', 'orders.id', 'disputes.order_id')
        .where('disputes.market_id', '=', marketId)
        .where('orders.seller_id', '=', order.seller_id)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
    ]);
    return {
      order: {
        id: order.id,
        sellerId: order.seller_id,
        buyerUserId: order.buyer_user_id,
        units: order.units,
        status: order.status,
        completionProof: order.completion_proof,
        completedAt: order.completed_at ? new Date(order.completed_at).toISOString() : null,
      },
      money,
      chatContext: (session?.state as Record<string, unknown>) ?? {},
      buyerHistory: {
        orders: Number(buyerOrders.n),
        disputes: Number(buyerDisputes.n),
        trustLevel: buyer.trust_level,
      },
      sellerHistory: { orders: Number(sellerOrders.n), disputes: Number(sellerDisputes.n) },
    };
  }

  async function countRecentAutoRefunds(
    buyerUserId: string,
    now: Date,
  ): Promise<{ claims: number; distinctSellers: number }> {
    const rows = await db
      .selectFrom('disputes')
      .innerJoin('orders', 'orders.id', 'disputes.order_id')
      .where('disputes.market_id', '=', marketId)
      .where('disputes.opened_by_user_id', '=', buyerUserId)
      .where('disputes.status', '=', 'auto_refunded')
      .where('disputes.created_at', '>', new Date(now.getTime() - ABUSE_WINDOW_MS))
      .select('orders.seller_id')
      .execute();
    return { claims: rows.length, distinctSellers: new Set(rows.map((r) => r.seller_id)).size };
  }

  return {
    ledger,
    assembleEvidence,

    /** §5.3-3: cancel inside window → refund lands → plain-number message. */
    async refundOnCancel(orderId: string): Promise<{ amountMinor: number; message: string }> {
      const sums = await ledger.orderSummary(orderId);
      const available = sums.captured - sums.refunded - sums.released;
      if (available <= 0) return { amountMinor: 0, message: '' };
      await ledger.refund({
        orderRef: orderId,
        amountMinor: available,
        currency: pack.currency.code,
        idempotencyKey: `cancel-refund:${orderId}`,
      });
      return {
        amountMinor: available,
        message: `${formatAmount(pack, available)} is on its way back to you.`,
      };
    },

    /** Open a dispute inside the 48h pre-release window. */
    async openDispute(input: {
      orderId: string;
      openedByUserId: string;
      reason: string;
      now?: Date;
    }): Promise<DisputeOutcome> {
      const now = input.now ?? new Date();
      const order = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('id', '=', input.orderId)
        .selectAll()
        .executeTakeFirstOrThrow();
      const money = await ledger.orderSummary(input.orderId);
      if (money.released > 0) {
        throw new Error(`order ${input.orderId} already released — dispute window is pre-release`);
      }
      if (
        order.completed_at &&
        now.getTime() - new Date(order.completed_at).getTime() > DISPUTE_WINDOW_MS
      ) {
        throw new Error(`dispute window (48h) has closed for order ${input.orderId}`);
      }

      const evidence = await assembleEvidence(input.orderId);
      const buyer = await db
        .selectFrom('users')
        .where('id', '=', input.openedByUserId)
        .selectAll()
        .executeTakeFirstOrThrow();

      // Clear-cut auto-refund: no proof of completion + buyer in good standing.
      const clearCut = evidence.order.completionProof === null;
      if (clearCut && buyer.trust_level === 'standard') {
        const available = money.captured - money.refunded;
        await db
          .insertInto('disputes')
          .values({
            market_id: marketId,
            order_id: input.orderId,
            opened_by_user_id: input.openedByUserId,
            reason: input.reason,
            status: 'auto_refunded',
            evidence: JSON.stringify(evidence),
          })
          .execute();
        if (available > 0) {
          await ledger.refund({
            orderRef: input.orderId,
            amountMinor: available,
            currency: pack.currency.code,
            idempotencyKey: `dispute-refund:${input.orderId}`,
          });
        }
        // Abuse counter: privileges downgrade at the threshold.
        const recent = await countRecentAutoRefunds(input.openedByUserId, now);
        if (recent.claims >= ABUSE_CLAIMS && recent.distinctSellers >= ABUSE_DISTINCT_SELLERS) {
          await db
            .updateTable('users')
            .set({ trust_level: 'restricted', updated_at: sql`now()` })
            .where('id', '=', input.openedByUserId)
            .execute();
        }
        return {
          decision: 'auto_refunded',
          amountMinor: available,
          message: `${formatAmount(pack, available)} is on its way back to you.`,
        };
      }

      await db
        .insertInto('disputes')
        .values({
          market_id: marketId,
          order_id: input.orderId,
          opened_by_user_id: input.openedByUserId,
          reason: input.reason,
          status: 'under_review',
          evidence: JSON.stringify(evidence),
        })
        .execute();
      return {
        decision: 'under_review',
        reason: clearCut
          ? 'buyer privileges restricted — human review required'
          : 'completion proof exists — human review required',
      };
    },

    /** Release is allowed only after the 48h window with no open dispute. */
    async releaseEligible(orderId: string, now = new Date()): Promise<boolean> {
      const order = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('id', '=', orderId)
        .selectAll()
        .executeTakeFirstOrThrow();
      if (order.status !== 'completed' || !order.completed_at) return false;
      if (now.getTime() - new Date(order.completed_at).getTime() < DISPUTE_WINDOW_MS) return false;
      const open = await db
        .selectFrom('disputes')
        .where('market_id', '=', marketId)
        .where('order_id', '=', orderId)
        .where('status', 'in', ['open', 'under_review'])
        .select('id')
        .executeTakeFirst();
      return open === undefined;
    },
  };
}

export type DisputeService = ReturnType<typeof disputeService>;
