import { sql, type Kysely } from 'kysely';

/**
 * A LEDGER ENTRY IS NOT A PAYMENT (C05 — external review, 2026-09-16).
 *
 * "Settlement posts an internal payout without invoking a payment
 * provider; payout.completed events are discarded as replays." So the
 * ledger said a seller had been paid, the seller's bank account said
 * otherwise, and nothing in the system could tell the difference.
 *
 * Two changes make the difference representable:
 *
 *   payout_in_flight  A ledger account for money that has LEFT the
 *                     seller's payable balance and has NOT arrived
 *                     anywhere yet. Reserving moves money here, so it
 *                     cannot be paid out twice; only confirmed external
 *                     success moves it to `external`, and a confirmed
 *                     failure moves it back. Money is never in two
 *                     places and never in none.
 *
 *   payout_intents    The record the provider conversation hangs off:
 *                     which provider, their reference, ONE stable
 *                     idempotency key that survives every retry, and a
 *                     state that distinguishes "they said no" from "we
 *                     do not know" — because those two demand opposite
 *                     actions and look identical from a timeout.
 *
 * States: pending → reserved → submitted → succeeded
 *                                  ↓           ↑
 *                               unknown ───────┘ (after reconciliation)
 *                                  ↓
 *                                failed (reservation returned)
 *
 * `unknown` is the important one. A request that timed out AFTER the
 * provider accepted it looks exactly like one that never arrived, and
 * the only safe move is to ASK the provider before doing anything else.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table ledger_entries drop constraint ledger_entries_account
  `.execute(db);
  await sql`
    alter table ledger_entries
      add constraint ledger_entries_account check
        (account in ('external', 'buyer_escrow', 'seller_payable', 'platform_fees',
                     'referral_credits', 'processor_fees', 'make_good_fund',
                     'payout_in_flight'))
  `.execute(db);

  await sql`
    create table payout_intents (
      id uuid primary key default gen_random_uuid(),
      market_id text not null references markets(market_id),
      seller_id uuid not null references sellers(id),
      currency text not null,
      amount_minor bigint not null check (amount_minor > 0),
      /** Which provider was asked. A refund or payout belongs to one. */
      provider text,
      /** Their id for it, once they give us one. */
      provider_ref text,
      /**
       * ONE key for the life of this intent. A retry reuses it, so a
       * provider that already accepted the request recognises it and
       * does not pay twice. It is derived from the intent id, never from
       * the batch, because a new batch must not become a new payment.
       */
      idempotency_key text not null unique,
      state text not null default 'pending'
        check (state in ('pending', 'reserved', 'submitted', 'succeeded', 'failed', 'unknown')),
      attempts integer not null default 0,
      last_error text,
      /** The batch that asked for it — reporting, never identity. */
      batch_key text,
      submitted_at timestamptz,
      settled_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create index payout_intents_seller on payout_intents (market_id, seller_id, currency)
  `.execute(db);
  // What reconciliation sweeps, and what an alarm counts: anything that
  // has left the building and not come back.
  await sql`
    create index payout_intents_open on payout_intents (state, submitted_at)
      where state in ('submitted', 'unknown')
  `.execute(db);
  // One OPEN payout per seller and currency. A second batch running
  // while the first is in flight is the C04 race wearing a new hat, and
  // the database refuses it rather than trusting every future caller to
  // take the lock.
  await sql`
    create unique index payout_intents_one_open
      on payout_intents (market_id, seller_id, currency)
      where state in ('pending', 'reserved', 'submitted', 'unknown')
  `.execute(db);

  await sql`
    create trigger payout_intents_market_live_guard
      before insert or update on payout_intents
      for each row execute function sycamore_assert_market_live()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists payout_intents`.execute(db);
  await sql`alter table ledger_entries drop constraint ledger_entries_account`.execute(db);
  // NOT VALID, deliberately. The ledger is append-only, so rows already
  // written against `payout_in_flight` cannot be deleted to satisfy the
  // narrower constraint — and rewriting history to make a rollback
  // tidy is exactly what an append-only ledger exists to prevent. The
  // constraint governs new rows from here; the old ones stay as they
  // were written.
  await sql`
    alter table ledger_entries
      add constraint ledger_entries_account check
        (account in ('external', 'buyer_escrow', 'seller_payable', 'platform_fees',
                     'referral_credits', 'processor_fees', 'make_good_fund'))
      not valid
  `.execute(db);
}
