-- Additive only: a function and a trigger. Existing rows are not rewritten.
--
-- An update that does not send a new revision is the app version already
-- open in browsers. That client omits the column, so NEW.revision stays
-- equal to OLD.revision, and it ignores a rejected write. Keep the blob
-- and move the stored revision forward by one. The write lands, and a
-- newer client refetches and merges instead of replacing it.
-- An update that sends a revision must send one greater than the row.
create or replace function public.progress_revision_guard()
returns trigger
language plpgsql
as $$
begin
  if new.revision is null or new.revision = old.revision then
    -- No revision-aware save has landed yet: accept the snapshot as the
    -- older app does today.
    -- After a newer client has saved (revision > 0), do not replace XP,
    -- ability, rewards, or schedules with the older snapshot. Keep that
    -- snapshot and append only incoming answers that are not the same
    -- occurrence. Occurrence is id + correct, plus day when both rows
    -- have one, so a relabeled row is not stored twice.
    if old.revision > 0
       and jsonb_typeof(old.blob) = 'object'
       and jsonb_typeof(new.blob) = 'object'
       and jsonb_typeof(old.blob->'log') = 'array'
       and jsonb_typeof(new.blob->'log') = 'array' then
      new.blob := jsonb_set(old.blob, '{log}', (
        select coalesce(jsonb_agg(entry order by ord), '[]'::jsonb)
        from (
          select entry, ord
            from jsonb_array_elements(old.blob->'log') with ordinality as kept(entry, ord)
          union all
          select entry, 1000000 + ord
            from jsonb_array_elements(new.blob->'log') with ordinality as incoming(entry, ord)
           where not exists (
             select 1
               from jsonb_array_elements(old.blob->'log') as already
              where already->>'id' is not distinct from entry->>'id'
                and already->>'correct' is not distinct from entry->>'correct'
                and (
                  not (already ? 'day') or not (entry ? 'day') or already->>'day' = entry->>'day'
                )
           )
        ) as combined
      ), true);
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
