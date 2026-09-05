import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('hurricane_states')
    .addColumn('market_id', 'text', (c) => c.primaryKey().references('markets.market_id'))
    .addColumn('active', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('reason', 'text', (c) => c.notNull())
    .addColumn('activated_at', 'timestamptz')
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('hurricane_impacts')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('order_id', 'uuid', (c) => c.notNull().references('orders.id').unique())
    .addColumn('disposition', 'text', (c) => c.notNull().defaultTo('pending'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table hurricane_impacts
      add constraint hurricane_impacts_disposition
      check (disposition in ('pending', 'rebooked', 'refunded'))
  `.execute(db);

  // The freeze is DB-enforced, like region lockdown: while a hurricane is
  // active, NO new order can be created in that market. Rebooking and
  // refunding existing orders stays possible — waves must run.
  await sql`
    create or replace function sycamore_assert_no_hurricane() returns trigger as $$
    begin
      if exists (
        select 1 from hurricane_states
        where market_id = new.market_id and active
      ) then
        raise exception 'market "%" is in Hurricane Mode — new bookings frozen', new.market_id;
      end if;
      return new;
    end;
    $$ language plpgsql
  `.execute(db);
  await sql`
    create trigger orders_hurricane_freeze
      before insert on orders
      for each row execute function sycamore_assert_no_hurricane()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop trigger if exists orders_hurricane_freeze on orders`.execute(db);
  await sql`drop function if exists sycamore_assert_no_hurricane`.execute(db);
  await db.schema.dropTable('hurricane_impacts').execute();
  await db.schema.dropTable('hurricane_states').execute();
}
