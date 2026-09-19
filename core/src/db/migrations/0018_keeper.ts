import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('surveys')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('thumbs_up', 'boolean', (c) => c.notNull())
    .addColumn('comment', 'text')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('radar_items')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('lane', 'text', (c) => c.notNull())
    .addColumn('pain_score', 'integer', (c) => c.notNull())
    .addColumn('market_score', 'integer', (c) => c.notNull())
    .addColumn('lane_clearance', 'boolean', (c) => c.notNull())
    .addColumn('revenue_estimate_minor', 'bigint')
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('source', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table radar_items
      add constraint radar_items_status check (status in ('cleared', 'parked'))
  `.execute(db);

  for (const table of ['surveys', 'radar_items']) {
    await sql`
      create trigger ${sql.raw(table)}_market_live_guard
        before insert or update on ${sql.raw(table)}
        for each row execute function sycamore_assert_market_live()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('radar_items').execute();
  await db.schema.dropTable('surveys').execute();
}
