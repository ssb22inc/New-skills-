import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table orders add column completed_at timestamptz`.execute(db);
  await sql`
    alter table users
      add column trust_level text not null default 'standard'
        check (trust_level in ('standard', 'restricted'))
  `.execute(db);

  await db.schema
    .createTable('disputes')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('order_id', 'uuid', (c) => c.notNull().references('orders.id'))
    .addColumn('opened_by_user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('reason', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('open'))
    .addColumn('evidence', 'jsonb', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table disputes
      add constraint disputes_status check
        (status in ('open', 'auto_refunded', 'under_review', 'resolved'))
  `.execute(db);
  await db.schema
    .createIndex('disputes_market_order_idx')
    .on('disputes')
    .columns(['market_id', 'order_id'])
    .execute();
  await sql`
    create trigger disputes_market_live_guard
      before insert or update on disputes
      for each row execute function sycamore_assert_market_live()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('disputes').execute();
  await sql`alter table users drop column trust_level`.execute(db);
  await sql`alter table orders drop column completed_at`.execute(db);
}
