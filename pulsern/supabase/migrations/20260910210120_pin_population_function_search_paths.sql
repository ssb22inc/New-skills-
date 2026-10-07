-- Keep population classification independent of the caller's schema lookup path.
-- Trigger calls already qualify public.classify_population; built-ins resolve
-- through pg_catalog. Preserve function bodies, privileges, and stored content.
alter function public.classify_population(text) set search_path = '';
alter function public.q_population_default() set search_path = '';
alter function public.c_population_default() set search_path = '';
