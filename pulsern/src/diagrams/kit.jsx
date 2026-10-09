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

/* Which step the player is on. The Explainer provides it; a diagram drawn
   outside the player (a rationale, a screenshot) sees stepKey null. */
export const StepContext = React.createContext({ stepKey: null, collect: null });

/* Motion is live only after mount, in a browser, without reduced-motion.
   Server and static renders therefore always show the finished picture,
   which is what a rationale, a screenshot and the reviewer must see. */
const Motion = React.createContext({ stepKey: null, live: false });
export const useMotion = () => React.useContext(Motion);
function useLive() {
  const [live, setLive] = React.useState(false);
  React.useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setLive(!reduce);
  }, []);
  return live;
}

/* The root of every diagram. title/desc make it readable to screen readers
   and are what the adversarial reviewer audits alongside the image. */
export function Frame({ h, title, desc, focus = null, children }) {
  const tid = React.useId();
  const { stepKey, collect = null } = React.useContext(StepContext);
  const live = useLive();
  return (
    <Motion.Provider value={{ stepKey, live, collect }}>
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
          <SharedDefs id={tid} />
        </defs>
        <ArrowIds.Provider value={tid}>{children}</ArrowIds.Provider>
      </svg>
    </Focus.Provider>
    </Motion.Provider>
  );
}
const ArrowIds = React.createContext("x");

/* url(#…) for a shared gradient, pattern or filter in this diagram. */
export function useDefs() {
  const id = React.useContext(ArrowIds);
  return (name) => `url(#${id}-${name})`;
}

/* ---------- depth and texture ----------
   Built only from the app's tokens: gradients are one token at two
   strengths, textures are thin lines and dots in the layer's own colour.
   The one exception is the drop shadow, which is black at low opacity —
   shade, not a colour. */
const stop = (offset, color, opacity = 1) =>
  <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />;

function SharedDefs({ id }) {
  const k = (n) => `${id}-${n}`;
  return (
    <>
      <filter id={k("shadow")} x="-10%" y="-10%" width="120%" height="140%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#000" floodOpacity="0.13" />
      </filter>
      {/* teal, denser at the bottom: a filled volume rather than a flat swatch */}
      <linearGradient id={k("teal")} x1="0" y1="0" x2="0" y2="1">{stop(0, C.teal, 0.55)}{stop(1, C.teal, 0.85)}</linearGradient>
      <linearGradient id={k("teal-soft")} x1="0" y1="0" x2="0" y2="1">{stop(0, C.teal, 0.06)}{stop(1, C.teal, 0.16)}</linearGradient>
      {/* a wound bed: brighter at the rim, deeper red at the floor */}
      <linearGradient id={k("wound")} x1="0" y1="0" x2="0" y2="1">{stop(0, C.coral, 0.6)}{stop(1, C.coral, 0.95)}</linearGradient>
      <radialGradient id={k("redness")} cx="0.5" cy="0.35" r="0.6">{stop(0, C.coral, 0.6)}{stop(1, C.coral, 0.08)}</radialGradient>
      {/* a red cell is biconcave: pale in the middle, dense at the rim */}
      <radialGradient id={k("cell")} cx="0.5" cy="0.5" r="0.5">{stop(0, C.teal, 0.18)}{stop(0.55, C.teal, 0.35)}{stop(1, C.teal, 0.8)}</radialGradient>
      <linearGradient id={k("sheen")} x1="0" y1="0" x2="0" y2="1">{stop(0, C.card, 0.55)}{stop(1, C.card, 0)}</linearGradient>
      <linearGradient id={k("fluid")} x1="0" y1="0" x2="0" y2="1">{stop(0, C.teal, 0.22)}{stop(1, C.teal, 0.45)}</linearGradient>
      {/* tissue textures, drawn at the scale of a 360-unit canvas */}
      <pattern id={k("tx-epi")} width="7" height="8" patternUnits="userSpaceOnUse">
        <rect x="0.6" y="1" width="5.8" height="6" rx="2" fill="none" stroke={C.teal} strokeOpacity="0.22" strokeWidth="0.6" />
      </pattern>
      <pattern id={k("tx-derm")} width="18" height="9" patternUnits="userSpaceOnUse">
        <path d="M0,3 q4.5,-3 9,0 t9,0 M0,7.5 q4.5,-3 9,0 t9,0" fill="none" stroke={C.teal} strokeOpacity="0.24" strokeWidth="0.7" />
      </pattern>
      <pattern id={k("tx-fat")} width="12" height="10" patternUnits="userSpaceOnUse">
        <circle cx="3.5" cy="3" r="3.2" fill="none" stroke={C.labInk} strokeOpacity="0.2" strokeWidth="0.7" />
        <circle cx="9.5" cy="8" r="3.2" fill="none" stroke={C.labInk} strokeOpacity="0.2" strokeWidth="0.7" />
      </pattern>
      <pattern id={k("tx-muscle")} width="10" height="4" patternUnits="userSpaceOnUse">
        <path d="M0,2 h10 M3,0.4 v3.2 M8,0.4 v3.2" stroke={C.card} strokeOpacity="0.3" strokeWidth="0.6" />
      </pattern>
      <pattern id={k("tx-bone")} width="8" height="8" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill={C.card} fillOpacity="0.35" />
        <circle cx="6" cy="6" r="1.3" fill={C.card} fillOpacity="0.28" />
        <path d="M0,8 L8,0" stroke={C.card} strokeOpacity="0.25" strokeWidth="0.6" />
      </pattern>
      <pattern id={k("tx-dots")} width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="0.7" fill={C.teal} fillOpacity="0.25" />
      </pattern>
    </>
  );
}

/* ---------- motion ----------
   <Anim on="stage3" kind="grow"> plays its entrance when the player
   reaches that step; at every other time — and always when motion is off —
   it renders the finished state. Keyed by step so revisiting a step plays it
   again. <Loop> holds ambient motion (water drops, a pressing finger) and
   renders nothing at all when motion is off, so static views carry only the
   drawn arrows. */
/* `collect` (tests only) gathers every step key a diagram's motion names,
   so a key that matches no step — motion that can never play — fails a
   test instead of silently doing nothing. */
const stepKeys = (on, collect) => {
  const keys = Array.isArray(on) ? on : [on];
  if (collect) keys.forEach((k) => collect.add(k));
  return keys;
};

export function Anim({ on, kind = "fade", delay = 0, dur, origin = "50% 50%", from, children }) {
  const { stepKey, live, collect } = useMotion();
  const keys = stepKeys(on, collect);
  if (!live || !keys.includes(stepKey)) return <g>{children}</g>;
  const style = { animationDelay: `${delay}ms`, transformOrigin: origin, transformBox: "fill-box" };
  if (dur) style.animationDuration = `${dur}ms`;
  if (from != null) style["--from"] = from;
  return <g key={stepKey} className={`dg-a dg-${kind}`} style={style}>{children}</g>;
}

export function Loop({ on, children }) {
  const { stepKey, live, collect } = useMotion();
  const keys = stepKeys(on, collect);
  return live && keys.includes(stepKey) ? <g key={stepKey} aria-hidden="true">{children}</g> : null;
}

/* Particles travelling a path, evenly staggered: water crossing a membrane,
   a drip, blood flow. Only ever rendered inside a <Loop>. */
export function Flow({ d, n = 3, dur = 1.8, r = 2.4, color = C.teal, opacity = 0.9, shape = "drop" }) {
  return Array.from({ length: n }, (_, i) => (
    <g key={i} opacity="0">
      {shape === "drop"
        ? <path d={`M0,${-r * 1.5} C${r * 0.7},${-r * 0.5} ${r},${r * 0.2} ${r},${r * 0.45} A${r},${r} 0 1 1 ${-r},${r * 0.45} C${-r},${r * 0.2} ${-r * 0.7},${-r * 0.5} 0,${-r * 1.5} Z`} fill={color} fillOpacity={opacity} />
        : <circle r={r} fill={color} fillOpacity={opacity} />}
      <animateMotion dur={`${dur}s`} begin={`${(i * dur) / n}s`} repeatCount="indefinite" path={d} />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur={`${dur}s`} begin={`${(i * dur) / n}s`} repeatCount="indefinite" />
    </g>
  ));
}

export function T({ x, y, size = 12, weight = 500, color = C.ink, anchor = "start", mono = false, children, ...rest }) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={color} textAnchor={anchor}
      fontFamily={mono ? MONO : SANS} {...rest}>{children}</text>
  );
}

export function Box({ x, y, w, h, r = 8, fill = C.card, stroke = C.line, sw = 1.2, dash, lift = false, ...rest }) {
  const u = useDefs();
  return <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dash}
    filter={lift ? u("shadow") : undefined} {...rest} />;
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
.dg-a{animation-fill-mode:both;animation-timing-function:cubic-bezier(.2,.75,.25,1)}
.dg-fade{animation-name:dg-fade;animation-duration:.6s}
.dg-pop{animation-name:dg-pop;animation-duration:.55s;animation-timing-function:cubic-bezier(.3,1.45,.5,1)}
.dg-grow{animation-name:dg-grow;animation-duration:1.2s}
.dg-scale{animation-name:dg-scale;animation-duration:1.6s;animation-timing-function:cubic-bezier(.45,0,.25,1)}
.dg-wipe{animation-name:dg-wipe;animation-duration:1.4s;animation-timing-function:linear}
.dg-press{animation:dg-press 1.6s ease-in-out infinite}
@keyframes dg-fade{from{opacity:0;transform:translateY(6px)}}
@keyframes dg-pop{from{opacity:0;transform:scale(.55)}}
@keyframes dg-grow{from{transform:scaleY(.04)}}
@keyframes dg-scale{from{transform:scale(var(--from,1))}}
@keyframes dg-wipe{from{clip-path:inset(0 100% 0 0)}}
@keyframes dg-press{0%,100%{transform:translateY(-6px)}40%,60%{transform:translateY(0)}}
@media (prefers-reduced-motion: reduce){.dg-g,.dg-progress>i{transition:none}.dg-a,.dg-press{animation:none!important}}
`;
