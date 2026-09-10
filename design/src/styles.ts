import {
  AMBER,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
  GREEN,
  INK,
  MINT,
  OCEAN_BRIGHT,
  OCEAN_DEEP,
  OCEAN_TINT,
  PANEL,
  PAPER,
  PAPER_LINE,
  PAPER_MUTED,
  RADIUS,
  RED,
  SPACE,
  TEXT,
  TEXT_MUTED,
} from './tokens.js';

/**
 * The two themes, as stylesheets. Pages compose a `<style>` from these
 * instead of hand-writing colour, so the palette can never drift again
 * and a token change lands everywhere at once.
 *
 * Both are plain CSS strings with no imports, no webfont fetches and no
 * runtime: the buyer trust page has a <100KB / <2s-on-3G budget that is
 * a product law, and a stylesheet that costs a network round trip would
 * spend that budget on nothing.
 */

/** Sellers and the founder work in the dark cockpit theme. */
export function darkTheme(): string {
  return `
body{margin:0;background:${INK};color:${PAPER};font-family:${FONT_UI}}
main{max-width:640px;margin:0 auto;padding:${SPACE.lg}}
h1{font-family:${FONT_DISPLAY};font-weight:900;font-size:22px;margin:0 0 ${SPACE.xs}}
h2{font-size:14px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:.06em;margin:${SPACE.xl} 0 ${SPACE.sm}}
section{background:${PANEL};border-radius:${RADIUS.md};padding:14px;margin-bottom:${SPACE.md}}
p{margin:6px 0;font-size:15px}
table{width:100%;border-collapse:collapse}
td,th{text-align:left;padding:${SPACE.xs} ${SPACE.sm};font-size:14px}
button{background:${AMBER};color:${INK};border:none;border-radius:${RADIUS.md};padding:${SPACE.md} ${SPACE.lg};font-family:${FONT_UI};font-weight:700;font-size:15px}
button.ghost{background:transparent;color:${TEXT_MUTED};font-weight:400;text-decoration:underline}
.num,td.num,.money{font-family:${FONT_MONO}}
.muted{color:${TEXT_MUTED};font-size:13px}
.ok{color:${GREEN}}.warn{color:${AMBER}}.bad{color:${RED}}
.stale{color:${AMBER};font-size:13px}
[hidden]{display:none!important}
`.trim();
}

/** Buyers browse in daylight — warm paper, ocean gradient headers. */
export function lightTheme(): string {
  return `
body{margin:0;background:${PAPER};color:${INK};font-family:${FONT_UI}}
main{max-width:480px;margin:0 auto;padding:${SPACE.lg}}
header{background:linear-gradient(135deg,${OCEAN_DEEP},${OCEAN_BRIGHT});color:${PAPER};border-radius:${RADIUS.md};padding:20px}
h1{font-family:${FONT_DISPLAY};font-weight:900;margin:0;font-size:28px}
h2{font-size:16px}
article{background:${TEXT};border-radius:${RADIUS.sm};padding:${SPACE.md};margin-bottom:${SPACE.sm}}
article span{float:right;font-family:${FONT_MONO}}
.g{background:${MINT};border-radius:${RADIUS.sm};padding:${SPACE.md};margin-top:${SPACE.md}}
.muted{color:${PAPER_MUTED}}
.on-ocean{color:${OCEAN_TINT}}
.num,.money{font-family:${FONT_MONO}}
input{flex:1;border:1px solid ${PAPER_LINE};border-radius:${RADIUS.md};padding:${SPACE.md};font-family:${FONT_UI};font-size:16px}
button{background:${AMBER};border:none;border-radius:${RADIUS.md};padding:${SPACE.md} ${SPACE.lg};font-family:${FONT_UI};font-weight:700}
.cta{display:block;text-align:center;background:${AMBER};color:${INK};font-weight:700;border-radius:${RADIUS.md};padding:${SPACE.lg};margin-top:20px;text-decoration:none}
`.trim();
}
