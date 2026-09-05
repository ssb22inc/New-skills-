import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('capacity_windows')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('seller_id', 'uuid', (c) => c.notNull().references('sellers.id'))
    .addColumn('vertical_id', 'text', (c) => c.notNull())
    .addColumn('starts_at', 'timestamptz', (c) => c.notNull())
    .addColumn('ends_at', 'timestamptz', (c) => c.notNull())
    .addColumn('total_units', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table capacity_windows
      add constraint capacity_windows_units_positive check (total_units > 0),
      add constraint capacity_windows_time_order check (ends_at > starts_at)
  `.execute(db);
  await db.schema
    .createIndex('capacity_windows_market_seller_idx')
    .on('capacity_windows')
    .columns(['market_id', 'seller_id'])
    .execute();

  await db.schema
    .createTable('capacity_holds')
    .addColumn('id', 'uuid', (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('window_id', 'uuid', (c) => c.notNull().references('capacity_windows.id'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('units', 'integer', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull().defaultTo('held'))
    .addColumn('expires_at', 'timestamptz', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table capacity_holds
      add constraint capacity_holds_units_positive check (units > 0),
      add constraint capacity_holds_status check
        (status in ('held', 'confirmed', 'released', 'expired'))
  `.execute(db);
  await db.schema
    .createIndex('capacity_holds_window_status_idx')
    .on('capacity_holds')
    .columns(['window_id', 'status'])
    .execute();
  // The sweeper scans only live holds.
  await sql`
    create index capacity_holds_expiry_idx on capacity_holds (expires_at)
      where status = 'held'
  `.execute(db);

  await db.schema
    .createTable('capacity_waitlist')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('market_id', 'text', (c) => c.notNull().references('markets.market_id'))
    .addColumn('window_id', 'uuid', (c) => c.notNull().references('capacity_windows.id'))
    .addColumn('user_id', 'uuid', (c) => c.notNull().references('users.id'))
    .addColumn('units', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`
    alter table capacity_waitlist
      add constraint capacity_waitlist_units_positive check (units > 0),
      add constraint capacity_waitlist_once_per_user unique (window_id, user_id)
  `.execute(db);

  // Region lockdown applies to capacity data like everything else.
  for (const table of ['capacity_windows', 'capacity_holds', 'capacity_waitlist']) {
    await sql`
      create trigger ${sql.raw(table)}_market_live_guard
        before insert or update on ${sql.raw(table)}
        for each row execute function sycamore_assert_market_live()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('capacity_waitlist').execute();
  await db.schema.dropTable('capacity_holds').execute();
  await db.schema.dropTable('capacity_windows').execute();
}
