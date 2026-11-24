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
