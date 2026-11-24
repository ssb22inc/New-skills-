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
    -- The older app replaces the whole blob and ignores a rejected write.
    -- Keep every answer already stored, then append only the incoming
    -- answers that are not already there, so a newer acknowledged answer
    -- is not erased by the older snapshot.
    if jsonb_typeof(old.blob) = 'object' and jsonb_typeof(new.blob) = 'object'
       and jsonb_typeof(old.blob->'log') = 'array' and jsonb_typeof(new.blob->'log') = 'array' then
      new.blob := jsonb_set(new.blob, '{log}', (
        select coalesce(jsonb_agg(entry order by ord), '[]'::jsonb)
        from (
          select entry, ord
            from jsonb_array_elements(old.blob->'log') with ordinality as kept(entry, ord)
          union all
          select entry, 1000000 + ord
            from jsonb_array_elements(new.blob->'log') with ordinality as incoming(entry, ord)
           where not exists (
             select 1 from jsonb_array_elements(old.blob->'log') as already
              where already = entry
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
