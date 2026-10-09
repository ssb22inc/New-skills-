/* Astra's review of a concept diagram — as a student sees it.
   ------------------------------------------------------------------
   The reviewer gets the RENDERED images (both themes, every animation step)
   together with every clinical claim, caption and narration script. A
   diagram can be wrong in ways its source code hides — an arrow pointing the
   wrong way, a label beside the wrong band, a highlight on the wrong part of
   a step — and those are only visible in the picture.

   As with code review, Astra finds and arithmetic decides: any blocker or
   major finding fails the diagram, whatever the summary says. */
import { createHash } from "node:crypto";
import { diagramHash } from "./map-diagrams-lib.mjs";

export const AREAS = ["clinical", "visual", "consistency", "accessibility", "pedagogy", "rules"];
export const SEVERITIES = ["blocker", "major", "minor"];

export const DIAGRAM_REVIEW_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "diagram_review",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["assessment", "findings"],
      properties: {
        assessment: { type: "string" },
        findings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["severity", "area", "where", "title", "problem", "fix", "confidence"],
            properties: {
              severity: { type: "string", enum: SEVERITIES },
              area: { type: "string", enum: AREAS },
              where: { type: "string" },
              title: { type: "string" },
              problem: { type: "string" },
              fix: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
          },
        },
      },
    },
  },
};

/* The images, in the order they are attached, with what each one is. */
export function imagePlan(diagram, gallery) {
  /* Every frame a student can see: the inline overview and every explainer
     step, in BOTH themes. Dark-theme step frames used to be left out, so a
     dark-only defect in a step annotation could keep a passing verdict
     (Astra, PR #133 review, finding 14). A missing frame is an error, not a
     smaller review. */
  const mine = gallery.filter((g) => g.id === diagram.id);
  const pick = (theme, key) => mine.find((g) => g.theme === theme && g.key === key);
  const plan = [];
  const missing = [];
  for (const theme of ["light", "dark"]) {
    for (const key of ["static", ...diagram.steps.map((s) => s.key)]) {
      const g = pick(theme, key);
      if (!g) { missing.push(`${theme}/${key}`); continue; }
      plan.push({ file: g.file, label: `${theme} theme — ${key === "static" ? "inline, as shown under a rationale" : `explainer step "${key}"`}` });
    }
  }
  if (missing.length) throw new Error(`imagePlan(${diagram.id}): missing rendered frames ${missing.join(", ")}`);
  return plan;
}

export function diagramReviewPrompt(diagram, plan, rulesExcerpt) {
  const steps = diagram.steps.map((s, i) => [
    `  ${i + 1}. key "${s.key}"${s.dynamic ? " (worked example — caption computed from the example values)" : ""}`,
    `     in focus: ${(s.focus ?? []).join(", ") || "(everything)"}`,
    `     caption: ${s.dynamic ? diagram.dynamicCaption?.(diagram.example) : s.caption}`,
    s.dynamic ? "     narration: (none — never recorded)" : `     narration script: ${s.narration}`,
  ].join("\n")).join("\n");
  return `You are the adversarial reviewer for PulseRN, an NCLEX-RN study app used by nursing students. Below is a concept diagram that will appear under practice-question rationales and as a step-by-step narrated explainer. It was drawn and written by a Claude model; you are from a different lab so that you do not share its blind spots. Find what is wrong before a student sees it. Do not be agreeable and do not pad.

THE DIAGRAM: "${diagram.title}" (id ${diagram.id})

Every clinical claim it makes:
${diagram.facts.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}

Explainer steps:
${steps}

Images attached, in order:
${plan.map((p, i) => `  Image ${i + 1}: ${p.label}`).join("\n")}

CHECK, AND REPORT ONLY REAL PROBLEMS:
- clinical: any claim, label, range, arrow direction, ordering or ECG/waveform shape that is wrong, outdated, overstated or unsafe by current standard nursing references for NCLEX-RN preparation. Anything that reads as real-world dosing or treatment instructions rather than exam-prep education.
- visual: the image does not show what the text says — a value marker in the wrong place, a label beside the wrong band or element, a highlight on the wrong group for the step, overlapping or clipped text, anything unreadable at phone width.
- consistency: caption, narration, picture and facts disagree with each other in any detail.
- accessibility: text too small to read on a phone, poor contrast in either theme, meaning carried by colour alone.
- pedagogy: an explanation that would leave a student with a misconception, or a step order that confuses.
- rules: the project rules below are broken (colour meanings, claims hygiene, AI labelling).

SEVERITY: blocker = wrong or unsafe clinical content, or a picture that teaches the wrong thing; major = a real error a student would notice or be misled by; minor = would improve clarity. If you are unsure, say what you could not verify and lower the confidence — do not inflate, do not omit.

"where" names the image number and/or step key and the element.

PROJECT RULES:
${rulesExcerpt}`;
}

export function validateReview(obj) {
  if (!obj || typeof obj.assessment !== "string" || !Array.isArray(obj.findings)) throw new Error("not a review");
  obj.findings.forEach((f, i) => {
    if (!SEVERITIES.includes(f.severity)) throw new Error(`finding ${i}: bad severity`);
    if (!AREAS.includes(f.area)) throw new Error(`finding ${i}: bad area`);
    for (const k of ["where", "title", "problem", "fix"]) if (typeof f[k] !== "string" || !f[k].trim()) throw new Error(`finding ${i}: missing ${k}`);
  });
  return obj;
}

export function verdictFor(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of findings) counts[f.severity] += 1;
  return { verdict: counts.blocker + counts.major ? "FAIL" : "PASS", counts };
}

/* What a verdict rests on: the diagram's words and its rendered pixels. If
   neither changed, the earlier verdict still stands and is not paid for
   again; if either changed, it is reviewed again. */
export function reviewKey(diagram, pngBuffers) {
  const h = createHash("sha256").update(diagramHash(diagram));
  for (const b of pngBuffers) h.update(b);
  return h.digest("hex").slice(0, 16);
}

export function renderReviewMarkdown(r) {
  const rank = (s) => SEVERITIES.indexOf(s);
  const lines = [
    `# Astra diagram review — ${r.title} — ${r.verdict}`, "",
    `| | |`, `|---|---|`,
    `| Reviewer | \`${r.model}\` |`,
    `| Reviewed at | ${r.reviewedAt} |`,
    `| Images | ${r.images} |`,
    `| Cost | ${r.usage?.costUsd != null ? `$${r.usage.costUsd.toFixed(4)}` : "unknown"} |`,
    r.counts ? `| Findings | ${r.counts.blocker} blocker · ${r.counts.major} major · ${r.counts.minor} minor |` : `| Findings | — |`,
    "",
  ];
  if (r.error) return [...lines, "## The review did not complete", "", r.error, "", "Recorded as a failure: an unfinished review is not a pass.", ""].join("\n");
  lines.push("## Assessment", "", r.assessment || "_(none)_", "");
  if (r.findings.length) {
    lines.push("## Findings", "");
    [...r.findings].sort((a, b) => rank(a.severity) - rank(b.severity)).forEach((f, i) => {
      lines.push(`### ${i + 1}. [${f.severity} · ${f.area}] ${f.title}`, "", `- **Where:** ${f.where} · confidence ${f.confidence}`, `- **Problem:** ${f.problem}`, `- **Fix:** ${f.fix}`, "");
    });
  } else lines.push("_No findings._", "");
  return lines.join("\n");
}

/* May an earlier result be reused instead of paying for a new review?
   Only a COMPLETED review of byte-identical images. An operational error —
   timeout, bad key, malformed answer — is not a verdict and is retried on
   the next run (Astra, PR #134 review, round 6: errors were cached as FAIL,
   and the normal re-run could never recover). */
export const canReuse = (prev, key, force = false) => !force && !!prev && prev.key === key && prev.completed === true;

/* One diagram's review. `ask` returns the reviewer's parsed answer. The
   result says whether a valid review completed, separately from what it
   concluded. */
export async function reviewOne({ d, key, images, ask, model, now = () => new Date().toISOString(), cost = () => null }) {
  const r = { id: d.id, title: d.title, model, reviewedAt: now(), images, key, findings: [], usage: null, error: null, completed: false };
  try {
    const parsed = validateReview(await ask());
    r.usage = { costUsd: cost() };
    r.assessment = parsed.assessment;
    r.findings = parsed.findings;
    Object.assign(r, verdictFor(parsed.findings));
    r.completed = true;
  } catch (e) {
    r.error = String(e?.message ?? e);
    r.verdict = "ERROR";   // not a clinical verdict; never PASS, never cached
  }
  return r;
}
