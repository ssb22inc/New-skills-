import { sql, type Kysely } from 'kysely';

/**
 * One release per order, enforced by the database rather than by a read
 * the application hopes nobody raced.
 *
 * The lock added to `release()` serialises the check; this makes the
 * invariant true even if a future caller forgets the lock, opens its own
 * transaction, or reaches the table by some path nobody has written yet.
 * Money rules (CLAUDE.md): "No order settles twice."
 *
 * Partial, because refunds legitimately repeat — an order may be refunded
 * in slices — and payouts and captures have their own references.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create unique index ledger_release_once
      on ledger_transactions (market_id, reference)
      where kind = 'release'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists ledger_release_once`.execute(db);
}
