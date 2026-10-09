/* The pure parts of the diagram-pairing run, separated so they can be
   tested without a database, a model, or money.
   ------------------------------------------------------------------
   What a pairing decision depends on is hashed: the item's own text and
   the diagram's clinical content. If either changes, the old decision no
   longer applies and the pairing is reviewed again. Nothing else
   invalidates it, so a re-run never pays twice for the same question. */
import { createHash } from "node:crypto";

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export const itemHash = (q) => sha(JSON.stringify([q.stem ?? "", q.options ?? null, q.rationale ?? "", q.answer ?? null]));

/* The parts of a diagram a pairing judgment rests on: what it claims and
   what it says. Layout changes do not re-open decisions; content does. */
export const diagramHash = (d) => sha(JSON.stringify([d.id, d.title, d.facts, d.steps.map((s) => [s.key, s.caption, s.narration])]));

export const decisionKey = (qid, did) => `${qid}:${did}`;

export function isFresh(prev, qHash, dHash) {
  return !!prev && prev.itemHash === qHash && prev.diagramHash === dHash;
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
export function buildItemMap(decisions) {
  const pairs = {};
  for (const [key, d] of Object.entries(decisions).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))) {
    if (!d.attach) continue;
    const [qid, did] = key.split(":");
    if (!d.fp) continue;   // no fingerprint, no way to show it safely
    (pairs[qid] ??= []).push(d.shown == null ? { d: did, f: d.fp } : { d: did, p: d.shown, f: d.fp });
  }
  return { version: 1, pairs };
}

/* The cache file, sorted for stable diffs. NOT JSON.stringify(obj, keys):
   a key array there is a whitelist applied at EVERY depth, which silently
   strips every field of every decision — an earlier draft did exactly that. */
export function serializeDecisions(decisions) {
  const sorted = Object.fromEntries(Object.entries(decisions).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
  return JSON.stringify(sorted, null, 2) + "\n";
}
