import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { capacityEngine } from '../capacity/engine.js';
import { ordersService } from '../orders/orders.js';
import { emitEvent } from '../db/outbox.js';

export interface OverflowAlternative {
  windowId: string;
  sellerId: string;
  startsAt: Date;
  available: number;
  unitPriceMinor: number;
}

/**
 * P22 — overflow routing: a full slot routes, in real time, to
 * fit-matched available sellers. The buyer KEEPS their waitlist spot on
 * the original; booking an alternative stamps the incumbent as referrer,
 * and P17's referred split settles their credit automatically.
 */
export function overflowService(db: Kysely<Database>, marketId: string) {
  const engine = capacityEngine(db, marketId);
  const orders = ordersService(db, marketId);

  return {
    /** Fit-matched alternatives: same vertical, ±24h, real availability. */
    async findAlternatives(input: {
      fromWindowId: string;
      units: number;
    }): Promise<OverflowAlternative[]> {
      const source = await db
        .selectFrom('capacity_windows')
        .where('market_id', '=', marketId)
        .where('id', '=', input.fromWindowId)
        .selectAll()
        .executeTakeFirstOrThrow();
      const dayMs = 24 * 60 * 60 * 1000;
      const candidates = await db
        .selectFrom('capacity_windows')
        .where('market_id', '=', marketId)
        .where('vertical_id', '=', source.vertical_id)
        .where('seller_id', '!=', source.seller_id)
        .where('starts_at', '>=', new Date(new Date(source.starts_at).getTime() - dayMs))
        .where('starts_at', '<=', new Date(new Date(source.starts_at).getTime() + dayMs))
        .selectAll()
        .execute();
      const alternatives: OverflowAlternative[] = [];
      for (const w of candidates) {
        const { available } = await engine.availability(w.id);
        if (available >= input.units) {
          alternatives.push({
            windowId: w.id,
            sellerId: w.seller_id,
            startsAt: new Date(w.starts_at),
            available,
            unitPriceMinor: Number(w.unit_price_minor),
          });
        }
      }
      return alternatives.sort((a, b) => b.available - a.available);
    },

    /**
     * Book the alternative. The buyer's waitlist entry on the source stays
     * (their choice); the incumbent becomes the referrer on the new order.
     */
    async bookViaOverflow(input: {
      sourceWindowId: string;
      targetWindowId: string;
      buyerUserId: string;
      units: number;
    }): Promise<{ orderId: string; status: 'held' | 'waitlisted'; referrerSellerId: string }> {
      const source = await db
        .selectFrom('capacity_windows')
        .where('market_id', '=', marketId)
        .where('id', '=', input.sourceWindowId)
        .selectAll()
        .executeTakeFirstOrThrow();
      const target = await db
        .selectFrom('capacity_windows')
        .where('market_id', '=', marketId)
        .where('id', '=', input.targetWindowId)
        .selectAll()
        .executeTakeFirstOrThrow();
      const order = await orders.createDraft({
        sellerId: target.seller_id,
        buyerUserId: input.buyerUserId,
        windowId: target.id,
        verticalId: target.vertical_id,
        units: input.units,
      });
      // The incumbent referred this booking — their credit settles in split.
      await db
        .updateTable('orders')
        .set({ referred_by_seller_id: source.seller_id, updated_at: sql`now()` })
        .where('id', '=', order.id)
        .execute();
      const outcome = await orders.placeHold(order.id);
      await emitEvent(db, {
        marketId,
        topic: 'overflow.routed',
        payload: { orderId: order.id, from: source.seller_id, to: target.seller_id },
      });
      return { orderId: order.id, status: outcome.status, referrerSellerId: source.seller_id };
    },
  };
}

export interface BundleOffer {
  windowId: string;
  sellerId: string;
  verticalId: string;
  newcomerSlot: boolean;
}

/**
 * The bundle engine: a host event carries partner offers at checkout with
 * ONE rotating newcomer slot. Booking any offer stamps the host as
 * referrer, so shares settle inside the split (P17) — never invoices.
 */
export function bundleService(db: Kysely<Database>, marketId: string) {
  const engine = capacityEngine(db, marketId);

  return {
    async offersFor(input: {
      hostWindowId: string;
      maxOffers?: number;
      rotationIndex: number;
    }): Promise<BundleOffer[]> {
      const host = await db
        .selectFrom('capacity_windows')
        .where('market_id', '=', marketId)
        .where('id', '=', input.hostWindowId)
        .selectAll()
        .executeTakeFirstOrThrow();
      const dayMs = 24 * 60 * 60 * 1000;
      const candidates = await db
        .selectFrom('capacity_windows')
        .innerJoin('sellers', 'sellers.id', 'capacity_windows.seller_id')
        .where('capacity_windows.market_id', '=', marketId)
        .where('capacity_windows.seller_id', '!=', host.seller_id)
        .where(
          'capacity_windows.starts_at',
          '>=',
          new Date(new Date(host.starts_at).getTime() - dayMs),
        )
        .where(
          'capacity_windows.starts_at',
          '<=',
          new Date(new Date(host.starts_at).getTime() + dayMs),
        )
        .select([
          'capacity_windows.id as window_id',
          'capacity_windows.seller_id',
          'capacity_windows.vertical_id',
          'sellers.completed_orders',
          'sellers.readiness',
        ])
        .execute();

      const open: (BundleOffer & { completedOrders: number })[] = [];
      for (const c of candidates) {
        const { available } = await engine.availability(c.window_id);
        if (available <= 0) continue;
        open.push({
          windowId: c.window_id,
          sellerId: c.seller_id,
          verticalId: c.vertical_id,
          newcomerSlot: false,
          completedOrders: c.completed_orders,
        });
      }
      const newcomers = open.filter((o) => o.completedOrders < 10);
      const incumbents = open.filter((o) => o.completedOrders >= 10);
      const max = input.maxOffers ?? 3;
      const offers: BundleOffer[] = [];
      // Exactly one rotating newcomer slot, when any newcomer is available.
      if (newcomers.length > 0) {
        const pick = newcomers[input.rotationIndex % newcomers.length]!;
        offers.push({ ...pick, newcomerSlot: true });
      }
      for (const o of incumbents) {
        if (offers.length >= max) break;
        offers.push(o);
      }
      return offers.map(({ windowId, sellerId, verticalId, newcomerSlot }) => ({
        windowId,
        sellerId,
        verticalId,
        newcomerSlot,
      }));
    },
  };
}

export type OverflowService = ReturnType<typeof overflowService>;
export type BundleService = ReturnType<typeof bundleService>;
