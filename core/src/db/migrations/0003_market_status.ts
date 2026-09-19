import { sql, type Kysely } from 'kysely';

/**
 * P6.5 region lockdown. Markets default to DARK — safe by default; only a
 * flip ceremony makes one live. The write guard is a Postgres trigger so
 * "a dark market's data cannot be written by ANY code path" is enforced at
 * the database, not by convention. feature_flags is deliberately exempt:
 * flags are operational config (the flip-approval flag itself must be
 * writable for a dark market), not market data.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table markets
      add column status text not null default 'dark'
        check (status in ('live', 'dark', 'retired'))
  `.execute(db);
  // Backfill: jm is the one live market at v1.0.
  await sql`update markets set status = 'live' where market_id = 'jm'`.execute(db);

  await sql`
    create or replace function sycamore_assert_market_live() returns trigger as $$
    begin
      if (select status from markets where market_id = new.market_id)
           is distinct from 'live' then
        raise exception 'market % is not live — region lockdown blocks this write',
          new.market_id;
      end if;
      return new;
    end
    $$ language plpgsql
  `.execute(db);

  for (const table of ['users', 'sellers', 'events_outbox']) {
    await sql`
      create trigger ${sql.raw(table)}_market_live_guard
        before insert or update on ${sql.raw(table)}
        for each row execute function sycamore_assert_market_live()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ['users', 'sellers', 'events_outbox']) {
    await sql`drop trigger if exists ${sql.raw(table)}_market_live_guard on ${sql.raw(table)}`.execute(
      db,
    );
  }
  await sql`drop function if exists sycamore_assert_market_live()`.execute(db);
  await sql`alter table markets drop column status`.execute(db);
}
