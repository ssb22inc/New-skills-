import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table users
      add column role text not null default 'buyer'
        check (role in ('buyer', 'seller', 'founder'))
  `.execute(db);
  await sql`
    alter table sellers
      add column readiness text not null default 'profile'
        check (readiness in ('profile', 'catalog', 'capacity', 'first_orders', 'verified')),
      add column standing text not null default 'active'
        check (standing in ('active', 'suspended')),
      add column completed_orders integer not null default 0
        check (completed_orders >= 0)
  `.execute(db);
  // status was a P2 placeholder; readiness+standing replace it.
  await sql`alter table sellers drop column status`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table sellers add column status text not null default 'onboarding'`.execute(db);
  await sql`
    alter table sellers
      drop column readiness, drop column standing, drop column completed_orders
  `.execute(db);
  await sql`alter table users drop column role`.execute(db);
}
