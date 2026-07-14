/* Persisted-state migration (PULSERN_BUILD.md §4 — the contract is FROZEN).
   Normalizes any saved blob — including legacy saves that predate the
   ability/plan keys — into the full current shape. Existing keys are never
   renamed or repurposed; missing keys get defaults. Derived values
   (readiness, weak areas) are recomputed elsewhere, never stored. */
import { emptyAbility } from "./ability-engine.js";

/* Category renames from the test-plan alignment: ability history recorded
   under an old name moves to its closest official category. */
const CAT_RENAMES = { "Psychosocial & Health Promotion": "Psychosocial Integrity" };

export function migrateBlob(s, cats) {
  const ability = {};
  for (const [k, v] of Object.entries(s.ability ?? {})) ability[CAT_RENAMES[k] ?? k] = v;
  return {
    theme: s.theme ?? "light",
    xp: s.xp ?? 0,
    bestRun: s.bestRun ?? 0,
    log: Array.isArray(s.log) ? s.log : [],
    flagged: Array.isArray(s.flagged) ? s.flagged : [],
    streak: { count: 0, lastDay: null, shield: true, ...(s.streak ?? {}) },
    daily: s.daily ?? null,
    srs: Array.isArray(s.srs) ? s.srs : [],
    customQs: Array.isArray(s.customQs) ? s.customQs : [],
    provider: s.provider ?? "claude",
    ability: { ...emptyAbility(cats), ...ability },
    plan: s.plan ?? null,
    examDate: s.examDate ?? null,
    tourSeen: s.tourSeen ?? false,
    srsMap: s.srsMap ?? {},
  };
}
