-- PulseRN — case-study reports (012)
--
-- Students can already report a problem with a practice question. Case studies
-- live in their own table, so question_reports.item_id — which is a foreign key
-- to questions(id) — cannot hold a case id. Add a parallel case_id and require
-- exactly one of the two to be set, so a report always points at exactly one
-- piece of content and the review console can join the right table.

alter table public.question_reports
  add column if not exists case_id bigint references public.case_studies(id) on delete cascade;

-- Every existing row has item_id set and case_id null, so all of them satisfy
-- this already and the constraint validates without a rewrite.
alter table public.question_reports
  drop constraint if exists question_reports_one_target;
alter table public.question_reports
  add constraint question_reports_one_target check (num_nonnulls(item_id, case_id) = 1);

create index if not exists reports_case_idx
  on public.question_reports (case_id) where case_id is not null;
