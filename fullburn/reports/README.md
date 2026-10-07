# reports/

Adversary and council output lands here — nothing ships without it.

- `ADVERSARY_REPORT_phase<N>.md` — the engine-adversary's PASS/FAIL verdict for each build phase (ENGINE_BUILD.md §10.1 step 5). CI blocks a phase merge without the report committed alongside green tests. Findings are ranked money loss > ban risk > data lies > UX.
- `IMPROVEMENT_PLAN_<yyyy-mm>.md` — the Improvement Council's monthly ranked proposals with verified citations (ENGINE_BUILD.md §13). Ships only after Phase SI goes live.

Reports are append-only history: superseded reports stay in place; a re-run adds a new report, it never rewrites the old one.

## The verdict schema the gate enforces (adversary finding R5-10)

A report is machine-read. Two fields must appear **in the first 10 lines, at
column 0, as plain text** — no code fence, no indent, no blockquote, no raw HTML
anywhere above them:

```
# ADVERSARY REPORT phase<N>[.<round>]
Verdict: PASS            <- or FAIL. Exactly that token; PASS may carry a
                            parenthetical, e.g. "PASS (CONDITIONAL — L1 open)"
verified-tree: <hash>    <- the tree the review judged
```

The binding is read through ordinary Markdown decoration — backticks, bold, a
list marker, a trailing parenthetical all parse — because writing a hash in
backticks used to make a correctly bound FAIL read as stale and be silently
discarded (R5-03). What does NOT parse is a binding below line 10, or anything
after a raw HTML tag in the header.

**A report the gate cannot read BLOCKS.** "Unparseable" and "about a different
tree" are different states: the gate can skip the second and must not skip the
first. If your report does not parse, the gate fails closed and names your file.

Compute the tree hash the way the gate does:

```
git ls-files -s -- 'fullburn/' '.github/' ':!fullburn/reports/' ':!fullburn/APPROVALS/' \
  | git hash-object --stdin
```

`reports/` and `APPROVALS/` are excluded so a report can bind to the tree it is
then committed into. Reports and approvals are both append-only: add a file,
never edit one.

**This matters most for a reviewer who is not this build harness.** §10.1 and
ledger L8/H6b require a second adversary on a different model family to review
the same tree. That reviewer has no way to discover this format from the code,
and every formatting choice listed above once silenced a FAIL in silence.
