-- Rollback for migration 022_progress_revision_guard.sql.
-- Run only if 022 must be undone. It removes what 022 added:
-- the revision guard trigger and its function, the parked-snapshot
-- table (with its policies and index), and progress.legacy_hold.
-- It does not touch migrations 020/021 (see
-- rollback_relabel_legacy_progress_20261124.sql for those).
-- Parked snapshots in progress_pending_merge are dropped with the
-- table; copy them out first if they are still needed.

begin;

drop trigger if exists progress_revision_guard on public.progress;
drop function if exists public.progress_revision_guard();

drop policy if exists pending_merge_select on public.progress_pending_merge;
drop policy if exists pending_merge_delete on public.progress_pending_merge;
drop policy if exists pending_merge_insert on public.progress_pending_merge;
drop index if exists public.progress_pending_merge_user_key_idx;
drop table if exists public.progress_pending_merge;

alter table public.progress drop column if exists legacy_hold;

commit;
