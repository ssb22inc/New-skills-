import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('catalog_items')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('seller_id', 'uuid', (c) => c.notNull().references('sellers.id'))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('photo_ref', 'text', (c) => c.notNull())
    .addColumn('price_minor', 'bigint', (c) => c.notNull())
    .addColumn('active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table catalog_items
      add constraint catalog_items_price_positive check (price_minor >= 0)
  `.execute(db);
  await db.schema
    .createIndex('catalog_items_market_seller_idx')
    .on('catalog_items')
    .columns(['market_id', 'seller_id'])
    .execute();
  await sql`
    create trigger catalog_items_market_live_guard
      before insert or update on catalog_items
      for each row execute function sycamore_assert_market_live()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('catalog_items').execute();
}
