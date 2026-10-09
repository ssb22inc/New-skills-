/* Pressure injury stages — how deep the damage goes.
   ------------------------------------------------------------------
   Staging follows the NPIAP definitions taught for NCLEX-RN: Stages 1–4,
   Unstageable, and Deep Tissue Pressure Injury. Each stage is drawn as a
   cross-section through the same skin layers, so the depth of tissue loss —
   which is what the stage means — is seen, not memorised. Damaged tissue is
   coral (critical state, per the colour rules); healthy tissue stays in the
   app's neutral tones.

   stageFrom() reads a single stated stage from a stem (pure, tested) so the
   matching column can be outlined. */
import React from "react";
import { Frame, G, T, Box, C, Anim, Loop, useDefs } from "./kit.jsx";

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4 };
export function stageFrom(text) {
  const found = new Set();
  for (const m of String(text ?? "").matchAll(/\bstage\s*(1|2|3|4|iv|iii|ii|i)\b/gi)) {
    const v = m[1].toLowerCase();
    found.add(ROMAN[v] ?? Number(v));
  }
  if (/unstageable/i.test(text ?? "")) found.add("unstageable");
  if (/deep tissue (?:pressure )?injury|\bDTPI\b|\bDTI\b/i.test(text ?? "")) found.add("dtpi");
  return found.size === 1 ? { stage: [...found][0] } : null;
}

/* Layers, top to bottom, with their band heights. */
/* Healthy tissue is graded teal — deeper is denser — so the layers read
   apart in both themes without adding a colour. Fat takes the app's warm
   lab tone, and bone a neutral grey, because those two are the landmarks
   the stages are defined by. Each layer also carries its own texture
   (cells, collagen, fat lobules, muscle fibres, bone), so it reads as
   tissue rather than as a coloured band. */
const LAYERS = [
  { key: "epi", name: "Epidermis", h: 8, fill: C.teal, op: 0.06, tx: "tx-epi" },
  { key: "derm", name: "Dermis", h: 18, fill: C.teal, op: 0.18, tx: "tx-derm" },
  { key: "fat", name: "Fat", h: 26, fill: C.lab, op: 1, tx: "tx-fat" },
  { key: "muscle", name: "Muscle", h: 24, fill: C.teal, op: 0.42, tx: "tx-muscle" },
  { key: "bone", name: "Bone", h: 16, fill: C.muted, op: 0.4, tx: "tx-bone" },
];
/* Legend x positions: measured item widths (swatch + label) spread evenly over the
   canvas, so the gaps match whatever the label lengths. */
const LEGEND_X = [12, 102, 178, 236, 312];
const TOP = 98;
const depthTo = (key) => {   // y at the BOTTOM of a layer
  let y = TOP;
  for (const l of LAYERS) { y += l.h; if (l.key === key) return y; }
  return y;
};
const BOTTOM = depthTo("bone");

/* Bands of tissue with their textures. `scale` shrinks the band heights for
   the small strips in the Unstageable and deep-tissue boxes. */
function Tissue({ x, y, w, layers = LAYERS, scale = 1, animate = null }) {
  const u = useDefs();
  let yy = y;
  return layers.map((l, i) => {
    const h = l.h * scale;
    const band = (
      <g key={l.key}>
        <rect x={x} y={yy} width={w} height={h} fill={l.fill} fillOpacity={l.op} />
        <rect x={x} y={yy} width={w} height={h} fill={u(l.tx)} />
        <line x1={x} x2={x + w} y1={yy + h} y2={yy + h} stroke={C.line} strokeWidth={0.6} />
      </g>
    );
    yy += h;
    return animate ? <Anim key={l.key} on={animate} kind="fade" delay={i * 140}>{band}</Anim> : band;
  });
}

/* The skin surface: a firmer line on top of the epidermis. */
const Surface = ({ x, y, w }) => <line x1={x} x2={x + w} y1={y} y2={y} stroke={C.teal} strokeOpacity={0.7} strokeWidth={1.3} />;

/* A pulsing ring that marks the deepest point a stage reaches. */
const Deepest = ({ cx, cy }) => (
  <circle cx={cx} cy={cy} r="4" fill="none" stroke={C.coral} strokeWidth="1.5">
    <animate attributeName="r" values="3;11" dur="1.4s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0.9;0" dur="1.4s" repeatCount="indefinite" />
  </circle>
);

/* Stage 1 redness: soft-edged, within intact skin. */
function Redness({ x, w }) {
  const u = useDefs();
  return <rect x={x} y={TOP} width={w} height={depthTo("derm") - TOP + 4} fill={u("redness")} />;
}

function Column({ x, w, stage, title, sub, under = null, wound = null, floor = null, highlight }) {
  const key = `stage${stage}`;
  const u = useDefs();
  return (
    <G id={`s${stage}`}>
      {highlight ? <rect x={x - 3} y={56} width={w + 6} height={BOTTOM - 56 + 50} rx={8} fill="none" stroke={C.coral} strokeWidth={2} strokeDasharray="5 4" /> : null}
      <T x={x + w / 2} y={70} size={12} weight={700} anchor="middle">{title}</T>
      <rect x={x} y={TOP} width={w} height={BOTTOM - TOP} rx={2} fill={C.card} filter={u("shadow")} />
      <Tissue x={x} y={TOP} w={w} animate="layers" />
      {under ? <Anim on={key} kind="fade" dur={900}>{under}</Anim> : null}
      <Surface x={x} y={TOP} w={w} />
      {wound ? <Anim on={key} kind="grow" origin="50% 0%" dur={1300}>{wound}</Anim> : null}
      {floor ? <Loop on={key}>{floor}</Loop> : null}
      <rect x={x} y={TOP} width={w} height={BOTTOM - TOP} rx={2} fill="none" stroke={C.line} strokeWidth={0.8} />
      <Anim on={key} kind="fade" delay={700}>
        {sub.map((line, i) => <T key={i} x={x + w / 2} y={BOTTOM + 16 + i * 13} size={10} anchor="middle" color={C.muted}>{line}</T>)}
      </Anim>
    </G>
  );
}

/* A wound crater from the surface down to `toLayer`, stopping `short` units
   above that layer's floor so the next layer down is visibly untouched.
   Returns the path and the floor point. */
const craterPath = (x, w, y0, y1, inset) => {
  const l = x + w * inset, r = x + w * (1 - inset);
  return `M${l - 6},${y0} Q${l},${y0 + 2} ${l + 4},${(y0 + y1) / 2} Q${(l + r) / 2},${y1 + 3} ${r - 4},${(y0 + y1) / 2} Q${r},${y0 + 2} ${r + 6},${y0} Z`;
};
function Crater({ x, w, toLayer, inset = 0.22, short = 1, children }) {
  const u = useDefs();
  const d = craterPath(x, w, TOP, depthTo(toLayer) - short, inset);
  return (
    <g>
      <path d={d} fill={u("wound")} stroke={C.danger} strokeWidth={1} strokeLinejoin="round" />
      {/* moist sheen along the upper wall */}
      <path d={d} fill={u("sheen")} opacity={0.6} />
      {children}
    </g>
  );
}
const floorOf = (x, w, toLayer, short = 1) => ({ cx: x + w / 2, cy: depthTo(toLayer) - short + 1 });

/* The fingertip that presses on Stage 1: the redness does not blanch. */
const Finger = ({ cx }) => (
  <g className="dg-press">
    <path d={`M${cx - 7},${TOP - 17} v10 a7,7 0 0 0 14,0 v-10`} fill={C.card} stroke={C.muted} strokeWidth={1.2} />
    <path d={`M${cx - 3.5},${TOP - 8} a3.5,2.8 0 0 0 7,0`} fill="none" stroke={C.muted} strokeOpacity={0.6} strokeWidth={1} />
  </g>
);

/* Slough: soft yellow-tan tissue, drawn as an irregular patch. */
const Slough = ({ cx, cy }) => (
  <path d={`M${cx - 8},${cy} q2,-3.5 6,-3 q3,-1.5 7,0.5 q3,2 0,4.5 q-4,2 -8,1 q-5,0.5 -5,-3 Z`}
    fill={C.labInk} fillOpacity={0.6} stroke={C.labInk} strokeWidth={0.7} />
);

/* Small illustrated strips for the two stages with no depth to draw. */
const STRIP = LAYERS.slice(0, 3);
function UnstageableStrip({ x, y, w }) {
  const s = 0.62, y1 = y + (8 + 18 + 26) * s - 2;
  const l = x + w * 0.26, r = x + w * 0.74;
  const d = craterPath(x, w, y, y1, 0.26);
  return (
    <g>
      <rect x={x} y={y} width={w} height={(8 + 18 + 26) * s} fill={C.card} />
      <Tissue x={x} y={y} w={w} layers={STRIP} scale={s} />
      {/* how deep it goes is unknown: an outline only, never a drawn wound */}
      <path d={d} fill={C.card} fillOpacity={0.55} stroke={C.muted} strokeWidth={1} strokeDasharray="3 2.5" />
      <T x={x + w / 2} y={y1 - 4} size={12} weight={700} anchor="middle" color={C.muted}>?</T>
      <Surface x={x} y={y} w={w} />
      {/* eschar: a thick dark crust filling the opening, with slough at one edge */}
      <path d={`M${l - 6},${y - 1.5} Q${x + w / 2},${y - 4} ${r + 6},${y - 1.5} L${r + 1},${y + 8} Q${x + w / 2},${y + 12} ${l - 1},${y + 8} Z`} fill={C.coral} />
      <path d={`M${l - 6},${y - 1.5} Q${x + w / 2},${y - 4} ${r + 6},${y - 1.5} L${r + 1},${y + 8} Q${x + w / 2},${y + 12} ${l - 1},${y + 8} Z`} fill="#000" fillOpacity={0.62} />
      <Slough cx={r - 4} cy={y + 3} />
    </g>
  );
}
function DeepTissueStrip({ x, y, w }) {
  const s = 0.62;
  return (
    <g>
      <rect x={x} y={y} width={w} height={(8 + 18 + 26) * s} fill={C.card} />
      <Tissue x={x} y={y} w={w} layers={STRIP} scale={s} />
      {/* damage starts deep, under skin that may still be intact */}
      <ellipse cx={x + w / 2} cy={y + 18} rx={w * 0.26} ry={12} fill={C.coral} fillOpacity={0.85} />
      <ellipse cx={x + w / 2} cy={y + 18} rx={w * 0.26} ry={12} fill="#000" fillOpacity={0.38} />
      <ellipse cx={x + w / 2} cy={y + 8} rx={w * 0.2} ry={3} fill={C.coral} fillOpacity={0.35} />
      <Surface x={x} y={y} w={w} />
    </g>
  );
}

/* Prevention, as six icons rather than a sentence. Line icons in teal. */
const ICON = { fill: "none", stroke: C.teal, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
const Icons = {
  braden: (cx, cy) => (
    <g {...ICON}>
      <rect x={cx - 8} y={cy - 10} width={16} height={20} rx={2} />
      <rect x={cx - 4} y={cy - 12} width={8} height={4} rx={1} fill={C.card} />
      <path d={`M${cx - 4},${cy - 3} h8 M${cx - 4},${cy + 1} h8 M${cx - 4},${cy + 5} h5`} strokeWidth={1.2} />
    </g>
  ),
  turn: (cx, cy) => (
    <g {...ICON}>
      <circle cx={cx} cy={cy} r={8} />
      <path d={`M${cx},${cy - 4.5} V${cy} l3,2.5`} strokeWidth={1.3} />
      <path d={`M${cx + 11},${cy - 5} A12,12 0 1 1 ${cx + 4},${cy - 11.5}`} />
      <path d={`M${cx + 7.5},${cy - 13} l-3.4,1.4 l2,3`} strokeWidth={1.3} />
    </g>
  ),
  hob: (cx, cy) => (
    /* a bed with the head section raised 30°, and the client on it */
    <g {...ICON}>
      <path d={`M${cx - 13},${cy + 7} H${cx + 13} M${cx - 11},${cy + 7} v3 M${cx + 11},${cy + 7} v3`} strokeWidth={1.3} />
      <path d={`M${cx - 1},${cy + 4} H${cx + 13}`} strokeWidth={2.6} />
      <path d={`M${cx - 1},${cy + 4} L${cx - 12},${cy - 2.4}`} strokeWidth={2.6} />
      <circle cx={cx - 10} cy={cy - 7} r={2.6} strokeWidth={1.3} />
      <path d={`M${cx - 7},${cy - 3} L${cx},${cy + 1} H${cx + 10}`} strokeWidth={1.3} />
      <path d={`M${cx + 7},${cy + 4} A8,8 0 0 0 ${cx + 6.2},${cy + 0.4}`} strokeWidth={1} strokeOpacity={0.7} transform={`translate(${-14},0)`} />
    </g>
  ),
  surface: (cx, cy) => (
    <g {...ICON}>
      <rect x={cx - 13} y={cy - 1} width={26} height={8} rx={2} />
      <path d={`M${cx - 13},${cy - 1} q3.25,-5 6.5,0 t6.5,0 t6.5,0 t6.5,0`} />
    </g>
  ),
  dry: (cx, cy) => (
    <g {...ICON}>
      <path d={`M${cx},${cy - 10} C${cx + 4},${cy - 4} ${cx + 7},${cy} ${cx + 7},${cy + 3} A7,7 0 1 1 ${cx - 7},${cy + 3} C${cx - 7},${cy} ${cx - 4},${cy - 4} ${cx},${cy - 10} Z`} />
      <path d={`M${cx - 3},${cy + 3} l2.2,2.4 l4,-4.6`} strokeWidth={1.3} />
    </g>
  ),
  nutrition: (cx, cy) => (
    <g {...ICON}>
      <circle cx={cx} cy={cy} r={8} />
      <circle cx={cx} cy={cy} r={4.5} strokeWidth={1} strokeOpacity={0.6} />
      <path d={`M${cx - 13},${cy - 8} v16 M${cx - 15},${cy - 8} v4 a2,2 0 0 0 4,0 v-4 M${cx + 13},${cy + 8} v-16 q-3,3 0,8`} strokeWidth={1.2} />
    </g>
  ),
};
const PREVENT = [
  ["braden", "Braden scale", "lower = higher risk"],
  ["turn", "Reposition", "at least every 2 h"],
  ["hob", "HOB ≤ 30°", "reduces shear"],
  ["surface", "Support surface", "spreads pressure"],
  ["dry", "Skin clean", "and dry"],
  ["nutrition", "Protein, calories", "and fluids"],
];

export function PressureInjuryDiagram({ params = null, focus = null }) {
  const lit = params?.stage;
  const W = 80, gap = 7, x0 = 9;
  const xs = [0, 1, 2, 3].map((i) => x0 + i * (W + gap));
  const OY = 284, PY = 394;
  return (
    <Frame h={560} focus={focus} title="Pressure injury stages"
      desc="Cross-sections through epidermis, dermis, fat, muscle and bone. Stage 1: intact skin with non-blanchable redness. Stage 2: partial-thickness loss into the dermis. Stage 3: full-thickness loss into fat; no muscle or bone exposed. Stage 4: full-thickness loss exposing muscle, tendon or bone. Unstageable: the base is covered by slough or eschar. Deep tissue pressure injury: intact or non-intact skin with persistent deep red, maroon or purple discoloration. Prevention: Braden scale (lower score means higher risk), reposition at least every 2 hours, head of bed at or below 30 degrees to reduce shear, pressure-redistributing support surfaces, clean and dry skin, and protein, calories and fluids.">
      <G id="layers">
        <T x={180} y={20} size={12} weight={700} anchor="middle">How deep does the damage go?</T>
        <T x={180} y={38} size={10.5} anchor="middle" color={C.muted}>Each column is the same skin, cut through</T>
      </G>
      <Column x={xs[0]} w={W} stage={1} title="Stage 1" highlight={lit === 1}
        sub={["Intact skin,", "redness that", "does not blanch"]}
        under={<Redness x={xs[0] + W * 0.14} w={W * 0.72} />}
        floor={<Finger cx={xs[0] + W / 2} />} />
      <Column x={xs[1]} w={W} stage={2} title="Stage 2" highlight={lit === 2}
        sub={["Partial", "thickness —", "into dermis"]}
        wound={<Crater x={xs[1]} w={W} toLayer="derm" inset={0.24} short={4} />}
        floor={<Deepest {...floorOf(xs[1], W, "derm", 4)} />} />
      <Column x={xs[2]} w={W} stage={3} title="Stage 3" highlight={lit === 3}
        sub={["Full thickness", "— into fat;", "no muscle/bone"]}
        wound={<Crater x={xs[2]} w={W} toLayer="fat" inset={0.18} short={6}>
          {/* slough may be present in the wound bed */}
          <Slough cx={xs[2] + W / 2 + 4} cy={depthTo("fat") - 10} />
        </Crater>}
        floor={<Deepest {...floorOf(xs[2], W, "fat", 6)} />} />
      <Column x={xs[3]} w={W} stage={4} title="Stage 4" highlight={lit === 4}
        sub={["Exposes", "muscle, tendon", "or bone"]}
        wound={<Crater x={xs[3]} w={W} toLayer="muscle" inset={0.14} short={1} />}
        floor={<Deepest {...floorOf(xs[3], W, "muscle", 1)} />} />
      <G id="legend">
        <Anim on="layers" kind="fade" delay={750}>
          {LAYERS.map((l, i) => (
            <g key={l.key}>
              <rect x={LEGEND_X[i]} y={262} width={12} height={10} fill={l.fill} fillOpacity={l.op} stroke={C.line} />
              <T x={LEGEND_X[i] + 16} y={271} size={10}>{l.name}</T>
            </g>
          ))}
        </Anim>
      </G>
      <G id="other">
        <Anim on="other" kind="pop">
          <Box x={8} y={OY} w={170} h={100} r={10} fill={C.surface} stroke={lit === "unstageable" ? C.coral : C.line} lift />
          <T x={18} y={OY + 19} size={11.5} weight={700}>Unstageable</T>
          <UnstageableStrip x={18} y={OY + 28} w={150} />
          <T x={18} y={OY + 76} size={10.5}>Base covered by slough</T>
          <T x={18} y={OY + 91} size={10.5}>or eschar — depth unseen</T>
        </Anim>
        <Anim on="other" kind="pop" delay={250}>
          <Box x={184} y={OY} w={168} h={100} r={10} fill={C.surface} stroke={lit === "dtpi" ? C.coral : C.line} lift />
          <T x={194} y={OY + 19} size={11.5} weight={700}>Deep tissue injury</T>
          <DeepTissueStrip x={194} y={OY + 28} w={148} />
          <T x={194} y={OY + 76} size={10.5}>Persistent deep red,</T>
          <T x={194} y={OY + 91} size={10.5}>maroon or purple area</T>
        </Anim>
      </G>
      <G id="prevent">
        <Box x={8} y={PY} w={344} h={160} r={10} fill={C.card} lift />
        <T x={18} y={PY + 19} size={11.5} weight={700} color={C.accent}>Prevent</T>
        {PREVENT.map(([icon, a, b], i) => {
          const tx = 14 + (i % 3) * 112, ty = PY + 28 + Math.floor(i / 3) * 64;
          return (
            <Anim key={icon} on="prevent" kind="pop" delay={i * 120}>
              <rect x={tx} y={ty} width={108} height={58} rx={8} fill={C.surface} stroke={C.line} />
              {Icons[icon](tx + 54, ty + 18)}
              <T x={tx + 54} y={ty + 41} size={10} weight={600} anchor="middle">{a}</T>
              <T x={tx + 54} y={ty + 53} size={9.5} anchor="middle" color={C.muted}>{b}</T>
            </Anim>
          );
        })}
      </G>
    </Frame>
  );
}

export const pressureInjury = {
  id: "pressure-injury",
  title: "Pressure injury stages",
  concepts: ["pressure-injury"],
  Diagram: PressureInjuryDiagram,
  example: null,
  facts: [
    "Stage 1 pressure injury: intact skin with a localized area of non-blanchable erythema.",
    "Stage 2: partial-thickness skin loss with exposed dermis; the wound bed is viable, pink or red, and moist, and may present as an intact or ruptured blister. Adipose tissue is not visible.",
    "Stage 3: full-thickness skin loss in which adipose (fat) tissue is visible; slough or eschar may be present, but fascia, muscle, tendon, ligament, cartilage and bone are not exposed.",
    "Stage 4: full-thickness skin and tissue loss with exposed or directly palpable fascia, muscle, tendon, ligament, cartilage or bone.",
    "Unstageable: full-thickness skin and tissue loss in which the extent of damage cannot be confirmed because it is obscured by slough or eschar.",
    "Deep tissue pressure injury: intact or non-intact skin with a localized area of persistent non-blanchable deep red, maroon or purple discoloration.",
    "On the Braden scale, a lower score indicates a higher risk of pressure injury.",
    "Prevention includes repositioning at least every 2 hours, keeping the head of the bed at or below 30 degrees unless contraindicated to reduce shear, pressure-redistributing support surfaces, keeping skin clean and dry, and adequate protein, calories and fluids.",
  ],
  steps: [
    { key: "layers", focus: ["layers", "legend", "s1", "s2", "s3", "s4"], caption: "Each column is the same skin cut through: epidermis, dermis, fat, muscle and bone. The stage is simply how deep the damage reaches.",
      narration: "Each column is the same skin, cut through: the epidermis, the dermis, fat, muscle, and bone. A pressure injury's stage is simply how deep the damage reaches." },
    { key: "stage1", focus: ["layers", "s1"], caption: "Stage 1: the skin is still intact, but there is redness that does not blanch when pressed.",
      narration: "Stage one. The skin is still intact, but there is an area of redness that does not blanch when you press on it." },
    { key: "stage2", focus: ["layers", "s2"], caption: "Stage 2: partial-thickness loss into the dermis — a shallow, pink, moist wound or a blister. No fat is visible.",
      narration: "Stage two is partial-thickness loss, into the dermis. It looks like a shallow, pink, moist wound, or a blister. No fat is visible." },
    { key: "stage3", focus: ["layers", "s3"], caption: "Stage 3: full-thickness loss down into the fat. Slough may be present, but no muscle, tendon or bone is exposed.",
      narration: "Stage three is full-thickness loss, down into the fat. Slough may be present, but no muscle, tendon, or bone is exposed." },
    { key: "stage4", focus: ["layers", "s4"], caption: "Stage 4: full-thickness tissue loss that exposes muscle, tendon or bone.",
      narration: "Stage four is full-thickness tissue loss that exposes muscle, tendon, or bone." },
    { key: "other", focus: ["other"], caption: "Unstageable: slough or eschar hides the base, so the depth can't be seen. Deep tissue injury: a persistent deep red, maroon or purple area.",
      narration: "If slough or eschar covers the base, the depth can't be seen, so the injury is unstageable. A deep tissue injury is a persistent area of deep red, maroon, or purple discoloration." },
    { key: "prevent", focus: ["prevent"], caption: "Prevention: assess with the Braden scale — a lower score means higher risk. Reposition at least every 2 hours, keep the head of the bed at 30° or lower unless contraindicated, use a support surface, keep skin clean and dry, and support nutrition.",
      narration: "Prevention starts with the Braden scale — and remember, a lower score means a higher risk. Reposition the client at least every two hours, keep the head of the bed at thirty degrees or lower unless that's contraindicated, use a pressure-redistributing surface, keep the skin clean and dry, and make sure they get enough protein, calories, and fluids." },
  ],
};
