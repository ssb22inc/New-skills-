import { sql, type Kysely } from 'kysely';

/**
 * P12 correction-feedback store: founder-approved corrections accumulate
 * into a patois glossary applied to transcripts BEFORE intent detection.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('asr_glossary')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('heard', 'text', (c) => c.notNull())
    .addColumn('meant', 'text', (c) => c.notNull())
    .addColumn('approved', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table asr_glossary
      add constraint asr_glossary_unique unique (market_id, heard)
  `.execute(db);
  await sql`
    create trigger asr_glossary_market_live_guard
      before insert or update on asr_glossary
      for each row execute function sycamore_assert_market_live()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('asr_glossary').execute();
}
