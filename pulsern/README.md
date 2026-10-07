# PulseRN — How to Run This Build

Complete package for building PulseRN end-to-end with Claude Code.

## Contents

- CLAUDE.md — project rules. Goes in the repo root; Claude Code reads it automatically.

- PULSERN_BUILD.md — full engineering spec (architecture, SQL, API contracts, acceptance criteria).

- PULSERN_PROMPTS.md — 14 sequential prompts, each with a verification gate.

- HUMAN_TASKS.md — accounts, secrets, reviewer registration, legal. H1–H4 block Prompt 1.

- assets/ — tested, working code Claude Code copies into place (does NOT rewrite):

- App.portable.jsx — the full app, v5.1 (local-date, SRS-merge, shield, render fixes applied; compiles clean)

- ability-engine.js — Elo/Rasch readiness engine (simulation-tested)

- content-factory.mjs — generate → adversarial review → schema gate pipeline (14/14 tests)

- review-console.html — RN approval gate, all six item types

- seed-content.mjs — loads the 21 starter questions (dry-run tested)

- api/ai.js — the LLM proxy route

- pulsern-content.json — validated starter content

## How to run it

- 1. Do HUMAN_TASKS.md H1–H4 (~25 minutes of account setup).

- 2. Unzip this kit, cd into it, start Claude Code.

- 3. Paste Prompt 1 from PULSERN_PROMPTS.md. Proceed prompt by prompt; never advance past a failed verification gate.

- 4. Prompt 13 is the full acceptance run + production deploy; Prompt 14 writes the handoff report.

## Search release gate

The production build generates the public product, trust, pricing, and NCLEX-RN
guide pages at the origin root before Vite bundles the authenticated PWA under
`/app/` in the same deployment.

```bash
npm run build
npm run seo:audit
npm run seo:app-boundary
```

`seo:audit` inspects the built artifact for traditional search metadata,
semantic structure, sitemap and robots coverage, AI-readable entity graphs,
named RN accountability, citations, unsafe outcome claims, and private-route
leakage. A critical or high finding fails the release.

The repository workflow runs fail-closed gates for PulseRN pull requests,
`main` pushes, manual runs, and a weekly scheduled check. Every run performs:

- the full unit and negative-fixture suite;
- a production build and deterministic traditional/LLM/agentic search audit;
- a fail-closed public-landing/private-app boundary audit;
- versioned search-intent and clinical provenance checks;
- anonymous local and live crawls with browser and named agent user agents;
- WCAG browser testing at desktop and mobile sizes; and
- a required structured OpenRouter adversarial review.

`OPENROUTER_API_KEY` is required as an encrypted GitHub Actions repository
secret. Missing credentials, provider errors, malformed model output, a model
`FAIL`, or any failed deterministic gate make the workflow fail. Reports are
uploaded before final enforcement and are bound to the exact commit SHA with
SHA-256 checksums.

The model cannot approve clinical facts or credentials. `content-review-records.json`
must contain real, consented RN-verification evidence and claim-level human
review records bound to the exact content and source digests. Pending or stale
evidence blocks release.
