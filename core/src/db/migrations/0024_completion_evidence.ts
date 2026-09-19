import { sql, type Kysely } from 'kysely';

/**
 * COMPLETION IS AN EVIDENCE RECORD, NOT A WORD IN A COLUMN.
 *
 * P9 asks for completion VERIFICATION. What existed was an enum: the
 * order carried `completion_proof = 'qr_scan'` and nothing anywhere said
 * a QR code had ever been scanned, by whom, or when. The external review
 * of 2026-09-16 found the consequence — the seller action route, handed
 * a missing or unparseable proof, substituted the vertical pack's FIRST
 * ACCEPTED proof and wrote it as fact. An unsupported claim became a
 * recorded QR scan, and that record is what disputes are judged on.
 *
 * Two tables:
 *
 *   completion_challenges — the one-use, order-bound, expiring secret
 *   behind a QR scan. The code is stored as a SHA-256 hash: the thing on
 *   the buyer's screen exists once, in the response that issued it.
 *
 *   completion_evidence — what was actually verified, by whom, against
 *   what, at a server clock. One accepted record per order, enforced by
 *   a unique index, so "consume the evidence and transition the order"
 *   is one atomic step and not a sequence somebody can interleave.
 *
 * Sellers also gain an optional service point. A geo check-in without a
 * reference point is not verifiable, and the rule this build follows is
 * that unverifiable evidence is REFUSED, never accepted on trust — so a
 * seller with no point recorded cannot complete by geo check-in and uses
 * another proof. Nullable because Genesis does not collect it today;
 * collecting it is a product gate, not a schema one.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table completion_challenges (
      id uuid primary key default gen_random_uuid(),
      market_id text not null references markets(market_id),
      order_id uuid not null references orders(id) on delete cascade,
      proof_type text not null,
      code_hash text not null,
      issued_to_user_id uuid references users(id),
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create index completion_challenges_order on completion_challenges (market_id, order_id)
  `.execute(db);

  await sql`
    create table completion_evidence (
      id uuid primary key default gen_random_uuid(),
      market_id text not null references markets(market_id),
      order_id uuid not null references orders(id) on delete cascade,
      seller_id uuid not null references sellers(id),
      proof_type text not null,
      /** Who claimed it. Null only for a system actor, which is audited. */
      actor_user_id uuid references users(id),
      actor_role text not null,
      /** What was checked against: a challenge id, a buyer user id, a point. */
      reference text,
      /** Server clock, never a client's. */
      verified_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    )
  `.execute(db);
  // One accepted evidence record per order. The order transition and
  // this insert share a transaction, so two racing completions cannot
  // both win: the loser's insert violates this index.
  await sql`
    create unique index completion_evidence_once on completion_evidence (market_id, order_id)
  `.execute(db);

  // Region lockdown (P6.5) applies to evidence like any other market
  // data: a dark market cannot have completions written for it.
  for (const table of ['completion_challenges', 'completion_evidence']) {
    await sql`
      create trigger ${sql.raw(table)}_market_live_guard
        before insert or update on ${sql.raw(table)}
        for each row execute function sycamore_assert_market_live()
    `.execute(db);
  }

  await sql`
    alter table sellers
      add column service_point_lat double precision,
      add column service_point_lng double precision,
      add column service_radius_m integer
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table sellers
      drop column if exists service_point_lat,
      drop column if exists service_point_lng,
      drop column if exists service_radius_m
  `.execute(db);
  await sql`drop table if exists completion_evidence`.execute(db);
  await sql`drop table if exists completion_challenges`.execute(db);
}
