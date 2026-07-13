/* Persisted-state migration (PULSERN_BUILD.md §4 — the contract is FROZEN).
   Normalizes any saved blob — including legacy saves that predate the
   ability/plan keys — into the full current shape. Existing keys are never
   renamed or repurposed; missing keys get defaults. Derived values
   (readiness, weak areas) are recomputed elsewhere, never stored. */
import { emptyAbility } from "./ability-engine.js";

export function migrateBlob(s, cats) {
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
    ability: { ...emptyAbility(cats), ...(s.ability ?? {}) },
    plan: s.plan ?? null,
    examDate: s.examDate ?? null,
    tourSeen: s.tourSeen ?? false,
  };
}
