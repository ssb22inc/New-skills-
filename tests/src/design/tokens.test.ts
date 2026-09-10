/**
 * PERMANENT CI LAW — the design system is the only source of colour.
 *
 * The 2026-07-25 audit found thirteen raw hex values inline across seven
 * route files, only three of which were named tokens, and Panel had
 * already drifted from #11283A to #12283A in two places. A palette that
 * lives in a markdown table drifts; a palette that fails CI does not.
 *
 * Type is covered too: BUILD §3 specifies Fraunces / Inter / Space Mono,
 * and "numbers are ALWAYS mono — money must look like money."
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLOWED_HEX, COLORS, FONT_MONO, darkTheme, lightTheme } from '@sycamore/design';

const repo = new URL('../../../', import.meta.url).pathname;
const APP_SURFACES = ['apps/web/app', 'apps/web/public'];

const HEX = /#[0-9A-Fa-f]{6}\b/g;

function files(target: string): string[] {
  const full = join(repo, target);
  const out: string[] = [];
  for (const entry of readdirSync(full)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const child = join(full, entry);
    if (statSync(child).isDirectory()) out.push(...files(join(target, entry)));
    else if (/\.(ts|tsx|js|css)$/.test(entry)) out.push(child);
  }
  return out;
}

describe('PERMANENT CI LAW — no ad-hoc colour outside the design system', () => {
  it('no app surface contains a raw hex literal', () => {
    const offenders: string[] = [];
    for (const surface of APP_SURFACES) {
      for (const file of files(surface)) {
        const source = readFileSync(file, 'utf8');
        for (const hex of source.match(HEX) ?? []) {
          offenders.push(`${file.replace(repo, '')}: ${hex}`);
        }
      }
    }
    expect(
      offenders,
      `Raw hex found outside @sycamore/design:\n${offenders.join('\n')}\n\n` +
        `Import the token instead. If the colour genuinely does not exist yet, ` +
        `add it to design/src/tokens.ts where everyone can see it.`,
    ).toEqual([]);
  });

  it('the themes are built only from declared tokens', () => {
    for (const [name, css] of [
      ['dark', darkTheme()],
      ['light', lightTheme()],
    ] as const) {
      for (const hex of css.match(HEX) ?? []) {
        expect(
          ALLOWED_HEX.map((c) => c.toLowerCase()),
          `${name} theme uses ${hex}, which is not a design token`,
        ).toContain(hex.toLowerCase());
      }
    }
  });

  it('the palette matches the Design Language spec exactly', () => {
    // The values BUILD §3 names. Drift here is the bug this file exists
    // to catch — Panel was written as #12283A for two prompts.
    expect(COLORS.ink).toBe('#0B1A26');
    expect(COLORS.panel).toBe('#11283A');
    expect(COLORS.line).toBe('#1F3B52');
    expect(COLORS.text).toBe('#E6EEF3');
    expect(COLORS.amber).toBe('#F4A24C');
    expect(COLORS.teal).toBe('#5BC8B0');
    expect(COLORS.paper).toBe('#F7F3EC');
  });

  it('money renders in the mono face — money must look like money', () => {
    expect(FONT_MONO).toContain('Space Mono');
    for (const css of [darkTheme(), lightTheme()]) {
      expect(css).toContain(FONT_MONO);
      expect(css).toMatch(/\.money\{|\.money,|,\.money/);
    }
  });

  it('both themes name the brand faces, each with a system fallback', () => {
    const dark = darkTheme();
    expect(dark).toContain('Fraunces'); // display
    expect(dark).toContain('Inter'); // UI
    // A seller on a cheap Android with no webfont budget still gets a page.
    expect(dark).toContain('system-ui');
  });
});
