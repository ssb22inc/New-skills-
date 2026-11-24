-- The revision column does not stop an already-open older app. That app
-- upserts the whole blob and does not advance revision. Reject an update
-- that does not move the revision forward, so the older blob cannot land.
create or replace function public.progress_revision_guard()
returns trigger
language plpgsql
as $$
begin
  if new.revision is null or new.revision <= old.revision then
    raise exception 'progress revision conflict' using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists progress_revision_guard on public.progress;
create trigger progress_revision_guard
before update on public.progress
for each row execute function public.progress_revision_guard();
