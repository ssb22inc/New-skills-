import { sql, type Kysely } from 'kysely';

/**
 * WHO IS ASKING (C01 — external review, 2026-09-16).
 *
 * The finding: "Seller HTML, seller-day JSON, seller actions, and the
 * founder cockpit do not authenticate a caller or check the caller's
 * ownership/role." Knowing a seller's UUID was enough to read their
 * buyers' names and phone numbers and to mutate their orders — and those
 * UUIDs appear in public trust-page URLs, so they were never secret.
 *
 * There is no prompt for sign-in anywhere in P0–P36; this build reached
 * P36 with link-reachable pages and no notion of a caller. The shape is
 * the founder's decision (17 September 2026) and the only one
 * Constitution §1 allows: the door is the chat.
 *
 *   sign_in_links  A seller asks in chat and gets a link. Single-use,
 *                  short-lived, stored as a SHA-256 — the token exists
 *                  in the message and nowhere else. Redeeming it is an
 *                  atomic consume, so a forwarded link is spent the
 *                  moment the first person taps it.
 *
 *   sessions       What the link becomes: a revocable, expiring record
 *                  the cookie points at. Revocation is a row, not a
 *                  guess about an unexpired JWT, because a seller who
 *                  loses their phone needs "not any more" to mean it.
 *
 * Both hold a HASH. A database dump, a log line or a backup cannot be
 * replayed into somebody's account.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table sign_in_links (
      id uuid primary key default gen_random_uuid(),
      market_id text not null references markets(market_id),
      user_id uuid not null references users(id) on delete cascade,
      token_hash text not null unique,
      /** seller | founder — what this link is allowed to become. */
      purpose text not null check (purpose in ('seller', 'founder')),
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`create index sign_in_links_user on sign_in_links (market_id, user_id)`.execute(db);

  await sql`
    create table sessions (
      id uuid primary key default gen_random_uuid(),
      market_id text not null references markets(market_id),
      user_id uuid not null references users(id) on delete cascade,
      token_hash text not null unique,
      role text not null check (role in ('seller', 'founder')),
      expires_at timestamptz not null,
      revoked_at timestamptz,
      last_seen_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`create index sessions_user on sessions (market_id, user_id)`.execute(db);

  // Region lockdown (P6.5): a dark market cannot mint sessions either.
  for (const table of ['sign_in_links', 'sessions']) {
    await sql`
      create trigger ${sql.raw(table)}_market_live_guard
        before insert or update on ${sql.raw(table)}
        for each row execute function sycamore_assert_market_live()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists sessions`.execute(db);
  await sql`drop table if exists sign_in_links`.execute(db);
}
