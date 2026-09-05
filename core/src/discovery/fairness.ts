import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { newcomerShareOfFirstTimeBookings, type BookingRecord } from './ranking.js';
import { ORDERS_REQUIRED_FOR_VERIFIED } from '../identity/readiness.js';

/**
 * P21 — the fairness meter, wired to the founder cockpit.
 *
 * The metric itself has always been a pure function; this is the thing
 * that reads real bookings and hands the founder the number. The
 * exposure floor is a promise Sycamore makes to every seller who joins
 * after the incumbents — a promise nobody can keep if nobody can see
 * whether it is being kept.
 *
 * "Newcomer" is the same definition the ranker uses: a seller who has
 * not yet reached the completed-order count that earns a verified
 * surface.
 */
export async function fairnessMeter(
  db: Kysely<Database>,
  marketId: string,
): Promise<{
  newcomerShare: number;
  firstTimeBookings: number;
  newcomerSellers: number;
  sellers: number;
}> {
  const sellers = await db
    .selectFrom('sellers')
    .where('market_id', '=', marketId)
    .select(['id', 'completed_orders'])
    .execute();
  const newcomers = new Set(
    sellers.filter((s) => s.completed_orders < ORDERS_REQUIRED_FOR_VERIFIED).map((s) => s.id),
  );

  const orders = await db
    .selectFrom('orders')
    .where('market_id', '=', marketId)
    .where('status', 'in', ['confirmed', 'completed'])
    .orderBy('created_at', 'asc')
    .select(['buyer_user_id', 'seller_id'])
    .execute();

  // Array order IS booking order — the query is ordered by created_at.
  const bookings: BookingRecord[] = orders.map((o) => ({
    buyerId: o.buyer_user_id,
    sellerId: o.seller_id,
    sellerIsNewcomer: newcomers.has(o.seller_id),
  }));

  // The metric counts a buyer's FIRST booking only — repeat business
  // with an incumbent must not drown out the question being asked.
  const firstTime = new Set<string>();
  for (const b of bookings) firstTime.add(b.buyerId);

  return {
    newcomerShare: newcomerShareOfFirstTimeBookings(bookings),
    firstTimeBookings: firstTime.size,
    newcomerSellers: newcomers.size,
    sellers: sellers.length,
  };
}

/**
 * The plain-number money view for the cockpit (Constitution §3: "you
 * spent X, it brought in Y" — never a chart the founder has to
 * interpret). Straight off the append-only ledger, per market.
 */
export async function marketMoney(
  db: Kysely<Database>,
  marketId: string,
): Promise<{
  capturedMinor: number;
  refundedMinor: number;
  paidOutMinor: number;
  feesMinor: number;
}> {
  const rows = await db
    .selectFrom('ledger_entries')
    .innerJoin('ledger_transactions', 'ledger_transactions.id', 'ledger_entries.transaction_id')
    .where('ledger_entries.market_id', '=', marketId)
    .select([
      'ledger_transactions.kind as kind',
      'ledger_entries.account as account',
      'ledger_entries.direction as direction',
      'ledger_entries.amount_minor as amount_minor',
    ])
    .execute();

  const sum = (predicate: (r: (typeof rows)[number]) => boolean): number =>
    rows.filter(predicate).reduce((s, r) => s + Number(r.amount_minor), 0);

  return {
    capturedMinor: sum((r) => r.kind === 'capture' && r.direction === 'debit'),
    refundedMinor: sum((r) => r.kind === 'refund' && r.direction === 'credit'),
    paidOutMinor: sum((r) => r.kind === 'payout' && r.direction === 'debit'),
    feesMinor: sum((r) => r.account === 'platform_fees' && r.direction === 'credit'),
  };
}
