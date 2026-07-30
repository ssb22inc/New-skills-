-- 011: remove duplicate question stems and guard against future dups.
-- Keeps the OLDEST copy of each approved stem (min id) and deletes the
-- rest — this fixes practice dups, within-exam dups, the same stem reused
-- across multiple exam forms, and the practice<->exam leak, in one pass.
-- tutor_cache and question_reports cascade on delete, so dependents go too.
-- Case studies are already unique by title (migration 005) — none removed.

with ranked as (
  select id, row_number() over (partition by stem order by id) as rn
  from public.questions
  where approved
)
delete from public.questions
where id in (select id from ranked where rn > 1);

-- Guard: no two published questions may share an identical stem again.
-- The content/exam factories insert row-by-row and treat an insert error as
-- "skip this item", so a unique violation simply drops the duplicate.
create unique index if not exists uniq_question_stem
  on public.questions (md5(stem)) where approved;
