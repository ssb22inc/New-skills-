-- 014_funnel_internal_accounts.sql — keep test accounts out of the funnel.
--
-- The first funnel read reported 23 signups. Nine were internal: e2e harnesses,
-- SMTP and magic-link diagnostics, a review-gate fixture, and the owner's own
-- account. They sign up and stop, which is exactly the shape of a leaky top of
-- funnel -- so including them made the worst-looking step in the whole chain an
-- artefact of testing. Ad spend judged against that baseline would have been
-- optimising a problem that does not exist.
--
-- Real numbers after excluding them: 14 signups, not 23.
--
-- An explicit table rather than an email pattern buried in the query. The owner
-- can see exactly who is excluded and why, add a future test account with one
-- insert, and nobody has to wonder whether a real student was silently dropped
-- for having an unusual address.

create table if not exists public.internal_accounts (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  reason   text not null,
  added_at timestamptz not null default now()
);

alter table public.internal_accounts enable row level security;

comment on table public.internal_accounts is
  'Accounts excluded from funnel reporting: test harnesses, diagnostics, and the owner. Owner-only.';

insert into public.internal_accounts (user_id, reason)
select u.id,
       case
         when u.email like '%@pulsern.dev' then 'test fixture'
         when u.email like 'ssb23inc+%' then 'owner diagnostic alias'
         when u.email = 'pulsern.gate.test@gmail.com' then 'review-gate test'
         when u.email = 'ssb23inc@gmail.com' then 'owner account'
       end
from auth.users u
where u.email like '%@pulsern.dev'
   or u.email like 'ssb23inc+%'
   or u.email in ('pulsern.gate.test@gmail.com','ssb23inc@gmail.com')
on conflict (user_id) do nothing;

-- Clear milestones already recorded for them, so historical rates are corrected
-- rather than only future ones.
delete from public.funnel_events fe
using public.internal_accounts ia
where fe.user_id = ia.user_id;

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

  insert into public.funnel_events (user_id, event, occurred_at, dedup_key, props)
  select s.user_id, 'purchase', s.starts_at,
         coalesce(s.stripe_session, 'sub:' || s.id::text),
         jsonb_build_object('plan', s.plan, 'cents', s.price_cents)
  from public.subscriptions s
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
