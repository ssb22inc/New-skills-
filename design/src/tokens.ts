/**
 * SYCAMORE DESIGN LANGUAGE — the tokens, in one place (BUILD §3).
 *
 * Before this package the palette lived as raw hex scattered through
 * seven route files, and it had already drifted: Panel was written as
 * #12283A in two places against a spec of #11283A. A design system that
 * exists only in a markdown table is not a design system.
 *
 * Rule enforced by `design/src/design.test.ts` and by
 * `apps/web/src/tokens.test.ts`: no raw hex literal may appear in any
 * app surface. Colour arrives from here or not at all.
 */

/** The dark cockpit/seller theme — sellers and the founder work in the dark. */
export const INK = '#0B1A26' as const;
export const PANEL = '#11283A' as const;
export const LINE = '#1F3B52' as const;
export const TEXT = '#E6EEF3' as const;
/** Muted text on dark — labels, timestamps, the quiet half of a sentence. */
export const TEXT_MUTED = '#9FB3C0' as const;

/** Action + system voice. */
export const AMBER = '#F4A24C' as const;
export const TEAL = '#5BC8B0' as const;

/** Money truth: green is money in, red is money out or broken. */
export const GREEN = '#7BD8A8' as const;
export const RED = '#F26D6D' as const;

/** Newcomer/audition and executive accents. */
export const VIOLET = '#9B8CF0' as const;
export const GOLD = '#E4C15F' as const;

/** The light buyer theme — buyers browse in daylight. */
export const PAPER = '#F7F3EC' as const;
export const PAPER_TEXT = INK;
export const PAPER_MUTED = '#4A5A66' as const;
export const PAPER_LINE = '#B9C6CF' as const;
/** Ocean gradient for buyer-facing headers. */
export const OCEAN_DEEP = '#0B4F6C' as const;
export const OCEAN_BRIGHT = '#01BAEF' as const;
export const OCEAN_TINT = '#DCE9F0' as const;
/** Guarantee/reassurance panel on the light theme. */
export const MINT = '#E8F6F1' as const;

export const COLORS = {
  ink: INK,
  panel: PANEL,
  line: LINE,
  text: TEXT,
  textMuted: TEXT_MUTED,
  amber: AMBER,
  teal: TEAL,
  green: GREEN,
  red: RED,
  violet: VIOLET,
  gold: GOLD,
  paper: PAPER,
  paperText: PAPER_TEXT,
  paperMuted: PAPER_MUTED,
  paperLine: PAPER_LINE,
  oceanDeep: OCEAN_DEEP,
  oceanBright: OCEAN_BRIGHT,
  oceanTint: OCEAN_TINT,
  mint: MINT,
} as const;

export type ColorToken = keyof typeof COLORS;

/**
 * Type. Fraunces/Inter/Space Mono are the brand faces; each falls back
 * to a system face so a seller on a cheap Android with no webfont
 * budget still gets a sane page. Numbers are ALWAYS mono — money must
 * look like money (BUILD §3).
 */
export const FONT_DISPLAY = "Fraunces, Georgia, 'Times New Roman', serif" as const;
export const FONT_UI = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" as const;
export const FONT_MONO = "'Space Mono', ui-monospace, SFMono-Regular, monospace" as const;

export const FONTS = { display: FONT_DISPLAY, ui: FONT_UI, mono: FONT_MONO } as const;

/** Spacing and radius — one scale, so screens agree with each other. */
export const SPACE = { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' } as const;
export const RADIUS = { sm: '8px', md: '12px', lg: '16px' } as const;

/** Every hex the design language admits — the allow-list the tests use. */
export const ALLOWED_HEX: readonly string[] = Object.values(COLORS);
