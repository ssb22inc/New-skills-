-- PulseRN — user feedback on questions (002)
-- Students report a problem with an item; reviewers see and resolve reports
-- in the review console's Reports tab.

create table if not exists question_reports (
  id          bigint generated always as identity primary key,
  item_id     bigint references questions(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  message     text not null check (char_length(message) between 3 and 1000),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);
alter table question_reports enable row level security;

-- any signed-in student may file a report as themselves
create policy "reports_insert" on question_reports
  for insert with check (auth.uid() = user_id);

-- only reviewers read and resolve
create policy "reports_reviewer_read" on question_reports
  for select using (exists (select 1 from reviewers r where r.user_id = auth.uid()));
create policy "reports_reviewer_update" on question_reports
  for update using (exists (select 1 from reviewers r where r.user_id = auth.uid()));

create index if not exists reports_open_idx on question_reports (resolved_at) where resolved_at is null;
