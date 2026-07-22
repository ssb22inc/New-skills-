-- 010: population tagging (owner order: >=500 peds + >=500 geriatric,
-- mixed across all categories). Deterministic regex backfill from stems;
-- the factory tags new items at generation time.
alter table public.questions    add column if not exists population text
  check (population in ('peds','geriatric','adult','maternal'));
alter table public.case_studies add column if not exists population text
  check (population in ('peds','geriatric','adult','maternal'));

create or replace function public.classify_population(txt text) returns text
language sql immutable as $$
  select case
    when txt ~* '(newborn|neonat|infant|toddler|preschool|school-age|adolescent|pediatric|\m([0-9]|1[0-7])[- ]year[- ]old|\mchild(ren)?\M|month[- ]old)' then 'peds'
    when txt ~* '(pregnan|labor(ing)?\M|postpartum|fetal|obstetric|gestation)' then 'maternal'
    when txt ~* '(\m(6[5-9]|[7-9][0-9]|1[0-1][0-9])[- ]year[- ]old|older adult|elderly|geriatric|long[- ]term care resident|nursing home)' then 'geriatric'
    else 'adult' end
$$;

update public.questions    set population = public.classify_population(stem) where population is null;
update public.case_studies set population = public.classify_population(coalesce(title,'') || ' ' || coalesce(intro,'') || ' ' || coalesce(note,'')) where population is null;

-- future inserts self-classify when the factory doesn't set a population
create or replace function public.q_population_default() returns trigger
language plpgsql as $$
begin
  if new.population is null then new.population := public.classify_population(new.stem); end if;
  return new;
end $$;
create or replace function public.c_population_default() returns trigger
language plpgsql as $$
begin
  if new.population is null then
    new.population := public.classify_population(coalesce(new.title,'') || ' ' || coalesce(new.intro,'') || ' ' || coalesce(new.note,''));
  end if;
  return new;
end $$;
drop trigger if exists trg_questions_population on public.questions;
create trigger trg_questions_population before insert on public.questions
  for each row execute function public.q_population_default();
drop trigger if exists trg_cases_population on public.case_studies;
create trigger trg_cases_population before insert on public.case_studies
  for each row execute function public.c_population_default();
