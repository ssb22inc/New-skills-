/**
 * PERMANENT CI LAW — no hardcoded user-facing strings.
 *
 * CLAUDE.md data rules: "No hardcoded user-facing strings. All copy goes
 * through the localization engine and is driven by Context Pack
 * directives. Zero hardcoded fallbacks — a missing pack field is a load
 * error, not a silent default."
 *
 * The 2026-07-25 completion audit found 53 English sentences sitting in
 * `core/src` and 15 more in web page HTML. Every one of them would have
 * shipped verbatim into a Spanish-speaking market. This test is why that
 * cannot happen again.
 *
 * SCOPE — deliberately drawn, and drawn narrowly enough to be honest:
 * modules that talk to SELLERS and BUYERS must own no sentences.
 * Founder/operator surfaces (the cockpit, runbook step descriptions,
 * agent internals) are one person's working vocabulary and are exempt;
 * error messages thrown at developers are exempt. Both exemptions are
 * listed below rather than left to taste.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogueKeys, loadContextPack, loadCopy, t } from '@sycamore/packs';

const repo = new URL('../../../', import.meta.url).pathname;

/** Modules whose output reaches a seller or a buyer. */
const USER_FACING_DIRS = [
  'core/src/shoebox',
  'core/src/hurricane',
  'core/src/lifeline',
  'core/src/settlement',
  'core/src/pulse',
  'core/src/trust',
  'core/src/orders',
  'core/src/capacity',
  'core/src/genesis',
  'core/src/conversations',
  'core/src/agents/mentor.ts',
  'core/src/agents/chairman.ts',
];

/** Buyer- and seller-facing web surfaces. The cockpit is founder-only. */
const USER_FACING_PAGES = [
  'apps/web/app/t',
  'apps/web/app/c',
  'apps/web/app/s',
  'apps/web/app/why',
];

/**
 * Named exemptions, with the reason written down. An exemption you have
 * to name in a test file is an exemption somebody will argue with; a
 * silent one is an exemption nobody ever revisits.
 */
const EXEMPT: Record<string, string> = {
  'core/src/hurricane/runbook.ts':
    'operator runbook steps — read by the founder during a drill, never sent to a user',
};

/**
 * A "sentence" for this test: a quoted run of prose starting with a
 * capital, containing a space, long enough that it cannot be an
 * identifier. Developer-facing throws are excluded by keyword — an
 * exception message is not product copy.
 */
const SENTENCE = /(['"`])([A-Z][a-z]+ [^'"`\n]{12,})\1/g;
const DEVELOPER_TEXT =
  /error|invalid|unknown|expected|must |cannot|refus|missing|not used|no handler|unsupported|failed|already |blocked|deprecated/i;

function sourceFiles(target: string): string[] {
  const full = join(repo, target);
  if (statSync(full).isFile()) return [full];
  const out: string[] = [];
  for (const entry of readdirSync(full)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const child = join(full, entry);
    if (statSync(child).isDirectory()) out.push(...sourceFiles(join(target, entry)));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) out.push(child);
  }
  return out;
}

/** Strip comments — prose in a comment is documentation, not copy. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** LLM system prompts instruct a model; they are not shown to anyone. */
function withoutSystemPrompts(source: string): string {
  return source.replace(/system:[\s\S]*?(?=\n\s{4,6}[a-zA-Z]+:|\n\s*\}\)?;)/g, 'system:…,');
}

function offendersIn(target: string): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(target)) {
    if (EXEMPT[file.replace(repo, '')]) continue;
    const code = withoutSystemPrompts(codeOnly(readFileSync(file, 'utf8')));
    for (const match of code.matchAll(SENTENCE)) {
      const sentence = match[2]!;
      if (DEVELOPER_TEXT.test(sentence)) continue;
      found.push(`${file.replace(repo, '')}: "${sentence.slice(0, 60)}"`);
    }
  }
  return found;
}

describe('PERMANENT CI LAW — user-facing copy lives in packs, never in code', () => {
  it('no seller- or buyer-facing core module contains a hardcoded sentence', () => {
    const offenders = USER_FACING_DIRS.flatMap(offendersIn);
    expect(
      offenders,
      `Hardcoded user-facing copy found:\n${offenders.join('\n')}\n\n` +
        `Move the sentence into packs/copy/<language>.yaml and render it with ` +
        `translator(pack)('some.key'). A market cannot ship in another market's words.`,
    ).toEqual([]);
  });

  it('no seller- or buyer-facing page contains a hardcoded sentence', () => {
    const offenders = USER_FACING_PAGES.flatMap(offendersIn);
    expect(offenders, `Hardcoded page copy found:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('the localization engine itself', () => {
  it('every language catalogue defines every key the base English one does', () => {
    const base = catalogueKeys('en');
    expect(base.length).toBeGreaterThan(50);
    const spanish = catalogueKeys('es');
    const missing = base.filter((k) => !spanish.includes(k));
    const extra = spanish.filter((k) => !base.includes(k));
    expect(missing, `es.yaml is missing keys: ${missing.join(', ')}`).toEqual([]);
    expect(extra, `es.yaml has keys en.yaml does not: ${extra.join(', ')}`).toEqual([]);
  });

  it('a market override wins over its language, and the language over the base', () => {
    const jm = loadCopy(loadContextPack('jm'));
    // jm.yaml overrides the disclaimer to name Jamaica's tax authority.
    expect(t(jm, 'shoebox.disclaimer')).toContain('TAJ');
    // …while inheriting everything it does not override.
    expect(t(jm, 'settlement.payout', { amount: 'J$1,000.00' })).toContain('J$1,000.00');

    // A Spanish market gets Spanish, with no English leaking through.
    const dom = loadCopy(loadContextPack('do'));
    expect(t(dom, 'shoebox.disclaimer')).not.toContain('TAJ');
    expect(t(dom, 'hurricane.freeze')).toContain('tormenta');
  });

  it('a missing key throws — there is no silent English fallback', () => {
    const jm = loadCopy(loadContextPack('jm'));
    expect(() => t(jm, 'nope.not_a_key')).toThrowError(/no copy for "nope.not_a_key"/);
  });

  it('a placeholder with no value throws rather than rendering "undefined"', () => {
    const jm = loadCopy(loadContextPack('jm'));
    expect(() => t(jm, 'settlement.payout')).toThrowError(/needs a value for \{amount\}/);
  });

  it('every market in the registry can load a complete catalogue', () => {
    for (const market of [
      'jm',
      'do',
      'mx',
      'tt',
      'bb',
      'bs',
      'gy',
      'bz',
      'lc',
      'gd',
      'vc',
      'ag',
      'kn',
      'dm',
    ]) {
      const catalogue = loadCopy(loadContextPack(market));
      for (const key of catalogueKeys('en')) {
        expect(catalogue.keys.has(key), `${market} is missing copy for "${key}"`).toBe(true);
      }
    }
  });
});
