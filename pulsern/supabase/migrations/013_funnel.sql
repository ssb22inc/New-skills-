-- 013_funnel.sql — the acquisition funnel, as durable milestones.
--
-- WHY DERIVED RATHER THAN INSTRUMENTED
-- Every step of the funnel is already recorded by the product:
--   signup       auth.users.created_at
--   trial_start  a subscriptions row with plan = 'pass1'
--   first_answer progress.blob->'log' has at least one entry
--   activated    progress.blob->'log' has at least ACTIVATION_ANSWERS entries
--   purchase     a subscriptions row with plan <> 'pass1' and price_cents > 0
--
-- Adding a parallel event stream from the client would create a second source
-- of truth that drifts from the first, can be lost by an ad blocker or a failed
-- request, and would only start counting from deploy day. Deriving instead
-- means the funnel is correct for every student who has ALREADY signed up, so
-- ad spend can be judged against real history rather than waiting weeks to
-- accumulate it.
--
-- WHY STORED RATHER THAN A VIEW
-- progress.blob is mutable: App.jsx resets the answer log when a student starts
-- over, which would silently un-activate them and make last month's conversion
-- rate change retroactively. A milestone that has been reached is a historical
-- fact and must not move. Each milestone is therefore written once and kept.
--
-- The unique index makes every write idempotent, so the refresh can run as
-- often as you like and the Stripe webhook can retry without double-counting.

create table if not exists public.funnel_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  event       text not null check (event in
                ('signup','trial_start','first_answer','activated','purchase')),
  occurred_at timestamptz not null default now(),
  -- '' for once-per-account milestones; the Stripe session id for purchases,
  -- so a renewal counts again but a webhook retry does not.
  dedup_key   text not null default '',
  props       jsonb not null default '{}'::jsonb
);

create unique index if not exists funnel_events_once
  on public.funnel_events (user_id, event, dedup_key);

create index if not exists funnel_events_event_time
  on public.funnel_events (event, occurred_at);

-- No client may read or write this table: it is commercial data about every
-- student, and nothing in the app needs it. The service role bypasses RLS, so
-- the owner-gated API and the refresh job still work.
alter table public.funnel_events enable row level security;

comment on table public.funnel_events is
  'Acquisition funnel milestones, derived from product data and written once each. Owner-only; no client access.';

-- 20 answered questions is the activation threshold: far enough in that the
-- student has genuinely used the product, close enough that it happens in a
-- first sitting. Changing it changes what "activated" means historically, so
-- it lives in one place rather than being retyped into each query.
create or replace function public.activation_answers()
returns integer language sql immutable set search_path = '' as $$ select 20 $$;

/* Write any milestone the data supports and we have not already recorded.
   Idempotent by construction: every insert is ON CONFLICT DO NOTHING against
   the unique index, so re-running only ever fills gaps.

   security definer because it reads auth.users, which is not readable by the
   caller's role; search_path is pinned so the definer rights cannot be aimed
   at an attacker-supplied schema. */
create or replace function public.refresh_funnel_events()
returns table (event text, inserted bigint)
language plpgsql security definer set search_path = '' as $$
declare
  counts jsonb := '{}'::jsonb;
  n bigint;
begin
  -- signup: every account, at the moment it was created.
  insert into public.funnel_events (user_id, event, occurred_at)
  select u.id, 'signup', u.created_at from auth.users u
  on conflict do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('signup', n);

  -- trial_start: the free pass. starts_at is when access actually began.
  insert into public.funnel_events (user_id, event, occurred_at)
  select s.user_id, 'trial_start', min(s.starts_at)
  from public.subscriptions s where s.plan = 'pass1'
  group by s.user_id
  on conflict do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('trial_start', n);

  -- purchase: one per paid subscription row, keyed on the Stripe session so a
  -- renewal counts again and a webhook retry does not.
  insert into public.funnel_events (user_id, event, occurred_at, dedup_key, props)
  select s.user_id, 'purchase', s.starts_at,
         coalesce(s.stripe_session, 'sub:' || s.id::text),
         jsonb_build_object('plan', s.plan, 'cents', s.price_cents)
  from public.subscriptions s
  where s.plan <> 'pass1' and coalesce(s.price_cents, 0) > 0
  on conflict do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('purchase', n);

  /* first_answer and activated come from the answer log. The log entries carry
     no timestamps, so the honest best estimate of when the milestone was
     reached is when that student's progress was last written. This is an upper
     bound, not the exact moment — it is recorded once and then frozen, so it
     never drifts afterwards. */
  insert into public.funnel_events (user_id, event, occurred_at)
  select p.user_id, 'first_answer', p.updated_at
  from public.progress p
  where jsonb_typeof(p.blob->'log') = 'array'
    and jsonb_array_length(p.blob->'log') >= 1
  on conflict do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('first_answer', n);

  insert into public.funnel_events (user_id, event, occurred_at)
  select p.user_id, 'activated', p.updated_at
  from public.progress p
  where jsonb_typeof(p.blob->'log') = 'array'
    and jsonb_array_length(p.blob->'log') >= public.activation_answers()
  on conflict do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('activated', n);

  return query
  select k, (counts->>k)::bigint
  from jsonb_object_keys(counts) k;
end $$;

revoke all on function public.refresh_funnel_events() from public, anon, authenticated;

comment on function public.refresh_funnel_events() is
  'Records any funnel milestone the product data supports and that is not already stored. Idempotent; safe to run repeatedly.';
