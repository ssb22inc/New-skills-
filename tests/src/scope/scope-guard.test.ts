/**
 * THE SCOPE GUARD (permanent CI law).
 *
 * Sycamore is WhatsApp-first commerce for Caribbean micro-entrepreneurs.
 * On 2026-07-25 an off-spec "study app" module (sign-up + daily study
 * reminders + course enrollment) was built into this repo because an
 * agent took a feature request at face value instead of checking it
 * against the spec. It cost a full build-and-revert cycle.
 *
 * This test makes that class of mistake impossible to commit quietly:
 *
 *   1. Every module directory under core/src MUST be registered below,
 *      with the BUILD/PROMPTS section that authorizes it. A new module
 *      fails CI until someone writes down which prompt asked for it.
 *   2. Vocabulary from other product domains may not appear in Sycamore
 *      source. If the words below start showing up, the build has
 *      drifted into somebody else's app.
 *
 * If you are an agent and this test fails: STOP. Do not add your module
 * to the registry to make the test pass. Ask the founder whether the
 * feature belongs to Sycamore at all — that question is the whole point
 * of this file.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE_SRC = new URL('../../../core/src', import.meta.url).pathname;
const SOURCE_ROOTS = ['core/src', 'adapters/src', 'packs/src', 'apps', 'tests/src'].map(
  (p) => new URL(`../../../${p}`, import.meta.url).pathname,
);

/**
 * Every core module → the spec section that authorizes it. Adding a row
 * here is a claim that SYCAMORE_BUILD.md or SYCAMORE_PROMPTS.md asked
 * for it. Making that claim falsely is how the study app got in.
 */
const AUTHORIZED_MODULES: Record<string, string> = {
  db: 'P2 — database core + migrations',
  flags: 'P6 — feature flags + canary',
  canary: 'P6 — feature flags + canary',
  observability: 'P6 — observability',
  markets: 'P6.5 — market registry & region lockdown',
  identity: 'P7 — identity + readiness gate',
  capacity: 'P8 — capacity engine',
  orders: 'P9 — orders + completion verification',
  conversations: 'P10 — conversations + intent engine',
  autopilot: 'P11 — Autopilot end-to-end',
  voice: 'P12 — voice pipeline',
  genesis: 'P13 — Genesis flow',
  ledger: 'P15 — double-entry ledger',
  payments: 'P16 — payment adapter + links',
  settlement: 'P17 — splits, release, payouts',
  trust: 'P18/P20 — disputes, verified reviews',
  shoebox: 'P19 — the Shoebox',
  discovery: 'P21/P22 — ranking, overflow, bundles',
  pulse: 'P23/P24/P26 — signals, campaigns, co-op pools',
  studio: 'P25 — Studio speak-to-create',
  agents: 'P27–P30 — the Keeper crew',
  hurricane: 'P32 — Hurricane Mode',
  passport: 'P33 — Credit Passport v1',
  lifeline: 'P34 — Lifeline (offline & low-bandwidth)',
  sovereignty: 'P35 — channel sovereignty',
};

/**
 * Vocabulary that belongs to OTHER products, not to Sycamore. These are
 * the words the study app brought with it; a housing app or an LMS would
 * bring their own. Keep this list to terms that are unambiguous domain
 * markers — never generic engineering words.
 */
const FOREIGN_DOMAIN_TERMS = [
  'study_enrollment',
  'studyEnrollment',
  'courseEnrollment',
  'reminderTick',
  'academyService',
  'lessonPlan',
  'curriculum',
  'quizAttempt',
  'landlord', // haven/ is a separate project and must stay separate
  'listingMatch',
];

function directoriesUnder(dir: string): string[] {
  return readdirSync(dir).filter((entry) => statSync(join(dir, entry)).isDirectory());
}

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFilesUnder(full));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('THE SCOPE GUARD — Sycamore builds only Sycamore', () => {
  it('every core module is authorized by a named prompt in the spec', () => {
    const unauthorized = directoriesUnder(CORE_SRC).filter((d) => !(d in AUTHORIZED_MODULES));
    expect(
      unauthorized,
      `Unregistered module(s) in core/src: ${unauthorized.join(', ')}.\n` +
        `If a prompt in SYCAMORE_PROMPTS.md asked for this, add it to AUTHORIZED_MODULES ` +
        `with that prompt's name. If no prompt did — it does not belong in Sycamore. ASK FIRST.`,
    ).toEqual([]);
  });

  it("no other product's vocabulary has leaked into Sycamore source", () => {
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFilesUnder(root)) {
        if (file.includes('/scope/')) continue; // this file names the terms on purpose
        const source = readFileSync(file, 'utf8');
        for (const term of FOREIGN_DOMAIN_TERMS) {
          if (source.includes(term)) offenders.push(`${file}: "${term}"`);
        }
      }
    }
    expect(
      offenders,
      `Foreign domain vocabulary found:\n${offenders.join('\n')}\n` +
        `Sycamore is WhatsApp-first commerce. These words belong to a different product.`,
    ).toEqual([]);
  });

  it('the spec files that define scope are present and non-empty', () => {
    // A scope guard is worthless if the thing it guards against can be
    // deleted. These four files ARE the definition of "in scope".
    for (const spec of [
      'SYCAMORE_BUILD.md',
      'SYCAMORE_PROMPTS.md',
      'SYCAMORE_SURVIVABILITY.md',
      'CLAUDE.md',
    ]) {
      const path = new URL(`../../../${spec}`, import.meta.url).pathname;
      expect(readFileSync(path, 'utf8').length, `${spec} is missing or empty`).toBeGreaterThan(500);
    }
  });
});
