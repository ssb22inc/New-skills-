-- 016_attribution_and_trial_end.sql — UTM attribution and trial end.
--
-- WHY ATTRIBUTION IS THE ONE THAT MATTERS
-- Without it there is no way to answer "which ad produced that sale", so ad
-- spend is judged against a total that mixes paid traffic with organic. A
-- funnel with no source column cannot tell you to spend more or to stop.
--
-- FIRST TOUCH, NOT LAST. One row per user, written once, never updated. A
-- student who arrives from an ad, leaves, and returns by typing the address
-- would otherwise be recorded as organic -- crediting the channel that did no
-- work and starving the one that did. First touch is also the only version
-- that is stable: last touch rewrites the history of a sale on every revisit.

create table if not exists public.user_attribution (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  referrer      text,
  landing_path  text,
  first_seen_at timestamptz not null default now()
);

alter table public.user_attribution enable row level security;

-- A signed-in student may record their own first touch exactly once. The
-- primary key enforces "once"; the policy enforces "their own". No update
-- policy exists, so immutability is structural rather than a client promise.
drop policy if exists "own first touch" on public.user_attribution;
create policy "own first touch" on public.user_attribution
  for insert to authenticated with check (auth.uid() = user_id);

comment on table public.user_attribution is
  'First-touch marketing attribution per user. Written once at first sign-in; never updated.';

-- trial_end is derived like the rest: a pass1 subscription carries its own
-- expiry, so the end of a trial is a fact the data already holds.
alter table public.funnel_events drop constraint if exists funnel_events_event_check;
alter table public.funnel_events add constraint funnel_events_event_check
  check (event in ('signup','trial_start','trial_end','first_answer','activated','purchase'));

create or replace function public.refresh_funnel_events()
returns table (event text, inserted bigint)
language plpgsql security definer set search_path = '' as $$
declare
  counts jsonb := '{}'::jsonb;
  n bigint;
begin
  insert into public.funnel_events (user_id, event, occurred_at)
  select u.id, 'signup', u.created_at from auth.users u
  where not exists (select 1 from public.internal_accounts ia where ia.user_id = u.id)
  on conflict do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('signup', n);

  insert into public.funnel_events (user_id, event, occurred_at)
  select s.user_id, 'trial_start', min(s.starts_at)
  from public.subscriptions s where s.plan = 'pass1'
    and not exists (select 1 from public.internal_accounts ia where ia.user_id = s.user_id)
  group by s.user_id
  on conflict do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('trial_start', n);


  -- Only once the expiry has passed: recording a future expiry as an ended
  -- trial would count students out of the funnel while they are still in it.
  insert into public.funnel_events (user_id, event, occurred_at)
  select s.user_id, 'trial_end', min(s.expires_at)
  from public.subscriptions s where s.plan = 'pass1' and s.expires_at <= now()
    and not exists (select 1 from public.internal_accounts ia where ia.user_id = s.user_id)
  group by s.user_id
  on conflict do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('trial_end', n);

  insert into public.funnel_events (user_id, event, occurred_at, dedup_key, props)
  select s.user_id, 'purchase', s.starts_at,
         coalesce(s.stripe_session, 'sub:' || s.id::text),
         jsonb_build_object('plan', s.plan, 'cents', s.price_cents,
                            'code', s.discount_code,
                            'internal', coalesce(dc.internal, false))
  from public.subscriptions s
  left join public.discount_codes dc on dc.code = s.discount_code
  where s.plan <> 'pass1' and coalesce(s.price_cents, 0) > 0
    and not exists (select 1 from public.internal_accounts ia where ia.user_id = s.user_id)
  on conflict do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('purchase', n);

  insert into public.funnel_events (user_id, event, occurred_at)
  select p.user_id, 'first_answer', p.updated_at
  from public.progress p
  where jsonb_typeof(p.blob->'log') = 'array'
    and jsonb_array_length(p.blob->'log') >= 1
    and not exists (select 1 from public.internal_accounts ia where ia.user_id = p.user_id)
  on conflict do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('first_answer', n);

  insert into public.funnel_events (user_id, event, occurred_at)
  select p.user_id, 'activated', p.updated_at
  from public.progress p
  where jsonb_typeof(p.blob->'log') = 'array'
    and jsonb_array_length(p.blob->'log') >= public.activation_answers()
    and not exists (select 1 from public.internal_accounts ia where ia.user_id = p.user_id)
  on conflict do nothing;
  get diagnostics n = row_count; counts := counts || jsonb_build_object('activated', n);

  return query
  select k, (counts->>k)::bigint
  from jsonb_object_keys(counts) k;
end $$;

revoke all on function public.refresh_funnel_events() from public, anon, authenticated;
grant execute on function public.refresh_funnel_events() to service_role, postgres;
