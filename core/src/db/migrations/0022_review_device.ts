import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // P20 — device-cluster fraud detection.
  //
  // Burst (many reviews on one seller in a window) and competitor-hit
  // signals were already in place; the audit found the third leg
  // missing because there was nowhere to put it: no device or network
  // identifier existed on a review at all. A review ring using fresh
  // phone numbers from one handset was invisible.
  //
  // What is stored is a SALTED HASH, never a raw device id or IP: the
  // fraud signal needs to know "same origin as that one", which a hash
  // answers, and nothing else. Jamaica's DPA 2020 is a floor, not a
  // goal (Constitution §5) — we collect the least that works.
  await sql`
    alter table reviews
      add column device_hash text,
      add column network_hash text
  `.execute(db);
  await sql`
    create index reviews_device_hash_idx on reviews (market_id, device_hash)
      where device_hash is not null
  `.execute(db);
  await sql`
    create index reviews_network_hash_idx on reviews (market_id, network_hash)
      where network_hash is not null
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index reviews_network_hash_idx`.execute(db);
  await sql`drop index reviews_device_hash_idx`.execute(db);
  await sql`alter table reviews drop column device_hash, drop column network_hash`.execute(db);
}
