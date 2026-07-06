import type { Kysely, Selectable } from 'kysely';
import type { Database, SellersTable } from '../db/types.js';
import {
  initialSellerState,
  transition,
  type ReadinessEvent,
  type Readiness,
  type SellerState,
  type Standing,
} from './readiness.js';

export type Seller = Selectable<SellersTable>;

/**
 * Phone-first identity: the WhatsApp number IS the login (Constitution §1).
 * Idempotent — a returning number gets the same user, never a duplicate.
 */
export function identityService(db: Kysely<Database>, marketId: string) {
  return {
    async findOrCreateUserByPhone(input: {
      phone: string;
      displayName: string;
      role?: 'buyer' | 'seller' | 'founder';
    }) {
      const existing = await db
        .selectFrom('users')
        .where('market_id', '=', marketId)
        .where('phone', '=', input.phone)
        .selectAll()
        .executeTakeFirst();
      if (existing) return existing;
      return db
        .insertInto('users')
        .values({
          market_id: marketId,
          phone: input.phone,
          display_name: input.displayName,
          ...(input.role && { role: input.role }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async createSeller(input: { userId: string; businessName: string }): Promise<Seller> {
      const initial = initialSellerState();
      return db
        .insertInto('sellers')
        .values({
          market_id: marketId,
          user_id: input.userId,
          business_name: input.businessName,
          readiness: initial.readiness,
          standing: initial.standing,
          completed_orders: initial.completedOrders,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async getSeller(sellerId: string): Promise<Seller | undefined> {
      return db
        .selectFrom('sellers')
        .where('market_id', '=', marketId)
        .where('id', '=', sellerId)
        .selectAll()
        .executeTakeFirst();
    },

    /**
     * Applies a readiness event atomically: the row is locked, the pure
     * state machine decides, and an invalid transition changes nothing.
     */
    async applySellerEvent(sellerId: string, event: ReadinessEvent): Promise<SellerState> {
      return db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom('sellers')
          .where('market_id', '=', marketId)
          .where('id', '=', sellerId)
          .forUpdate()
          .selectAll()
          .executeTakeFirstOrThrow();
        const next = transition(sellerStateOf(row), event);
        await trx
          .updateTable('sellers')
          .set({
            readiness: next.readiness,
            standing: next.standing,
            completed_orders: next.completedOrders,
          })
          .where('market_id', '=', marketId)
          .where('id', '=', sellerId)
          .execute();
        return next;
      });
    },
  };
}

export function sellerStateOf(row: Seller): SellerState {
  return {
    readiness: row.readiness as Readiness,
    standing: row.standing as Standing,
    completedOrders: row.completed_orders,
  };
}

export type IdentityService = ReturnType<typeof identityService>;
