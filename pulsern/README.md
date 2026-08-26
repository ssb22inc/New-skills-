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
guide pages before Vite bundles the authenticated app.

```bash
npm run build
npm run seo:audit
```

`seo:audit` inspects the built artifact for traditional search metadata,
semantic structure, sitemap and robots coverage, AI-readable entity graphs,
named RN accountability, citations, unsafe outcome claims, and private-route
leakage. A critical or high finding fails the release.

The repository workflow runs this gate for PulseRN pull requests, `main` pushes,
manual runs, and a weekly scheduled check. If the repository has an
`OPENAI_API_KEY` Actions secret, it also runs `npm run seo:adversary` as an
independent model-based critique. The model review is a second opinion; it does
not override the deterministic gate or the licensed-RN clinical review.
