-- Additive only. Existing progress rows are not rewritten.
--
-- A save that does not send a revision is the app already open in
-- browsers. That write is never rejected.
--
-- A revision-less save never replaces the stored row, at ANY revision,
-- including 0. Migration 020 labelled the stored log rows and migration
-- 021 left them at revision 0; an old tab that still holds the
-- pre-migration history must not be able to write it back over those
-- labels. The stored progress row stays as it is. The incoming
-- snapshot is copied into progress_pending_merge. The signed-in app
-- reads those rows, merges them with the conflict path it already
-- uses for two devices, saves a new revision, and deletes the rows
-- it consumed.
-- A client that sends a revision must send one greater than the row.

drop function if exists public.progress_review_stamp(jsonb);
drop function if exists public.progress_merge_card_map(jsonb, jsonb);
drop function if exists public.progress_answer_matches(jsonb, jsonb);
drop function if exists public.progress_merge_log(jsonb, jsonb);
drop function if exists public.progress_apply_answer(jsonb, jsonb);
drop function if exists public.progress_ability_from_log(jsonb);
drop function if exists public.progress_union_text(jsonb, jsonb);
drop function if exists public.progress_merge_rewards(jsonb, jsonb);
drop function if exists public.progress_merge_legacy_blob(jsonb, jsonb);

create table if not exists public.progress_pending_merge (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,
  snapshot    jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.progress add column if not exists legacy_hold boolean not null default false;

create index if not exists progress_pending_merge_user_key_idx
  on public.progress_pending_merge (user_id, key, received_at, id);

alter table public.progress_pending_merge enable row level security;

drop policy if exists pending_merge_select on public.progress_pending_merge;
create policy pending_merge_select on public.progress_pending_merge
  for select using (auth.uid() = user_id);

drop policy if exists pending_merge_delete on public.progress_pending_merge;
create policy pending_merge_delete on public.progress_pending_merge
  for delete using (auth.uid() = user_id);

-- The trigger is SECURITY DEFINER (table owner bypasses RLS). This
-- insert policy still covers any non-definer write so a parked
-- snapshot cannot be inserted for another user.
drop policy if exists pending_merge_insert on public.progress_pending_merge;
create policy pending_merge_insert on public.progress_pending_merge
  for insert with check (auth.uid() = user_id);

create or replace function public.progress_revision_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.revision is null or new.revision = old.revision then
    if old.legacy_hold is not true and new.blob is not null then
      insert into public.progress_pending_merge (user_id, key, snapshot)
      values (old.user_id, old.key, new.blob);
    end if;
    return old;
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
