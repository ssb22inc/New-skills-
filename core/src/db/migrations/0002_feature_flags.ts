import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('feature_flags')
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('key', 'text', (c) => c.notNull())
    .addColumn('enabled', 'boolean', (c) => c.notNull().defaultTo(false))
    // Rollout in basis points: 500 = 5% canary, 10000 = fully promoted.
    .addColumn('rollout_bps', 'integer', (c) => c.notNull().defaultTo(10000))
    .addColumn('description', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('feature_flags_pk', ['market_id', 'key'])
    .execute();
  await sql`
    alter table feature_flags
      add constraint feature_flags_rollout_bps_range check (rollout_bps between 0 and 10000)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('feature_flags').execute();
}
