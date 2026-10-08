/* Drawing kit for PulseRN concept diagrams.
   ------------------------------------------------------------------
   Every diagram is drawn on a 360-unit-wide canvas because the app is
   mobile-first: at a 340px phone width, 1 unit ≈ 0.94px, so 12-unit text
   stays readable without zooming. On desktop the same drawing scales up.

   Colour comes from the app's own tokens (var(--teal) etc.), so diagrams
   follow light and dim themes with no extra work, and the design rules in
   CLAUDE.md hold by construction:
     teal  — the concept, normal, "do this"
     coral — ONLY the dangerous/critical state
     amber — ONLY caution
   No new colours, no stock imagery.

   Animated explainers are the same drawing stepped through: each element
   belongs to a named group, and a step says which groups are in focus.
   Out-of-focus groups dim rather than disappear, so the learner keeps their
   bearings. Transitions are opacity/transform only and switch off under
   prefers-reduced-motion. */
import React from "react";

export const W = 360;
export const MONO = "'IBM Plex Mono',ui-monospace,monospace";
export const SANS = "'Archivo',system-ui,sans-serif";

export const C = {
  ink: "var(--ink)",
  muted: "var(--muted)",
  line: "var(--line)",
  card: "var(--card)",
  surface: "var(--surface)",
  teal: "var(--teal)",
  accent: "var(--accent-ink)",
  coral: "var(--coral)",
  danger: "var(--danger-ink)",
  amber: "var(--amber)",
  okBg: "var(--ok-bg)",
  noBg: "var(--no-bg)",
  pick: "var(--pick-bg)",
  lab: "var(--lab-bg)",
  labInk: "var(--lab-ink)",
};

/* Context so any element can ask whether its group is in focus. */
const Focus = React.createContext({ focus: null });

/* A group dims when a step focuses on others. focus=null shows everything
   at full strength — the static diagram in a rationale. */
export function G({ id, children, ...rest }) {
  const { focus } = React.useContext(Focus);
  const on = !focus || focus.includes(id);
  return (
    <g data-g={id} className="dg-g" style={{ opacity: on ? 1 : 0.18 }} {...rest}>
      {children}
    </g>
  );
}

/* The root of every diagram. title/desc make it readable to screen readers
   and are what the adversarial reviewer audits alongside the image. */
export function Frame({ h, title, desc, focus = null, children }) {
  const tid = React.useId();
  return (
    <Focus.Provider value={{ focus }}>
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-labelledby={`${tid}-t ${tid}-d`}
        style={{ display: "block", fontFamily: SANS, overflow: "visible" }}>
        <title id={`${tid}-t`}>{title}</title>
        <desc id={`${tid}-d`}>{desc}</desc>
        <defs>
          {["teal", "coral", "amber", "muted", "accent"].map((k) => (
            /* userSpaceOnUse: the head is 8 units whatever the stroke width,
               so short arrows do not get swallowed by their own heads. */
            <marker key={k} id={`${tid}-arrow-${k}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={C[k]} />
            </marker>
          ))}
        </defs>
        <ArrowIds.Provider value={tid}>{children}</ArrowIds.Provider>
      </svg>
    </Focus.Provider>
  );
}
const ArrowIds = React.createContext("x");

export function T({ x, y, size = 12, weight = 500, color = C.ink, anchor = "start", mono = false, children, ...rest }) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={color} textAnchor={anchor}
      fontFamily={mono ? MONO : SANS} {...rest}>{children}</text>
  );
}

export function Box({ x, y, w, h, r = 8, fill = C.card, stroke = C.line, sw = 1.2, dash, ...rest }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} {...rest} />;
}

export function Arrow({ x1, y1, x2, y2, color = "teal", sw = 2, dash, curve = 0 }) {
  const id = React.useContext(ArrowIds);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * curve, cy = my + (dx / len) * curve;
  const d = curve ? `M${x1},${y1} Q${cx},${cy} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`;
  return <path d={d} fill="none" stroke={C[color] ?? color} strokeWidth={sw} strokeDasharray={dash}
    strokeLinecap="round" markerEnd={`url(#${id}-arrow-${color})`} />;
}

/* A rounded label chip: the workhorse for terms and values. */
export function Chip({ x, y, text, color = "teal", fill, anchor = "middle", size = 11, mono = false, pad = 7 }) {
  const w = Math.max(24, text.length * size * (mono ? 0.62 : 0.56) + pad * 2);
  const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return (
    <g>
      <rect x={left} y={y - size - 3} width={w} height={size + 9} rx={(size + 9) / 2}
        fill={fill ?? C.surface} stroke={C[color] ?? color} strokeWidth={1.2} />
      <T x={left + w / 2} y={y + 1} size={size} anchor="middle" weight={600} color={C[color] ?? color} mono={mono}>{text}</T>
    </g>
  );
}

/* A horizontal number line with the normal range shaded and an optional
   marker. The tool for every lab-value diagram: where the value sits
   relative to normal is the whole point. */
export function Gauge({ x, y, w, min, max, lo, hi, value, decimals = 0, unit = "",
  leftLabel, rightLabel, leftColor = "muted", rightColor = "muted", markerColor = "coral", label }) {
  /* Vertical rhythm, top to bottom: title (y-34), value (y-15), marker
     (y-6), bar (y), range numbers and end labels (y+19). The title and the
     value used to share a line and collided whenever the value sat under it. */
  const px = (v) => x + ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * w;
  const fmt = (v) => Number(v).toFixed(decimals);
  const valueBad = value != null && (value < lo || value > hi);
  const vx = value != null ? Math.min(x + w - 14, Math.max(x + 14, px(value))) : 0;
  return (
    <g>
      {label ? <T x={x} y={y - 34} size={12} weight={700}>{label}</T> : null}
      {unit ? <T x={x + w} y={y - 34} size={10} anchor="end" color={C.muted} mono>{unit}</T> : null}
      <rect x={x} y={y - 4} width={w} height={8} rx={4} fill={C.surface} stroke={C.line} />
      <rect x={px(lo)} y={y - 4} width={px(hi) - px(lo)} height={8} rx={3} fill={C.teal} opacity={0.85} />
      <T x={px(lo)} y={y + 19} size={10.5} anchor="middle" color={C.accent} mono>{fmt(lo)}</T>
      <T x={px(hi)} y={y + 19} size={10.5} anchor="middle" color={C.accent} mono>{fmt(hi)}</T>
      {leftLabel ? <T x={x} y={y + 19} size={10.5} color={C[leftColor]} weight={600}>{leftLabel}</T> : null}
      {rightLabel ? <T x={x + w} y={y + 19} size={10.5} anchor="end" color={C[rightColor]} weight={600}>{rightLabel}</T> : null}
      {value != null ? (
        <g>
          <path d={`M${px(value)},${y - 5} l-5.5,-8 h11 z`} fill={valueBad ? C[markerColor] : C.teal} />
          <T x={vx} y={y - 16} size={12} anchor="middle" weight={700} mono color={valueBad ? C[markerColor] : C.teal}>{fmt(value)}</T>
        </g>
      ) : null}
    </g>
  );
}

/* Styles for the explainer player, injected once. Plain CSS, app tokens,
   and every motion off under prefers-reduced-motion. */
export const DIAGRAM_CSS = `
.dg-g{transition:opacity .45s ease}
.dg-wrap{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 12px 10px;margin:10px 0}
.dg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
.dg-title{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--teal);font-weight:600}
.dg-badge{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);border:1px solid var(--line);border-radius:99px;padding:2px 8px}
.dg-badge.rn{color:var(--accent-ink);border-color:var(--teal)}
.dg-caption{font-size:var(--read-size,15px);line-height:var(--read-lh,1.55);color:var(--ink);margin:10px 2px 8px;min-height:3.1em}
.dg-controls{display:flex;align-items:center;gap:8px}
.dg-btn{font:600 13px 'Archivo',system-ui,sans-serif;color:var(--btn-ink);background:var(--teal);border:0;border-radius:10px;padding:8px 14px;cursor:pointer;min-height:40px}
.dg-btn.ghost{color:var(--accent-ink);background:var(--card);border:1px solid var(--line)}
.dg-btn:disabled{opacity:.45;cursor:default}
.dg-btn:focus-visible,.dg-dot:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
.dg-dots{display:flex;gap:6px;flex:1;justify-content:center;flex-wrap:wrap}
.dg-dot{width:10px;height:10px;border-radius:99px;border:1px solid var(--teal);background:transparent;padding:0;cursor:pointer}
.dg-dot.on{background:var(--teal)}
.dg-progress{height:3px;background:var(--line);border-radius:3px;margin-top:8px;overflow:hidden}
.dg-progress>i{display:block;height:100%;background:var(--teal);transition:width .25s linear}
.dg-ai{font-size:11.5px;color:var(--muted);margin:8px 2px 0}
@media (prefers-reduced-motion: reduce){.dg-g,.dg-progress>i{transition:none}}
`;
