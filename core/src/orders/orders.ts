import type { Kysely, Selectable, Transaction } from 'kysely';
import type { CompletionProof, VerticalPack } from '@sycamore/packs';
import type { Database, OrdersTable } from '../db/types.js';
import { confirmHoldTx, releaseHoldTx, requestHoldTx, CapacityError } from '../capacity/engine.js';
import { emitEvent } from '../db/outbox.js';

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

    /** held → confirmed: order and hold flip together or not at all. */
    async confirm(orderId: string): Promise<void> {
      await db.transaction().execute(async (trx) => {
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
      });
    },

    /** confirmed → completed, with a proof the vertical pack allows. */
    async complete(orderId: string, proof: CompletionProof, pack: VerticalPack): Promise<void> {
      await db.transaction().execute(async (trx) => {
        const order = await lockOrder(trx, orderId);
        assertStatus(order, ['confirmed', 'disputed']);
        if (order.vertical_id !== pack.vertical_id) {
          throw new OrderError(`order is ${order.vertical_id}, pack is ${pack.vertical_id}`);
        }
        if (!pack.booking.completion_proof.includes(proof)) {
          throw new OrderError(
            `proof "${proof}" is not accepted for ${pack.vertical_id} ` +
              `(allowed: ${pack.booking.completion_proof.join(', ')})`,
          );
        }
        await trx
          .updateTable('orders')
          .set({ status: 'completed', completion_proof: proof, completed_at: new Date() })
          .where('id', '=', orderId)
          .execute();
        await emitEvent(trx, { marketId, topic: 'order.completed', payload: { orderId, proof } });
      });
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
