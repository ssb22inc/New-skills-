import { sql, type Kysely } from 'kysely';

/**
 * P17: seller attribution on ledger entries (payout batching needs
 * per-seller payable/referral balances) and referral tracking on orders
 * (overflow routing sets it in P22; settlement reads it).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table ledger_entries
      add column seller_id uuid references sellers(id)
  `.execute(db);
  await sql`
    create index ledger_entries_seller_idx on ledger_entries (market_id, seller_id)
      where seller_id is not null
  `.execute(db);
  await sql`
    alter table orders
      add column referred_by_seller_id uuid references sellers(id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table orders drop column referred_by_seller_id`.execute(db);
  await sql`alter table ledger_entries drop column seller_id`.execute(db);
}
