/* The pure parts of the diagram-pairing run, separated so they can be
   tested without a database, a model, or money.
   ------------------------------------------------------------------
   What a pairing decision depends on is hashed: the item's own text and
   the diagram's clinical content. If either changes, the old decision no
   longer applies and the pairing is reviewed again. Nothing else
   invalidates it, so a re-run never pays twice for the same question. */
import { createHash } from "node:crypto";
import { diagramFp, fingerprint } from "../src/diagrams/fingerprint.js";

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export const itemHash = (q) => sha(JSON.stringify([q.stem ?? "", q.options ?? null, q.rationale ?? "", q.answer ?? null]));

/* The parts of a diagram a pairing judgment rests on: what it claims and
   what it says. Layout changes do not re-open decisions; content does. */
export const diagramHash = (d) => sha(JSON.stringify([d.id, d.title, d.facts, d.steps.map((s) => [s.key, s.caption, s.narration])]));

export const decisionKey = (qid, did) => `${qid}:${did}`;

export function isFresh(prev, qHash, dHash) {
  return !!prev && prev.itemHash === qHash && prev.diagramHash === dHash;
}

/* A pairing decision is the paid reviewer's, so the paid job signs it
   (ops/attest.mjs). The cache lives in the branch: an unsigned or edited
   decision is never reused and never published (Astra, PR #134 review,
   round 26: a cached "attach" with altered values skipped the reviewer
   and shipped other numbers). What is published is derived from the
   signed fields, never from a separate cached copy. */
const decisionFields = (key, d) => [key, d.attach ?? null, d.values_confirmed ?? null, d.extracted ?? null, d.itemHash ?? null, d.diagramHash ?? null, d.reviewedAt ?? null, d.model ?? null];
export const signDecision = (key, d, signer) => signer.sign("pairing-decision", decisionFields(key, d));
export function verifyDecision(key, d, verifier) {
  if (typeof verifier?.verify !== "function") throw new Error("verifyDecision: no public key to check the signature with");
  return !!d && verifier.verify("pairing-decision", decisionFields(key, d), d.sig);
}
/* The published map is signed too, so CI can tell a map the paid mapper
   wrote from one written by hand. */
const mapFields = (m) => [JSON.stringify({ version: m?.version ?? null, sourceKey: m?.sourceKey ?? null, pairs: m?.pairs ?? null })];
export const signMap = (m, signer) => ({ ...m, sig: signer.sign("item-map", mapFields(m)) });
export function verifyMap(m, verifier) {
  if (typeof verifier?.verify !== "function") throw new Error("verifyMap: no public key to check the signature with");
  return !!m && verifier.verify("item-map", mapFields(m), m.sig);
}

export const BATCH_SIZE = 15;
export function batches(list, size = BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export const PAIRING_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "diagram_pairings",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["decisions"],
      properties: {
        decisions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "attach", "values_confirmed", "reason"],
            properties: {
              id: { type: "integer" },
              attach: { type: "boolean" },
              values_confirmed: { type: ["boolean", "null"] },
              reason: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export function pairingPrompt(diagram, items) {
  return `You are the adversarial reviewer for PulseRN, an NCLEX-RN study app. A concept diagram may be shown inside the rationale of practice questions. Decide, question by question, whether showing THIS diagram with THIS question helps a nursing student and is clinically safe.

THE DIAGRAM: "${diagram.title}"
It makes exactly these clinical claims:
${diagram.facts.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}
It teaches, step by step:
${diagram.steps.filter((s) => !s.dynamic).map((s) => `  - ${s.caption}`).join("\n")}

ATTACH (attach: true) only if ALL hold:
- The question's keyed answer or rationale turns on the concept this diagram teaches — not a passing mention (a lab value listed in passing, a fluid named only as a line flush, a different main concept).
- Nothing in the diagram contradicts the question's stem, keyed answer or rationale.
- Seeing the diagram would not give away the answer to a DIFFERENT, unanswered part of the question.
When in doubt, do not attach. A missing diagram costs little; a wrong one teaches the wrong thing.

VALUES. Some questions come with values read automatically from the stem ("extracted"). If extracted is not null, set values_confirmed true ONLY if every extracted number appears in the stem exactly, belongs to the one client the question is about, and is the value the question asks the student to interpret. Otherwise false. If extracted is null, values_confirmed must be null.

Give a one-sentence reason for every decision. Return a decision for every id below, and no others.

QUESTIONS:
${items.map((it) => JSON.stringify({
  id: it.id,
  stem: it.stem,
  options: it.options ?? null,
  keyed_answer: it.answer ?? null,
  rationale: it.rationale,
  extracted: it.extracted ?? null,
})).join("\n")}`;
}

/* Turns the reviewer's answer into decisions, refusing anything that does
   not account for exactly the ids asked about. A partial answer is not
   read as "the rest are no": the batch is reported as failed and retried
   on the next run. */
export function readDecisions(answer, items) {
  const asked = new Set(items.map((i) => i.id));
  const got = Array.isArray(answer?.decisions) ? answer.decisions : null;
  if (!got) throw new Error("no decisions array");
  const seen = new Set();
  for (const d of got) {
    if (!asked.has(d.id)) throw new Error(`decision for id ${d.id}, which was not asked about`);
    if (seen.has(d.id)) throw new Error(`two decisions for id ${d.id}`);
    seen.add(d.id);
    if (typeof d.attach !== "boolean") throw new Error(`id ${d.id}: attach is not a boolean`);
  }
  if (seen.size !== asked.size) throw new Error(`answered ${seen.size} of ${asked.size} questions`);
  return got;
}

/* What a student is shown, from a decision. Values are kept only when the
   reviewer confirmed them; an attached diagram with unconfirmed values is
   shown as a concept, never with the unconfirmed numbers. */
export function shownAs(decision, extracted) {
  if (!decision.attach) return null;
  return extracted && decision.values_confirmed === true ? extracted : null;
}

/* The shipped map: only attached pairs, deterministic order so a re-run
   with the same decisions produces a byte-identical file and a clean diff. */
export function buildItemMap(decisions, diagrams, sourceKey = null, items = null) {
  const pairs = {};
  for (const [key, d] of Object.entries(decisions).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))) {
    if (!d.attach) continue;
    const [qid, did] = key.split(":");
    /* The question fingerprint is computed NOW from the current question,
       never copied from the cache: a cached value from an older algorithm
       would make the app hide the pairing silently (Astra, PR #134 review,
       round 7). Safe without a new paid review, because itemHash already
       binds the decision to exactly the question that was reviewed. */
    const q = items?.get(Number(qid));
    if (!q) continue;      // no current question, nothing to fingerprint
    const dg = diagrams?.[did];
    if (!dg) continue;     // no diagram, no content to bind the pairing to
    const f = fingerprint(q), v = diagramFp(dg);
    const shown = shownAs(d, d.extracted);   // from the signed fields, never a cached copy
    (pairs[qid] ??= []).push(shown == null ? { d: did, f, v } : { d: did, p: shown, f, v });
  }
  /* sourceKey: the drawing code this map was built against. A map with
     pairings must be rebuilt after any drawing or matcher change
     (tests/diagram-gate.test.js), which re-checks every pairing. */
  return sourceKey ? { version: 2, sourceKey, pairs } : { version: 2, pairs };
}

/* The cache file, sorted for stable diffs. NOT JSON.stringify(obj, keys):
   a key array there is a whitelist applied at EVERY depth, which silently
   strips every field of every decision — an earlier draft did exactly that. */
export function serializeDecisions(decisions) {
  const sorted = Object.fromEntries(Object.entries(decisions).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
  return JSON.stringify(sorted, null, 2) + "\n";
}

/* The decisions that may ship: still about the current question and the
   current diagram, AND for a diagram whose visual review passes as it is
   now (`approved(id)`). Anything else is held back — fail closed. */
export function publishable(decisions, items, diagrams, approved, proposals = null, verifier = null) {
  if (typeof verifier?.verify !== "function") throw new Error("publishable: no public key to check decisions with");
  const out = {};
  for (const [key, d] of Object.entries(decisions)) {
    if (!verifyDecision(key, d, verifier)) continue;
    const [qid, did] = key.split(":");
    const q = items.get(Number(qid));
    const dg = diagrams[did];
    if (!(q && dg && approved(did) && d.itemHash === itemHash(q) && d.diagramHash === diagramHash(dg))) continue;
    if (proposals && !sameProposal(proposals.get(Number(qid)), did, d.extracted)) continue;
    out[key] = d;
  }
  return out;
}

/* Does today's matcher still propose this diagram for the question, reading
   the SAME values the pairing review confirmed? A narrowed matcher (the
   long-acting row now excludes detemir) must retire the old pairing, not
   keep drawing the old values (Astra, PR #134 review). */
export function sameProposal(proposed, did, extracted) {
  const p = (proposed ?? []).find((x) => x.d === did);
  return !!p && JSON.stringify(p.p ?? null) === JSON.stringify(extracted ?? null);
}

/* The paid part of a pairing run: ask the reviewer about each batch, record
   every decision, and keep going past a failed batch — but count it, so the
   run cannot end looking successful (Astra, PR #133 review, finding 12).
   Everything that costs money or touches the network is passed in, so this
   is tested with a reviewer that throws. */
export async function pairAll({ queue, diagrams, decisions, run, limit = Infinity, maxUsd, ask, spent, isFatal = () => false, onBatch = () => {}, fingerprintOf, model, signer, now = () => new Date().toISOString() }) {
  if (typeof signer?.sign !== "function") throw new Error("pairAll: no signing key — a decision that cannot be signed is not recorded");
  let budgetLeft = limit;
  outer: for (const [did, list] of Object.entries(queue)) {
    const dg = diagrams[did];
    for (const batch of batches(list.slice(0, Math.max(0, budgetLeft)))) {
      if (spent() >= maxUsd) { run.stoppedFor = `reached the $${maxUsd} cap`; break outer; }
      try {
        const got = readDecisions(await ask(dg, batch), batch);
        const byId = new Map(batch.map((b) => [b.id, b]));
        for (const dec of got) {
          const it = byId.get(dec.id);
          const shown = shownAs(dec, it.extracted);
          const key = decisionKey(dec.id, did);
          const record = {
            attach: dec.attach, values_confirmed: dec.values_confirmed, reason: dec.reason,
            extracted: it.extracted, shown, itemHash: itemHash(it), diagramHash: diagramHash(dg), fp: fingerprintOf(it),
            reviewedAt: now(), model,
          };
          decisions[key] = { ...record, sig: signDecision(key, record, signer) };
          run.asked += 1;
          if (dec.attach) { run.attached += 1; if (shown) run.attachedWithValues += 1; } else run.rejected += 1;
        }
      } catch (e) {
        if (isFatal(e)) { run.stoppedFor = e.message.split("\n")[0]; onBatch(); throw e; }
        run.failedBatches.push({ diagram: did, ids: batch.map((b) => b.id), error: String(e.message).slice(0, 200) });
      }
      budgetLeft -= batch.length;
      onBatch();   // after every batch: a stopped run keeps what it paid for
    }
    if (budgetLeft <= 0) { run.stoppedFor = run.stoppedFor ?? `reached --limit ${limit}`; break; }
  }
  return run;
}

/* 0 only when every batch that was asked got an answer. */
export const exitCodeFor = (run) => (run.failedBatches.length ? 1 : 0);
