import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Low-bandwidth mode is a per-user switch the Watchman flips.
  await sql`alter table users add column lite_mode boolean not null default false`.execute(db);

  // Blackout Mode rides the hurricane_states row but is its own switch:
  // commerce continues during a blackout — only money release and
  // non-essential messaging pause.
  await sql`
    alter table hurricane_states
      add column blackout boolean not null default false,
      add column blackout_started_at timestamptz,
      add column blackout_ended_at timestamptz
  `.execute(db);

  // Offline replay dedupe: one row per applied idempotency key, so a PWA
  // queue that syncs twice produces exactly one effect.
  await db.schema
    .createTable('offline_replays')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('idempotency_key', 'text', (c) => c.notNull())
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table offline_replays
      add constraint offline_replays_once unique (market_id, idempotency_key)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('offline_replays').execute();
  await sql`
    alter table hurricane_states
      drop column blackout,
      drop column blackout_started_at,
      drop column blackout_ended_at
  `.execute(db);
  await sql`alter table users drop column lite_mode`.execute(db);
}
