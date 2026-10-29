/* IV fluid tonicity: what each kind of bag does to a cell.
   ------------------------------------------------------------------
   The cell is drawn in each solution, because "which way does the water
   move" is the whole concept and it is far easier to see than to read.

   Tonicity is about EFFECTIVE solutes: those that cannot cross into the
   cell (sodium, chloride). Osmolarity counts every dissolved particle,
   including glucose, which cells take up (Sol, PR #155 diagram review:
   the first draft taught osmolarity as tonicity). So each panel compares
   equal-size samples, inside the cell and in the fluid around it, with
   dots at the true relative density — not a count spread over unequal
   areas — and then shows the cell after the water has moved.

   Bag classifications are the standard NCLEX teaching lists, as labeled
   (osmolarity in the bag). Every dextrose fluid is starred: dextrose is
   usually cleared quickly (glucose builds up only when delivery outpaces
   uptake, as with impaired insulin action) and the fluid then acts like
   what is left. */
import React from "react";
import { Frame, G, T, Box, Arrow, C, Anim, OnStep, Loop, Flow, Para, paraLines, useDefs, BODY_TEXT, MIN_TEXT } from "./kit.jsx";

export const FLUIDS = {
  isotonic: ["0.9% NaCl (NS)", "lactated Ringer's", "D5W*"],
  hypotonic: ["0.45% NaCl (½NS)", "0.225% NaCl (¼NS)"],
  hypertonic: ["3% NaCl", "D5 0.9% NaCl*", "D5 ½NS*", "D5LR*", "D10W*"],
};

/* A cell: smooth when normal or swollen, crenated (scalloped) when shrunk.
   Teal, not red: CLAUDE.md reserves coral for incorrect/critical states, and
   a cell is neither — even though real red cells are red. The radial fill
   is pale in the middle like a biconcave red cell. */
function Cell({ cx, cy, r, crenated }) {
  const u = useDefs();
  if (!crenated) return <circle cx={cx} cy={cy} r={r} fill={u("cell")} stroke={C.teal} strokeWidth={1.4} filter={u("shadow")} />;
  const n = 14;
  const d = Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r - 2.6 : r + 1.2;
    return `${i ? "L" : "M"}${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ") + " Z";
  return <path d={d} fill={u("cell")} stroke={C.teal} strokeWidth={1.4} strokeLinejoin="round" filter={u("shadow")} />;
}

/* Dissolved particles, placed deterministically (a seeded generator, so
   every render and screenshot is identical) inside a circle of radius r.
   Two circles of the SAME size are compared, so the number of dots is the
   concentration. */
function seeded(seed) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
export function particles({ cx, cy, r, n, seed }) {
  const rnd = seeded(seed);
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 5000) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (r - 4);
    const p = [cx + d * Math.cos(a), cy + d * Math.sin(a)];
    if (out.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 6.5)) out.push(p);
  }
  return out;
}
const Dot = ({ p }) => <circle cx={p[0]} cy={p[1]} r={2.2} fill={C.ink} fillOpacity={0.75} />;
const Drop = ({ x, y, s = 1 }) => (
  <path transform={`translate(${x},${y}) scale(${s})`} d="M0,-4.5 C2,-1.6 3.2,0 3.2,1.3 A3.2,3.2 0 1 1 -3.2,1.3 C-3.2,0 -2,-1.6 0,-4.5 Z" fill={C.teal} fillOpacity={0.85} />
);

/* Inside the cell = 5 effective-solute particles per sample, always. */
export const INSIDE = 5;
const PY = 112, PW = 110, PH = 214, SR = 17, START_R = 22;
function Panel({ id, step, x, title, outside, after, flow, sub, seed }) {
  const u = useDefs();
  const lx = x + 29, rx = x + 81, sy = PY + 68;
  const ax = x + PW / 2, cy = PY + 146;
  const inn = particles({ cx: lx, cy: sy, r: SR, n: INSIDE, seed });
  const out = particles({ cx: rx, cy: sy, r: SR, n: outside, seed: seed + 7 });
  return (
    <G id={id}>
      <Box x={x} y={PY} w={PW} h={PH} r={10} fill={C.card} lift />
      {/* the panel this step is about; the other two stay for comparison */}
      <OnStep on={step}><rect className="dg-solid" x={x - 3} y={PY - 3} width={PW + 6} height={PH + 6} rx={12} fill="none" stroke={C.accent} strokeWidth={2.2} /></OnStep>
      <T x={ax} y={PY + 21} size={BODY_TEXT} weight={700} anchor="middle">{title}</T>
      <T x={lx} y={PY + 43} size={MIN_TEXT} anchor="middle" color={C.muted}>cell</T>
      <T x={rx} y={PY + 43} size={MIN_TEXT} anchor="middle" color={C.muted}>fluid</T>
      {/* equal-size samples: inside the cell, and of the fluid around it */}
      <circle cx={lx} cy={sy} r={SR} fill={u("cell")} stroke={C.teal} strokeWidth={1.4} />
      <circle cx={rx} cy={sy} r={SR} fill={u("teal-soft")} stroke={C.muted} strokeWidth={1.2} strokeDasharray="3 3" />
      {inn.map((p, i) => <Dot key={`i${i}`} p={p} />)}
      {out.map((p, i) => <Dot key={`o${i}`} p={p} />)}
      {/* which way the water goes */}
      {flow === "both"
        ? <><Arrow x1={lx + 4} y1={sy + 26} x2={rx - 4} y2={sy + 26} sw={1.6} /><Arrow x1={rx - 4} y1={sy + 34} x2={lx + 4} y2={sy + 34} sw={1.6} /></>
        : flow === "in"
          ? <Arrow x1={rx} y1={sy + 30} x2={lx} y2={sy + 30} sw={2} />
          : <Arrow x1={lx} y1={sy + 30} x2={rx} y2={sy + 30} sw={2} />}
      <Loop on={step}>
        {flow === "both" ? null : <Flow d={flow === "in" ? `M${rx},${sy + 22} L${lx},${sy + 22}` : `M${lx},${sy + 22} L${rx},${sy + 22}`} n={2} dur={1.9} />}
      </Loop>
      {/* the cell afterwards, over a dashed ring at its starting size, so
          "same size", "swells" and "shrinks" can be seen (Sol, round 2:
          the samples above read as the starting cell) */}
      <Anim on={step} kind="scale" from={START_R / after.r} dur={1800}>
        <Cell cx={ax} cy={cy} r={after.r} crenated={after.crenated} />
      </Anim>
      {/* the start-size ring is drawn OVER the cell, in body ink on a card
          halo, so it stays visible on a swollen cell (Sol, round 15) */}
      <circle className="dg-solid" cx={ax} cy={cy} r={START_R} fill="none" stroke={C.card} strokeWidth={3} />
      <circle className="dg-solid" cx={ax} cy={cy} r={START_R} fill="none" stroke={C.ink} strokeWidth={1.3} strokeDasharray="3 3" />
      <Anim on={step} kind="fade" delay={900}>
        {sub.map((line, i) => <T key={i} x={ax} y={PY + 188 + i * 17} size={MIN_TEXT} anchor="middle" color={i ? C.muted : C.ink} weight={i ? 500 : 600}>{line}</T>)}
      </Anim>
    </G>
  );
}

/* An IV bag: hanger, bag with fluid, port. */
function Bag({ x, y }) {
  const u = useDefs();
  return (
    <g>
      <path d={`M${x + 7},${y} v-3 h4 v3`} fill="none" stroke={C.muted} strokeWidth={1} />
      <rect x={x} y={y} width={18} height={24} rx={4} fill={C.card} stroke={C.muted} strokeWidth={1.1} />
      <rect x={x + 1.5} y={y + 8} width={15} height={14.5} rx={3} fill={u("fluid")} />
      <path d={`M${x + 4},${y + 5} h10`} stroke={C.muted} strokeOpacity={0.5} strokeWidth={0.8} />
      <rect x={x + 7} y={y + 24} width={4} height={4} rx={1} fill={C.muted} fillOpacity={0.6} />
    </g>
  );
}

/* Glucose as a hexagon, the way chemistry draws a sugar ring. */
const Hex = ({ cx, cy, r = 7 }) => (
  <path d={Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + (i * Math.PI) / 3; return `${i ? "L" : "M"}${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ") + " Z"}
    fill={C.teal} fillOpacity={0.15} stroke={C.teal} strokeWidth={1.3} />
);

/* A brain, side view, with arrows pushing outward: cerebral edema. */
function Brain({ cx, cy }) {
  return (
    <g>
      <path d={`M${cx - 15},${cy + 4} C${cx - 19},${cy - 4} ${cx - 13},${cy - 13} ${cx - 5},${cy - 12} C${cx - 1},${cy - 17} ${cx + 9},${cy - 16} ${cx + 12},${cy - 10} C${cx + 19},${cy - 8} ${cx + 19},${cy + 2} ${cx + 14},${cy + 6} C${cx + 13},${cy + 12} ${cx + 4},${cy + 13} ${cx},${cy + 9} C${cx - 5},${cy + 13} ${cx - 13},${cy + 10} ${cx - 15},${cy + 4} Z`}
        fill={C.coral} fillOpacity={0.18} stroke={C.coral} strokeWidth={1.3} />
      <path d={`M${cx - 8},${cy - 6} q4,3 0,7 M${cx + 1},${cy - 10} q-3,5 2,8 q4,2 2,7 M${cx + 9},${cy - 4} q-3,3 1,6`} fill="none" stroke={C.coral} strokeOpacity={0.7} strokeWidth={1} />
    </g>
  );
}

const LISTS = [
  ["Isotonic", "0.9% NaCl, lactated\u00a0Ringer's, D5W*"],
  ["Hypotonic", "0.45% NaCl, 0.225% NaCl"],
  ["Hypertonic", "3% NaCl; D5\u00a00.9%\u00a0NaCl*, D5\u00a0½NS*, D5LR*, D10W*"],
];
const DEX = [
  "*Dextrose counts in the bag but is usually cleared quickly; if delivery outpaces uptake (as with impaired insulin action), glucose builds up. Once it is used, the fluid acts like what is left:",
  "D5W, D10W: free water (hypotonic). D5 ½NS: like ½NS. D5 0.9% NaCl, D5LR: like NS and LR (isotonic).",
  "Once the dextrose is used, 3% NaCl is the bag shown that stays hypertonic. If glucose builds up instead (high blood glucose), dextrose fluids can raise plasma tonicity too.",
];
const SAFE = [
  "Hypotonic fluid can worsen cerebral edema, so it is generally avoided with increased intracranial pressure or acute brain injury; the choice depends on the clinical picture.",
  "Isotonic and hypertonic fluids: monitor for fluid volume overload.",
];
const LH = 1.3;
const linesH = (texts, w, size) => texts.reduce((a, t) => a + paraLines(t, w, size).length * size * LH, 0);

export function TonicityDiagram({ focus = null }) {
  const yB = PY + PH + 12;
  const hB = 34 + LISTS.reduce((a, [k, t]) => a + paraLines(`${k} ${t}`, 320).length * BODY_TEXT * LH, 0) + 6;
  const yD = yB + hB + 10;
  const hD = 32 + linesH(DEX, 272, MIN_TEXT) + (DEX.length - 1) * 5 + 4;
  const yS = yD + hD + 10;
  const hS = 32 + linesH(SAFE, 272, MIN_TEXT) + 5 + 4;
  return (
    <Frame h={yS + hS + 6} focus={focus} title="IV fluid tonicity"
      regions={{ intro: [0, 68], key: [74, 110], iso: [PY, PY + PH], hypo: [PY, PY + PH], hyper: [PY, PY + PH], fluids: [yB, yB + hB], dextrose: [yD, yD + hD], safety: [yS, yS + hS] }}
      desc="Water moves across cell membranes toward the side with more effective solute, meaning solutes that cannot cross into the cell. Each panel compares equal-size samples of the cell and the fluid around it, then shows the cell afterwards against a dashed ring at its starting size. Isotonic fluid: the same effective solute concentration on both sides, so no net water shift (water keeps moving both ways at equal rates) and cell volume is unchanged; it expands the extracellular fluid, in the blood vessels and the tissue spaces. Hypotonic fluid: less effective solute outside, so water moves into cells and they swell. Hypertonic fluid: more effective solute outside, so water moves out of cells and they shrink. Bags as labeled by osmolarity in the bag: isotonic 0.9% NaCl, lactated Ringer's, D5W; hypotonic 0.45% and 0.225% NaCl; hypertonic 3% NaCl, D5 0.9% NaCl, D5 half normal saline, D5LR, D10W. Dextrose is usually cleared rapidly; if delivery exceeds uptake and metabolism, for example with impaired insulin action, glucose can accumulate. Once it is used, the fluid acts like what is left: D5W and D10W like free water (hypotonic), D5 half normal saline like half normal saline, D5 0.9% NaCl and D5LR like their isotonic bases; once the dextrose has been used, 3% NaCl is the fluid shown that remains hypertonic, but if glucose accumulates, dextrose-containing fluids can also raise plasma tonicity. Hypotonic fluid can worsen cerebral edema and is generally avoided with increased intracranial pressure or acute brain injury; the choice depends on the clinical picture. Monitor isotonic and hypertonic infusions for fluid volume overload.">
      <G id="intro">
        <T x={180} y={18} size={BODY_TEXT} weight={700} anchor="middle">Water moves toward more effective solute</T>
        <T x={180} y={37} size={MIN_TEXT} anchor="middle" color={C.muted}>effective solute: cannot cross into the cell</T>
        <Dot p={[96, 58]} />
        <T x={103} y={62} size={MIN_TEXT} color={C.muted}>effective solute</T>
        <Drop x={232} y={58} s={1} />
        <T x={240} y={62} size={MIN_TEXT} color={C.muted}>water</T>
      </G>
      <G id="key">
        <T x={180} y={88} size={MIN_TEXT} anchor="middle" color={C.muted}>Top: equal-size samples of cell and fluid.</T>
        <T x={180} y={105} size={MIN_TEXT} anchor="middle" color={C.muted}>Bottom: the cell after; dashed ring = start size.</T>
      </G>
      <Panel id="iso" step="isotonic" x={8} title="Isotonic" outside={5} flow="both" after={{ r: START_R }} sub={["No net shift", "same size"]} seed={11} />
      <Panel id="hypo" step="hypotonic" x={125} title="Hypotonic" outside={2} flow="in" after={{ r: 27 }} sub={["Water in", "cell swells"]} seed={23} />
      <Panel id="hyper" step="hypertonic" x={242} title="Hypertonic" outside={9} flow="out" after={{ r: 15, crenated: true }} sub={["Water out", "cell shrinks"]} seed={37} />
      <G id="fluids">
        <Anim on="bags" kind="pop">
          <Box x={8} y={yB} w={344} h={hB} r={10} fill={C.card} lift />
          <T x={20} y={yB + 22} size={BODY_TEXT} weight={700} color={C.accent}>Bags by in-bag osmolarity</T>
          <Bag x={322} y={yB + 7} />
          {(() => { let ty = yB + 44; return LISTS.map(([k, t]) => {
            const at = ty; ty += paraLines(`${k} ${t}`, 320).length * BODY_TEXT * LH;
            return <G key={k} id={`fluids-${k === "Isotonic" ? "iso" : k === "Hypotonic" ? "hypo" : "hyper"}`}><Para x={20} y={at} w={320} lead={k} text={t} /></G>;
          }); })()}
        </Anim>
      </G>
      <G id="dextrose">
        <Box x={8} y={yD} w={344} h={hD} r={10} fill={C.surface} lift />
        <T x={20} y={yD + 22} size={BODY_TEXT} weight={700} color={C.accent}>The dextrose catch</T>
        <Anim on="dextrose" kind="fade" delay={300}><Hex cx={292} cy={yD + 30} /></Anim>
        <Anim on="dextrose" kind="fade" delay={700}><Arrow x1={304} y1={yD + 30} x2={324} y2={yD + 30} color="muted" sw={1.4} /></Anim>
        <Anim on="dextrose" kind="pop" delay={1100}><Drop x={336} y={yD + 31} s={1.8} /></Anim>
        {(() => { let ty = yD + 44; return DEX.map((t, i) => {
          const at = ty; ty += paraLines(t, 272, MIN_TEXT).length * MIN_TEXT * LH + 5;
          return <Para key={i} x={20} y={at} w={i ? 320 : 272} size={MIN_TEXT} text={t} />;
        }); })()}
      </G>
      <G id="safety">
        <Box x={8} y={yS} w={344} h={hS} r={10} fill={C.noBg} stroke={C.coral} lift />
        <T x={20} y={yS + 22} size={BODY_TEXT} weight={700} color={C.danger}>Safety</T>
        <Anim on="safety" kind="scale" from={0.82} dur={1400}><Brain cx={322} cy={yS + 28} /></Anim>
        {(() => { let ty = yS + 44; return SAFE.map((t, i) => {
          const at = ty; ty += paraLines(t, 272, MIN_TEXT).length * MIN_TEXT * LH + 5;
          return <Para key={i} x={20} y={at} w={i ? 320 : 272} size={MIN_TEXT} text={t} />;
        }); })()}
      </G>
    </Frame>
  );
}

/* What each player step SHOWS, for the image's text alternative (Sol,
   round 12): the panels, the full bag lists and the boxes' text. */
const INTRO_TEXT = "Water moves toward more effective solute. Effective solute: cannot cross into the cell. Legend: dots are effective solute; drops are water.";
const KEY_TEXT = "Each panel: top, equal-size samples of cell and fluid; bottom, the cell after, with a dashed ring at its start size.";
const PANELS_TEXT = "Isotonic: the same effective solute inside and out; arrows both ways; no net shift, same size. Hypotonic: less solute in the fluid; water in, the cell swells. Hypertonic: more solute in the fluid; water out, the cell shrinks.";
const listsText = () => `Bags by in-bag osmolarity: ${LISTS.map(([k, t]) => `${k}: ${t.replace(/\u00a0/g, " ")}`).join(". ")}. A star marks a dextrose bag.`;
export function tonicityStepDesc(key) {
  return {
    isotonic: `${INTRO_TEXT} ${KEY_TEXT} ${PANELS_TEXT} The isotonic panel is outlined.`,
    hypotonic: `${KEY_TEXT} ${PANELS_TEXT} The hypotonic panel is outlined.`,
    hypertonic: `${KEY_TEXT} ${PANELS_TEXT} The hypertonic panel is outlined.`,
    bags: listsText(),
    dextrose: `${listsText()} The dextrose catch: ${DEX.join(" ")}`,
    safety: `Safety: ${SAFE.join(" ")}`,
  }[key] ?? null;
}

export const tonicity = {
  id: "tonicity",
  title: "IV fluid tonicity",
  concepts: ["fluid-balance", "iv-therapy", "sodium"],
  Diagram: TonicityDiagram,
  example: {},
  facts: [
    "Tonicity is set by effective solutes, those that cannot freely cross the cell membrane (such as sodium and chloride); water moves across the membrane toward the side with the higher effective solute concentration. Osmolarity counts all dissolved particles, including ones such as glucose that cells take up.",
    "Isotonic fluids cause no net water shift into or out of cells: water keeps moving both ways at equal rates, so cell volume is unchanged. Separately from that definition, isotonic crystalloids such as 0.9% NaCl and lactated Ringer's expand extracellular fluid volume: they cross capillary walls freely, so after equilibration most of the infused volume is in the interstitial space and only roughly a quarter remains in the vessels (colloids such as albumin distribute differently).",
    "Hypotonic fluids move water into cells, which swell. Examples: 0.45% NaCl, 0.225% NaCl.",
    "Hypertonic saline (3% NaCl) pulls water out of cells into the extracellular fluid, and cells shrink.",
    "IV bags are classified by their osmolarity in the bag: D5W is isotonic in the bag, and D5 0.9% NaCl, D5 0.45% NaCl, D5LR and D10W are hypertonic in the bag. Dextrose is usually cleared rapidly; if delivery exceeds uptake and metabolism, for example with impaired insulin action, glucose can accumulate and contribute to plasma tonicity. Once the dextrose is used, the fluid acts like what remains: D5W and D10W like free water (hypotonic), D5 0.45% NaCl like 0.45% NaCl, D5 0.9% NaCl and D5LR like 0.9% NaCl and lactated Ringer's. After the dextrose has been taken up and metabolized, 3% NaCl is the fluid shown that remains hypertonic; if glucose accumulates (delivery exceeds uptake, as with hyperglycemia or impaired insulin action), dextrose-containing fluids can also increase plasma tonicity.",
    "Hypotonic fluids can worsen cerebral edema and are generally avoided with increased intracranial pressure or acute brain injury; fluid selection depends on the clinical context.",
    "Clients receiving isotonic or hypertonic fluids are monitored for fluid volume overload.",
  ],
  steps: [
    { key: "isotonic", desc: (p) => tonicityStepDesc("isotonic", p), focus: ["intro", "key", "iso", "hypo", "hyper"], caption: "Water moves toward the side with more effective solute: solutes that can't freely cross the cell membrane in that time. Isotonic fluid has the same effective solute concentration as the cell, so there is no net water shift: water keeps moving both ways at the same rate and the cell keeps its size. Isotonic crystalloids such as normal saline and LR expand the fluid outside the cells, in the vessels and the tissues, which is why they are used to replace volume.",
      narration: "Water moves toward the side with more effective solute. Effective solutes are the ones that can't freely cross the cell membrane in that time. Isotonic fluid has the same effective solute concentration as the cell, so there is no net water shift. Water keeps moving both ways at the same rate, and the cell keeps its size. Isotonic crystalloids, such as normal saline and lactated Ringer's, expand the fluid outside the cells, in the blood vessels and in the tissues, which is why they are used to replace volume." },
    { key: "hypotonic", desc: (p) => tonicityStepDesc("hypotonic", p), focus: ["key", "iso", "hypo", "hyper"], caption: "Hypotonic fluid has less effective solute than the cell, so water moves into the cell and it swells.",
      narration: "Hypotonic fluid has less effective solute than the inside of the cell, so water moves into the cell, and the cell swells." },
    { key: "hypertonic", desc: (p) => tonicityStepDesc("hypertonic", p), focus: ["key", "iso", "hypo", "hyper"], caption: "Hypertonic fluid, like 3% saline, has more effective solute than the cell, so water is pulled out of the cell into the fluid around it, and the cell shrinks.",
      narration: "Hypertonic fluid, like three percent saline, has more effective solute than the cell, so water is pulled out of the cell and into the fluid around it, and the cell shrinks." },
    { key: "bags", desc: (p) => tonicityStepDesc("bags", p), focus: ["fluids"], caption: "Know which bag is which. These are the usual NCLEX categories, by osmolarity in the bag: osmolarity counts every particle, while tonicity is what changes cell size. They mostly agree, but dextrose is the catch: D5W is about iso-osmolar in the bag, yet acts hypotonic once the glucose is used.",
      narration: "Know which bag is which. These are the usual NCLEX categories, sorted by osmolarity in the bag. Osmolarity counts every particle, while tonicity is what actually changes cell size. They mostly agree, but dextrose is the catch. D-five-W is about iso-osmolar in the bag, yet it acts hypotonic once the glucose is used." },
    { key: "dextrose", desc: (p) => tonicityStepDesc("dextrose", p), focus: ["fluids", "dextrose"], caption: "Dextrose is usually cleared quickly; if delivery outpaces uptake, as with impaired insulin action, glucose builds up. Once it is used, the fluid acts like what is left: D5W and D10W become free water, D5 ½NS acts like ½NS, and D5NS and D5LR act like their isotonic bases. Once the dextrose is used, 3% saline is the bag shown that stays hypertonic; if glucose builds up instead, dextrose fluids can raise plasma tonicity too.",
      narration: "Dextrose is usually cleared quickly. But if it is given faster than the body can take it up, as with impaired insulin action, glucose builds up. Once it is used, the fluid acts like whatever is left. D-five-W and D-ten-W become free water. D-five half-normal saline acts like half-normal saline. And D-five normal saline and D-five lactated Ringer's act like their isotonic bases. Once the dextrose has been used, three percent saline is the bag shown that stays hypertonic. But if glucose builds up instead, the dextrose fluids can raise plasma tonicity too." },
    { key: "safety", desc: (p) => tonicityStepDesc("safety", p), focus: ["safety"], caption: "Hypotonic fluid can worsen cerebral edema, so it is generally avoided with increased intracranial pressure or an acute brain injury; the right fluid depends on the clinical picture. Watch isotonic and hypertonic infusions for fluid overload.",
      narration: "Hypotonic fluid can make cerebral edema worse, so it is generally avoided with increased intracranial pressure or an acute brain injury. The right fluid depends on the whole clinical picture. And watch anyone on isotonic or hypertonic fluids for fluid overload." },
  ],
};
