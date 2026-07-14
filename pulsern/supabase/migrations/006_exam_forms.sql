-- PulseRN — standardized readiness-exam forms (006)
-- exam_form: null = regular practice bank; 1..10 = the item/case belongs to
-- that readiness exam and is QUARANTINED from Practice so scores stay honest.

alter table questions add column if not exists exam_form int
  check (exam_form is null or exam_form between 1 and 10);
create index if not exists questions_exam_form_idx on questions (exam_form) where exam_form is not null;

alter table case_studies add column if not exists exam_form int
  check (exam_form is null or exam_form between 1 and 10);
create index if not exists cases_exam_form_idx on case_studies (exam_form) where exam_form is not null;
