import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table sellers add column parish text`.execute(db);

  await db.schema
    .createTable('coop_campaigns')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('vertical_id', 'text', (c) => c.notNull())
    .addColumn('parish', 'text', (c) => c.notNull())
    .addColumn('external_id', 'text', (c) => c.notNull())
    .addColumn('budget_minor', 'bigint', (c) => c.notNull())
    .addColumn('reconciled', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('coop_attributions')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('campaign_id', 'uuid', (c) => c.notNull().references('coop_campaigns.id'))
    .addColumn('seller_id', 'uuid', (c) => c.notNull().references('sellers.id'))
    .addColumn('spend_minor', 'bigint', (c) => c.notNull())
    .addColumn('impressions', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table coop_attributions
      add constraint coop_attributions_once unique (campaign_id, seller_id)
  `.execute(db);

  for (const table of ['coop_campaigns', 'coop_attributions']) {
    await sql`
      create trigger ${sql.raw(table)}_market_live_guard
        before insert or update on ${sql.raw(table)}
        for each row execute function sycamore_assert_market_live()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('coop_attributions').execute();
  await db.schema.dropTable('coop_campaigns').execute();
  await sql`alter table sellers drop column parish`.execute(db);
}
