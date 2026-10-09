/* Potassium: the level, what it does to the ECG, and the priority actions.
   ------------------------------------------------------------------
   The classification is computed by classifyPotassium() (pure, tested), so
   the highlighted strip and the worked-example caption always match the
   value. Reference range: 3.5–5.0 mEq/L, the adult serum range taught for
   NCLEX. No severity thresholds are stated: they vary by source and
   protocol, and a wrong cut-off on a teaching diagram is worse than none. */
import React from "react";
import { Frame, G, T, Gauge, Box, C, Anim, Loop, useDefs } from "./kit.jsx";

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
/* A monitor strip: bezel, grid (minor every 10, major every 50), and the
   trace with a soft phosphor glow. On its step the trace is drawn left to
   right, then a write-head dot keeps sweeping it like a live monitor. */
function Strip({ x, y, w, kind, step }) {
  const u = useDefs();
  const beats = Math.floor((w - 10) / 60);
  const d = `M${x},${y} l5,0 ` + Array.from({ length: beats }, () => beat(kind)).join(" ");
  const top = y - 30, h = 44;
  return (
    <g>
      <rect x={x} y={top} width={w} height={h} rx={6} fill="var(--mon)" filter={u("shadow")} />
      {Array.from({ length: Math.floor(w / 10) + 1 }, (_, i) => (
        <line key={`v${i}`} x1={x + i * 10} y1={top} x2={x + i * 10} y2={top + h} stroke="var(--ecg)" strokeOpacity={i % 5 ? 0.06 : 0.16} />
      ))}
      {Array.from({ length: Math.floor(h / 10) + 1 }, (_, i) => (
        <line key={`h${i}`} x1={x} y1={top + 2 + i * 10} x2={x + w} y2={top + 2 + i * 10} stroke="var(--ecg)" strokeOpacity={0.06} />
      ))}
      <Anim on={step} kind="draw" dur={1600}>
        <path d={d} pathLength={1} fill="none" stroke="var(--ecg)" strokeOpacity={0.25} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
        <path d={d} pathLength={1} fill="none" stroke="var(--ecg)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      </Anim>
      {/* the write head appears once the trace has been drawn */}
      <Loop on={step}>
        <g className="dg-a dg-fade" style={{ animationDelay: "1.6s" }}>
          <circle r={3} fill="var(--ecg)">
            <animateMotion dur="3.2s" repeatCount="indefinite" path={d} />
          </circle>
        </g>
      </Loop>
      <T x={x + w - 8} y={top + 12} size={9} anchor="end" mono color="var(--ecg)" opacity={0.7}>II</T>
    </g>
  );
}

/* A callout ring with a leader to its label, popped in after the trace. */
function Callout({ cx, cy, lx, ly, label, step }) {
  return (
    <Anim on={step} kind="pop" delay={1500}>
      <circle cx={cx} cy={cy} r={7.5} fill="none" stroke={C.coral} strokeWidth={1.8} />
      <path d={`M${lx - 2},${ly + 2} L${cx + 5},${cy - 6}`} fill="none" stroke={C.coral} strokeWidth={1.8} strokeLinecap="round" />
      <T x={lx} y={ly} size={10.5} weight={700} color={C.coral}>{label}</T>
    </Anim>
  );
}

const Bullets = ({ x, y, items, gap = 17, step, base = 0 }) => {
  let row = 0;
  return items.map((lines, i) => {
    const y0 = y + row * gap;
    row += lines.length;
    return (
      <Anim key={i} on={step} kind="fade" delay={base + i * 160}>
        <circle cx={x + 3} cy={y0 - 4} r={2.2} fill={C.teal} />
        {lines.map((l, j) => <T key={j} x={x + 11} y={y0 + j * gap} size={11.5}>{l}</T>)}
      </Anim>
    );
  });
};

const ICON = { fill: "none", stroke: C.teal, strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };
const KIcons = {
  noPush: (cx, cy) => (
    <g {...ICON}>
      <path d={`M${cx - 7},${cy + 4} l9,-9 l3,3 l-9,9 z M${cx + 2},${cy - 5} l3,-3 M${cx + 3.5},${cy - 6.5} l2,2 M${cx - 7},${cy + 4} l-2,2`} />
      <path d={`M${cx - 8},${cy - 8} L${cx + 8},${cy + 8}`} stroke={C.coral} strokeWidth={1.8} />
    </g>
  ),
  pump: (cx, cy) => (
    <g {...ICON}>
      <rect x={cx - 7} y={cy - 8} width={14} height={16} rx={2.5} />
      <rect x={cx - 4.5} y={cy - 5.5} width={9} height={5} rx={1} fill={C.teal} fillOpacity={0.25} />
      <circle cx={cx - 2.5} cy={cy + 4} r={1.2} fill={C.teal} />
      <circle cx={cx + 2.5} cy={cy + 4} r={1.2} fill={C.teal} />
    </g>
  ),
  urine: (cx, cy) => (
    <g {...ICON}>
      <path d={`M${cx},${cy - 8} C${cx + 3},${cy - 4} ${cx + 5.5},${cy - 1} ${cx + 5.5},${cy + 2} A5.5,5.5 0 1 1 ${cx - 5.5},${cy + 2} C${cx - 5.5},${cy - 1} ${cx - 3},${cy - 4} ${cx},${cy - 8} Z`}
        fill={C.labInk} fillOpacity={0.3} stroke={C.labInk} />
    </g>
  ),
};
const HeartIcon = (cx, cy) => (
  <path d={`M${cx},${cy + 6} C${cx - 9},${cy} ${cx - 7},${cy - 8} ${cx},${cy - 3.5} C${cx + 7},${cy - 8} ${cx + 9},${cy} ${cx},${cy + 6} Z`}
    fill={C.coral} fillOpacity={0.22} stroke={C.coral} strokeWidth={1.4} strokeLinejoin="round" />
);

/* The hyperkalemia emergency order as a numbered stepper. */
function Stepper({ x, y, items, step }) {
  const gap = 29;
  return (
    <g>
      <line x1={x} x2={x} y1={y - 4} y2={y - 4 + gap * (items.length - 1)} stroke={C.line} strokeWidth={2} />
      {items.map(([title, ...subs], i) => (
        <Anim key={i} on={step} kind="pop" delay={i * 280} origin="0% 50%">
          <circle cx={x} cy={y - 4 + i * gap} r={7.5} fill={i === 0 ? C.danger : C.teal} />
          <T x={x} y={y + i * gap} size={10} weight={700} anchor="middle" mono color={C.card}>{i + 1}</T>
          <T x={x + 12} y={y + i * gap} size={11} weight={700}>{title}</T>
          {subs.map((s, j) => <T key={j} x={x + 12} y={y + i * gap + 12 + j * 11} size={9.5} color={C.muted}>{s}</T>)}
        </Anim>
      ))}
    </g>
  );
}

export const K_EXAMPLE = { k: 6.2 };

/* params === null: concept-only — no patient marker, no matched strip. */
export function PotassiumDiagram({ params = K_EXAMPLE, focus = null }) {
  const concept = params === null;
  const state = concept ? "normal" : classifyPotassium(params.k);
  /* Beat k starts at x = 25 + 60k. In a hypo beat the U wave peaks 52 units
     in, 5 above baseline; in a hyper beat the T peaks 51 units in, 26 above. */
  const uX = 25 + 60 + 52, tX = 25 + 60 + 51;
  return (
    <Frame h={520} focus={focus} title="Potassium and the heart"
      desc={`${concept ? "Serum potassium normal range 3.5 to 5.0 mEq/L." : `Serum potassium ${params.k} mEq/L (normal 3.5 to 5.0): ${state}.`} Low potassium: flattened T waves, ST depression, prominent U wave. High potassium: tall peaked T waves, widened QRS, flattened P waves. Low potassium replacement: never IV push or IM, diluted on a pump, confirm urine output first. Hyperkalemia emergency order: calcium gluconate to protect the heart, insulin with dextrose to shift potassium into cells, then remove it with binders, diuretics or dialysis.`}>
      <G id="level">
        <Gauge x={20} y={52} w={320} min={2} max={7} lo={3.5} hi={5.0} value={concept ? null : params.k} decimals={1} unit="mEq/L"
          label="Serum potassium (K⁺)" leftLabel="◂ HYPO" rightLabel="HYPER ▸" leftColor="coral" rightColor="coral"
          icon={HeartIcon} anim={["range", "worked"]} />
      </G>

      <G id="hypo">
        <T x={20} y={104} size={12} weight={700}>Low K⁺ — below 3.5</T>
        <Strip x={20} y={138} w={320} kind="hypo" step="hypo-ecg" />
        <T x={20} y={170} size={11} color={C.muted}>flat T · ST depression · <tspan fill={C.coral} fontWeight={700}>prominent U wave</tspan></T>
        <Callout cx={uX} cy={133} lx={uX + 16} ly={106} label="U wave" step="hypo-ecg" />
      </G>

      <G id="hyper">
        <T x={20} y={198} size={12} weight={700}>High K⁺ — above 5.0</T>
        <Strip x={20} y={232} w={320} kind="hyper" step="hyper-ecg" />
        <T x={20} y={264} size={11} color={C.muted}><tspan fill={C.coral} fontWeight={700}>tall peaked T</tspan> · wide QRS · flat P</T>
        <Callout cx={tX} cy={207} lx={tX + 24} ly={191} label="peaked T" step="hyper-ecg" />
      </G>

      <G id="hypo-act">
        <Box x={20} y={280} w={156} h={232} r={10} fill={C.surface} lift />
        <T x={30} y={301} size={12} weight={700}>Low: causes</T>
        <Bullets x={30} y={320} step="hypo-care" items={[["Loop/thiazide", "diuretics"], ["Vomiting, NG suction"], ["Diarrhea"]]} />
        <T x={30} y={404} size={12} weight={700}>Replace safely</T>
        {[["noPush", "Never IV push or IM"], ["pump", "Diluted, on a pump"], ["urine", "Urine output first"]].map(([ic, t], i) => (
          <Anim key={ic} on="hypo-care" kind="fade" delay={600 + i * 200}>
            {KIcons[ic](38, 424 + i * 28)}
            <T x={52} y={428 + i * 28} size={11}>{t}</T>
          </Anim>
        ))}
      </G>

      <G id="hyper-act">
        <Box x={184} y={280} w={156} h={232} r={10} fill={C.surface} lift />
        <T x={194} y={301} size={12} weight={700}>High: causes</T>
        <Bullets x={194} y={320} step="hyper-care" items={[["Kidney failure"], ["K⁺-sparing diuretics"], ["ACE inhibitors"], ["Crush injury, burns"]]} />
        <T x={194} y={404} size={12} weight={700} color={C.coral}>Emergency order</T>
        <Stepper x={202} y={426} step="hyper-care" items={[
          ["Calcium gluconate", "protects the heart"],
          ["Insulin + dextrose", "shifts K⁺ into cells"],
          ["Remove K⁺", "binders, diuretics,", "dialysis"],
        ]} />
      </G>
      {/* the strip that matches this client's value is outlined */}
      {state !== "normal" ? (
        <G id="match">
          <Anim on="worked" kind="pop" delay={900}>
            <rect x={17} y={state === "hypokalemia" ? 105 : 199} width={326} height={52} rx={8}
              fill="none" stroke={C.coral} strokeWidth={2} strokeDasharray="5 4" />
          </Anim>
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
    { key: "range", focus: ["level"], caption: "Normal serum potassium is 3.5–5.0. It sets the heart's resting electrical state, so either extreme can trigger a dangerous rhythm.",
      narration: "Normal serum potassium is three point five to five point oh. Potassium sets the heart's resting electrical state, so a level that is either too low or too high can trigger a dangerous rhythm." },
    { key: "hypo-ecg", focus: ["hypo"], caption: "Low potassium flattens the T wave, depresses the ST segment, and adds a prominent U wave after the T.",
      narration: "Low potassium flattens the T wave, pushes the S-T segment down, and adds a prominent U wave just after the T." },
    { key: "hypo-care", focus: ["hypo", "hypo-act"], caption: "Common causes: diuretics, vomiting or NG suction, diarrhea. Replace it safely — IV potassium is never pushed: it is diluted, run on a pump, with the heart monitored. Check urine output first.",
      narration: "The common causes are diuretics, vomiting or N-G suction, and diarrhea. Replace it safely. I-V potassium is never pushed. It is diluted and run on a pump while the heart is monitored. And check urine output first, because the kidneys have to be able to clear it." },
    { key: "hyper-ecg", focus: ["hyper"], caption: "High potassium makes tall, peaked T waves first; as it climbs the QRS widens and the P wave flattens.",
      narration: "High potassium makes tall, narrow, peaked T waves first. As it climbs further, the Q-R-S widens and the P wave flattens out." },
    { key: "hyper-care", focus: ["hyper", "hyper-act"], caption: "Emergency order: calcium gluconate first to protect the heart — it does not lower potassium. Then insulin with dextrose to shift K⁺ into cells. Then remove it.",
      narration: "In an emergency, the order matters. Give calcium gluconate first, to protect the heart — remember, it does not lower the potassium. Then insulin with dextrose to shift potassium into the cells. Then remove it from the body with binders, diuretics, or dialysis." },
    { key: "worked", focus: ["level", "match"], dynamic: true, caption: null, narration: null },
  ],
  dynamicCaption: ({ k } = K_EXAMPLE) => {
    const s = classifyPotassium(k);
    if (s === "normal") return `This client's potassium is ${k.toFixed(1)} mEq/L — within 3.5–5.0, so no potassium-related ECG change is expected.`;
    if (s === "hypokalemia") return `This client's potassium is ${k.toFixed(1)} mEq/L — below 3.5, so hypokalemia: watch for flat T waves and U waves, and confirm urine output before replacing it.`;
    return `This client's potassium is ${k.toFixed(1)} mEq/L — above 5.0, so hyperkalemia: watch the monitor for peaked T waves, and if the ECG changes, calcium gluconate comes first.`;
  },
};
