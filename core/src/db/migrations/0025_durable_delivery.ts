import { sql, type Kysely } from 'kysely';

/**
 * CLAIM, DO, CONFIRM — instead of mark-and-hope.
 *
 * Both of this build's deduplication points recorded "processed" BEFORE
 * the work ran. The external review of 2026-09-16 put it plainly: a job
 * is marked processed, the process dies before its order mutation, and
 * the next delivery is classified as a duplicate. Acknowledged input is
 * lost, and the duplicate-prevention tests pass the whole time, because
 * preventing duplicates is exactly what the code does — including the
 * duplicate that was the only remaining copy of the work.
 *
 * A record with a lifecycle fixes it. `in_flight` means somebody claimed
 * this and has not finished; `done` means the effect happened. A crash
 * leaves `in_flight` with a claim timestamp, and after the lease expires
 * another worker may take it over, so work is retried rather than
 * swallowed. Handlers must be idempotent for that to be safe, and they
 * are: completing a completed order is refused, recording an install
 * twice is one install.
 *
 * `inbound_inbox` gives the same lifecycle to the gateway's queue, in
 * the database rather than in Redis — a durable record next to the
 * business mutation it guards, which a marker with a seven-day TTL in a
 * cache never was.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table offline_replays
      add column status text not null default 'done'
        check (status in ('in_flight', 'done')),
      add column claimed_at timestamptz not null default now(),
      add column completed_at timestamptz
  `.execute(db);
  // Rows that existed before this migration are finished work: they were
  // only ever written after (well — before, that was the bug) a handler
  // the process then ran to completion. Marking them done keeps their
  // duplicate protection.
  await sql`update offline_replays set completed_at = created_at where completed_at is null`.execute(
    db,
  );

  await sql`
    create table inbound_inbox (
      id bigserial primary key,
      channel text not null,
      message_id text not null,
      market_id text references markets(market_id),
      status text not null default 'in_flight'
        check (status in ('in_flight', 'done')),
      attempts integer not null default 1,
      claimed_at timestamptz not null default now(),
      completed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create unique index inbound_inbox_once on inbound_inbox (channel, message_id)
  `.execute(db);
  // The sweep a stalled-queue alarm reads: claimed long ago, never done.
  await sql`
    create index inbound_inbox_stalled on inbound_inbox (status, claimed_at)
      where status = 'in_flight'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists inbound_inbox`.execute(db);
  await sql`
    alter table offline_replays
      drop column if exists status,
      drop column if exists claimed_at,
      drop column if exists completed_at
  `.execute(db);
}
