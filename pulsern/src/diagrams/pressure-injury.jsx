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
import { Frame, G, T, Box, C } from "./kit.jsx";

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
   the stages are defined by. */
const LAYERS = [
  { key: "epi", name: "Epidermis", h: 8, fill: C.teal, op: 0.06 },
  { key: "derm", name: "Dermis", h: 16, fill: C.teal, op: 0.18 },
  { key: "fat", name: "Fat", h: 22, fill: C.lab, op: 1 },
  { key: "muscle", name: "Muscle", h: 18, fill: C.teal, op: 0.42 },
  { key: "bone", name: "Bone", h: 12, fill: C.muted, op: 0.4 },
];
/* Legend x positions: measured item widths (swatch + label) spread evenly over the
   canvas, so the gaps match whatever the label lengths. */
const LEGEND_X = [12, 102, 178, 236, 312];
const TOP = 94;
const depthTo = (key) => {   // y at the BOTTOM of a layer
  let y = TOP;
  for (const l of LAYERS) { y += l.h; if (l.key === key) return y; }
  return y;
};

function Column({ x, w, stage, title, sub, wound, highlight }) {
  const bottom = depthTo("bone");
  return (
    <G id={`s${stage}`}>
      {highlight ? <rect x={x - 3} y={60} width={w + 6} height={bottom - 60 + 52} rx={8} fill="none" stroke={C.coral} strokeWidth={2} strokeDasharray="5 4" /> : null}
      <T x={x + w / 2} y={74} size={12} weight={700} anchor="middle">{title}</T>
      {/* the layers */}
      {(() => {
        let y = TOP;
        return LAYERS.map((l) => {
          const r = <rect key={l.key} x={x} y={y} width={w} height={l.h} fill={l.fill} fillOpacity={l.op} stroke={C.line} strokeWidth={0.8} />;
          y += l.h;
          return r;
        });
      })()}
      {wound}
      {sub.map((line, i) => <T key={i} x={x + w / 2} y={bottom + 16 + i * 13} size={10} anchor="middle" color={C.muted}>{line}</T>)}
    </G>
  );
}

/* A wound crater from the surface down to `toLayer`, stopping `short` units
   above that layer's floor so the next layer down is visibly untouched. */
const crater = (x, w, toLayer, inset = 0.22, short = 1) => {
  const y1 = depthTo(toLayer) - short;
  const l = x + w * inset, r = x + w * (1 - inset);
  return <path d={`M${l - 6},${TOP} Q${l},${TOP + 2} ${l + 4},${(TOP + y1) / 2} Q${(l + r) / 2},${y1 + 3} ${r - 4},${(TOP + y1) / 2} Q${r},${TOP + 2} ${r + 6},${TOP} Z`}
    fill={C.coral} fillOpacity={0.75} stroke={C.danger} strokeWidth={1} />;
};

export function PressureInjuryDiagram({ params = null, focus = null }) {
  const lit = params?.stage;
  const W = 80, gap = 7, x0 = 9;
  const xs = [0, 1, 2, 3].map((i) => x0 + i * (W + gap));
  return (
    <Frame h={438} focus={focus} title="Pressure injury stages"
      desc="Cross-sections through epidermis, dermis, fat, muscle and bone. Stage 1: intact skin with non-blanchable redness. Stage 2: partial-thickness loss into the dermis. Stage 3: full-thickness loss into fat; no muscle or bone exposed. Stage 4: full-thickness loss exposing muscle, tendon or bone. Unstageable: the base is covered by slough or eschar. Deep tissue pressure injury: intact or non-intact skin with persistent deep red, maroon or purple discoloration. Prevention: Braden scale, regular repositioning, head of bed at or below 30 degrees unless contraindicated, pressure-redistributing surfaces, moisture and nutrition.">
      <G id="layers">
        <T x={180} y={20} size={12} weight={700} anchor="middle">How deep does the damage go?</T>
        <T x={180} y={38} size={10.5} anchor="middle" color={C.muted}>Each column is the same skin, cut through</T>
      </G>
      <Column x={xs[0]} w={W} stage={1} title="Stage 1" highlight={lit === 1}
        sub={["Intact skin,", "redness that", "does not blanch"]}
        wound={<rect x={xs[0] + W * 0.18} y={TOP} width={W * 0.64} height={depthTo("derm") - TOP} fill={C.coral} fillOpacity={0.45} />} />
      <Column x={xs[1]} w={W} stage={2} title="Stage 2" highlight={lit === 2}
        sub={["Partial", "thickness —", "into dermis"]}
        wound={crater(xs[1], W, "derm", 0.24, 4)} />
      <Column x={xs[2]} w={W} stage={3} title="Stage 3" highlight={lit === 3}
        sub={["Full thickness", "— into fat;", "no muscle/bone"]}
        wound={crater(xs[2], W, "fat", 0.18, 6)} />
      <Column x={xs[3]} w={W} stage={4} title="Stage 4" highlight={lit === 4}
        sub={["Exposes", "muscle, tendon", "or bone"]}
        wound={crater(xs[3], W, "muscle", 0.14, 1)} />
      <G id="legend">
        {LAYERS.map((l, i) => (
          <g key={l.key}>
            <rect x={LEGEND_X[i]} y={252} width={12} height={10} fill={l.fill} fillOpacity={l.op} stroke={C.line} />
            <T x={LEGEND_X[i] + 16} y={261} size={10}>{l.name}</T>
          </g>
        ))}
      </G>
      <G id="other">
        <Box x={8} y={274} w={170} h={70} r={10} fill={C.surface} stroke={lit === "unstageable" ? C.coral : C.line} />
        <T x={18} y={293} size={11.5} weight={700}>Unstageable</T>
        <T x={18} y={310} size={10.5}>Base covered by slough</T>
        <T x={18} y={325} size={10.5}>or eschar — depth unseen</T>
        <Box x={184} y={274} w={168} h={70} r={10} fill={C.surface} stroke={lit === "dtpi" ? C.coral : C.line} />
        <T x={194} y={293} size={11.5} weight={700}>Deep tissue injury</T>
        <T x={194} y={310} size={10.5}>Persistent deep red,</T>
        <T x={194} y={325} size={10.5}>maroon or purple area</T>
      </G>
      <G id="prevent">
        <Box x={8} y={354} w={344} h={80} r={10} fill={C.card} />
        <T x={18} y={373} size={11.5} weight={700} color={C.accent}>Prevent</T>
        <T x={18} y={390} size={10.5}>Braden scale: lower score = higher risk · reposition</T>
        <T x={18} y={405} size={10.5}>regularly · HOB ≤ 30° unless contraindicated (shear)</T>
        <T x={18} y={420} size={10.5}>pressure-redistributing surface · moisture · nutrition</T>
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
    "Prevention includes regular repositioning, keeping the head of the bed at or below 30 degrees unless contraindicated to reduce shear, pressure-redistributing support surfaces, and managing moisture and nutrition.",
  ],
  steps: [
    { key: "layers", focus: ["layers", "legend"], caption: "Each column is the same skin cut through: epidermis, dermis, fat, muscle and bone. The stage is simply how deep the damage reaches.",
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
    { key: "prevent", focus: ["prevent"], caption: "Prevention: assess with the Braden scale — a lower score means higher risk. Reposition regularly, keep the head of the bed at 30° or lower unless contraindicated, and manage moisture and nutrition.",
      narration: "Prevention starts with the Braden scale — and remember, a lower score means a higher risk. Reposition the client regularly, keep the head of the bed at thirty degrees or lower unless that's contraindicated, and manage moisture and nutrition." },
  ],
};
