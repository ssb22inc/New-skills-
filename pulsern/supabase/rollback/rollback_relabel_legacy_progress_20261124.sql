-- Restore PulseRN saved progress from schema backup_20261124.
-- Run this only against project xlfdywudgamrnzjwtrtd.
-- The backup was taken before the 2026-11-24 legacy-id relabel.
begin;

delete from public.progress;
insert into public.progress (user_id, key, blob, updated_at)
select user_id, key, blob, updated_at from backup_20261124.progress;

delete from public.exam_attempts;
insert into public.exam_attempts (user_id, form, started_at, id, items, submitted_at, correct, total, result)
select user_id, form, started_at, id, items, submitted_at, correct, total, result
from backup_20261124.exam_attempts;

commit;
