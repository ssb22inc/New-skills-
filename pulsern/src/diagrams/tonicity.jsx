/* IV fluid tonicity: what each kind of bag does to a cell.
   ------------------------------------------------------------------
   The cell is drawn as a red blood cell in each solution, because "which
   way does the water move" is the whole concept and it is far easier to see
   than to read. Water moves toward the side with more dissolved particles.

   Fluid classification follows the standard NCLEX teaching lists. D5W is
   shown as isotonic IN THE BAG with an explicit note that it acts
   hypotonic once the dextrose is metabolised — the classic trap. */
import React from "react";
import { Frame, G, T, Box, Arrow, C } from "./kit.jsx";

export const FLUIDS = {
  isotonic: ["0.9% NaCl (NS)", "Lactated Ringer's", "D5W — in the bag*"],
  hypotonic: ["0.45% NaCl (½ NS)", "0.225% NaCl (¼ NS)"],
  hypertonic: ["3% NaCl", "D5 0.9% NaCl", "D5 ½ NS", "D5LR", "D10W"],
};

/* A cell: smooth when normal or swollen, crenated (scalloped) when shrunk.
   Teal, not red: CLAUDE.md reserves coral for incorrect/critical states, and
   a cell is neither — even though real red cells are red. */
function Cell({ cx, cy, r, crenated }) {
  if (!crenated) return <circle cx={cx} cy={cy} r={r} fill={C.teal} fillOpacity={0.55} stroke={C.teal} strokeWidth={1.2} />;
  const n = 14;
  const d = Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r - 2.6 : r + 1.2;
    return `${i ? "L" : "M"}${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ") + " Z";
  return <path d={d} fill={C.teal} fillOpacity={0.55} stroke={C.teal} strokeWidth={1.2} strokeLinejoin="round" />;
}

function Panel({ id, x, title, sub, r, crenated, flow }) {
  const cx = x + 55, cy = 98;
  const arrows = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  return (
    <G id={id}>
      <Box x={x} y={30} w={110} h={140} r={10} fill={C.surface} />
      <T x={cx} y={48} size={12} weight={700} anchor="middle">{title}</T>
      <Cell cx={cx} cy={cy} r={r} crenated={crenated} />
      {flow === "both"
        ? <>
            <Arrow x1={cx - 46} y1={cy - 6} x2={cx - r - 6} y2={cy - 6} color="teal" sw={1.8} />
            <Arrow x1={cx + r + 6} y1={cy + 6} x2={cx + 46} y2={cy + 6} color="teal" sw={1.8} />
          </>
        : arrows.map(([dx, dy], i) => {
            const near = r + 4, far = r + 15;
            const [a, b] = flow === "in" ? [far, near] : [near, far];
            return <Arrow key={i} x1={cx + dx * a} y1={cy + dy * a} x2={cx + dx * b} y2={cy + dy * b} color="teal" sw={1.8} />;
          })}
      {sub.map((line, i) => <T key={i} x={cx} y={146 + i * 13} size={10.5} anchor="middle" color={C.muted}>{line}</T>)}
    </G>
  );
}

export function TonicityDiagram({ focus = null }) {
  const col = (x, w, id, title, items, note) => (
    <G id={id}>
      <Box x={x} y={182} w={w} h={118} r={10} fill={C.card} />
      <T x={x + 9} y={200} size={11} weight={700} color={C.accent}>{title}</T>
      {items.map((t, i) => <T key={i} x={x + 9} y={218 + i * 15} size={10}>{t}</T>)}
      {note ? note.map((line, i) => <T key={i} x={x + 9} y={279 + i * 12} size={9.5} color={C.muted}>{line}</T>) : null}
    </G>
  );
  return (
    <Frame h={392} focus={focus} title="IV fluid tonicity"
      desc="Isotonic fluid: no net water movement, the cell keeps its shape and volume stays in the vessels. Hypotonic fluid: water moves into cells and they swell. Hypertonic fluid: water moves out of cells into the vessels and cells shrink. D5W is isotonic in the bag but acts hypotonic once the dextrose is metabolized. Do not give hypotonic fluids with increased intracranial pressure. Monitor isotonic and hypertonic infusions for fluid overload.">
      <T x={180} y={18} size={10.5} anchor="middle" color={C.muted}>Water moves toward the side with MORE particles</T>
      <Panel id="iso" x={8} title="Isotonic" sub={["no net shift", "stays in vessels"]} r={22} flow="both" />
      <Panel id="hypo" x={125} title="Hypotonic" sub={["water moves IN", "cell swells"]} r={26} flow="in" />
      <Panel id="hyper" x={242} title="Hypertonic" sub={["water moves OUT", "cell shrinks"]} r={15} crenated flow="out" />
      <G id="fluids">
        {col(8, 110, "fluids-iso", "Isotonic", FLUIDS.isotonic, ["*acts hypotonic", "once dextrose is used"])}
        {col(125, 110, "fluids-hypo", "Hypotonic", FLUIDS.hypotonic)}
        {col(242, 110, "fluids-hyper", "Hypertonic", FLUIDS.hypertonic)}
      </G>
      <G id="safety">
        <Box x={8} y={312} w={344} h={74} r={10} fill={C.noBg} stroke={C.coral} />
        <T x={20} y={331} size={11.5} weight={700} color={C.danger}>Safety</T>
        <T x={20} y={349} size={10.5}>Hypotonic: never with ↑ICP, stroke or head injury —</T>
        <T x={20} y={363} size={10.5}>water entering brain cells worsens cerebral edema.</T>
        <T x={20} y={379} size={10.5}>Isotonic & hypertonic: watch for fluid overload.</T>
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
    "D5W is isotonic in the bag but acts as a hypotonic fluid once the dextrose is metabolised.",
    "Hypotonic fluids are avoided in clients with increased intracranial pressure, stroke or head injury because they can worsen cerebral edema.",
    "Clients receiving isotonic or hypertonic fluids are monitored for fluid volume overload.",
  ],
  steps: [
    { focus: ["iso"], caption: "Isotonic fluid matches the blood, so water doesn't shift in or out of cells. It stays in the vessels and expands circulating volume.",
      narration: "Isotonic fluid matches the blood, so water doesn't shift into or out of the cells. It stays in the vessels and expands the circulating volume." },
    { focus: ["hypo"], caption: "Hypotonic fluid has fewer particles than the cell, so water moves into the cell and it swells.",
      narration: "Hypotonic fluid has fewer particles than the inside of the cell, so water moves into the cell, and the cell swells." },
    { focus: ["hyper"], caption: "Hypertonic fluid has more particles, so water is pulled out of the cell into the vessel, and the cell shrinks.",
      narration: "Hypertonic fluid has more particles, so water is pulled out of the cell and into the vessel, and the cell shrinks." },
    { focus: ["fluids"], caption: "Know which bag is which. The trap is D5W: isotonic in the bag, but once the dextrose is used up it behaves like a hypotonic fluid.",
      narration: "Know which bag is which. The classic trap is D-five-W. It is isotonic in the bag, but once the body uses up the dextrose, it behaves like a hypotonic fluid." },
    { focus: ["hypo", "safety"], caption: "Never give hypotonic fluid with increased intracranial pressure, stroke or head injury — water moving into brain cells worsens the swelling. Watch isotonic and hypertonic infusions for fluid overload.",
      narration: "Never give a hypotonic fluid to a client with increased intracranial pressure, a stroke, or a head injury, because water moving into brain cells makes the swelling worse. And watch anyone on isotonic or hypertonic fluids for fluid overload." },
  ],
};
