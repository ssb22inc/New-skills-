-- PulseRN — scaled content: flashcards + case-study banks (005)
-- Owner amendment (licensed RN): flashcards and case studies are
-- auto-published after passing cross-vendor adversarial AI review at high
-- confidence; the reviewer console retains rejection authority. QBank
-- practice questions keep the human approval gate.

create table if not exists flashcards (
  id             bigint generated always as identity primary key,
  cat            text not null,
  topic          text not null,
  front          text not null check (char_length(front) between 8 and 220),
  back           text not null check (char_length(back) between 1 and 420),
  ai             boolean not null default true,
  approved       boolean not null default false,
  gen_model      text,
  review_model   text,
  reviewer_notes text,
  rejected_at    timestamptz,
  created_at     timestamptz not null default now()
);
alter table flashcards enable row level security;
create policy "flashcards_read_approved" on flashcards
  for select using (approved = true and rejected_at is null);
create policy "flashcards_reviewer_read" on flashcards
  for select using (exists (select 1 from reviewers r where r.user_id = auth.uid()));
create policy "flashcards_reviewer_update" on flashcards
  for update using (exists (select 1 from reviewers r where r.user_id = auth.uid()));
create index if not exists flashcards_cat_idx on flashcards (cat);
create unique index if not exists flashcards_front_uniq on flashcards (front);

create table if not exists case_studies (
  id             bigint generated always as identity primary key,
  cat            text not null,
  title          text not null,
  blurb          text not null,
  intro          text not null,
  vitals         jsonb not null,
  labs           jsonb not null,
  note           text not null,
  steps          jsonb not null,
  ai             boolean not null default true,
  approved       boolean not null default false,
  gen_model      text,
  review_model   text,
  reviewer_notes text,
  rejected_at    timestamptz,
  created_at     timestamptz not null default now()
);
alter table case_studies enable row level security;
create policy "cases_read_approved" on case_studies
  for select using (approved = true and rejected_at is null);
create policy "cases_reviewer_read" on case_studies
  for select using (exists (select 1 from reviewers r where r.user_id = auth.uid()));
create policy "cases_reviewer_update" on case_studies
  for update using (exists (select 1 from reviewers r where r.user_id = auth.uid()));
create unique index if not exists cases_title_uniq on case_studies (title);
-- writes happen only via the factories using the service role (bypasses RLS)
