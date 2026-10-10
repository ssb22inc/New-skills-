-- 017_free_pass_seven_days.sql — the free pass is 7 days, including people
-- who already have one.
--
-- New accounts insert pass1 themselves. Migration 007's insert policy
-- refused any expiry more than 25 hours out, so a 7-day grant cannot land
-- until this policy replaces it. Apply this file with the deploy. If the
-- app ships first, new free-pass inserts fail the old 25-hour check.
--
-- Existing rows, and only unpaid ones. A user with any non-pass1
-- subscription (a paid plan or an owner comp) is not updated. Readiness
-- exams stay at zero: exams_granted and price_cents are not touched.
--
--   * Still active: expires_at becomes starts_at + 7 days, and only if that
--     is later than the expiry they have. The pass runs 7 days from when
--     it started.
--   * Already expired, and the old window was at most 26 hours (the 25-hour
--     policy ceiling plus slack): expires_at becomes now() + 7 days. A
--     fresh week from the moment this migration runs. starts_at is left
--     alone so the funnel's trial_start stays the original date.
--   * A trial_end already recorded for a pass this reopens is removed.
--     refresh_funnel_events writes trial_end again only after the new
--     expiry, so trialsEnded does not count a pass that is active again.
--
-- Re-running is a no-op. An extended row is no longer shorter than 7 days
-- from its start. A refreshed row is no longer a 26-hour window, including
-- after that new window ends. The same rules are in src/free-pass.js.

drop policy if exists "self-grant free pass" on public.subscriptions;
create policy "self-grant free pass" on public.subscriptions
  for insert with check (
    auth.uid() = user_id
    and plan = 'pass1'
    and exams_granted = 0
    and price_cents = 0
    and expires_at <= now() + interval '7 days 1 hour'
  );

do $$
declare
  n bigint;
begin
  update public.subscriptions s
  set expires_at = s.starts_at + interval '7 days'
  where s.plan = 'pass1'
    and coalesce(s.price_cents, 0) = 0
    and coalesce(s.exams_granted, 0) = 0
    and s.expires_at > now()
    and s.expires_at < s.starts_at + interval '7 days'
    and not exists (
      select 1 from public.subscriptions other
      where other.user_id = s.user_id and other.plan <> 'pass1'
    );
  get diagnostics n = row_count;
  raise notice 'unpaid free passes extended to 7 days from start: %', n;

  delete from public.funnel_events fe
  using public.subscriptions s
  where fe.user_id = s.user_id
    and fe.event = 'trial_end'
    and fe.dedup_key = ''
    and s.plan = 'pass1'
    and coalesce(s.price_cents, 0) = 0
    and coalesce(s.exams_granted, 0) = 0
    and s.expires_at <= now()
    and s.expires_at <= s.starts_at + interval '26 hours'
    and not exists (
      select 1 from public.subscriptions other
      where other.user_id = s.user_id and other.plan <> 'pass1'
    );
  get diagnostics n = row_count;
  raise notice 'stale trial_end rows cleared for reopened free passes: %', n;

  update public.subscriptions s
  set expires_at = now() + interval '7 days'
  where s.plan = 'pass1'
    and coalesce(s.price_cents, 0) = 0
    and coalesce(s.exams_granted, 0) = 0
    and s.expires_at <= now()
    and s.expires_at <= s.starts_at + interval '26 hours'
    and not exists (
      select 1 from public.subscriptions other
      where other.user_id = s.user_id and other.plan <> 'pass1'
    );
  get diagnostics n = row_count;
  raise notice 'expired unpaid free passes refreshed to 7 days from now: %', n;
end $$;
