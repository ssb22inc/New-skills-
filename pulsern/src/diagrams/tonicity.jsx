/* IV fluid tonicity: what each kind of bag does to a cell.
   ------------------------------------------------------------------
   The cell is drawn as a red blood cell in each solution, because "which
   way does the water move" is the whole concept and it is far easier to see
   than to read. Water moves toward the side with more dissolved particles.

   Fluid classification follows the standard NCLEX teaching lists, IN THE
   BAG. Every dextrose fluid is starred, because the body uses the dextrose
   quickly and the fluid then acts like what is left: D5W and D10W like free
   water (hypotonic), D5 ½NS like ½NS (hypotonic), D5NS and D5LR like their
   isotonic bases. An earlier draft starred only D5W, which invited students
   to think the rule applied to D5W alone (owner's review, 2026-10-09). */
import React from "react";
import { Frame, G, T, Box, Arrow, C, Anim, Loop, Flow, useDefs } from "./kit.jsx";

export const FLUIDS = {
  isotonic: ["0.9% NaCl (NS)", "Lactated Ringer's", "D5W*"],
  hypotonic: ["0.45% NaCl (½ NS)", "0.225% NaCl (¼ NS)"],
  hypertonic: ["3% NaCl", "D5 0.9% NaCl*", "D5 ½ NS*", "D5LR*", "D10W*"],
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
   every render and screenshot is identical): `outside` in the solution
   around the cell, `inside` within it. Their counts ARE the concept — water
   moves toward the side with more of them. */
function seeded(seed) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
export function particles({ x, cx, cy, r, outside, inside, seed }) {
  const rnd = seeded(seed);
  const out = [], inn = [];
  let guard = 0;
  while (out.length < outside && guard++ < 5000) {
    const px = x + 9 + rnd() * 92, py = PANEL_Y + 30 + rnd() * 74;
    const clear = Math.hypot(px - cx, py - cy) > r + 20 && [...out].every((p) => Math.hypot(p[0] - px, p[1] - py) > 9);
    if (clear) out.push([px, py]);
  }
  guard = 0;
  while (inn.length < inside && guard++ < 5000) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (r * 0.62);
    const p = [cx + d * Math.cos(a), cy + d * Math.sin(a)];
    if (inn.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 6)) inn.push(p);
  }
  return { out, inn };
}
const Dot = ({ p }) => <circle cx={p[0]} cy={p[1]} r={2.1} fill={C.muted} fillOpacity={0.7} />;
const Drop = ({ x, y, s = 1 }) => (
  <path transform={`translate(${x},${y}) scale(${s})`} d="M0,-4.5 C2,-1.6 3.2,0 3.2,1.3 A3.2,3.2 0 1 1 -3.2,1.3 C-3.2,0 -2,-1.6 0,-4.5 Z" fill={C.teal} fillOpacity={0.85} />
);

const PANEL_Y = 40;
function Panel({ id, step, x, title, sub, r, r0 = 22, crenated, flow, outside, seed }) {
  const u = useDefs();
  const cx = x + 55, cy = PANEL_Y + 70;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const { out, inn } = particles({ x, cx, cy, r: Math.max(r, r0), outside, inside: 5, seed });
  const near = r + 4, far = r + 15;
  return (
    <G id={id}>
      <Box x={x} y={PANEL_Y} w={110} h={140} r={10} fill={C.card} lift />
      <rect x={x + 1} y={PANEL_Y + 24} width={108} height={86} fill={u("teal-soft")} />
      <T x={cx} y={PANEL_Y + 17} size={12} weight={700} anchor="middle">{title}</T>
      {out.map((p, i) => <Dot key={i} p={p} />)}
      <Anim on={step} kind="scale" from={r0 / r} dur={1800}>
        <Cell cx={cx} cy={cy} r={r} crenated={crenated} />
      </Anim>
      {inn.map((p, i) => <Dot key={`i${i}`} p={p} />)}
      {flow === "both"
        ? <>
            <Arrow x1={cx - 46} y1={cy - 6} x2={cx - r - 6} y2={cy - 6} color="teal" sw={1.8} />
            <Arrow x1={cx + r + 6} y1={cy + 6} x2={cx + 46} y2={cy + 6} color="teal" sw={1.8} />
          </>
        : dirs.map(([dx, dy], i) => {
            const [a, b] = flow === "in" ? [far, near] : [near, far];
            return <Arrow key={i} x1={cx + dx * a} y1={cy + dy * a} x2={cx + dx * b} y2={cy + dy * b} color="teal" sw={1.8} />;
          })}
      {/* water drops travelling the arrows while this step plays */}
      <Loop on={step}>
        {flow === "both"
          ? <>
              <Flow d={`M${cx - 50},${cy - 14} L${cx - r + 4},${cy - 14}`} n={2} dur={2.2} />
              <Flow d={`M${cx + r - 4},${cy + 14} L${cx + 50},${cy + 14}`} n={2} dur={2.2} />
            </>
          : dirs.map(([dx, dy], i) => {
              const ox = dy ? 9 : 0, oy = dx ? 9 : 0;   // beside the arrow, not on it
              const [a, b] = flow === "in" ? [far + 12, near - 6] : [near - 6, far + 12];
              return <Flow key={i} d={`M${cx + dx * a + ox},${cy + dy * a + oy} L${cx + dx * b + ox},${cy + dy * b + oy}`} n={2} dur={1.9} />;
            })}
      </Loop>
      <Anim on={step} kind="fade" delay={900}>
        {sub.map((line, i) => <T key={i} x={cx} y={PANEL_Y + 124 + i * 12} size={10.5} anchor="middle" color={C.muted}>{line}</T>)}
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

export function TonicityDiagram({ focus = null }) {
  const col = (x, w, id, title, items, i) => (
    <G id={id}>
      <Anim on="bags" kind="pop" delay={i * 160}>
        <Box x={x} y={196} w={w} h={118} r={10} fill={C.card} lift />
        <T x={x + 9} y={214} size={11} weight={700} color={C.accent}>{title}</T>
        <Bag x={x + w - 26} y={203} />
        {items.map((t, j) => <T key={j} x={x + 9} y={238 + j * 15} size={10}>{t}</T>)}
      </Anim>
    </G>
  );
  return (
    <Frame h={498} focus={focus} title="IV fluid tonicity"
      desc="Isotonic fluid: no net water movement, the cell keeps its shape and volume stays in the vessels. Hypotonic fluid: fewer particles outside the cell, so water moves into cells and they swell. Hypertonic fluid: more particles outside the cell, so water moves out of cells into the vessels and cells shrink. Dextrose fluids act like what is left once the dextrose is metabolized: D5W and D10W like free water (hypotonic), D5 half normal saline like half normal saline (hypotonic), D5 normal saline and D5LR like their isotonic bases. Do not give hypotonic fluids with increased intracranial pressure. Monitor isotonic and hypertonic infusions for fluid overload.">
      <T x={180} y={14} size={10.5} anchor="middle" color={C.muted}>Water moves toward the side with MORE particles</T>
      <g>
        <Dot p={[118, 29]} />
        <T x={124} y={32} size={9.5} color={C.muted}>dissolved particle</T>
        <Drop x={214} y={29} s={0.9} />
        <T x={220} y={32} size={9.5} color={C.muted}>water</T>
      </g>
      <Panel id="iso" step="isotonic" x={8} title="Isotonic" sub={["no net shift", "stays in vessels"]} r={22} flow="both" outside={7} seed={11} />
      <Panel id="hypo" step={["hypotonic", "safety"]} x={125} title="Hypotonic" sub={["water moves IN", "cell swells"]} r={26} flow="in" outside={2} seed={23} />
      <Panel id="hyper" step="hypertonic" x={242} title="Hypertonic" sub={["water moves OUT", "cell shrinks"]} r={15} crenated flow="out" outside={14} seed={37} />
      <G id="fluids">
        {col(8, 110, "fluids-iso", "Isotonic", FLUIDS.isotonic, 0)}
        {col(125, 110, "fluids-hypo", "Hypotonic", FLUIDS.hypotonic, 1)}
        {col(242, 110, "fluids-hyper", "Hypertonic", FLUIDS.hypertonic, 2)}
      </G>
      <G id="dextrose">
        <Box x={8} y={324} w={344} h={76} r={10} fill={C.surface} lift />
        <T x={20} y={343} size={11.5} weight={700} color={C.accent}>* Dextrose is used up fast</T>
        {/* sugar used up → water left behind */}
        <Anim on="dextrose" kind="fade" delay={300}><Hex cx={268} cy={339} /></Anim>
        <Anim on="dextrose" kind="fade" delay={700}><Arrow x1={281} y1={339} x2={304} y2={339} color="muted" sw={1.4} /></Anim>
        <Anim on="dextrose" kind="pop" delay={1100}><Drop x={318} y={339} s={1.8} /></Anim>
        <T x={20} y={361} size={10.5}>Then the fluid acts like what is left:</T>
        <T x={20} y={376} size={10.5}>D5W, D10W → free water (hypotonic) · D5 ½NS → ½NS</T>
        <T x={20} y={391} size={10.5}>D5NS, D5LR → NS, LR (isotonic)</T>
      </G>
      <G id="safety">
        <Box x={8} y={410} w={344} h={82} r={10} fill={C.noBg} stroke={C.coral} lift />
        <T x={20} y={429} size={11.5} weight={700} color={C.danger}>Safety</T>
        <Anim on="safety" kind="scale" from={0.82} dur={1400}><Brain cx={324} cy={433} /></Anim>
        <T x={20} y={449} size={10.5}>Hypotonic: never with ↑ICP, stroke or head injury —</T>
        <T x={20} y={464} size={10.5}>water entering brain cells worsens cerebral edema.</T>
        <T x={20} y={482} size={10.5}>Isotonic & hypertonic: watch for fluid overload.</T>
      </G>
    </Frame>
  );
}

export const tonicity = {
  id: "tonicity",
  title: "IV fluid tonicity",
  concepts: ["fluid-balance", "iv-therapy", "sodium"],
  Diagram: TonicityDiagram,
  example: {},
  facts: [
    "Across a cell membrane, water moves toward the side with the higher concentration of dissolved particles.",
    "Isotonic fluids cause no net water shift into or out of cells and expand intravascular volume. Examples: 0.9% NaCl, lactated Ringer's.",
    "Hypotonic fluids move water into cells, which swell. Examples: 0.45% NaCl, 0.225% NaCl.",
    "Hypertonic fluids pull water out of cells into the vascular space, and cells shrink. Examples: 3% NaCl, D5 0.9% NaCl, D5 0.45% NaCl, D5LR, D10W.",
    "Tonicity of dextrose fluids is stated as in the bag; once the dextrose is metabolised the fluid acts like what remains: D5W and D10W like free water (hypotonic), D5 0.45% NaCl like 0.45% NaCl (hypotonic), D5 0.9% NaCl and D5LR like 0.9% NaCl and lactated Ringer's (isotonic).",
    "Hypotonic fluids are avoided in clients with increased intracranial pressure, stroke or head injury because they can worsen cerebral edema.",
    "Clients receiving isotonic or hypertonic fluids are monitored for fluid volume overload.",
  ],
  steps: [
    { key: "isotonic", focus: ["iso"], caption: "Isotonic fluid matches the blood, so water doesn't shift in or out of cells. It stays in the vessels and expands circulating volume.",
      narration: "Isotonic fluid matches the blood, so water doesn't shift into or out of the cells. It stays in the vessels and expands the circulating volume." },
    { key: "hypotonic", focus: ["hypo"], caption: "Hypotonic fluid has fewer particles than the cell, so water moves into the cell and it swells.",
      narration: "Hypotonic fluid has fewer particles than the inside of the cell, so water moves into the cell, and the cell swells." },
    { key: "hypertonic", focus: ["hyper"], caption: "Hypertonic fluid has more particles, so water is pulled out of the cell into the vessel, and the cell shrinks.",
      narration: "Hypertonic fluid has more particles, so water is pulled out of the cell and into the vessel, and the cell shrinks." },
    { key: "bags", focus: ["fluids"], caption: "Know which bag is which. Each fluid is classified as it is in the bag — and every bag with dextrose carries a catch.",
      narration: "Know which bag is which. Each fluid is classified as it is in the bag — and every bag with dextrose in it carries a catch." },
    { key: "dextrose", focus: ["fluids", "dextrose"], caption: "The body uses dextrose fast, then the fluid acts like what is left. D5W and D10W become free water — hypotonic. D5 ½NS becomes ½NS. D5NS and D5LR become isotonic.",
      narration: "The body uses up dextrose quickly, and then the fluid acts like whatever is left. D-five-W and D-ten-W become free water, which is hypotonic. D-five half-normal saline becomes half-normal saline. And D-five normal saline and D-five lactated Ringer's become isotonic." },
    { key: "safety", focus: ["hypo", "safety"], caption: "Never give hypotonic fluid with increased intracranial pressure, stroke or head injury — water moving into brain cells worsens the swelling. Watch isotonic and hypertonic infusions for fluid overload.",
      narration: "Never give a hypotonic fluid to a client with increased intracranial pressure, a stroke, or a head injury, because water moving into brain cells makes the swelling worse. And watch anyone on isotonic or hypertonic fluids for fluid overload." },
  ],
};
