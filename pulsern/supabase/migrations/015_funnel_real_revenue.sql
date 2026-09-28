-- 015_funnel_real_revenue.sql — separate real revenue from comps and tests.
--
-- The funnel reported "1 paid", which reads as one customer. It was a $0.50
-- transaction with the code LAUNCHCHECK50 -- a launch check run through Stripe
-- to prove the payment path worked. The three other non-pass1 rows are
-- OWNER_COMP at $0. Real revenue to date is $0.50, from nobody.
--
-- That distinction decides whether ad spend is justified, so it must not live
-- in someone's memory of which codes were internal. It is recorded on the code
-- itself, and carried onto each purchase event so a historical purchase keeps
-- the classification it had when it happened.

alter table public.discount_codes
  add column if not exists internal boolean not null default false;

comment on column public.discount_codes.internal is
  'True for owner comps and launch/test transactions. Purchases using an internal code are excluded from revenue and conversion reporting.';

update public.discount_codes set internal = true
where code in ('OWNER_COMP','LAUNCHCHECK50');

insert into public.discount_codes (code, partner, percent_off, amount_off_cents, active, internal)
select 'OWNER_COMP', 'internal', 100, null, false, true
where not exists (select 1 from public.discount_codes where code = 'OWNER_COMP');

insert into public.discount_codes (code, partner, percent_off, amount_off_cents, active, internal)
select 'LAUNCHCHECK50', 'internal', null, null, false, true
where not exists (select 1 from public.discount_codes where code = 'LAUNCHCHECK50');

update public.funnel_events fe
set props = fe.props || jsonb_build_object(
      'code', s.discount_code,
      'internal', coalesce(dc.internal, false))
from public.subscriptions s
left join public.discount_codes dc on dc.code = s.discount_code
where fe.event = 'purchase'
  and fe.dedup_key in (coalesce(s.stripe_session, 'sub:' || s.id::text));

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
