-- One-time, idempotent relabel of saved answer rows.
-- A numeric id is renamed only when the full catalog (built-in questions,
-- every bank row including withdrawn items, and case steps) contains exactly
-- one source whose category matches the saved category. Anything else stays
-- in the log as an explicit unresolved record. Absence from the approved
-- bank list is not treated as proof of another source.
-- Backup of the pre-change rows: schema backup_20261124.

create schema if not exists backup_20261124;
revoke all on schema backup_20261124 from public, anon, authenticated;

create table if not exists backup_20261124.builtin_questions (
  id text primary key,
  cat text not null
);
create table if not exists backup_20261124.bundled_cases (
  legacy_id text primary key,
  cat text not null,
  case_id text not null
);

insert into backup_20261124.builtin_questions (id, cat) values
('1', 'Pharmacology'),
('2', 'Pharmacology'),
('3', 'Pharmacology'),
('4', 'Pharmacology'),
('5', 'Pharmacology'),
('6', 'Management of Care'),
('7', 'Management of Care'),
('8', 'Safety & Infection Control'),
('9', 'Safety & Infection Control'),
('10', 'Safety & Infection Control'),
('11', 'Reduction of Risk'),
('12', 'Physiological Adaptation'),
('13', 'Physiological Adaptation'),
('14', 'Physiological Adaptation'),
('15', 'Physiological Adaptation'),
('16', 'Reduction of Risk'),
('17', 'Reduction of Risk'),
('18', 'Safety & Infection Control'),
('19', 'Psychosocial Integrity'),
('20', 'Health Promotion & Maintenance'),
('21', 'Physiological Adaptation'),
('901', 'Safety & Infection Control'),
('902', 'Physiological Adaptation'),
('903', 'Pharmacology'),
('904', 'Pharmacology'),
('905', 'Pharmacology'),
('906', 'Pharmacology'),
('907', 'Pharmacology'),
('908', 'Basic Care & Comfort'),
('909', 'Basic Care & Comfort'),
('910', 'Basic Care & Comfort'),
('911', 'Health Promotion & Maintenance'),
('912', 'Health Promotion & Maintenance'),
('913', 'Physiological Adaptation'),
('914', 'Pharmacology'),
('915', 'Reduction of Risk')
on conflict (id) do update set cat = excluded.cat;

insert into backup_20261124.bundled_cases (legacy_id, cat, case_id) values
('100', 'Physiological Adaptation', 'case-sepsis-0'),
('101', 'Physiological Adaptation', 'case-sepsis-1'),
('102', 'Physiological Adaptation', 'case-sepsis-2'),
('110', 'Physiological Adaptation', 'case-dka-0'),
('111', 'Physiological Adaptation', 'case-dka-1'),
('112', 'Physiological Adaptation', 'case-dka-2'),
('113', 'Physiological Adaptation', 'case-dka-3'),
('114', 'Physiological Adaptation', 'case-dka-4'),
('115', 'Physiological Adaptation', 'case-dka-5'),
('120', 'Pharmacology', 'case-preeclampsia-magnesium-0'),
('121', 'Pharmacology', 'case-preeclampsia-magnesium-1'),
('122', 'Pharmacology', 'case-preeclampsia-magnesium-2'),
('123', 'Pharmacology', 'case-preeclampsia-magnesium-3'),
('124', 'Pharmacology', 'case-preeclampsia-magnesium-4'),
('125', 'Pharmacology', 'case-preeclampsia-magnesium-5')
on conflict (legacy_id) do update set cat = excluded.cat, case_id = excluded.case_id;

create or replace function backup_20261124.relabel_answer(elem jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_id text;
  v_cat text;
  n_source int;
  n_key int;
  chosen_source text;
  chosen_key text;
begin
  if jsonb_typeof(elem) is distinct from 'object' then
    return jsonb_build_object('status','untouched','elem', coalesce(elem, 'null'::jsonb));
  end if;
  if coalesce(elem->>'unresolved','false') = 'true' then
    return jsonb_build_object('status','untouched','elem', elem);
  end if;
  if coalesce(elem->>'key','') ~ '^(builtin|bank|case):' then
    return jsonb_build_object('status','untouched','elem', elem);
  end if;
  v_id := nullif(btrim(elem->>'id'), '');
  v_cat := nullif(btrim(elem->>'cat'), '');
  if v_id is null or v_cat is null then
    return jsonb_build_object('status','unresolved','elem', elem || jsonb_build_object('unresolved', true, 'legacyId', elem->'id', 'unclassified', true));
  end if;
  with hits as (
    select 'builtin'::text as source, 'builtin:' || b.id as key
    from backup_20261124.builtin_questions b
    where b.id = v_id and b.cat = v_cat
    union
    select 'bank', 'bank:' || q.id::text
    from public.questions q
    where q.id::text = v_id and q.cat = v_cat
    union
    select 'case', 'case:' || c.case_id
    from backup_20261124.bundled_cases c
    where c.legacy_id = v_id and c.cat = v_cat
    union
    select 'case', 'case:case-db' || cs.id::text || '-' || step.i::text
    from public.case_studies cs
    cross join lateral generate_series(0, coalesce(jsonb_array_length(cs.steps), 0) - 1) as step(i)
    where (50000 + cs.id * 10 + step.i)::text = v_id
      and cs.cat = v_cat
  )
  select count(distinct hits.source), count(distinct hits.key), min(hits.source), min(hits.key)
    into n_source, n_key, chosen_source, chosen_key
  from hits;
  if n_source = 1 and n_key = 1 then
    return jsonb_build_object('status','relabeled','elem', elem || jsonb_build_object('source', chosen_source, 'key', chosen_key, 'unclassified', false));
  end if;
  return jsonb_build_object('status','unresolved','elem', elem || jsonb_build_object('unresolved', true, 'legacyId', elem->'id', 'unclassified', true));
end;
$$;

-- Latest built-in or bank answer that can own a QBank review date for
-- this numeric id. Case steps and schedule:false rows are skipped. A
-- later row with no single home returns null so the number stays put.
create or replace function backup_20261124.schedule_owner(log jsonb, raw_id text)
returns text
language plpgsql
stable
as $$
declare
  item jsonb;
begin
  if jsonb_typeof(log) is distinct from 'array' or raw_id is null then
    return null;
  end if;
  for item in
    select elem
    from jsonb_array_elements(log) with ordinality as logged(elem, ordinality)
    where elem->>'id' = raw_id
    order by ordinality desc
  loop
    if coalesce(item->>'unresolved','false') = 'true'
       or coalesce(item->>'unclassified','false') = 'true'
       or coalesce(item->>'key','') !~ '^(builtin|bank|case):' then
      return null;
    end if;
    if coalesce(item->>'schedule','true') = 'false' or coalesce(item->>'source','') = 'case' then
      continue;
    end if;
    if coalesce(item->>'source','') in ('builtin','bank')
       and coalesce(item->>'key','') ~ '^(builtin|bank):' then
      return item->>'key';
    end if;
  end loop;
  return null;
end;
$$;

create or replace function backup_20261124.relabel_blob(blob jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  new_log jsonb := '[]'::jsonb;
  item jsonb;
  classified jsonb;
  new_schedule jsonb := '{}'::jsonb;
  pending jsonb := '{}'::jsonb;
  sched_key text;
  sched_val jsonb;
  raw_id text;
  owner text;
begin
  if jsonb_typeof(blob) is distinct from 'object' then
    return blob;
  end if;
  -- A missing, null, or non-array log is left untouched for the app.
  if jsonb_typeof(blob->'log') is distinct from 'array' then
    return blob;
  end if;
  for item in select value from jsonb_array_elements(blob->'log')
  loop
    classified := backup_20261124.relabel_answer(item);
    new_log := new_log || jsonb_build_array(classified->'elem');
  end loop;
  if jsonb_typeof(blob->'missSchedule') is distinct from 'object' then
    return jsonb_set(blob, '{log}', new_log);
  end if;
  for sched_key, sched_val in select key, value from jsonb_each(blob->'missSchedule')
  loop
    if sched_key ~ '^(builtin|bank):' then
      new_schedule := new_schedule || jsonb_build_object(sched_key, sched_val);
      continue;
    end if;
    raw_id := sched_key;
    if sched_key ~ '^case:' then
      select elem->>'id' into raw_id
      from jsonb_array_elements(new_log) with ordinality as logged(elem, ordinality)
      where elem->>'key' = sched_key
      order by ordinality desc
      limit 1;
      if raw_id is null or pending ? raw_id then
        continue;
      end if;
    elsif pending ? sched_key then
      continue;
    end if;
    pending := pending || jsonb_build_object(raw_id, sched_val);
  end loop;
  for sched_key, sched_val in select key, value from jsonb_each(pending)
  loop
    owner := backup_20261124.schedule_owner(new_log, sched_key);
    if owner is not null then
      if not (new_schedule ? owner) then
        new_schedule := new_schedule || jsonb_build_object(owner, sched_val);
      end if;
    else
      new_schedule := new_schedule || jsonb_build_object(sched_key, sched_val);
    end if;
  end loop;
  return jsonb_set(jsonb_set(blob, '{log}', new_log), '{missSchedule}', new_schedule);
end;
$$;

revoke all on function backup_20261124.relabel_answer(jsonb) from public, anon, authenticated;
revoke all on function backup_20261124.schedule_owner(jsonb, text) from public, anon, authenticated;
revoke all on function backup_20261124.relabel_blob(jsonb) from public, anon, authenticated;

-- Self-check. A bad log must not abort the migration, and a review date
-- shared by a bank question and a later case step stays with the bank question.
do $$
declare
  blob jsonb;
  out jsonb;
begin
  blob := '{"log":null,"xp":1}'::jsonb;
  if backup_20261124.relabel_blob(blob) is distinct from blob then
    raise exception 'null log was rewritten';
  end if;
  blob := '{"log":{"id":1},"xp":1}'::jsonb;
  if backup_20261124.relabel_blob(blob) is distinct from blob then
    raise exception 'object log was rewritten';
  end if;
  blob := '{"xp":1}'::jsonb;
  if backup_20261124.relabel_blob(blob) is distinct from blob then
    raise exception 'missing log was rewritten';
  end if;
  blob := jsonb_build_object(
    'log', jsonb_build_array(
      jsonb_build_object('id', 101, 'cat', 'Pharmacology', 'correct', false),
      jsonb_build_object('id', 101, 'cat', 'Physiological Adaptation', 'correct', true)
    ),
    'missSchedule', jsonb_build_object('101', jsonb_build_object('interval', 3, 'due', '2026-12-01'))
  );
  out := backup_20261124.relabel_blob(blob);
  if not (out->'missSchedule' ? 'bank:101') then
    raise exception 'review date did not stay with the bank question';
  end if;
  if out->'missSchedule' ? 'case:case-sepsis-1' or out->'missSchedule' ? '101' then
    raise exception 'review date moved onto a case step or stayed on the shared number';
  end if;
  blob := jsonb_build_object(
    'log', jsonb_build_array(
      jsonb_build_object('id', '101', 'cat', 'Pharmacology', 'correct', false, 'source', 'bank', 'key', 'bank:101'),
      jsonb_build_object('id', '101', 'cat', 'Physiological Adaptation', 'correct', true, 'source', 'case', 'key', 'case:case-sepsis-1')
    ),
    'missSchedule', jsonb_build_object('case:case-sepsis-1', jsonb_build_object('interval', 3, 'due', '2026-12-01'))
  );
  out := backup_20261124.relabel_blob(blob);
  if (out->'missSchedule'->'bank:101') is distinct from jsonb_build_object('interval', 3, 'due', '2026-12-01')
     or out->'missSchedule' ? 'case:case-sepsis-1' then
    raise exception 'a case review date was not returned to the bank question';
  end if;
end $$;

-- Idempotent: a second run leaves canonical and unresolved rows untouched.
update public.progress
   set blob = backup_20261124.relabel_blob(blob)
 where blob is distinct from backup_20261124.relabel_blob(blob);
