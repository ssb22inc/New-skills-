import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('conversation_sessions')
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('autopilot', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('state', 'jsonb', (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('conversation_sessions_pk', ['market_id', 'user_id'])
    .execute();
  await sql`
    create trigger conversation_sessions_market_live_guard
      before insert or update on conversation_sessions
      for each row execute function sycamore_assert_market_live()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('conversation_sessions').execute();
}
