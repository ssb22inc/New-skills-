-- Additive only: functions and a trigger. Existing rows are not rewritten.
--
-- A save that does not send a revision is the app version already open
-- in browsers. That write is never rejected. The stored revision moves
-- forward by one so a newer client refetches.
--
-- Before any revision-aware save, the snapshot is stored as sent.
-- After one, the snapshot is merged:
--   a card schedule wins when its last review is later, or the card is new;
--   answer occurrences already stored stay, and new ones are appended;
--   ability is replayed from the merged log;
--   XP, rewards, and shift covers keep the greater earned value;
--   every other field is taken from this write, which is the newest one.
-- A client that sends a revision must send one greater than the row.

create or replace function public.progress_review_stamp(entry jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(entry) <> 'object' then null
    when jsonb_typeof(entry->'at') = 'number' then to_char((entry->>'at')::numeric, 'FM00000000000000000000')
    when coalesce(entry->>'seen', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then entry->>'seen'
    else null
  end
$$;

create or replace function public.progress_merge_card_map(stored jsonb, incoming jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, chosen order by key), '{}'::jsonb)
  from (
    select keys.key,
      case
        when stored_map is null or not (stored_map ? keys.key) then incoming_map->keys.key
        when incoming_map is null or not (incoming_map ? keys.key) then stored_map->keys.key
        when public.progress_review_stamp(incoming_map->keys.key) is not null
         and (
           public.progress_review_stamp(stored_map->keys.key) is null
           or public.progress_review_stamp(incoming_map->keys.key) > public.progress_review_stamp(stored_map->keys.key)
         ) then incoming_map->keys.key
        else stored_map->keys.key
      end as chosen
    from (
      select stored_side as stored_map, incoming_side as incoming_map
      from (
        select
          case when jsonb_typeof(stored) = 'object' then stored else '{}'::jsonb end as stored_side,
          case when jsonb_typeof(incoming) = 'object' then incoming else '{}'::jsonb end as incoming_side
      ) sides
    ) maps
    cross join lateral (
      select jsonb_object_keys(maps.stored_map) as key
      union
      select jsonb_object_keys(maps.incoming_map)
    ) keys
  ) merged
$$;

create or replace function public.progress_merge_log(stored jsonb, incoming jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(entry order by ord), '[]'::jsonb)
  from (
    select entry, ord
      from jsonb_array_elements(case when jsonb_typeof(stored) = 'array' then stored else '[]'::jsonb end)
        with ordinality as kept(entry, ord)
    union all
    select entry, 1000000 + ord
      from jsonb_array_elements(case when jsonb_typeof(incoming) = 'array' then incoming else '[]'::jsonb end)
        with ordinality as added(entry, ord)
     where not exists (
       select 1
         from jsonb_array_elements(case when jsonb_typeof(stored) = 'array' then stored else '[]'::jsonb end) as already
        where already->>'id' is not distinct from entry->>'id'
          and already->>'correct' is not distinct from entry->>'correct'
          and (
            not (already ? 'day') or not (entry ? 'day') or already->>'day' = entry->>'day'
          )
     )
  ) as combined
$$;

create or replace function public.progress_ability_from_log(answer_log jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  cats text[] := array[
    'Management of Care',
    'Safety & Infection Control',
    'Health Promotion & Maintenance',
    'Psychosocial Integrity',
    'Basic Care & Comfort',
    'Pharmacology',
    'Reduction of Risk',
    'Physiological Adaptation'
  ];
  ability jsonb := '{}'::jsonb;
  cat text;
  row jsonb;
  qcat text;
  diff int;
  source text;
  theta double precision;
  n int;
  rating double precision;
  k double precision;
  expected double precision;
  actual double precision;
begin
  foreach cat in array cats loop
    ability := ability || jsonb_build_object(cat, jsonb_build_object('theta', 1200, 'n', 0));
  end loop;
  if jsonb_typeof(answer_log) <> 'array' then
    return ability;
  end if;
  for row in select value from jsonb_array_elements(answer_log) as answers(value) loop
    if jsonb_typeof(row) <> 'object' or not (row ? 'cat') or not (row ? 'correct') then
      continue;
    end if;
    qcat := row->>'cat';
    if qcat is null or qcat = '' then
      continue;
    end if;
    if not (ability ? qcat) then
      ability := ability || jsonb_build_object(qcat, jsonb_build_object('theta', 1200, 'n', 0));
    end if;
    theta := (ability->qcat->>'theta')::double precision;
    n := coalesce((ability->qcat->>'n')::int, 0);
    diff := nullif(row->>'diff', '')::int;
    source := row->>'source';
    if source in ('builtin', 'case') or coalesce(jsonb_typeof(row->'rating'), '') <> 'number' then
      rating := case diff when 1 then 1100 when 2 then 1300 when 3 then 1500 else 1300 end;
    else
      rating := (row->>'rating')::double precision;
    end if;
    k := case when n < 10 then 40 when n < 30 then 24 else 12 end;
    expected := 1.0 / (1.0 + power(10::double precision, (rating - theta) / 400.0));
    actual := case when coalesce((row->>'correct')::boolean, false) then 1 else 0 end;
    theta := theta + k * (actual - expected);
    ability := jsonb_set(
      ability,
      array[qcat],
      jsonb_build_object('theta', theta, 'n', n + 1)
    );
  end loop;
  return ability;
end;
$$;

create or replace function public.progress_union_text(stored jsonb, incoming jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(item order by item), '[]'::jsonb)
  from (
    select distinct value as item
    from (
      select jsonb_array_elements_text(case when jsonb_typeof(stored) = 'array' then stored else '[]'::jsonb end)
      union
      select jsonb_array_elements_text(case when jsonb_typeof(incoming) = 'array' then incoming else '[]'::jsonb end)
    ) listed(value)
    where value is not null and value <> ''
  ) unique_items
$$;

create or replace function public.progress_merge_rewards(stored jsonb, incoming jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  base jsonb := case when jsonb_typeof(stored) = 'object' then stored else '{}'::jsonb end;
  added jsonb := case when jsonb_typeof(incoming) = 'object' then incoming else '{}'::jsonb end;
  days jsonb := '{}'::jsonb;
  day text;
  badges jsonb := '{}'::jsonb;
  badge text;
  best jsonb;
  ops jsonb := '[]'::jsonb;
  op jsonb;
begin
  for day in
    select key from (
      select jsonb_object_keys(case when jsonb_typeof(base->'days') = 'object' then base->'days' else '{}'::jsonb end) as key
      union
      select jsonb_object_keys(case when jsonb_typeof(added->'days') = 'object' then added->'days' else '{}'::jsonb end)
    ) keys
    order by key
  loop
    days := days || jsonb_build_object(day, jsonb_build_object(
      'q', greatest(coalesce((base->'days'->day->>'q')::numeric, 0), coalesce((added->'days'->day->>'q')::numeric, 0)),
      'ok', greatest(coalesce((base->'days'->day->>'ok')::numeric, 0), coalesce((added->'days'->day->>'ok')::numeric, 0)),
      'xp', greatest(coalesce((base->'days'->day->>'xp')::numeric, 0), coalesce((added->'days'->day->>'xp')::numeric, 0)),
      'cards', greatest(coalesce((base->'days'->day->>'cards')::numeric, 0), coalesce((added->'days'->day->>'cards')::numeric, 0)),
      'fixes', greatest(coalesce((base->'days'->day->>'fixes')::numeric, 0), coalesce((added->'days'->day->>'fixes')::numeric, 0)),
      'ms', greatest(coalesce((base->'days'->day->>'ms')::numeric, 0), coalesce((added->'days'->day->>'ms')::numeric, 0))
    ));
  end loop;
  best := jsonb_build_object(
    'run', greatest(coalesce((base->'best'->>'run')::numeric, 0), coalesce((added->'best'->>'run')::numeric, 0)),
    'sessionAcc', greatest(coalesce((base->'best'->>'sessionAcc')::numeric, 0), coalesce((added->'best'->>'sessionAcc')::numeric, 0)),
    'sessionN', greatest(coalesce((base->'best'->>'sessionN')::numeric, 0), coalesce((added->'best'->>'sessionN')::numeric, 0)),
    'dayQ', greatest(coalesce((base->'best'->>'dayQ')::numeric, 0), coalesce((added->'best'->>'dayQ')::numeric, 0)),
    'streak', greatest(coalesce((base->'best'->>'streak')::numeric, 0), coalesce((added->'best'->>'streak')::numeric, 0))
  );
  for badge in
    select key from (
      select jsonb_object_keys(case when jsonb_typeof(base->'badgesSeen') = 'object' then base->'badgesSeen' else '{}'::jsonb end) as key
      union
      select jsonb_object_keys(case when jsonb_typeof(added->'badgesSeen') = 'object' then added->'badgesSeen' else '{}'::jsonb end)
    ) keys
    order by key
  loop
    badges := badges || jsonb_build_object(
      badge,
      greatest(coalesce((base->'badgesSeen'->>badge)::numeric, 0), coalesce((added->'badgesSeen'->>badge)::numeric, 0))
    );
  end loop;
  if jsonb_typeof(base->'cardOps') = 'array' then
    for op in select value from jsonb_array_elements(base->'cardOps') loop
      ops := ops || jsonb_build_array(op);
    end loop;
  end if;
  if jsonb_typeof(added->'cardOps') = 'array' then
    for op in select value from jsonb_array_elements(added->'cardOps') loop
      if op->>'id' is null or not exists (
        select 1 from jsonb_array_elements(ops) as have where have->>'id' = op->>'id'
      ) then
        ops := ops || jsonb_build_array(op);
      end if;
    end loop;
  end if;
  return base || added || jsonb_build_object(
    'covers', least(2, greatest(coalesce((base->>'covers')::numeric, 0), coalesce((added->>'covers')::numeric, 0))),
    'coverWeeks', public.progress_union_text(base->'coverWeeks', added->'coverWeeks'),
    'coverDays', public.progress_union_text(base->'coverDays', added->'coverDays'),
    'days', days,
    'best', best,
    'milestones', coalesce((
      select jsonb_agg(item order by item)
      from (
        select distinct value::numeric as item
        from (
          select jsonb_array_elements_text(case when jsonb_typeof(base->'milestones') = 'array' then base->'milestones' else '[]'::jsonb end)
          union
          select jsonb_array_elements_text(case when jsonb_typeof(added->'milestones') = 'array' then added->'milestones' else '[]'::jsonb end)
        ) listed(value)
        where value ~ '^-?[0-9]+(\.[0-9]+)?$'
      ) unique_items
    ), '[]'::jsonb),
    'badgesSeen', badges,
    'prefs', case
      when jsonb_typeof(base->'prefs') = 'object' or jsonb_typeof(added->'prefs') = 'object'
        then coalesce(base->'prefs', '{}'::jsonb) || coalesce(added->'prefs', '{}'::jsonb)
      else coalesce(added->'prefs', base->'prefs')
    end,
    'cardOps', ops
  ) || case
    when (base ? 'rankHigh') or (added ? 'rankHigh') then jsonb_build_object(
      'rankHigh',
      greatest(coalesce((base->>'rankHigh')::numeric, 0), coalesce((added->>'rankHigh')::numeric, 0))
    )
    else '{}'::jsonb
  end;
end;
$$;

create or replace function public.progress_merge_legacy_blob(stored jsonb, incoming jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  base jsonb := case when jsonb_typeof(stored) = 'object' then stored else '{}'::jsonb end;
  added jsonb := case when jsonb_typeof(incoming) = 'object' then incoming else '{}'::jsonb end;
  merged_log jsonb := public.progress_merge_log(base->'log', added->'log');
  result jsonb := base;
  key text;
  structural text[] := array[
    'log', 'ability', 'xp', 'bestRun', 'run', 'rewards', 'srsMap', 'missSchedule',
    'streak', 'daily', 'fcNew', 'examResults'
  ];
begin
  result := result || jsonb_build_object(
    'log', merged_log,
    'ability', public.progress_ability_from_log(merged_log),
    'srsMap', public.progress_merge_card_map(base->'srsMap', added->'srsMap'),
    'missSchedule', public.progress_merge_card_map(base->'missSchedule', added->'missSchedule'),
    'rewards', public.progress_merge_rewards(base->'rewards', added->'rewards')
  );
  if (base ? 'xp') or (added ? 'xp') then
    result := result || jsonb_build_object('xp', greatest(coalesce((base->>'xp')::numeric, 0), coalesce((added->>'xp')::numeric, 0)));
  end if;
  if (base ? 'bestRun') or (added ? 'bestRun') then
    result := result || jsonb_build_object('bestRun', greatest(coalesce((base->>'bestRun')::numeric, 0), coalesce((added->>'bestRun')::numeric, 0)));
  end if;
  if (base ? 'run') or (added ? 'run') then
    result := result || jsonb_build_object('run', greatest(coalesce((base->>'run')::numeric, 0), coalesce((added->>'run')::numeric, 0)));
  end if;
  if (base ? 'streak') or (added ? 'streak') then
    result := result || jsonb_build_object('streak', jsonb_build_object(
      'count', greatest(coalesce((base->'streak'->>'count')::numeric, 0), coalesce((added->'streak'->>'count')::numeric, 0)),
      'lastDay', greatest(base->'streak'->>'lastDay', added->'streak'->>'lastDay'),
      'shield', coalesce((base->'streak'->>'shield')::boolean, false) or coalesce((added->'streak'->>'shield')::boolean, false)
    ));
  end if;
  if (base ? 'daily') or (added ? 'daily') then
    if coalesce(added->'daily'->>'day', '') > coalesce(base->'daily'->>'day', '') then
      result := result || jsonb_build_object('daily', added->'daily');
    elsif coalesce(base->'daily'->>'day', '') > coalesce(added->'daily'->>'day', '') then
      result := result || jsonb_build_object('daily', base->'daily');
    else
      result := result || jsonb_build_object('daily', coalesce(base->'daily', '{}'::jsonb) || coalesce(added->'daily', '{}'::jsonb) || jsonb_build_object(
        'answered', greatest(coalesce((base->'daily'->>'answered')::numeric, 0), coalesce((added->'daily'->>'answered')::numeric, 0))
      ));
    end if;
  end if;
  if (base ? 'fcNew') or (added ? 'fcNew') then
    if coalesce(added->'fcNew'->>'day', '') > coalesce(base->'fcNew'->>'day', '') then
      result := result || jsonb_build_object('fcNew', added->'fcNew');
    elsif coalesce(base->'fcNew'->>'day', '') > coalesce(added->'fcNew'->>'day', '') then
      result := result || jsonb_build_object('fcNew', base->'fcNew');
    else
      result := result || jsonb_build_object('fcNew', coalesce(base->'fcNew', '{}'::jsonb) || coalesce(added->'fcNew', '{}'::jsonb) || jsonb_build_object(
        'count', greatest(coalesce((base->'fcNew'->>'count')::numeric, 0), coalesce((added->'fcNew'->>'count')::numeric, 0)),
        'ids', public.progress_union_text(base->'fcNew'->'ids', added->'fcNew'->'ids')
      ));
    end if;
  end if;
  if (base ? 'examResults') or (added ? 'examResults') then
    result := result || jsonb_build_object(
      'examResults',
      public.progress_merge_card_map(base->'examResults', added->'examResults')
    );
  end if;
  for key in select jsonb_object_keys(added) order by 1 loop
    if not (key = any (structural)) then
      result := result || jsonb_build_object(key, added->key);
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.progress_revision_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.revision is null or new.revision = old.revision then
    if old.revision > 0
       and jsonb_typeof(old.blob) = 'object'
       and jsonb_typeof(new.blob) = 'object' then
      new.blob := public.progress_merge_legacy_blob(old.blob, new.blob);
    end if;
    new.revision := old.revision + 1;
    return new;
  end if;
  if new.revision < old.revision then
    raise exception 'progress revision conflict' using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists progress_revision_guard on public.progress;
create trigger progress_revision_guard
before update on public.progress
for each row execute function public.progress_revision_guard();
