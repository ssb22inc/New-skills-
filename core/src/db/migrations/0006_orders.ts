import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('orders')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('seller_id', 'uuid', (c) => c.notNull().references('sellers.id'))
    .addColumn('buyer_user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('window_id', 'uuid', (c) => c.notNull().references('capacity_windows.id'))
    .addColumn('hold_id', 'uuid', (c) => c.references('capacity_holds.id'))
    .addColumn('vertical_id', 'text', (c) => c.notNull())
    .addColumn('units', 'integer', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('draft'))
    .addColumn('completion_proof', 'text')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table orders
      add constraint orders_units_positive check (units > 0),
      add constraint orders_status check
        (status in ('draft', 'held', 'confirmed', 'completed', 'cancelled', 'disputed')),
      add constraint orders_proof check
        (completion_proof is null
          or completion_proof in ('qr_scan', 'buyer_confirm', 'geo_checkin')),
      add constraint orders_completed_have_proof check
        (status <> 'completed' or completion_proof is not null)
  `.execute(db);
  await db.schema
    .createIndex('orders_market_seller_idx')
    .on('orders')
    .columns(['market_id', 'seller_id'])
    .execute();
  await sql`
    create trigger orders_market_live_guard
      before insert or update on orders
      for each row execute function sycamore_assert_market_live()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('orders').execute();
}
