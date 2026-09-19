import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('signals')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('port_id', 'text')
    .addColumn('parish', 'text', (c) => c.notNull())
    .addColumn('occurs_at', 'timestamptz', (c) => c.notNull())
    .addColumn('magnitude', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table signals
      add constraint signals_kind check (kind in ('cruise_arrival', 'platform_event')),
      add constraint signals_dedupe unique (market_id, kind, port_id, occurs_at)
  `.execute(db);

  // One boost per (signal, vertical): re-running the matcher never doubles.
  await db.schema
    .createTable('pulse_boosts')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('signal_id', 'bigint', (c) => c.notNull().references('signals.id'))
    .addColumn('vertical_id', 'text', (c) => c.notNull())
    .addColumn('parish', 'text', (c) => c.notNull())
    .addColumn('lead_days', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table pulse_boosts
      add constraint pulse_boosts_once unique (signal_id, vertical_id)
  `.execute(db);

  for (const table of ['signals', 'pulse_boosts']) {
    await sql`
      create trigger ${sql.raw(table)}_market_live_guard
        before insert or update on ${sql.raw(table)}
        for each row execute function sycamore_assert_market_live()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('pulse_boosts').execute();
  await db.schema.dropTable('signals').execute();
}
