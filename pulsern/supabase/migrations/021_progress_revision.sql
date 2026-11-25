-- A later save wins. An older whole-blob write cannot land after it.
alter table public.progress add column if not exists revision bigint not null default 0;
