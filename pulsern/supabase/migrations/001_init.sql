-- PulseRN — initial schema (PULSERN_BUILD.md §3 + record_answer per §6)

-- ============ per-user progress: one JSON blob, synced ============
create table if not exists progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  blob       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table progress enable row level security;
create policy "progress_select" on progress for select using (auth.uid() = user_id);
create policy "progress_insert" on progress for insert with check (auth.uid() = user_id);
create policy "progress_update" on progress for update using (auth.uid() = user_id);
create policy "progress_delete" on progress for delete using (auth.uid() = user_id);

-- ============ shared question bank ============
create table if not exists questions (
  id                bigint generated always as identity primary key,
  cat               text not null,
  diff              int  not null check (diff in (1,2,3)),
  type              text not null check (type in ('mc','sata','order','matrix','bowtie','cloze')),
  stem              text not null,
  options           jsonb,            -- mc/sata/order; null for NGN types
  extra             jsonb,            -- NGN payloads: rows/columns/actions/conditions/parameters/dropdowns
  answer            jsonb not null,
  rationale         text not null,
  ai                boolean not null default false,
  approved          boolean not null default false,
  gen_model         text,
  review_model      text,
  reviewer_notes    text,             -- AI adversarial reviewer output
  human_review_note text,
  reviewed_by       uuid references auth.users(id),
  last_reviewed_at  timestamptz,
  rejected_at       timestamptz,
  times_answered    int not null default 0,
  times_correct     int not null default 0,
  elo_rating        numeric,
  created_at        timestamptz not null default now()
);
alter table questions enable row level security;
create policy "questions_read_approved" on questions
  for select using (approved = true and rejected_at is null);
create index if not exists questions_cat_idx on questions (cat);
create index if not exists questions_pending_idx on questions (approved, rejected_at);

-- ============ reviewer role (licensed RNs only) ============
create table if not exists reviewers (
  user_id    uuid primary key references auth.users(id),
  full_name  text not null,
  license_no text,                    -- audit only; never displayed client-side
  added_at   timestamptz not null default now()
);
alter table reviewers enable row level security;
create policy "reviewers_self" on reviewers for select using (auth.uid() = user_id);

create policy "questions_reviewer_read" on questions
  for select using (exists (select 1 from reviewers r where r.user_id = auth.uid()));
create policy "questions_reviewer_update" on questions
  for update using (exists (select 1 from reviewers r where r.user_id = auth.uid()));

-- ============ tutor cache: pay once per explanation, ever ============
create table if not exists tutor_cache (
  item_id     bigint not null references questions(id) on delete cascade,
  was_correct boolean not null,
  text        text not null,
  created_at  timestamptz not null default now(),
  primary key (item_id, was_correct)
);
alter table tutor_cache enable row level security;
create policy "tutor_cache_read" on tutor_cache
  for select using (auth.role() = 'authenticated');
-- writes happen only via /api routes using the service role (bypasses RLS)

-- ============ atomic telemetry update (called by api/telemetry.js) ============
-- Seeds elo_rating from diff tier on first answer (1→1100, 2→1300, 3→1500),
-- then clamps every move into [800, 1900]. Single statement = atomic.
create or replace function record_answer(item_id bigint, was_correct boolean, delta numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update questions
  set times_answered = times_answered + 1,
      times_correct  = times_correct + (case when was_correct then 1 else 0 end),
      elo_rating     = least(1900, greatest(800,
                         coalesce(elo_rating,
                           case diff when 1 then 1100 when 2 then 1300 else 1500 end)
                         + delta))
  where id = item_id;
$$;
-- Only server contexts may call it: revoke from anon/authenticated.
revoke execute on function record_answer(bigint, boolean, numeric) from public, anon, authenticated;
