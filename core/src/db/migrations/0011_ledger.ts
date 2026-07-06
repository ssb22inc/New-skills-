import { sql, type Kysely } from 'kysely';

/**
 * P15 — the Vault's spine. Two laws enforced AT THE DATABASE:
 * 1. Append-only: UPDATE and DELETE on ledger tables raise, always.
 * 2. Idempotency: one transaction per (market_id, idempotency_key) —
 *    a double-fired webhook physically cannot post twice.
 * Balance (Σdebits = Σcredits) is enforced by the service inside the
 * same transaction that writes the rows.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('ledger_transactions')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('reference', 'text', (c) => c.notNull())
    .addColumn('idempotency_key', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table ledger_transactions
      add constraint ledger_transactions_kind check
        (kind in ('capture', 'refund', 'release', 'payout', 'adjustment')),
      add constraint ledger_transactions_idem unique (market_id, idempotency_key)
  `.execute(db);
  await db.schema
    .createIndex('ledger_transactions_ref_idx')
    .on('ledger_transactions')
    .columns(['market_id', 'reference'])
    .execute();

  await db.schema
    .createTable('ledger_entries')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('transaction_id', 'bigint', (c) => c.notNull().references('ledger_transactions.id'))
    .addColumn('account', 'text', (c) => c.notNull())
    .addColumn('direction', 'text', (c) => c.notNull())
    .addColumn('amount_minor', 'bigint', (c) => c.notNull())
    .addColumn('currency', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table ledger_entries
      add constraint ledger_entries_account check
        (account in ('external', 'buyer_escrow', 'seller_payable', 'platform_fees',
                     'referral_credits', 'processor_fees', 'make_good_fund')),
      add constraint ledger_entries_direction check (direction in ('debit', 'credit')),
      add constraint ledger_entries_amount_positive check (amount_minor > 0)
  `.execute(db);
  await db.schema
    .createIndex('ledger_entries_txn_idx')
    .on('ledger_entries')
    .column('transaction_id')
    .execute();
  await db.schema
    .createIndex('ledger_entries_account_idx')
    .on('ledger_entries')
    .columns(['market_id', 'account'])
    .execute();

  await sql`
    create or replace function sycamore_append_only() returns trigger as $$
    begin
      raise exception 'ledger is append-only: % on % is forbidden', tg_op, tg_table_name;
    end
    $$ language plpgsql
  `.execute(db);
  for (const table of ['ledger_transactions', 'ledger_entries']) {
    await sql`
      create trigger ${sql.raw(table)}_append_only
        before update or delete on ${sql.raw(table)}
        for each row execute function sycamore_append_only()
    `.execute(db);
    await sql`
      create trigger ${sql.raw(table)}_market_live_guard
        before insert on ${sql.raw(table)}
        for each row execute function sycamore_assert_market_live()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('ledger_entries').execute();
  await db.schema.dropTable('ledger_transactions').execute();
  await sql`drop function if exists sycamore_append_only()`.execute(db);
}
