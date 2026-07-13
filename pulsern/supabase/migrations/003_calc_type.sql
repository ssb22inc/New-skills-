-- PulseRN — add the dosage-calculation item type (003)
-- calc items: numeric-entry answer; unit and tolerance ride in extra.

alter table questions drop constraint if exists questions_type_check;
alter table questions add constraint questions_type_check
  check (type in ('mc','sata','order','matrix','bowtie','cloze','calc'));
