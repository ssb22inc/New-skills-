-- PulseRN — full NCSBN test-plan coverage (004)
-- 1) Add the NGN highlight item type.
-- 2) Split the merged "Psychosocial & Health Promotion" category into the
--    two official categories (one-time data reclassification of the rows
--    that existed under the merged name).

alter table questions drop constraint if exists questions_type_check;
alter table questions add constraint questions_type_check
  check (type in ('mc','sata','order','matrix','bowtie','cloze','calc','highlight'));

-- health-promotion content → Health Promotion & Maintenance
update questions set cat = 'Health Promotion & Maintenance'
  where cat = 'Psychosocial & Health Promotion' and id in (20, 28);
-- psychosocial content → Psychosocial Integrity
update questions set cat = 'Psychosocial Integrity'
  where cat = 'Psychosocial & Health Promotion';
