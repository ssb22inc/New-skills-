-- 009: review-date stamps (RN pack prompt 7). Lets the About page's claim
-- be auditable and enables 12-month re-review queries. Adversarially
-- published rows are stamped with their publication time (that IS their
-- review moment); console approvals stamp now() going forward.
alter table public.questions    add column if not exists reviewed_at timestamptz;
alter table public.case_studies add column if not exists reviewed_at timestamptz;
alter table public.flashcards   add column if not exists reviewed_at timestamptz;
update public.questions    set reviewed_at = coalesce(reviewed_at, created_at) where approved;
update public.case_studies set reviewed_at = coalesce(reviewed_at, created_at) where approved;
update public.flashcards   set reviewed_at = coalesce(reviewed_at, created_at) where approved;
