/* Potassium: the level, what it does to the ECG, and the priority actions.
   ------------------------------------------------------------------
   The classification is computed by classifyPotassium() (pure, tested), so
   the highlighted strip and the worked-example caption always match the
   value. Reference range: 3.5–5.0 mEq/L, the adult serum range taught for
   NCLEX. No severity thresholds are stated: they vary by source and
   protocol, and a wrong cut-off on a teaching diagram is worse than none. */
import React from "react";
import { Frame, G, T, Gauge, Box, C } from "./kit.jsx";

export const K_RANGE = { lo: 3.5, hi: 5.0 };

export function classifyPotassium(k) {
  if (!Number.isFinite(k)) throw new Error("classifyPotassium: value must be a number");
  return k < K_RANGE.lo ? "hypokalemia" : k > K_RANGE.hi ? "hyperkalemia" : "normal";
}

/* One beat, 60 units wide, drawn relative to a baseline. Shapes follow the
   classic teaching patterns:
     normal — P, short PR, narrow QRS, rounded T
     hypo   — flattened T, ST depression, a prominent U wave after the T
     hyper  — flattened P, longer PR, widened QRS, tall narrow peaked T */
function beat(kind) {
  switch (kind) {
    case "hypo":
      return "q4,-5 8,0 l8,0 l2,3 l4,-24 l4,26 l2,-2 l6,0 q5,-3 10,-1 l2,-2 q4,-11 8,0 l2,0";
    case "hyper":
      return "l8,0 l10,0 l4,3 l8,-22 l8,24 l4,-5 l3,0 l6,-26 l6,26 l3,0";
    default:
      return "q4,-6 8,0 l8,0 l2,3 l4,-24 l4,26 l2,-5 l8,0 q6,-14 12,0 l12,0";
  }
}
function Strip({ x, y, w, kind, color }) {
  const beats = Math.floor((w - 10) / 60);
  const d = `M${x},${y} l5,0 ` + Array.from({ length: beats }, () => beat(kind)).join(" ");
  return (
    <g>
      <rect x={x} y={y - 30} width={w} height={44} rx={6} fill="var(--mon)" />
      {/* faint monitor grid */}
      {Array.from({ length: Math.floor(w / 20) + 1 }, (_, i) => (
        <line key={i} x1={x + i * 20} y1={y - 30} x2={x + i * 20} y2={y + 14} stroke="var(--ecg)" strokeOpacity={0.12} />
      ))}
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
}

const Lines = ({ x, y, lines, size = 11.5, gap = 17, color = C.ink, weight = 500 }) =>
  lines.map((l, i) => <T key={i} x={x} y={y + i * gap} size={size} color={color} weight={weight}>{l}</T>);

export const K_EXAMPLE = { k: 6.2 };

export function PotassiumDiagram({ params = K_EXAMPLE, focus = null }) {
  const state = classifyPotassium(params.k);
  return (
    <Frame h={492} focus={focus} title="Potassium and the heart"
      desc={`Serum potassium ${params.k} mEq/L (normal 3.5 to 5.0): ${state}. Low potassium: flattened T waves, ST depression, prominent U wave. High potassium: tall peaked T waves, widened QRS, flattened P waves. Hyperkalemia emergency order: calcium gluconate to protect the heart, insulin with dextrose to shift potassium into cells, then remove it.`}>
      <G id="level">
        <Gauge x={20} y={52} w={320} min={2} max={7} lo={3.5} hi={5.0} value={params.k} decimals={1} unit="mEq/L"
          label="Serum potassium (K⁺)" leftLabel="◂ HYPO" rightLabel="HYPER ▸" leftColor="coral" rightColor="coral" />
      </G>

      <G id="hypo">
        <T x={20} y={104} size={12} weight={700}>Low K⁺ — below 3.5</T>
        <Strip x={20} y={138} w={320} kind="hypo" color="var(--ecg)" />
        <T x={20} y={170} size={11} color={C.muted}>flat T · ST depression · <tspan fill={C.coral} fontWeight={700}>prominent U wave</tspan></T>
        {/* Points at the U wave of the second beat. Beat k starts at
            x = 25 + 60k; the U wave peaks 52 units into a hypo beat. */}
        <circle cx={25 + 60 + 52} cy={133} r={7.5} fill="none" stroke={C.coral} strokeWidth={1.8} />
        <path d={`M${25 + 60 + 52 + 14},${108} L${25 + 60 + 52 + 6},${126}`} fill="none" stroke={C.coral} strokeWidth={1.8} strokeLinecap="round" />
        <T x={25 + 60 + 52 + 16} y={106} size={10.5} weight={700} color={C.coral}>U wave</T>
      </G>

      <G id="hyper">
        <T x={20} y={198} size={12} weight={700}>High K⁺ — above 5.0</T>
        <Strip x={20} y={232} w={320} kind="hyper" color="var(--ecg)" />
        <T x={20} y={264} size={11} color={C.muted}><tspan fill={C.coral} fontWeight={700}>tall peaked T</tspan> · wide QRS · flat P</T>
      </G>

      <G id="hypo-act">
        <Box x={20} y={280} w={156} h={204} r={10} fill={C.surface} />
        <T x={30} y={301} size={12} weight={700}>Low: causes</T>
        <Lines x={30} y={320} lines={["Loop/thiazide", "diuretics", "Vomiting, NG suction", "Diarrhea"]} />
        <T x={30} y={398} size={12} weight={700}>Replace safely</T>
        <Lines x={30} y={417} lines={["Never IV push or IM", "Diluted, on a pump", "Urine output first"]} />
      </G>

      <G id="hyper-act">
        <Box x={184} y={280} w={156} h={204} r={10} fill={C.surface} />
        <T x={194} y={301} size={12} weight={700}>High: causes</T>
        <Lines x={194} y={320} lines={["Kidney failure", "K⁺-sparing diuretics", "ACE inhibitors", "Crush injury, burns"]} />
        <T x={194} y={398} size={12} weight={700} color={C.coral}>Emergency order</T>
        <Lines x={194} y={417} lines={["1 Calcium gluconate", "2 Insulin + dextrose", "3 Remove: binders,", "   diuretics, dialysis"]} />
      </G>
      {/* the strip that matches this client's value is outlined */}
      {state !== "normal" ? (
        <G id="match">
          <rect x={17} y={state === "hypokalemia" ? 105 : 199} width={326} height={52} rx={8}
            fill="none" stroke={C.coral} strokeWidth={2} strokeDasharray="5 4" />
        </G>
      ) : <G id="match" />}
    </Frame>
  );
}

export const potassium = {
  id: "potassium",
  title: "Potassium & the ECG",
  concepts: ["potassium"],
  Diagram: PotassiumDiagram,
  example: K_EXAMPLE,
  facts: [
    "Normal adult serum potassium is 3.5–5.0 mEq/L.",
    "Potassium sets the heart's resting electrical state, so both low and high levels can cause dysrhythmias.",
    "Hypokalemia ECG changes: flattened T waves, ST depression and a prominent U wave.",
    "Hyperkalemia ECG changes: tall peaked T waves, a widened QRS and flattened P waves.",
    "Common causes of hypokalemia include loop and thiazide diuretics, vomiting or NG suction, and diarrhea.",
    "Common causes of hyperkalemia include kidney failure, potassium-sparing diuretics, ACE inhibitors, and tissue damage such as crush injuries or burns.",
    "IV potassium is never given by IV push or intramuscularly; it is diluted, given by infusion pump, with cardiac monitoring.",
    "Adequate urine output is confirmed before giving potassium, because the kidneys must be able to excrete it.",
    "In hyperkalemia with ECG changes, IV calcium gluconate is given first to stabilise the cardiac membrane; it does not lower the potassium level.",
    "Insulin given with dextrose shifts potassium into cells; binders, diuretics or dialysis remove it from the body.",
  ],
  steps: [
    { focus: ["level"], caption: "Normal serum potassium is 3.5–5.0. It sets the heart's resting electrical state, so either extreme can trigger a dangerous rhythm.",
      narration: "Normal serum potassium is three point five to five point oh. Potassium sets the heart's resting electrical state, so a level that is either too low or too high can trigger a dangerous rhythm." },
    { focus: ["hypo"], caption: "Low potassium flattens the T wave, depresses the ST segment, and adds a prominent U wave after the T.",
      narration: "Low potassium flattens the T wave, pushes the S-T segment down, and adds a prominent U wave just after the T." },
    { focus: ["hypo", "hypo-act"], caption: "Common causes: diuretics, vomiting or NG suction, diarrhea. Replace it safely — IV potassium is never pushed: it is diluted, run on a pump, with the heart monitored. Check urine output first.",
      narration: "The common causes are diuretics, vomiting or N-G suction, and diarrhea. Replace it safely. I-V potassium is never pushed. It is diluted and run on a pump while the heart is monitored. And check urine output first, because the kidneys have to be able to clear it." },
    { focus: ["hyper"], caption: "High potassium makes tall, peaked T waves first; as it climbs the QRS widens and the P wave flattens.",
      narration: "High potassium makes tall, narrow, peaked T waves first. As it climbs further, the Q-R-S widens and the P wave flattens out." },
    { focus: ["hyper", "hyper-act"], caption: "Emergency order: calcium gluconate first to protect the heart — it does not lower potassium. Then insulin with dextrose to shift K⁺ into cells. Then remove it.",
      narration: "In an emergency, the order matters. Give calcium gluconate first, to protect the heart — remember, it does not lower the potassium. Then insulin with dextrose to shift potassium into the cells. Then remove it from the body with binders, diuretics, or dialysis." },
    { focus: ["level", "match"], dynamic: true, caption: null, narration: null },
  ],
  dynamicCaption: ({ k } = K_EXAMPLE) => {
    const s = classifyPotassium(k);
    if (s === "normal") return `This client's potassium is ${k.toFixed(1)} mEq/L — within 3.5–5.0, so no potassium-related ECG change is expected.`;
    if (s === "hypokalemia") return `This client's potassium is ${k.toFixed(1)} mEq/L — below 3.5, so hypokalemia: watch for flat T waves and U waves, and confirm urine output before replacing it.`;
    return `This client's potassium is ${k.toFixed(1)} mEq/L — above 5.0, so hyperkalemia: watch the monitor for peaked T waves, and if the ECG changes, calcium gluconate comes first.`;
  },
};
