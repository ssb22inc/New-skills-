import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('reviews')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('order_id', 'uuid', (c) => c.notNull().references('orders.id').unique())
    .addColumn('seller_id', 'uuid', (c) => c.notNull().references('sellers.id'))
    .addColumn('buyer_user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('rating', 'integer', (c) => c.notNull())
    .addColumn('body', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('published'))
    .addColumn('made_it_right', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('resolution_opened_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table reviews
      add constraint reviews_rating check (rating between 1 and 5),
      add constraint reviews_status check (status in ('published', 'held'))
  `.execute(db);
  await db.schema
    .createIndex('reviews_market_seller_idx')
    .on('reviews')
    .columns(['market_id', 'seller_id'])
    .execute();

  // Second-Chance visible history: every prior version, append-only.
  await db.schema
    .createTable('review_revisions')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('review_id', 'uuid', (c) => c.notNull().references('reviews.id'))
    .addColumn('rating', 'integer', (c) => c.notNull())
    .addColumn('body', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    create trigger review_revisions_append_only
      before update or delete on review_revisions
      for each row execute function sycamore_append_only()
  `.execute(db);

  for (const table of ['reviews', 'review_revisions']) {
    await sql`
      create trigger ${sql.raw(table)}_market_live_guard
        before insert on ${sql.raw(table)}
        for each row execute function sycamore_assert_market_live()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('review_revisions').execute();
  await db.schema.dropTable('reviews').execute();
}
