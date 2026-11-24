-- Restore the progress blobs captured before the 2026-11-24 relabel.
-- Run this only against project xlfdywudgamrnzjwtrtd.
-- Exam attempts are not part of this migration and are not touched.
-- Progress rows created after the backup are left in place.
begin;

update public.progress as live
   set blob = saved.blob,
       updated_at = saved.updated_at
  from backup_20261124.progress as saved
 where live.user_id = saved.user_id
   and live.key = saved.key;

commit;
