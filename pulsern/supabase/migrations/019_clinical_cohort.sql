-- 019_clinical_cohort.sql — clinical-student perk.
--
-- /clinicals (and the backup code CLINICALS) puts a nursing student in the
-- clinicals cohort: 30 days of free study, then $40 once for the 30-day
-- pass. This file is additive. It does not change list prices, the 7-day
-- free pass for everyone else, or any earlier migration.
--
-- The cap is an argument (p_cap) because the database cannot see Vercel
-- env vars. api/billing.js passes PULSERN_CLINICAL_SPOTS, default 20.
-- Internal accounts are recorded and do not consume a spot.
--
-- The same rules live in src/clinical.js claimCohortSpot so they can be
-- unit-tested. This function is the one that runs in production: the
-- advisory lock makes two signups at the last spot serialize, and the
-- service role is the only role that can call it.
--
-- Re-running is safe: create-if-not-exists and create-or-replace.

create table if not exists public.cohort_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  cohort text not null check (char_length(cohort) between 1 and 40),
  source text not null default 'link' check (source in ('link', 'code')),
  claimed_at timestamptz not null default now(),
  primary key (user_id, cohort)
);

create index if not exists cohort_members_cohort
  on public.cohort_members (cohort);

alter table public.cohort_members enable row level security;

comment on table public.cohort_members is
  'Perk cohorts. Written only by claim_cohort_spot (service role). No client policies.';

create or replace function public.claim_cohort_spot(
  p_user_id uuid,
  p_cohort text,
  p_cap integer default 20,
  p_source text default 'link'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap integer;
  v_internal boolean;
  v_count integer;
  v_target timestamptz;
  v_pass public.subscriptions%rowtype;
  v_expires timestamptz;
begin
  if p_user_id is null or p_cohort is distinct from 'clinicals' then
    return jsonb_build_object('ok', false, 'status', 'unknown');
  end if;

  -- One locker for this cohort, held until the transaction ends, so two
  -- claims cannot both read "19 of 20" and both insert.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pulsern.cohort.' || p_cohort)::bigint);

  v_cap := case when p_cap is null or p_cap < 0 then 20 else p_cap end;

  if exists (
    select 1 from public.cohort_members m
    where m.user_id = p_user_id and m.cohort = p_cohort
  ) then
    select s.expires_at into v_expires
    from public.subscriptions s
    where s.user_id = p_user_id and s.plan = 'pass1'
    limit 1;
    select count(*) into v_count
    from public.cohort_members m
    where m.cohort = p_cohort
      and not exists (
        select 1 from public.internal_accounts ia where ia.user_id = m.user_id
      );
    return jsonb_build_object(
      'ok', true,
      'status', 'already',
      'expires_at', v_expires,
      'spots_left', greatest(0, v_cap - v_count),
      'member', true
    );
  end if;

  -- Paid plans and owner comps are not eligible to join. A pass1 row with
  -- no price and no OWNER_COMP mark is the free pass, and it is eligible.
  if exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id
      and (
        s.plan <> 'pass1'
        or coalesce(s.price_cents, 0) > 0
        or coalesce(s.discount_code, '') = 'OWNER_COMP'
      )
  ) then
    return jsonb_build_object('ok', false, 'status', 'ineligible', 'member', false);
  end if;

  select exists (
    select 1 from public.internal_accounts ia where ia.user_id = p_user_id
  ) into v_internal;

  select count(*) into v_count
  from public.cohort_members m
  where m.cohort = p_cohort
    and not exists (
      select 1 from public.internal_accounts ia where ia.user_id = m.user_id
    );

  if not v_internal and v_count >= v_cap then
    return jsonb_build_object(
      'ok', false,
      'status', 'full',
      'spots_left', 0,
      'member', false
    );
  end if;

  insert into public.cohort_members (user_id, cohort, source)
  values (
    p_user_id,
    p_cohort,
    case when p_source = 'code' then 'code' else 'link' end
  );

  -- 30 days from now, and never an earlier expiry than the one they have.
  -- A second call returned above, so this cannot stack another 30 days.
  v_target := pg_catalog.now() + interval '30 days';
  select * into v_pass
  from public.subscriptions s
  where s.user_id = p_user_id and s.plan = 'pass1'
  limit 1;

  if found then
    if v_pass.expires_at < v_target then
      update public.subscriptions
      set expires_at = v_target
      where id = v_pass.id;
      v_expires := v_target;
    else
      v_expires := v_pass.expires_at;
    end if;
  else
    insert into public.subscriptions (user_id, plan, expires_at, exams_granted, price_cents)
    values (p_user_id, 'pass1', v_target, 0, 0);
    v_expires := v_target;
  end if;

  if not v_internal then
    v_count := v_count + 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'claimed',
    'expires_at', v_expires,
    'spots_left', greatest(0, v_cap - v_count),
    'member', true
  );
end $$;

revoke all on function public.claim_cohort_spot(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.claim_cohort_spot(uuid, text, integer, text) to service_role, postgres;

comment on function public.claim_cohort_spot(uuid, text, integer, text) is
  'Claim one clinicals spot, extend unpaid pass1 to 30 days without shortening it, and refuse paid or comped accounts. Service role only. Cap excludes internal_accounts.';
