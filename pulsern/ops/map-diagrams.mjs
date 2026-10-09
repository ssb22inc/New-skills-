#!/usr/bin/env node
/* Pairs concept diagrams with practice questions — confirmed by Astra.
   ------------------------------------------------------------------
   1. Read the approved practice bank (public read; no secret needed).
   2. Propose candidate pairings with tight keyword matchers, reading any
      patient values from the stem (src/diagrams/match.js).
   3. Ask GPT Astra to confirm each pairing for that exact question, in
      batches, with a strict answer schema.
   4. Ship only confirmed pairings, in src/diagrams/item-map.json.

   Money: --max-usd caps a run (default $15). Every decision is cached with
   hashes of the question and of the diagram's clinical content, so a re-run
   pays only for what is new or changed. The cache and a run report are
   written after EVERY batch, so a run that is stopped still keeps what it
   paid for (owner's instruction: every paid review is kept).

   Usage: node ops/map-diagrams.mjs [--dry-run] [--limit N] [--max-usd X] [--only diagramId]
   Env:   OPENROUTER_API_KEY (not needed for --dry-run)
          PULSERN_SUPABASE_URL / PULSERN_SUPABASE_ANON_KEY (default: the app's public values) */
import { createServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readAll } from "../src/read-all.js";
import { fingerprint } from "../src/diagrams/fingerprint.js";
import { review, parseJson, reviewSpend } from "./review.mjs";
import { REVIEW_MODEL, GEN_MODEL } from "./models.mjs";
import { FatalLlmError } from "./llm.mjs";
import {
  itemHash, diagramHash, decisionKey, isFresh, pairingPrompt, PAIRING_SCHEMA,
  buildItemMap, serializeDecisions, publishable, sameProposal, pairAll, exitCodeFor,
} from "./map-diagrams-lib.mjs";
import { sourceKey, readReviewIndex, approval } from "./diagram-attest.mjs";

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry-run");
const LIMIT = arg("--limit") ? Number(arg("--limit")) : Infinity;
const MAX_USD = Number(arg("--max-usd", "15"));
const ONLY = arg("--only");

/* Public by design (CLAUDE.md rule 2): the app ships these to every browser. */
const URL_ = process.env.PULSERN_SUPABASE_URL || "https://xlfdywudgamrnzjwtrtd.supabase.co";
const ANON = process.env.PULSERN_SUPABASE_ANON_KEY || "sb_publishable_wH9FG2HgmC9hrvqNO4hZiQ_eJi86SUd";

const CACHE = "reports/diagram-map/decisions.json";
const MAP = "src/diagrams/item-map.json";
const startedAt = new Date().toISOString();
const RUN = `reports/diagram-map/run-${startedAt.replace(/[:.]/g, "-")}`;

const decisions = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const run = { startedAt, model: REVIEW_MODEL, maxUsd: MAX_USD, limit: Number.isFinite(LIMIT) ? LIMIT : null, dryRun: DRY,
  candidates: {}, asked: 0, attached: 0, attachedWithValues: 0, rejected: 0, failedBatches: [], stoppedFor: null };

/* Which diagrams may be attached at all: passed their visual review, as the
   code is now. Computed once per run. */
const KEY = sourceKey();
const REVIEWS = readReviewIndex();
const approvedNow = (id) => approval(REVIEWS, id, KEY).ok;
/* What today's matcher proposes for each question; filled once the bank
   is read. A decision ships only if its values still match. */
const PROPOSALS = new Map();

function save(diagrams, items) {
  mkdirSync("reports/diagram-map", { recursive: true });
  writeFileSync(CACHE, serializeDecisions(decisions));
  const fresh = publishable(decisions, items, diagrams, approvedNow, PROPOSALS);
  writeFileSync(MAP, JSON.stringify(buildItemMap(fresh, diagrams, KEY)) + "\n");
  const spend = reviewSpend();
  run.spendUsd = spend.costUsd;
  run.calls = spend.calls;
  run.uncostedCalls = spend.uncosted;
  run.shipped = Object.values(fresh).filter((d) => d.attach).length;
  writeFileSync(`${RUN}.json`, JSON.stringify(run, null, 2) + "\n");
  writeFileSync(`${RUN}.md`, [
    `# Diagram pairing run — ${run.failedBatches.length ? `FAILED BATCHES (${run.failedBatches.length})` : run.stoppedFor ? `PARTIAL (${run.stoppedFor})` : "complete"}`,
    "", `- Reviewer: \`${REVIEW_MODEL}\``, `- Started: ${startedAt}`,
    `- Spend: $${(run.spendUsd ?? 0).toFixed(4)} across ${run.calls ?? 0} calls${run.uncostedCalls ? ` (+${run.uncostedCalls} with no cost reported)` : ""} · cap $${MAX_USD}`,
    `- Candidates: ${Object.entries(run.candidates).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`,
    `- Asked this run: ${run.asked} · attached ${run.attached} (${run.attachedWithValues} with confirmed values) · rejected ${run.rejected}`,
    `- Pairings now shipped: ${run.shipped}`,
    `- Diagrams held back (no current passing visual review): ${Object.entries(run.heldBack ?? {}).map(([k, v]) => `${k} — ${v}`).join("; ") || "none"}`,
    run.failedBatches.length ? `- Failed batches (will be retried next run): ${run.failedBatches.map((f) => `${f.diagram} [${f.ids.join(", ")}] — ${f.error}`).join("; ")}` : "- Failed batches: none",
    "",
  ].join("\n"));
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let code = 0;
try {
  const { DIAGRAMS } = await vite.ssrLoadModule("/src/diagrams/index.js");
  /* Through Vite, like the registry: the matchers import .jsx modules, which
     plain Node cannot load (Astra, PR #133 review, finding 11 — the CLI
     crashed before reading a single question). */
  const { proposePairs } = await vite.ssrLoadModule("/src/diagrams/match.js");
  run.heldBack = {};
  for (const id of Object.keys(DIAGRAMS)) {
    const a = approval(REVIEWS, id, KEY);
    if (!a.ok) run.heldBack[id] = a.why;
  }
  if (Object.keys(run.heldBack).length) console.log(`Held back, not reviewed for pairing: ${JSON.stringify(run.heldBack)}`);
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });
  console.log("Reading practice questions…");
  const rows = await readAll(() => sb.from("questions").select("id, stem, options, answer, rationale")
    .eq("approved", true).is("exam_form", null).order("id"), { ordered: true });
  const items = new Map(rows.map((r) => [r.id, r]));
  console.log(`Read ${rows.length} practice questions.`);

  const queue = {};
  for (const q of rows) {
    const proposed = proposePairs(q);
    PROPOSALS.set(q.id, proposed);
    for (const pair of proposed) {
      const dg = DIAGRAMS[pair.d];
      if (!dg || (ONLY && pair.d !== ONLY)) continue;
      if (!approvedNow(pair.d)) continue;   // never pay to pair a diagram that cannot ship
      run.candidates[pair.d] = (run.candidates[pair.d] ?? 0) + 1;
      const prev = decisions[decisionKey(q.id, pair.d)];
      if (isFresh(prev, itemHash(q), diagramHash(dg)) && sameProposal(proposed, pair.d, prev.extracted)) continue;
      (queue[pair.d] ??= []).push({ ...q, extracted: pair.p ?? null });
    }
  }
  const pending = Object.entries(queue).map(([d, l]) => `${d} ${l.length}`).join(", ");
  console.log(`Candidates: ${JSON.stringify(run.candidates)} · needing review: ${pending || "none"}`);

  if (DRY) { save(DIAGRAMS, items); console.log("Dry run: nothing sent."); }
  else {
    await pairAll({
      queue, diagrams: DIAGRAMS, decisions, run, limit: LIMIT, maxUsd: MAX_USD, model: REVIEW_MODEL,
      ask: async (dg, batch) => parseJson(await review(pairingPrompt(dg, batch), 12000, { writer: GEN_MODEL, responseFormat: PAIRING_SCHEMA })),
      spent: () => reviewSpend().costUsd,
      isFatal: (e) => e instanceof FatalLlmError,
      fingerprintOf: fingerprint,
      onBatch: () => { save(DIAGRAMS, items); console.log(`  ${run.asked} decided so far · $${reviewSpend().costUsd.toFixed(4)}${run.failedBatches.length ? ` · ${run.failedBatches.length} batch(es) failed` : ""}`); },
    });
    save(DIAGRAMS, items);
    /* A batch that failed is a run that did not finish its job: it must not
       report success (Astra, PR #133 review, finding 12). */
    code = exitCodeFor(run);
    console.log(`Done${run.stoppedFor ? ` (partial: ${run.stoppedFor})` : ""}${run.failedBatches.length ? ` — ${run.failedBatches.length} batch(es) FAILED` : ""}. Report: ${RUN}.md`);
  }
} catch (e) {
  console.error(e.message);
  code = 1;
} finally {
  await vite.close();
}
process.exit(code);
