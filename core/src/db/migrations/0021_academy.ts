import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Sign-up now captures email alongside name + phone. Marketing consent
  // is EXPLICIT and defaults OFF (Jamaica DPA 2020 / Constitution §5:
  // trust is never traded — no consent, no marketing, no exceptions).
  await sql`
    alter table users
      add column email text,
      add column marketing_opt_in boolean not null default false
  `.execute(db);

  await db.schema
    .createTable('study_enrollments')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id').unique())
    .addColumn('course', 'text', (c) => c.notNull())
    .addColumn('reminder_hour_local', 'integer', (c) => c.notNull().defaultTo(18))
    .addColumn('last_studied_on', 'date')
    .addColumn('last_reminded_on', 'date')
    .addColumn('active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  // One marketing message per campaign per person, enforced by the DB —
  // a re-run campaign can never double-send.
  await db.schema
    .createTable('marketing_sends')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('campaign_id', 'text', (c) => c.notNull())
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table marketing_sends
      add constraint marketing_sends_once unique (market_id, campaign_id, user_id)
  `.execute(db);

  for (const table of ['study_enrollments', 'marketing_sends']) {
    await sql`
      create trigger ${sql.raw(table)}_market_live_guard
        before insert or update on ${sql.raw(table)}
        for each row execute function sycamore_assert_market_live()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('marketing_sends').execute();
  await db.schema.dropTable('study_enrollments').execute();
  await sql`
    alter table users
      drop column email,
      drop column marketing_opt_in
  `.execute(db);
}
