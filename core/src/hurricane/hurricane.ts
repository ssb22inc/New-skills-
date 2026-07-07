import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { ContextPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { emitEvent } from '../db/outbox.js';
import { ledgerService } from '../ledger/ledger.js';
import { ordersService } from '../orders/orders.js';

export class HurricaneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HurricaneError';
  }
}

/**
 * P32 — Hurricane Mode. One switch: freeze new bookings (DB-enforced),
 * snapshot every in-flight order, then work the waves — rebook what can
 * move, refund what can't, tell everyone "we're safe" and later "we're
 * open", and hand Pulse a recovery promo. The timed PROD rehearsal is
 * the P32 HUMAN GATE; the runbook score below runs against staging.
 */
export function hurricaneMode(db: Kysely<Database>, marketId: string, pack: ContextPack) {
  const ledger = ledgerService(db, marketId);
  const orders = ordersService(db, marketId);

  return {
    ledger,

    async status() {
      const row = await db
        .selectFrom('hurricane_states')
        .where('market_id', '=', marketId)
        .selectAll()
        .executeTakeFirst();
      return { active: row?.active ?? false, reason: row?.reason ?? null };
    },

    /** Freeze + snapshot. Idempotent: re-activation extends nothing. */
    async activate(reason: string) {
      await db
        .insertInto('hurricane_states')
        .values({ market_id: marketId, active: true, reason, activated_at: new Date() })
        .onConflict((oc) =>
          oc.column('market_id').doUpdateSet({ active: true, reason, updated_at: sql`now()` }),
        )
        .execute();

      // Snapshot every order that now sits in the storm's path.
      const inFlight = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('status', 'in', ['held', 'confirmed'])
        .select('id')
        .execute();
      for (const o of inFlight) {
        await db
          .insertInto('hurricane_impacts')
          .values({ market_id: marketId, order_id: o.id })
          .onConflict((oc) => oc.column('order_id').doNothing())
          .execute();
      }
      await emitEvent(db, {
        marketId,
        topic: 'hurricane.broadcast',
        payload: {
          kind: 'freeze',
          text: 'Storm coming — bookings are paused while we look after everyone booked in. Stay safe.',
        },
      });
      return { frozenOrders: inFlight.length };
    },

    /** Wave 1: move what can move. Idempotent — only pending impacts move. */
    async rebookWave(targets: { orderId: string; targetWindowId: string }[]) {
      let rebooked = 0;
      for (const t of targets) {
        const impact = await db
          .selectFrom('hurricane_impacts')
          .where('market_id', '=', marketId)
          .where('order_id', '=', t.orderId)
          .selectAll()
          .executeTakeFirst();
        if (!impact || impact.disposition !== 'pending') continue;
        await orders.reschedule(t.orderId, t.targetWindowId);
        await db
          .updateTable('hurricane_impacts')
          .set({ disposition: 'rebooked', updated_at: sql`now()` })
          .where('id', '=', impact.id)
          .execute();
        rebooked++;
      }
      return { rebooked };
    },

    /**
     * Wave 2: refund everything still pending, to the cent, idempotent
     * under retries (webhooks WILL double-fire in a storm).
     */
    async refundWave() {
      const pending = await db
        .selectFrom('hurricane_impacts')
        .where('market_id', '=', marketId)
        .where('disposition', '=', 'pending')
        .selectAll()
        .execute();
      let refunded = 0;
      let refundedMinor = 0;
      for (const impact of pending) {
        const sums = await ledger.orderSummary(impact.order_id);
        const refundable = sums.captured - sums.refunded - sums.released;
        await orders.cancel(impact.order_id);
        if (refundable > 0) {
          await ledger.refund({
            orderRef: impact.order_id,
            amountMinor: refundable,
            currency: pack.currency.code,
            idempotencyKey: `hurricane-refund:${impact.order_id}`,
          });
          refundedMinor += refundable;
        }
        await db
          .updateTable('hurricane_impacts')
          .set({ disposition: 'refunded', updated_at: sql`now()` })
          .where('id', '=', impact.id)
          .execute();
        refunded++;
      }
      return { refunded, refundedMinor };
    },

    async broadcast(kind: 'were_safe' | 'were_open') {
      const text =
        kind === 'were_safe'
          ? 'We came through fine. Everyone booked has been moved or refunded — check your chat.'
          : 'We are OPEN again. Sellers are back and taking bookings now.';
      await emitEvent(db, { marketId, topic: 'hurricane.broadcast', payload: { kind, text } });
    },

    /** Lift the freeze; hand Pulse the recovery promo. */
    async deactivate() {
      const open = await db
        .selectFrom('hurricane_impacts')
        .where('market_id', '=', marketId)
        .where('disposition', '=', 'pending')
        .select((eb) => eb.fn.countAll().as('n'))
        .executeTakeFirst();
      if (Number(open?.n ?? 0) > 0) {
        throw new HurricaneError(
          `${Number(open?.n)} impacted orders still pending — finish the waves first`,
        );
      }
      await db
        .updateTable('hurricane_states')
        .set({ active: false, updated_at: sql`now()` })
        .where('market_id', '=', marketId)
        .execute();
      await this.broadcast('were_open');
      await emitEvent(db, {
        marketId,
        topic: 'hurricane.recovery_promo',
        payload: { note: 'recovery promo window for rebooked + refunded buyers' },
      });
    },
  };
}

export type HurricaneMode = ReturnType<typeof hurricaneMode>;
