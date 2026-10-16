-- 018_paid_content_rls.sql — paid content is readable only by people who
-- hold access, and readiness exams are never readable from a browser.
--
-- Why. Until now the read policies on questions (001), flashcards and
-- case_studies (005) had no role and no entitlement test:
--   using (approved = true and rejected_at is null)
-- Anyone holding the public anon key (it ships in every browser) could read
-- the whole bank, answers and rationales included. Readiness-exam items
-- (exam_form 1..10, migration 006) were "quarantined" only by the app adding
-- .is("exam_form", null) to its own queries, so ?exam_form=eq.N returned all
-- ten exams with their answer keys. Exam credits and never-repeat were
-- checked only in the browser, and clients inserted exam_attempts directly.
--
-- What this does.
--   1. public.has_active_entitlement(): true when auth.uid() has any
--      subscriptions row with expires_at > now(). That includes the free
--      pass (plan 'pass1'), exactly like computeEntitlement() in
--      src/pricing.js ("active = not yet expired"). SECURITY DEFINER with a
--      pinned, empty search_path (the 20260910210120 convention); every
--      name inside is schema-qualified.
--   2. questions / flashcards / case_studies: the open read policies are
--      replaced by policies for the `authenticated` role only, requiring
--      approved, not rejected, practice content (exam_form IS NULL) and an
--      active entitlement. anon gets nothing.
--   3. Exam-form rows (exam_form IS NOT NULL) match no student policy at
--      all. api/exam.js serves them with the service role, without answers,
--      and grades on the server.
--      Reviewers (rows in public.reviewers: the owner's review console,
--      /review/) keep their existing questions/flashcards/cases reviewer
--      read+update policies from 001/005 unchanged. Those policies need a
--      reviewers row, which no student can create, so reviewers are the only
--      signed-in clients that still see exam items (the console reviews them).
--   4. exam_attempts: clients can no longer insert (the "insert own
--      attempts" policy is dropped). api/exam.js inserts attempts with the
--      service role after checking credits and never-repeat server-side.
--      Students keep reading their own attempts (the app's entitlement
--      read uses it). New columns hold the served item keys and the
--      server-graded result: id, items, submitted_at, correct, total, result.
--
-- Apply by hand. Like 017, this file is NOT applied automatically: paste it
-- into the Supabase SQL editor for production (HUMAN_TASKS.md H21). Ship the
-- app release that contains api/exam.js FIRST, then apply this file — see
-- H21 for why that order is the safe one. Re-running is safe: every step is
-- drop-if-exists / create-or-replace / add-column-if-not-exists.

-- ============ 1. entitlement test ============
create or replace function public.has_active_entitlement()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = auth.uid()
      and s.expires_at > now()
  );
$$;
revoke all on function public.has_active_entitlement() from public, anon;
grant execute on function public.has_active_entitlement() to authenticated, service_role;
comment on function public.has_active_entitlement() is
  'True when the calling user holds any unexpired subscription row (free pass included). Used by the practice-content read policies (018).';

-- ============ 2. practice content: authenticated + entitled only ============
drop policy if exists "questions_read_approved" on public.questions;
drop policy if exists "questions_read_practice_entitled" on public.questions;
create policy "questions_read_practice_entitled" on public.questions
  for select to authenticated
  using (
    approved = true
    and rejected_at is null
    and exam_form is null
    and public.has_active_entitlement()
  );

drop policy if exists "flashcards_read_approved" on public.flashcards;
drop policy if exists "flashcards_read_entitled" on public.flashcards;
create policy "flashcards_read_entitled" on public.flashcards
  for select to authenticated
  using (
    approved = true
    and rejected_at is null
    and public.has_active_entitlement()
  );

drop policy if exists "cases_read_approved" on public.case_studies;
drop policy if exists "cases_read_practice_entitled" on public.case_studies;
create policy "cases_read_practice_entitled" on public.case_studies
  for select to authenticated
  using (
    approved = true
    and rejected_at is null
    and exam_form is null
    and public.has_active_entitlement()
  );

-- ============ 3. exam attempts: server-created, server-graded ============
drop policy if exists "insert own attempts" on public.exam_attempts;

alter table public.exam_attempts
  add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists exam_attempts_id_key on public.exam_attempts (id);
alter table public.exam_attempts add column if not exists items jsonb;
alter table public.exam_attempts add column if not exists submitted_at timestamptz;
alter table public.exam_attempts add column if not exists correct int;
alter table public.exam_attempts add column if not exists total int;
alter table public.exam_attempts add column if not exists result jsonb;

-- "read own attempts" (007) stays: select using (auth.uid() = user_id).
-- There are still no update or delete policies, so a student can neither
-- reset an attempt nor write their own score.
