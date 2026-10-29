/* Pressure injury stages — the tissue findings and extent of loss.
   ------------------------------------------------------------------
   Staging follows the NPIAP definitions taught for NCLEX-RN: Stages 1–4,
   Unstageable, and Deep Tissue Pressure Injury. Each stage is drawn as a
   cross-section through the same skin layers, so the extent of tissue loss
   is seen, not memorised — but the drawing says what staging is: tissue
   findings and the extent of loss, not a depth ruler (real thickness varies
   by site), not a required progression, and a healing injury is not
   reverse-staged (Sol, PR #155 diagram review). Damaged tissue is coral
   (critical state, per the colour rules); healthy tissue stays in the app's
   neutral tones.

   The diagram is a concept explainer only: it never outlines a column as
   this client's stage. Reading a stage from question text kept selecting
   hypothetical, excluded or unrelated stages (Sol, rounds 1–5), and a
   wrong outline teaches the wrong stage with the authority of a picture. */
import React from "react";
import { Frame, G, T, Box, C, Anim, OnStep, Loop, Para, paraLines, useDefs, BODY_TEXT, MIN_TEXT } from "./kit.jsx";

/* Layers, top to bottom, with their band heights. */
/* Healthy tissue is graded teal — deeper is denser — so the layers read
   apart in both themes without adding a colour. Fat takes the app's warm
   lab tone, and bone a neutral grey, because those two are the landmarks
   the stages are defined by. Each layer also carries its own texture
   (cells, collagen, fat lobules, muscle fibres, bone), so it reads as
   tissue rather than as a coloured band. */
const LAYERS = [
  { key: "epi", name: "Epidermis", h: 8, fill: C.teal, op: 0.06, tx: "tx-epi" },
  { key: "derm", name: "Dermis", h: 18, fill: C.teal, op: 0.3, tx: "tx-derm" },
  { key: "fat", name: "Fat", h: 26, fill: C.lab, op: 1, tx: "tx-fat" },
  { key: "muscle", name: "Muscle", h: 24, fill: C.teal, op: 0.42, tx: "tx-muscle" },
  { key: "bone", name: "Bone", h: 16, fill: C.muted, op: 0.4, tx: "tx-bone" },
];
/* Legend x positions: measured item widths (swatch + label) spread evenly over the
   canvas, so the gaps match whatever the label lengths. */
const LEGEND_X = [12, 102, 178, 236, 312];
const TOP = 104;
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
        <line x1={x} x2={x + w} y1={yy + h} y2={yy + h} stroke={C.muted} strokeWidth={0.9} />
      </g>
    );
    yy += h;
    return animate ? <Anim key={l.key} on={animate} kind="fade" delay={i * 140}>{band}</Anim> : band;
  });
}

/* A legend swatch: the band's fill AND texture, outlined like the bands. */
function Swatch({ l, x, y }) {
  const u = useDefs();
  return (
    <g>
      <rect x={x} y={y} width={12} height={12} fill={l.fill} fillOpacity={l.op} />
      <rect x={x} y={y} width={12} height={12} fill={u(l.tx)} stroke={C.muted} />
    </g>
  );
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
  /* A dashed boundary marks the non-blanchable area at 3:1 or better in
     both themes; dashed, so it does not read as broken skin (Sol, round 6). */
  return (
    <g>
      <rect x={x} y={TOP} width={w} height={depthTo("derm") - TOP + 4} fill={u("redness")} />
      <rect className="dg-solid" x={x} y={TOP + 1} width={w} height={depthTo("derm") - TOP + 2} rx={6} fill="none" stroke={C.danger} strokeWidth={1.4} strokeDasharray="4 3" />
    </g>
  );
}

function Column({ x, w, stage, title, under = null, wound = null, floor = null }) {
  const key = `stage${stage}`;
  const u = useDefs();
  return (
    <g>
      {/* the column this step is about (the other columns stay for comparison) */}
      <OnStep on={key}><rect className="dg-solid" x={x - 3} y={TOP - 50} width={w + 6} height={BOTTOM - TOP + 56} rx={8} fill="none" stroke={C.ink} strokeWidth={1.6} strokeDasharray="5 3" /></OnStep>
      <T x={x + w / 2} y={TOP - 30} size={BODY_TEXT} weight={700} anchor="middle">{title}</T>
      <rect x={x} y={TOP} width={w} height={BOTTOM - TOP} rx={2} fill={C.card} filter={u("shadow")} />
      <Tissue x={x} y={TOP} w={w} animate="layers" />
      {under ? <Anim on={key} kind="fade" dur={900}>{under}</Anim> : null}
      <Surface x={x} y={TOP} w={w} />
      {wound ? <Anim on={key} kind="grow" origin="50% 0%" dur={1300}>{wound}</Anim> : null}
      {floor ? <Loop on={key}>{floor}</Loop> : null}
      <rect x={x} y={TOP} width={w} height={BOTTOM - TOP} rx={2} fill="none" stroke={C.line} strokeWidth={0.8} />
    </g>
  );
}

/* A wound crater from the surface down to `toLayer`, stopping `short` units
   above that layer's floor so the next layer down is visibly untouched.
   The floor curve is built so it actually REACHES y1 (Sol: a quadratic
   whose control point sat at the floor stopped short of it, leaving slough
   and depth markers drawn in intact fat): for a quadratic from (·, mid) to
   (·, mid), the lowest point is (mid + c) / 2, so c = 2·y1 − mid. */
export const craterPath = (x, w, y0, y1, inset) => {
  const l = x + w * inset, r = x + w * (1 - inset);
  const mid = (y0 + y1) / 2, c = 2 * y1 - mid;
  return `M${l - 6},${y0} Q${l},${y0 + 2} ${l + 4},${mid} Q${(l + r) / 2},${c} ${r - 4},${mid} Q${r},${y0 + 2} ${r + 6},${y0} Z`;
};
export const craterFloor = (toLayer, short = 1) => depthTo(toLayer) - short;
function Crater({ x, w, toLayer, inset = 0.22, short = 1, children }) {
  const u = useDefs();
  const clip = React.useId();
  const d = craterPath(x, w, TOP, craterFloor(toLayer, short), inset);
  return (
    <g>
      <clipPath id={clip}><path d={d} /></clipPath>
      {/* the lost tissue is gone: an opaque base hides the layers and the
          skin surface across the opening (Sol, round 4: fibres and fat
          lobules showed through a translucent wound) */}
      <path d={d} fill={C.card} />
      <path d={d} fill={u("wound")} stroke={C.danger} strokeWidth={1} strokeLinejoin="round" />
      {/* moist sheen along the upper wall */}
      <path d={d} fill={u("sheen")} opacity={0.6} />
      {/* what lies in the wound bed is clipped to the wound itself, so it can
          never be drawn into intact tissue (Sol, round 2: slough edge) */}
      <g clipPath={`url(#${clip})`}>{children}</g>
    </g>
  );
}
/* The deepest point of a crater: the same geometry the crater is drawn with. */
const floorOf = (x, w, toLayer, short = 1) => ({ cx: x + w / 2, cy: craterFloor(toLayer, short) });

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
      <T x={x + w / 2} y={y1 - 3} size={BODY_TEXT} weight={700} anchor="middle" color={C.muted}>?</T>
      <Surface x={x} y={y} w={w} />
      {/* eschar: a thick dark crust filling the opening, with slough at one edge */}
      <path d={`M${l - 6},${y - 1.5} Q${x + w / 2},${y - 4} ${r + 6},${y - 1.5} L${r + 1},${y + 8} Q${x + w / 2},${y + 12} ${l - 1},${y + 8} Z`} fill={C.coral} />
      <path d={`M${l - 6},${y - 1.5} Q${x + w / 2},${y - 4} ${r + 6},${y - 1.5} L${r + 1},${y + 8} Q${x + w / 2},${y + 12} ${l - 1},${y + 8} Z`} fill="#000" fillOpacity={0.62}
        stroke={C.danger} strokeWidth={1.6} />
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
      <ellipse cx={x + w / 2} cy={y + 18} rx={w * 0.26} ry={12} fill="#000" fillOpacity={0.38} stroke={C.danger} strokeWidth={1.2} strokeDasharray="3 2" />
      <ellipse cx={x + w / 2} cy={y + 8} rx={w * 0.2} ry={3} fill={C.coral} fillOpacity={0.35} />
      <Surface x={x} y={y} w={w} />
      {/* the finding a nurse SEES: intact skin with a deep red-purple
          patch over the damage (Sol, round 2: the surface looked normal) */}
      <rect x={x + w * 0.27} y={y - 1.5} width={w * 0.46} height={4.5} rx={2.2} fill={C.coral} />
      <rect x={x + w * 0.27} y={y - 1.5} width={w * 0.46} height={4.5} rx={2.2} fill="#000" fillOpacity={0.45} stroke={C.danger} strokeWidth={1.4} />
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
  ["braden", "Braden scale", "lower score, higher risk"],
  ["turn", "Reposition", "individualized schedule"],
  ["hob", "HOB ≤ 30°", "if clinically appropriate"],
  ["surface", "Support surface", "spreads pressure"],
  ["dry", "Skin care", "clean and dry"],
  ["nutrition", "Nutrition", "protein, calories, fluids"],
];
const STAGES = [
  ["Stage 1", "Intact skin with non-blanchable redness. In darker skin the color change can look different; also check warmth, firmness and sensation."],
  ["Stage 2", "Partial-thickness loss with exposed dermis: a pink, moist bed, or an intact or ruptured serum-filled blister. No fat, granulation, slough or eschar. Not used for moisture damage, skin tears, burns or abrasions."],
  ["Stage 3", "Full-thickness loss with fat visible; slough or eschar may be present. No fascia, muscle, tendon, ligament, cartilage or bone exposed."],
  ["Stage 4", "Full-thickness loss with exposed or directly palpable fascia, muscle, tendon, ligament, cartilage or bone."],
];
const UNSTAGEABLE = "Slough or eschar covers the base, so the extent of loss can't be confirmed.";
const DTPI = "Intact or non-intact skin: a persistent non-blanchable deep red, maroon or purple area, a blood-filled blister, or epidermal separation showing a dark wound bed.";
const PREVENT_NOTE = "Every 2 hours is a common NCLEX schedule; the plan is individualized and reassessed. A higher head of bed may be needed for breathing or aspiration precautions.";
const LH = 1.3;
const H = (t, w, size = MIN_TEXT) => paraLines(t, w, size).length * size * LH;

export function PressureInjuryDiagram({ focus = null }) {
  const W = 80, gap = 7, x0 = 9;
  const xs = [0, 1, 2, 3].map((i) => x0 + i * (W + gap));
  const LY = BOTTOM + 22;
  let sy = LY + 34;
  const rows = STAGES.map(([k, t]) => { const y = sy; sy += H(`${k} ${t}`, 324) + 6; return y; });
  const noteY = sy + 4;
  const OY = noteY + H("x", 324) + 14;
  const oh = 82 + Math.max(H(UNSTAGEABLE, 150), H(DTPI, 148)) - MIN_TEXT * LH + 14;
  const PY = OY + oh + 10;
  const tileH = 108;
  const pnY = PY + 30 + 2 * (tileH + 6) + 14;
  const PH = pnY - PY + H(PREVENT_NOTE, 324) + 4;
  const stageRow = (i) => (
    <G id={`r${i + 1}`}>
      <Anim on={`stage${i + 1}`} kind="fade" delay={500}>
        <Para x={18} y={rows[i]} w={324} size={MIN_TEXT} lead={STAGES[i][0]} text={STAGES[i][1]} />
      </Anim>
    </G>
  );
  const rowSpan = (i) => [rows[i] - 14, rows[i] + H(`${STAGES[i][0]} ${STAGES[i][1]}`, 324) - 12];
  return (
    <Frame h={PY + PH + 6} focus={focus} title="Pressure injury stages"
      regions={{ head: [0, 46], note: [noteY - 14, noteY + 5], legend: [LY - 14, LY + 4], other: [OY, OY + oh], prevent: [PY, PY + PH],
        ...Object.fromEntries(STAGES.map((_, i) => [`s${i + 1}`, [TOP - 52, BOTTOM + 2]])),
        ...Object.fromEntries(STAGES.map((_, i) => [`r${i + 1}`, rowSpan(i)])) }}
      desc="Cross-sections through epidermis, dermis, fat, muscle and bone. Stages describe tissue findings and the extent of tissue loss; actual depth varies by location, the stages are not a required progression, and a healing injury is not reverse-staged. Stage 1: intact skin with non-blanchable redness; in darker skin the color change can look different, so warmth, firmness and sensation are also assessed. Stage 2: partial-thickness loss with exposed dermis, a pink moist bed, or an intact or ruptured serum-filled blister; no fat, granulation tissue, slough or eschar; Stage 2 is for pressure-related injury, not moisture-associated skin damage, incontinence-associated dermatitis, skin tears, burns or abrasions. Stage 3: full-thickness loss with fat visible; slough or eschar may be present; no fascia, muscle, tendon, ligament, cartilage or bone exposed. Stage 4: full-thickness loss with exposed or directly palpable fascia, muscle, tendon, ligament, cartilage or bone. Unstageable: slough or eschar covers the base, so the extent of loss cannot be confirmed. Deep tissue pressure injury: intact or non-intact skin with persistent non-blanchable deep red, maroon or purple discoloration, a blood-filled blister, or epidermal separation revealing a dark wound bed, resulting from intense and/or prolonged pressure and shear forces at the bone-muscle interface. Prevention: Braden scale (lower score means higher risk), repositioning on an individualized schedule (every 2 hours is a common teaching schedule), head of bed at or below 30 degrees if clinically appropriate, because breathing or aspiration precautions may require a higher position; pressure-redistributing support surfaces; clean and dry skin; and protein, calories and fluids.">
      <G id="head">
        <T x={180} y={20} size={BODY_TEXT} weight={700} anchor="middle">Stages: what the tissue shows</T>
        <T x={180} y={39} size={MIN_TEXT} anchor="middle" color={C.muted}>the same skin, cut through; real depth varies</T>
      </G>
      <G id="note">
        <T x={18} y={noteY} size={MIN_TEXT} color={C.muted}>Not a required progression; healing keeps its stage.</T>
      </G>
      <G id="s1">
        <Column x={xs[0]} w={W} stage={1} title="Stage 1"
          under={<Redness x={xs[0] + W * 0.14} w={W * 0.72} />}
          floor={<Finger cx={xs[0] + W / 2} />} />
      </G>
      {stageRow(0)}
      <G id="s2">
        <Column x={xs[1]} w={W} stage={2} title="Stage 2"
          wound={<Crater x={xs[1]} w={W} toLayer="derm" inset={0.24} short={4} />}
          floor={<Deepest {...floorOf(xs[1], W, "derm", 4)} />} />
      </G>
      {stageRow(1)}
      <G id="s3">
        <Column x={xs[2]} w={W} stage={3} title="Stage 3"
          wound={<Crater x={xs[2]} w={W} toLayer="fat" inset={0.18} short={6}>
            {/* slough adheres to the wound bed: drawn ON the floor */}
            <Slough cx={xs[2] + W / 2 + 2} cy={craterFloor("fat", 6) - 4} />
            {/* exposed fat: lobules on the bed either side of the slough, so
                the visible fat is drawn, not the slough (Sol, round 7) */}
            {[[-9, -9], [-13, -16], [12, -9], [16, -16]].map(([dx, dy], i) => (
              <circle key={i} cx={xs[2] + W / 2 + dx} cy={craterFloor("fat", 6) + dy} r={3} fill={C.lab} stroke={C.labInk} strokeWidth={0.9} />
            ))}
          </Crater>}
          floor={<Deepest {...floorOf(xs[2], W, "fat", 6)} />} />
        {/* the slough, labelled with a leader so it is not read as fat */}
        <path className="dg-solid" d={`M${xs[2] + W / 2 + 2},${craterFloor("fat", 6) - 1} V${depthTo("muscle") - 17}`} stroke={C.ink} strokeWidth={1} />
        <rect className="dg-solid" x={xs[2] + W / 2 - 22} y={depthTo("muscle") - 17} width={48} height={17} rx={4} fill={C.card} stroke={C.line} />
        <T x={xs[2] + W / 2 + 2} y={depthTo("muscle") - 4} size={MIN_TEXT} weight={700} anchor="middle">slough</T>
      </G>
      {stageRow(2)}
      <G id="s4">
        <Column x={xs[3]} w={W} stage={4} title="Stage 4"
          wound={<Crater x={xs[3]} w={W} toLayer="muscle" inset={0.14} short={1} />}
          floor={<Deepest {...floorOf(xs[3], W, "muscle", 1)} />} />
      </G>
      {stageRow(3)}
      <G id="legend">
        <Anim on="layers" kind="fade" delay={750}>
          {LAYERS.map((l, i) => (
            <g key={l.key}>
              {/* the swatch repeats the band's texture, and its outline matches
                  the band boundaries (Sol, round 7) */}
              <Swatch l={l} x={LEGEND_X[i]} y={LY - 11} />
              <T x={LEGEND_X[i] + 16} y={LY} size={MIN_TEXT}>{l.name}</T>
            </g>
          ))}
        </Anim>
      </G>
      <G id="other">
        <Anim on="other" kind="pop">
          <Box x={8} y={OY} w={170} h={oh} r={10} fill={C.surface} stroke={C.line} sw={1.2} lift />
          <T x={18} y={OY + 21} size={BODY_TEXT} weight={700}>Unstageable</T>
          <UnstageableStrip x={18} y={OY + 34} w={150} />
          <Para x={18} y={OY + 82} w={150} size={MIN_TEXT} text={UNSTAGEABLE} />
        </Anim>
        <Anim on="other" kind="pop" delay={250}>
          <Box x={184} y={OY} w={168} h={oh} r={10} fill={C.surface} stroke={C.line} sw={1.2} lift />
          <T x={194} y={OY + 21} size={BODY_TEXT} weight={700}>Deep tissue injury</T>
          <DeepTissueStrip x={194} y={OY + 34} w={148} />
          <Para x={194} y={OY + 82} w={148} size={MIN_TEXT} text={DTPI} />
        </Anim>
      </G>
      <G id="prevent">
        <Box x={8} y={PY} w={344} h={PH} r={10} fill={C.card} lift />
        <T x={18} y={PY + 21} size={BODY_TEXT} weight={700} color={C.accent}>Prevent</T>
        {PREVENT.map(([icon, a, b], i) => {
          const tx = 14 + (i % 3) * 112, ty = PY + 30 + Math.floor(i / 3) * (tileH + 6);
          return (
            <Anim key={icon} on="prevent" kind="pop" delay={i * 120}>
              <rect x={tx} y={ty} width={108} height={tileH} rx={8} fill={C.surface} stroke={C.line} />
              {Icons[icon](tx + 54, ty + 20)}
              <T x={tx + 54} y={ty + 48} size={MIN_TEXT} weight={700} anchor="middle">{a}</T>
              {paraLines(b, 96, MIN_TEXT).map((l, j) => <T key={j} x={tx + 54} y={ty + 66 + j * 16} size={MIN_TEXT} anchor="middle" color={C.muted}>{l}</T>)}
            </Anim>
          );
        })}
        <Para x={18} y={pnY} w={324} size={MIN_TEXT} color={C.muted} text={PREVENT_NOTE} />
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
    "Pressure injury stages describe tissue findings and the extent of tissue loss; actual tissue depth varies by anatomical location. Stages are not a required progression, and a healing pressure injury is not reverse-staged.",
    "Stage 1 pressure injury: intact skin with a localized area of non-blanchable erythema. In darkly pigmented skin the color change may appear differently, so localized warmth, firmness and sensation changes are also assessed.",
    "Stage 2: partial-thickness skin loss with exposed dermis; the wound bed is viable, pink or red, and moist, and may present as an intact or ruptured serum-filled blister. Adipose tissue is not visible, and granulation tissue, slough and eschar are not present. Stage 2 applies only to pressure-related injury: it is not used for moisture-associated skin damage (including incontinence-associated dermatitis), skin tears, burns or abrasions.",
    "Stage 3: full-thickness skin loss in which adipose (fat) tissue is visible; slough or eschar may be present, but fascia, muscle, tendon, ligament, cartilage and bone are not exposed.",
    "Stage 4: full-thickness skin and tissue loss with exposed or directly palpable fascia, muscle, tendon, ligament, cartilage or bone.",
    "Unstageable: full-thickness skin and tissue loss in which the extent of damage cannot be confirmed because it is obscured by slough or eschar.",
    "Deep tissue pressure injury: intact or non-intact skin with a localized area of persistent non-blanchable deep red, maroon or purple discoloration, or epidermal separation revealing a dark wound bed or a blood-filled blister. It results from intense and/or prolonged pressure and shear forces at the bone-muscle interface.",
    "On the Braden scale, a lower score indicates a higher risk of pressure injury.",
    "Prevention includes repositioning on an individualized schedule that is reassessed (every 2 hours is a commonly specified schedule), keeping the head of the bed at or below 30 degrees if clinically appropriate to reduce shear (respiratory or aspiration-prevention needs may require a higher position), pressure-redistributing support surfaces, keeping skin clean and dry, and adequate protein, calories and fluids.",
  ],
  steps: [
    { key: "layers", focus: ["head", "s1", "s2", "s3", "s4", "legend", "r1", "r2", "r3", "r4", "note"], caption: "Each column is the same skin cut through: epidermis, dermis, fat, muscle and bone. Stages describe what the tissue shows and how much is lost; real depth varies by location, and stages are not a required progression.",
      narration: "Each column is the same skin, cut through: the epidermis, the dermis, fat, muscle, and bone. A stage describes what the tissue shows and how much tissue is lost. Real depth varies from one part of the body to another, and the stages are not a required progression." },
    { key: "stage1", focus: ["head", "s1", "s2", "s3", "s4", "legend", "r1"], caption: "Stage 1: the skin is intact, with redness that does not blanch when pressed. In darker skin the color change can look different, so warmth, firmness and sensation are also checked.",
      narration: "Stage one. The skin is intact, with an area of redness that does not blanch when you press on it. In darker skin the color change can look different, so warmth, firmness, and sensation are checked too." },
    { key: "stage2", focus: ["head", "s1", "s2", "s3", "s4", "legend", "r2"], caption: "Stage 2: partial-thickness loss with exposed dermis: a shallow, pink, moist wound, or an intact or ruptured serum-filled blister. No fat, granulation tissue, slough or eschar. It is only for pressure-related injury, not moisture damage, skin tears, burns or abrasions.",
      narration: "Stage two is partial-thickness loss with exposed dermis. It looks like a shallow, pink, moist wound, or an intact or ruptured blister filled with clear serum. There is no fat, granulation tissue, slough, or eschar. And Stage 2 is only for injury from pressure, not for moisture damage, skin tears, burns, or abrasions." },
    { key: "stage3", focus: ["head", "s1", "s2", "s3", "s4", "legend", "r3"], caption: "Stage 3: full-thickness loss with fat visible. Slough or eschar may be present, but no fascia, muscle, tendon, ligament, cartilage or bone is exposed.",
      narration: "Stage three is full-thickness loss, with fat visible. Slough or eschar may be present, but no fascia, muscle, tendon, ligament, cartilage, or bone is exposed." },
    { key: "stage4", focus: ["head", "s1", "s2", "s3", "s4", "legend", "r4"], caption: "Stage 4: full-thickness loss with exposed or directly palpable fascia, muscle, tendon, ligament, cartilage or bone.",
      narration: "Stage four is full-thickness loss, with fascia, muscle, tendon, ligament, cartilage, or bone exposed, or directly palpable." },
    { key: "other", focus: ["other"], caption: "Unstageable: slough or eschar hides the base, so the extent of loss can't be confirmed. Deep tissue injury: intact or non-intact skin with a persistent, non-blanchable deep red, maroon or purple area, a blood-filled blister, or epidermal separation showing a dark wound bed.",
      narration: "If slough or eschar covers the base, the extent of loss can't be confirmed, so the injury is unstageable. A deep tissue injury can be on intact or broken skin: a persistent, non-blanchable area of deep red, maroon, or purple, a blood-filled blister, or skin separating to show a dark wound bed." },
    { key: "prevent", focus: ["prevent"], caption: "Prevention: assess with the Braden scale, where a lower score means higher risk. Reposition on an individualized schedule (every 2 hours is a common NCLEX schedule), keep the head of the bed at 30° or lower if clinically appropriate, use a support surface, keep skin clean and dry, and support nutrition.",
      narration: "Prevention starts with the Braden scale, and remember, a lower score means a higher risk. Reposition the client on an individualized schedule; every two hours is a common schedule on the exam. Keep the head of the bed at thirty degrees or lower if that is clinically appropriate, use a pressure-redistributing surface, keep the skin clean and dry, and make sure they get enough protein, calories, and fluids." },
  ],
};
