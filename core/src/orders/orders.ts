import type { Kysely, Selectable, Transaction } from 'kysely';
import type { CompletionProof, VerticalPack } from '@sycamore/packs';
import type { Database, OrdersTable } from '../db/types.js';
import { confirmHoldTx, releaseHoldTx, requestHoldTx, CapacityError } from '../capacity/engine.js';
import { emitEvent } from '../db/outbox.js';
import { completionEvidence, type CompletionClaim } from './evidence.js';

export type Order = Selectable<OrdersTable>;
export type OrderStatus = 'draft' | 'held' | 'confirmed' | 'completed' | 'cancelled' | 'disputed';

export class OrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderError';
  }
}

/**
 * P9 — order lifecycle bound to capacity holds:
 * draft → held → confirmed → completed | cancelled | disputed.
 * Every move that touches capacity happens in ONE transaction with the
 * hold change, so no crash can leave an order and its hold disagreeing.
 */
export function ordersService(db: Kysely<Database>, marketId: string) {
  async function lockOrder(trx: Transaction<Database>, orderId: string): Promise<Order> {
    const order = await trx
      .selectFrom('orders')
      .where('market_id', '=', marketId)
      .where('id', '=', orderId)
      .forUpdate()
      .selectAll()
      .executeTakeFirst();
    if (!order) throw new OrderError(`order ${orderId} not found`);
    return order;
  }

  function assertStatus(order: Order, allowed: OrderStatus[]): void {
    if (!allowed.includes(order.status as OrderStatus)) {
      throw new OrderError(`order ${order.id} is ${order.status}; expected ${allowed.join(' | ')}`);
    }
  }

  return {
    async createDraft(input: {
      sellerId: string;
      buyerUserId: string;
      windowId: string;
      verticalId: string;
      units: number;
    }): Promise<Order> {
      return db
        .insertInto('orders')
        .values({
          market_id: marketId,
          seller_id: input.sellerId,
          buyer_user_id: input.buyerUserId,
          window_id: input.windowId,
          vertical_id: input.verticalId,
          units: input.units,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** draft → held (books capacity) or stays draft with a waitlist slot. */
    async placeHold(
      orderId: string,
      options: { ttlMs?: number } = {},
    ): Promise<{ status: 'held' | 'waitlisted' }> {
      return db.transaction().execute(async (trx) => {
        const order = await lockOrder(trx, orderId);
        assertStatus(order, ['draft']);
        const outcome = await requestHoldTx(trx, marketId, {
          windowId: order.window_id,
          userId: order.buyer_user_id,
          units: order.units,
          ...(options.ttlMs !== undefined && { ttlMs: options.ttlMs }),
        });
        if (outcome.kind === 'waitlisted') return { status: 'waitlisted' };
        await trx
          .updateTable('orders')
          .set({ status: 'held', hold_id: outcome.holdId })
          .where('id', '=', orderId)
          .execute();
        await emitEvent(trx, { marketId, topic: 'order.held', payload: { orderId } });
        return { status: 'held' };
      });
    },

    /**
     * held → confirmed: order and hold flip together or not at all.
     *
     * Confirmation also mints the BUYER's completion code and posts it
     * to the outbox for delivery down the buyer's own channel. That is
     * what makes offline completion honest: the seller's installed
     * client can ask for a code the buyer already has in their chat,
     * queue it with no signal, and have it verified on reconnect —
     * rather than asserting "done" and being believed (C02). The code is
     * order-bound, one-use, and expires a day after the booking ends.
     */
    async confirm(orderId: string): Promise<void> {
      const code = await db.transaction().execute(async (trx) => {
        const order = await lockOrder(trx, orderId);
        assertStatus(order, ['held']);
        if (!order.hold_id) throw new OrderError(`order ${orderId} has no hold`);
        await confirmHoldTx(trx, marketId, order.hold_id);
        await trx
          .updateTable('orders')
          .set({ status: 'confirmed' })
          .where('id', '=', orderId)
          .execute();
        await emitEvent(trx, { marketId, topic: 'order.confirmed', payload: { orderId } });
        return { buyerUserId: order.buyer_user_id, windowId: order.window_id };
      });
      const window = await db
        .selectFrom('capacity_windows')
        .where('market_id', '=', marketId)
        .where('id', '=', code.windowId)
        .select('ends_at')
        .executeTakeFirst();
      const endsAt = window ? new Date(window.ends_at).getTime() : Date.now();
      const issued = await completionEvidence(db, marketId).issueChallenge({
        orderId,
        issuedToUserId: code.buyerUserId,
        ttlMs: Math.max(endsAt + 86_400_000 - Date.now(), 3_600_000),
      });
      await emitEvent(db, {
        marketId,
        topic: 'order.completion_code',
        payload: { orderId, buyerUserId: code.buyerUserId, code: issued.code },
      });
    },

    /**
     * confirmed → completed, on VERIFIED evidence.
     *
     * This is the only way an order completes, and it takes a claim, not
     * a proof: the caller says what happened and the evidence service
     * decides whether it did. Before the external review of 2026-09-16
     * this took a bare enum, so any caller holding an order id could
     * write "qr_scan" onto it and the record a dispute is judged on was
     * whatever the caller typed.
     *
     * Verification reads first, then the transaction consumes the
     * evidence and moves the order together — one step, so two racing
     * completions cannot both succeed (the unique index on
     * completion_evidence is the backstop if a future caller finds
     * another path in).
     */
    async complete(
      orderId: string,
      claim: CompletionClaim,
      pack: VerticalPack,
      actor: { userId: string | null; role: string },
    ): Promise<{ proof: CompletionProof }> {
      const evidence = completionEvidence(db, marketId);
      const order0 = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('id', '=', orderId)
        .select(['vertical_id', 'status', 'id'])
        .executeTakeFirst();
      if (!order0) throw new OrderError(`order ${orderId} not found`);
      if (order0.vertical_id !== pack.vertical_id) {
        throw new OrderError(`order is ${order0.vertical_id}, pack is ${pack.vertical_id}`);
      }
      // Cheap and first, so completing a draft still fails as a bad
      // TRANSITION rather than as missing evidence — the caller's
      // mistake should name itself. The authoritative check is the
      // locked one inside the transaction below.
      assertStatus(order0 as Order, ['confirmed', 'disputed']);
      const verified = await evidence.verify({
        orderId,
        claim,
        actorUserId: actor.userId,
        actorRole: actor.role,
        allowed: pack.booking.completion_proof,
      });
      await db.transaction().execute(async (trx) => {
        const order = await lockOrder(trx, orderId);
        assertStatus(order, ['confirmed', 'disputed']);
        if (order.vertical_id !== pack.vertical_id) {
          throw new OrderError(`order is ${order.vertical_id}, pack is ${pack.vertical_id}`);
        }
        await verified.apply(trx);
        await trx
          .updateTable('orders')
          .set({
            status: 'completed',
            completion_proof: verified.proof,
            completed_at: new Date(),
          })
          .where('id', '=', orderId)
          .execute();
        await emitEvent(trx, {
          marketId,
          topic: 'order.completed',
          payload: { orderId, proof: verified.proof, evidenceRef: verified.reference },
        });
      });
      return { proof: verified.proof };
    },

    /** The one-use code behind a QR completion (see evidence.ts). */
    issueCompletionCode(input: { orderId: string; issuedToUserId?: string; ttlMs?: number }) {
      return completionEvidence(db, marketId).issueChallenge(input);
    },

    /** What was verified for an order — what a dispute reads. */
    completionEvidenceFor(orderId: string) {
      return completionEvidence(db, marketId).forOrder(orderId);
    },

    /** Any pre-terminal state → cancelled; frees the hold in the same txn. */
    async cancel(orderId: string): Promise<void> {
      await db.transaction().execute(async (trx) => {
        const order = await lockOrder(trx, orderId);
        assertStatus(order, ['draft', 'held', 'confirmed', 'disputed']);
        if (order.hold_id) await releaseHoldTx(trx, marketId, order.hold_id);
        await trx
          .updateTable('orders')
          .set({ status: 'cancelled' })
          .where('id', '=', orderId)
          .execute();
        await emitEvent(trx, { marketId, topic: 'order.cancelled', payload: { orderId } });
      });
    },

    /** confirmed → disputed (resolution paths arrive with P18). */
    async dispute(orderId: string): Promise<void> {
      await db.transaction().execute(async (trx) => {
        const order = await lockOrder(trx, orderId);
        assertStatus(order, ['confirmed']);
        await trx
          .updateTable('orders')
          .set({ status: 'disputed' })
          .where('id', '=', orderId)
          .execute();
        await emitEvent(trx, { marketId, topic: 'order.disputed', payload: { orderId } });
      });
    },

    /**
     * GATE-critical: reschedule is ATOMIC — source freed and target filled,
     * or neither. Target capacity is requested first; if the target is full
     * the transaction rolls back and the source hold is untouched.
     */
    async reschedule(orderId: string, targetWindowId: string): Promise<void> {
      await db.transaction().execute(async (trx) => {
        const order = await lockOrder(trx, orderId);
        assertStatus(order, ['held', 'confirmed']);
        if (!order.hold_id) throw new OrderError(`order ${orderId} has no hold`);
        if (order.window_id === targetWindowId) return;

        const outcome = await requestHoldTx(trx, marketId, {
          windowId: targetWindowId,
          userId: order.buyer_user_id,
          units: order.units,
        });
        if (outcome.kind === 'waitlisted') {
          // Rolling back would still leave the waitlist row gone with the
          // txn — but we must not leave one either way: throw aborts all.
          throw new CapacityError(
            `target window ${targetWindowId} is full — reschedule aborted, source untouched`,
          );
        }
        if (order.status === 'confirmed') {
          await confirmHoldTx(trx, marketId, outcome.holdId);
        }
        await releaseHoldTx(trx, marketId, order.hold_id);
        await trx
          .updateTable('orders')
          .set({ window_id: targetWindowId, hold_id: outcome.holdId })
          .where('id', '=', orderId)
          .execute();
        await emitEvent(trx, {
          marketId,
          topic: 'order.rescheduled',
          payload: { orderId, from: order.window_id, to: targetWindowId },
        });
      });
    },

    async get(orderId: string): Promise<Order | undefined> {
      return db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('id', '=', orderId)
        .selectAll()
        .executeTakeFirst();
    },
  };
}

export type OrdersService = ReturnType<typeof ordersService>;
