/* Count bank items with nothing the voice can read.
   ------------------------------------------------
   A question, case study or card that has no speakable passage stays silent
   no matter how fast Listen is. This walks rows already loaded (the same
   shape the voice job reads) and prints the ones itemParts() drops.

   Usage, from pulsern/:
     node ops/audit-speakable.mjs questions.json cases.json cards.json
   Each file is a JSON array of bank rows. With no files, the built-in
   examples run so the script can be checked on its own. */
import { readFileSync } from "node:fs";
import { hasSpeakablePassage, itemParts } from "../src/read-aloud-script.js";

export function unspeakableItems(kind, rows) {
  const out = [];
  for (const row of rows ?? []) {
    if (hasSpeakablePassage(kind, row)) continue;
    out.push({ id: row.id, parts: itemParts(kind, row).length });
  }
  return out;
}

const examples = {
  question: [
    { id: 1, type: "mc", stem: "Which value is the priority?", options: ["Potassium 2.9."], rationale: "Low potassium." },
    { id: 2, type: "mc", stem: "2 · DBP only", options: ["2 · DBP"], rationale: "2 · DBP" },
  ],
  case: [
    { id: 6, title: "Digoxin Toxicity · Elderly Client", intro: "Margaret is admitted.", vitals: [], labs: [], note: "", steps: [] },
  ],
  card: [
    { id: 3, front: "Name the antidote.", back: "Digoxin immune fab." },
  ],
};

function load(path, kind) {
  if (!path) return examples[kind];
  return JSON.parse(readFileSync(path, "utf8"));
}

const isMain = process.argv[1]?.endsWith("audit-speakable.mjs");
if (isMain) {
  const [qPath, cPath, kPath] = process.argv.slice(2);
  const report = {
    question: unspeakableItems("question", load(qPath, "question")),
    case: unspeakableItems("case", load(cPath, "case")),
    card: unspeakableItems("card", load(kPath, "card")),
  };
  const summary = Object.fromEntries(Object.entries(report).map(([k, rows]) => [k, rows.length]));
  console.log(JSON.stringify({ summary, ids: Object.fromEntries(Object.entries(report).map(([k, rows]) => [k, rows.map((r) => r.id)])) }, null, 2));
  if (qPath && (summary.question || summary.case || summary.card)) process.exitCode = 1;
}
