import { sql, type Kysely } from 'kysely';

/**
 * Money rules: integer minor units, currency comes from the market's
 * context pack. No default — a window without an explicit price is a bug,
 * not a free tour.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table capacity_windows
      add column unit_price_minor bigint not null
        check (unit_price_minor >= 0)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table capacity_windows drop column unit_price_minor`.execute(db);
}
