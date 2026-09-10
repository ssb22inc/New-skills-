import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('agent_incidents')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('vital', 'text', (c) => c.notNull())
    .addColumn('direction', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('open'))
    .addColumn('runbook_id', 'text')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table agent_incidents
      add constraint agent_incidents_status check (status in ('open', 'healed', 'escalated'))
  `.execute(db);

  await db.schema
    .createTable('agent_actions')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('incident_id', 'uuid', (c) => c.notNull().references('agent_incidents.id'))
    .addColumn('action', 'text', (c) => c.notNull())
    .addColumn('runbook_id', 'text', (c) => c.notNull())
    .addColumn('runbook_version', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  for (const table of ['agent_incidents', 'agent_actions']) {
    await sql`
      create trigger ${sql.raw(table)}_market_live_guard
        before insert or update on ${sql.raw(table)}
        for each row execute function sycamore_assert_market_live()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('agent_actions').execute();
  await db.schema.dropTable('agent_incidents').execute();
}
