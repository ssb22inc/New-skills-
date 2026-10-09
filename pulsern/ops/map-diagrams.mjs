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
import { proposePairs } from "../src/diagrams/match.js";
import { fingerprint } from "../src/diagrams/fingerprint.js";
import { review, parseJson, reviewSpend } from "./review.mjs";
import { REVIEW_MODEL, GEN_MODEL } from "./models.mjs";
import { FatalLlmError } from "./llm.mjs";
import {
  itemHash, diagramHash, decisionKey, isFresh, batches, pairingPrompt, PAIRING_SCHEMA,
  readDecisions, shownAs, buildItemMap, serializeDecisions,
} from "./map-diagrams-lib.mjs";

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

function save(diagrams, items) {
  mkdirSync("reports/diagram-map", { recursive: true });
  writeFileSync(CACHE, serializeDecisions(decisions));
  // ship only decisions that still match the current question and diagram
  const fresh = {};
  for (const [key, d] of Object.entries(decisions)) {
    const [qid, did] = key.split(":");
    const q = items.get(Number(qid));
    const dg = diagrams[did];
    if (q && dg && d.itemHash === itemHash(q) && d.diagramHash === diagramHash(dg)) fresh[key] = d;
  }
  writeFileSync(MAP, JSON.stringify(buildItemMap(fresh)) + "\n");
  const spend = reviewSpend();
  run.spendUsd = spend.costUsd;
  run.calls = spend.calls;
  run.uncostedCalls = spend.uncosted;
  run.shipped = Object.values(fresh).filter((d) => d.attach).length;
  writeFileSync(`${RUN}.json`, JSON.stringify(run, null, 2) + "\n");
  writeFileSync(`${RUN}.md`, [
    `# Diagram pairing run — ${run.stoppedFor ? `PARTIAL (${run.stoppedFor})` : "complete"}`,
    "", `- Reviewer: \`${REVIEW_MODEL}\``, `- Started: ${startedAt}`,
    `- Spend: $${(run.spendUsd ?? 0).toFixed(4)} across ${run.calls ?? 0} calls${run.uncostedCalls ? ` (+${run.uncostedCalls} with no cost reported)` : ""} · cap $${MAX_USD}`,
    `- Candidates: ${Object.entries(run.candidates).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`,
    `- Asked this run: ${run.asked} · attached ${run.attached} (${run.attachedWithValues} with confirmed values) · rejected ${run.rejected}`,
    `- Pairings now shipped: ${run.shipped}`,
    run.failedBatches.length ? `- Failed batches (will be retried next run): ${run.failedBatches.map((f) => `${f.diagram} [${f.ids.join(", ")}] — ${f.error}`).join("; ")}` : "- Failed batches: none",
    "",
  ].join("\n"));
}

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let code = 0;
try {
  const { DIAGRAMS } = await vite.ssrLoadModule("/src/diagrams/index.js");
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });
  const rows = await readAll(() => sb.from("questions").select("id, stem, options, answer, rationale")
    .eq("approved", true).is("exam_form", null).order("id"), { ordered: true });
  const items = new Map(rows.map((r) => [r.id, r]));
  console.log(`Read ${rows.length} practice questions.`);

  const queue = {};
  for (const q of rows) {
    for (const pair of proposePairs(q)) {
      const dg = DIAGRAMS[pair.d];
      if (!dg || (ONLY && pair.d !== ONLY)) continue;
      run.candidates[pair.d] = (run.candidates[pair.d] ?? 0) + 1;
      if (isFresh(decisions[decisionKey(q.id, pair.d)], itemHash(q), diagramHash(dg))) continue;
      (queue[pair.d] ??= []).push({ ...q, extracted: pair.p ?? null });
    }
  }
  const pending = Object.entries(queue).map(([d, l]) => `${d} ${l.length}`).join(", ");
  console.log(`Candidates: ${JSON.stringify(run.candidates)} · needing review: ${pending || "none"}`);

  if (DRY) { save(DIAGRAMS, items); console.log("Dry run: nothing sent."); }
  else {
    let budgetLeft = LIMIT;
    outer: for (const [did, list] of Object.entries(queue)) {
      const dg = DIAGRAMS[did];
      for (const batch of batches(list.slice(0, Math.max(0, budgetLeft)))) {
        if (reviewSpend().costUsd >= MAX_USD) { run.stoppedFor = `reached the $${MAX_USD} cap`; break outer; }
        try {
          const raw = await review(pairingPrompt(dg, batch), 12000, { writer: GEN_MODEL, responseFormat: PAIRING_SCHEMA });
          const got = readDecisions(parseJson(raw), batch);
          const byId = new Map(batch.map((b) => [b.id, b]));
          for (const dec of got) {
            const it = byId.get(dec.id);
            const shown = shownAs(dec, it.extracted);
            decisions[decisionKey(dec.id, did)] = {
              attach: dec.attach, values_confirmed: dec.values_confirmed, reason: dec.reason,
              extracted: it.extracted, shown, itemHash: itemHash(it), diagramHash: diagramHash(dg), fp: fingerprint(it),
              reviewedAt: new Date().toISOString(), model: REVIEW_MODEL,
            };
            run.asked += 1;
            if (dec.attach) { run.attached += 1; if (shown) run.attachedWithValues += 1; } else run.rejected += 1;
          }
        } catch (e) {
          if (e instanceof FatalLlmError) { run.stoppedFor = e.message.split("\n")[0]; save(DIAGRAMS, items); throw e; }
          run.failedBatches.push({ diagram: did, ids: batch.map((b) => b.id), error: e.message.slice(0, 200) });
          console.log(`  ✗ batch failed (${e.message.slice(0, 120)}); will retry next run`);
        }
        budgetLeft -= batch.length;
        save(DIAGRAMS, items);   // after every batch: a stopped run keeps what it paid for
        console.log(`  ${did}: ${run.asked} decided so far · $${reviewSpend().costUsd.toFixed(4)}`);
      }
      if (budgetLeft <= 0) { run.stoppedFor = run.stoppedFor ?? `reached --limit ${LIMIT}`; break; }
    }
    save(DIAGRAMS, items);
    console.log(`Done${run.stoppedFor ? ` (partial: ${run.stoppedFor})` : ""}. Report: ${RUN}.md`);
  }
} catch (e) {
  console.error(e.message);
  code = 1;
} finally {
  await vite.close();
}
process.exit(code);
