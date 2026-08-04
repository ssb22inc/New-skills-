import { describe, expect, it } from 'vitest';
import { ALLOWED_HEX, COLORS, FONTS, RADIUS, SPACE, darkTheme, lightTheme } from './index.js';

/**
 * The design system's own tests. The repo-wide "no raw hex in an app
 * surface" law lives in tests/src/design/tokens.test.ts; these are the
 * invariants of the package itself.
 */
describe('@sycamore/design', () => {
  it('every token is a valid 6-digit hex', () => {
    for (const [name, value] of Object.entries(COLORS)) {
      expect(value, `${name} is not a hex colour`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('token names are unique values — no two names for one colour', () => {
    // Two names for one hex is how a palette starts drifting: somebody
    // "fixes" one and not the other.
    const seen = new Map<string, string>();
    for (const [name, value] of Object.entries(COLORS)) {
      const clash = seen.get(value);
      // paperText deliberately aliases INK: buyer text IS the ink colour.
      if (clash && !(name === 'paperText' || clash === 'paperText')) {
        throw new Error(`${name} and ${clash} are both ${value}`);
      }
      seen.set(value, name);
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it('ALLOWED_HEX covers every declared colour', () => {
    expect(new Set(ALLOWED_HEX)).toEqual(new Set(Object.values(COLORS)));
  });

  it('both themes render as non-empty CSS with no unresolved template holes', () => {
    for (const css of [darkTheme(), lightTheme()]) {
      expect(css.length).toBeGreaterThan(200);
      expect(css).not.toContain('undefined');
      expect(css).not.toContain('${');
    }
  });

  it('themes stay small — the trust page has a byte budget', () => {
    // <100KB total for the whole page; a stylesheet is not where that
    // budget gets spent.
    expect(Buffer.byteLength(lightTheme())).toBeLessThan(4_000);
    expect(Buffer.byteLength(darkTheme())).toBeLessThan(4_000);
  });

  it('every brand face carries a system fallback', () => {
    for (const stack of Object.values(FONTS)) {
      expect(stack.split(',').length).toBeGreaterThan(1);
    }
  });

  it('the spacing and radius scales are one scale, in px', () => {
    for (const value of [...Object.values(SPACE), ...Object.values(RADIUS)]) {
      expect(value).toMatch(/^\d+px$/);
    }
  });
});
