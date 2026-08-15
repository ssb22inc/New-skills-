# reports/

Adversary and council output lands here — nothing ships without it.

- `ADVERSARY_REPORT_phase<N>.md` — the engine-adversary's PASS/FAIL verdict for each build phase (ENGINE_BUILD.md §10.1 step 5). CI blocks a phase merge without the report committed alongside green tests. Findings are ranked money loss > ban risk > data lies > UX.
- `IMPROVEMENT_PLAN_<yyyy-mm>.md` — the Improvement Council's monthly ranked proposals with verified citations (ENGINE_BUILD.md §13). Ships only after Phase SI goes live.

Reports are append-only history: superseded reports stay in place; a re-run adds a new report, it never rewrites the old one.
