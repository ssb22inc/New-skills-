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
