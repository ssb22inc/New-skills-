import { sql, type Kysely, type Transaction } from 'kysely';
import type { VerticalPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';

export type HoldOutcome =
  { kind: 'held'; holdId: string; expiresAt: Date } | { kind: 'waitlisted'; position: number };

export class CapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapacityError';
  }
}

const DEFAULT_HOLD_TTL_MS = 10 * 60 * 1000;

/**
 * THE primitive (P8): units × time windows × TTL holds × waitlist.
 * Correctness rests on one rule — every capacity decision happens inside
 * a transaction that holds `FOR UPDATE` on the window row, so the
 * used-units arithmetic is serialized per window. The *Tx functions are
 * the real operations; they compose into larger transactions (orders,
 * reschedule) so an order and its hold always change atomically.
 */

async function usedUnits(trx: Transaction<Database>, windowId: string): Promise<number> {
  const row = await trx
    .selectFrom('capacity_holds')
    .where('window_id', '=', windowId)
    .where((eb) =>
      eb.or([
        eb('status', '=', 'confirmed'),
        eb.and([eb('status', '=', 'held'), eb('expires_at', '>', sql<Date>`now()`)]),
      ]),
    )
    .select((eb) => eb.fn.coalesce(eb.fn.sum<number>('units'), sql<number>`0`).as('used'))
    .executeTakeFirstOrThrow();
  return Number(row.used);
}

async function promoteFromWaitlist(
  trx: Transaction<Database>,
  marketId: string,
  windowId: string,
): Promise<void> {
  const window = await trx
    .selectFrom('capacity_windows')
    .where('id', '=', windowId)
    .selectAll()
    .executeTakeFirstOrThrow();
  let used = await usedUnits(trx, windowId);
  // Deterministic order: bigserial id — first asked, first served.
  const waiting = await trx
    .selectFrom('capacity_waitlist')
    .where('window_id', '=', windowId)
    .orderBy('id', 'asc')
    .selectAll()
    .execute();
  for (const entry of waiting) {
    if (used + entry.units > window.total_units) break;
    await trx
      .insertInto('capacity_holds')
      .values({
        market_id: marketId,
        window_id: windowId,
        user_id: entry.user_id,
        units: entry.units,
        status: 'held',
        expires_at: new Date(Date.now() + DEFAULT_HOLD_TTL_MS),
      })
      .execute();
    await trx.deleteFrom('capacity_waitlist').where('id', '=', entry.id).execute();
    used += entry.units;
  }
}

export async function lockWindow(trx: Transaction<Database>, marketId: string, windowId: string) {
  const window = await trx
    .selectFrom('capacity_windows')
    .where('market_id', '=', marketId)
    .where('id', '=', windowId)
    .forUpdate()
    .selectAll()
    .executeTakeFirst();
  if (!window) throw new CapacityError(`window ${windowId} not found`);
  return window;
}

export async function requestHoldTx(
  trx: Transaction<Database>,
  marketId: string,
  input: { windowId: string; userId: string; units: number; ttlMs?: number },
): Promise<HoldOutcome> {
  if (!Number.isInteger(input.units) || input.units <= 0) {
    throw new CapacityError(`units must be a positive integer, got ${input.units}`);
  }
  const window = await lockWindow(trx, marketId, input.windowId);
  const used = await usedUnits(trx, input.windowId);
  if (used + input.units <= window.total_units) {
    const expiresAt = new Date(Date.now() + (input.ttlMs ?? DEFAULT_HOLD_TTL_MS));
    const hold = await trx
      .insertInto('capacity_holds')
      .values({
        market_id: marketId,
        window_id: input.windowId,
        user_id: input.userId,
        units: input.units,
        status: 'held',
        expires_at: expiresAt,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { kind: 'held', holdId: hold.id, expiresAt };
  }
  await trx
    .insertInto('capacity_waitlist')
    .values({
      market_id: marketId,
      window_id: input.windowId,
      user_id: input.userId,
      units: input.units,
    })
    .onConflict((oc) => oc.columns(['window_id', 'user_id']).doNothing())
    .execute();
  const position = await trx
    .selectFrom('capacity_waitlist')
    .where('window_id', '=', input.windowId)
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .executeTakeFirstOrThrow();
  return { kind: 'waitlisted', position: Number(position.n) };
}

export async function confirmHoldTx(
  trx: Transaction<Database>,
  marketId: string,
  holdId: string,
): Promise<void> {
  const hold = await trx
    .selectFrom('capacity_holds')
    .where('market_id', '=', marketId)
    .where('id', '=', holdId)
    .forUpdate()
    .selectAll()
    .executeTakeFirst();
  if (!hold) throw new CapacityError(`hold ${holdId} not found`);
  if (hold.status !== 'held') {
    throw new CapacityError(`hold ${holdId} is ${hold.status}, not held`);
  }
  if (new Date(hold.expires_at) <= new Date()) {
    throw new CapacityError(`hold ${holdId} has expired`);
  }
  await trx
    .updateTable('capacity_holds')
    .set({ status: 'confirmed' })
    .where('id', '=', holdId)
    .execute();
}

/** Idempotent; frees units and promotes the waitlist in the same transaction. */
export async function releaseHoldTx(
  trx: Transaction<Database>,
  marketId: string,
  holdId: string,
): Promise<void> {
  const hold = await trx
    .selectFrom('capacity_holds')
    .where('market_id', '=', marketId)
    .where('id', '=', holdId)
    .forUpdate()
    .selectAll()
    .executeTakeFirst();
  if (!hold) throw new CapacityError(`hold ${holdId} not found`);
  if (hold.status === 'released' || hold.status === 'expired') return;
  await lockWindow(trx, marketId, hold.window_id);
  await trx
    .updateTable('capacity_holds')
    .set({ status: 'released' })
    .where('id', '=', holdId)
    .execute();
  await promoteFromWaitlist(trx, marketId, hold.window_id);
}

export function capacityEngine(db: Kysely<Database>, marketId: string) {
  return {
    /** Windows are vertical-pack driven: duration must fit the pack's granularity. */
    async createWindow(
      pack: VerticalPack,
      input: {
        sellerId: string;
        startsAt: Date;
        endsAt: Date;
        totalUnits: number;
        unitPriceMinor: number;
      },
    ) {
      const minutes = (input.endsAt.getTime() - input.startsAt.getTime()) / 60_000;
      const granularity = pack.capacity.time_granularity_minutes;
      if (minutes <= 0 || minutes % granularity !== 0) {
        throw new CapacityError(
          `window of ${minutes}min does not fit ${pack.vertical_id}'s ` +
            `${granularity}min granularity`,
        );
      }
      if (!Number.isInteger(input.unitPriceMinor) || input.unitPriceMinor < 0) {
        throw new CapacityError(`unitPriceMinor must be a non-negative integer minor-unit amount`);
      }
      return db
        .insertInto('capacity_windows')
        .values({
          market_id: marketId,
          seller_id: input.sellerId,
          vertical_id: pack.vertical_id,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          total_units: input.totalUnits,
          unit_price_minor: input.unitPriceMinor,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** Live availability from the single source of truth — the database. */
    async availability(windowId: string): Promise<{ total: number; available: number }> {
      const window = await db
        .selectFrom('capacity_windows')
        .where('market_id', '=', marketId)
        .where('id', '=', windowId)
        .selectAll()
        .executeTakeFirst();
      if (!window) throw new CapacityError(`window ${windowId} not found`);
      const row = await db
        .selectFrom('capacity_holds')
        .where('window_id', '=', windowId)
        .where((eb) =>
          eb.or([
            eb('status', '=', 'confirmed'),
            eb.and([eb('status', '=', 'held'), eb('expires_at', '>', sql<Date>`now()`)]),
          ]),
        )
        .select((eb) => eb.fn.coalesce(eb.fn.sum<number>('units'), sql<number>`0`).as('used'))
        .executeTakeFirstOrThrow();
      const used = Number(row.used);
      return { total: window.total_units, available: window.total_units - used };
    },

    /** Book or waitlist — atomically, under the window row lock. */
    async requestHold(input: {
      windowId: string;
      userId: string;
      units: number;
      ttlMs?: number;
    }): Promise<HoldOutcome> {
      return db.transaction().execute((trx) => requestHoldTx(trx, marketId, input));
    },

    /** held → confirmed; expired or foreign holds refuse. */
    async confirmHold(holdId: string): Promise<void> {
      await db.transaction().execute((trx) => confirmHoldTx(trx, marketId, holdId));
    },

    /** Frees the units and promotes the waitlist in the same transaction. */
    async releaseHold(holdId: string): Promise<void> {
      await db.transaction().execute((trx) => releaseHoldTx(trx, marketId, holdId));
    },

    /** The sweeper (runs in apps/worker): expire TTL'd holds, promote waiters. */
    async sweepExpiredHolds(): Promise<number> {
      return db.transaction().execute(async (trx) => {
        const expired = await trx
          .updateTable('capacity_holds')
          .set({ status: 'expired' })
          .where('market_id', '=', marketId)
          .where('status', '=', 'held')
          .where('expires_at', '<=', sql<Date>`now()`)
          .returning(['id', 'window_id'])
          .execute();
        const windows = [...new Set(expired.map((h) => h.window_id))];
        for (const windowId of windows) {
          await lockWindow(trx, marketId, windowId);
          await promoteFromWaitlist(trx, marketId, windowId);
        }
        return expired.length;
      });
    },

    async waitlistFor(windowId: string) {
      return db
        .selectFrom('capacity_waitlist')
        .where('market_id', '=', marketId)
        .where('window_id', '=', windowId)
        .orderBy('id', 'asc')
        .selectAll()
        .execute();
    },

    async holdsFor(windowId: string) {
      return db
        .selectFrom('capacity_holds')
        .where('market_id', '=', marketId)
        .where('window_id', '=', windowId)
        .selectAll()
        .execute();
    },
  };
}

export type CapacityEngine = ReturnType<typeof capacityEngine>;
