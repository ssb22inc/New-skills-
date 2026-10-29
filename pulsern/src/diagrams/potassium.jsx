/* Potassium: the level, what it can do to the ECG, and the priorities.
   ------------------------------------------------------------------
   The classification is computed by classifyPotassium() (pure, tested), so
   the highlighted strip and the worked-example caption always match the
   value, and the value is SHOWN at the precision it was given (3.49 stays
   3.49), so the picture can never put an abnormal reading on the boundary
   number (Sol, PR #155 diagram review). Reference range: 3.5–5.0 mEq/L,
   the adult serum range taught for NCLEX. No severity cut-offs are stated:
   they vary by source and protocol.

   ECG strips are illustrative of classic findings, not a predictable
   sequence: changes do not track the level reliably, and a normal ECG does
   not rule out dangerous hyperkalemia. Emergency care is taught as three
   goals that can overlap under the prescribed protocol, not a fixed serial
   order. */
import React from "react";
import { Frame, G, T, Gauge, Box, C, Anim, Loop, Para, paraLines, useDefs, exact, BODY_TEXT, MIN_TEXT } from "./kit.jsx";

export const K_RANGE = { lo: 3.5, hi: 5.0 };

export function classifyPotassium(k) {
  if (!Number.isFinite(k)) throw new Error("classifyPotassium: value must be a number");
  return k < K_RANGE.lo ? "hypokalemia" : k > K_RANGE.hi ? "hyperkalemia" : "normal";
}

/* The value exactly as given, at least one decimal: every supplied digit
   is kept, so a reading is never rounded onto a limit (Sol, round 2: 3.499
   still showed as "3.5"). */
export const displayK = (k) => exact(k, 1);

/* One beat, drawn relative to a baseline (hypo 56 units wide, hyper 60). Shapes follow the
   classic teaching patterns:
     normal — P, short PR, narrow QRS, rounded T
     hypo   — flattened T, ST depression, a prominent U wave after the T
     hyper  — flattened P, longer PR, widened QRS, tall narrow peaked T */
export const BEAT_W = { hypo: 56, hyper: 60, normal: 60 };
/* Landmarks inside a beat, from the path below: the hypo U wave peaks 50
   units in, 5.5 above baseline; the hyper T peaks 51 units in, 26 above. */
export const U_APEX = { dx: 50, dy: -5.5 }, T_APEX = { dx: 51, dy: -26 };
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
  const beats = Math.floor((w - 10) / BEAT_W[kind]);
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
      {/* above the strip, never on the trace */}
      <T x={x + w} y={top - 8} size={MIN_TEXT} anchor="end" mono color={C.muted}>illustrative</T>
    </g>
  );
}

/* A callout ring with a leader to its label, popped in after the trace. */
function Callout({ cx, cy, lx, ly, label, step }) {
  return (
    <Anim on={step} kind="pop" delay={1500}>
      <circle className="dg-solid" cx={cx} cy={cy} r={7.5} fill="none" stroke={C.coral} strokeWidth={1.8} />
      <path className="dg-solid" d={`M${lx - 2},${ly + 2} L${cx + 5},${cy - 6}`} fill="none" stroke={C.coral} strokeWidth={1.8} strokeLinecap="round" />
      <T x={lx} y={ly} size={MIN_TEXT} weight={700} color={C.coral}>{label}</T>
    </Anim>
  );
}

const ICON = { fill: "none", stroke: C.teal, strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };
const KIcons = {
  noPush: (cx, cy) => (
    <g {...ICON}>
      <path d={`M${cx - 7},${cy + 4} l9,-9 l3,3 l-9,9 z M${cx + 2},${cy - 5} l3,-3 M${cx + 3.5},${cy - 6.5} l2,2 M${cx - 7},${cy + 4} l-2,2`} />
      <path d={`M${cx - 8},${cy - 8} L${cx + 8},${cy + 8}`} stroke={C.danger} strokeWidth={1.8} />
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
    fill={C.teal} fillOpacity={0.22} stroke={C.teal} strokeWidth={1.4} strokeLinejoin="round" />
);

const LH = 1.3;
const H = (t, w, size = MIN_TEXT) => paraLines(t, w, size).length * size * LH;
const HYPO_CAUSES = "Loop and thiazide diuretics, vomiting or NG suction, diarrhea.";
const HYPO_IV = [["noPush", "Never IV push or IM"], ["pump", "Diluted, on an infusion pump"], ["urine", "Confirm urine output first"]];
const HYPER_CAUSES = "Kidney failure, K⁺-sparing diuretics, ACE inhibitors, crush injury, burns.";
const GOALS = [
  ["Protect the heart:", "IV calcium gluconate, expected with ECG changes or a very high level; it does not lower K⁺."],
  ["Shift K⁺ into cells:", "insulin with dextrose; the effect is temporary."],
  ["Remove K⁺:", "dialysis; diuretics only if the kidneys respond; binders act slowly, so they are not rescue therapy alone."],
];

export const K_EXAMPLE = { k: 6.2 };

/* params === null: concept-only — no patient marker, no matched strip. */
export function PotassiumDiagram({ params = K_EXAMPLE, focus = null }) {
  const concept = params === null;
  const state = concept ? "normal" : classifyPotassium(params.k);
  const uX = 20 + 5 + BEAT_W.hypo + U_APEX.dx, uY = 150 + U_APEX.dy;
  const tX = 20 + 5 + BEAT_W.hyper + T_APEX.dx, tY = 250 + T_APEX.dy;
  const yLo = 330;
  const hLo = 30 + H(`Causes ${HYPO_CAUSES}`, 320, BODY_TEXT) + 28 + HYPO_IV.length * 26 + 4;
  const yHi = yLo + hLo + 10;
  const goalsH = GOALS.reduce((a, [l, t]) => a + H(`${l} ${t}`, 302) + 6, 0);
  const headY = yHi + 44 + H(`Causes ${HYPER_CAUSES}`, 320, BODY_TEXT) + 8;
  let gy = headY + 24;
  const hHi = gy + goalsH - yHi - 6;
  return (
    <Frame h={yHi + hHi + 6} focus={focus} title="Potassium and the heart"
      regions={{ level: [0, 96], hypo: [92, 196], hyper: [194, 316], "hypo-act": [yLo, yLo + hLo], "hyper-act": [yHi, yHi + hHi], match: [92, 316] }}
      desc={`${concept ? "Serum potassium normal range 3.5 to 5.0 mEq/L." : `Serum potassium ${displayK(params.k)} mEq/L (normal 3.5 to 5.0): ${state}.`} Illustrative ECG strips of classic findings, which may or may not appear and do not track the level predictably. Low potassium can show flattened T waves, ST depression and a prominent U wave. High potassium can show tall peaked T waves, a widened QRS and flattened P waves, and a normal ECG does not rule out dangerous hyperkalemia. Low potassium causes: loop and thiazide diuretics, vomiting or NG suction, diarrhea; IV replacement is never given by IV push or IM, is diluted on an infusion pump, and urine output is confirmed first. High potassium causes: kidney failure, potassium-sparing diuretics, ACE inhibitors, crush injury, burns. Hyperkalemia emergency goals, which can overlap under the prescribed protocol: protect the heart with IV calcium gluconate, expected with ECG changes or a very high level, which does not lower potassium; shift potassium into cells with insulin and dextrose, a temporary effect; remove potassium with dialysis, diuretics only if the kidneys respond, and binders, which act slowly and are not rescue therapy alone.`}>
      <G id="level">
        <Gauge x={20} y={62} w={320} min={2} max={7} lo={3.5} hi={5.0} value={concept ? null : params.k} decimals={1}
          text={concept ? null : displayK(params.k)} unit="mEq/L"
          label="Serum potassium (K⁺)" leftLabel="◂ HYPO" rightLabel="HYPER ▸" leftColor="coral" rightColor="coral"
          icon={HeartIcon} anim={["range", "worked"]} />
      </G>

      <G id="hypo">
        <T x={20} y={112} size={BODY_TEXT} weight={700}>Low K⁺: below 3.5</T>
        <Strip x={20} y={150} w={320} kind="hypo" step="hypo-ecg" />
        <T x={20} y={186} size={MIN_TEXT} color={C.muted}>May show: flat T, ST depression, <tspan fill={C.danger} fontWeight={700}>U wave</tspan></T>
        <Callout cx={uX} cy={uY} lx={uX + 18} ly={113} label="U wave" step="hypo-ecg" />
      </G>

      <G id="hyper">
        <T x={20} y={214} size={BODY_TEXT} weight={700}>High K⁺: above 5.0</T>
        <Strip x={20} y={250} w={320} kind="hyper" step="hyper-ecg" />
        <T x={20} y={286} size={MIN_TEXT} color={C.muted}>May show: <tspan fill={C.danger} fontWeight={700}>peaked T</tspan>, wide QRS, flat P</T>
        <T x={20} y={306} size={MIN_TEXT} weight={700} color={C.danger}>A normal ECG does not rule out danger.</T>
        <Callout cx={tX} cy={tY} lx={tX + 26} ly={214} label="peaked T" step="hyper-ecg" />
      </G>

      <G id="hypo-act">
        <Box x={8} y={yLo} w={344} h={hLo} r={10} fill={C.surface} lift />
        <T x={20} y={yLo + 22} size={BODY_TEXT} weight={700}>Low K⁺</T>
        <Anim on="hypo-care" kind="fade"><Para x={20} y={yLo + 44} w={320} lead="Causes" text={HYPO_CAUSES} /></Anim>
        <T x={20} y={yLo + 44 + H(`Causes ${HYPO_CAUSES}`, 320, BODY_TEXT) + 10} size={BODY_TEXT} weight={700}>IV replacement</T>
        {HYPO_IV.map(([ic, t], i) => {
          const y = yLo + 44 + H(`Causes ${HYPO_CAUSES}`, 320, BODY_TEXT) + 36 + i * 26;
          return (
            <Anim key={ic} on="hypo-care" kind="fade" delay={600 + i * 200}>
              {KIcons[ic](30, y - 5)}
              <T x={46} y={y} size={MIN_TEXT}>{t}</T>
            </Anim>
          );
        })}
      </G>

      <G id="hyper-act">
        <Box x={8} y={yHi} w={344} h={hHi} r={10} fill={C.surface} lift />
        <T x={20} y={yHi + 22} size={BODY_TEXT} weight={700}>High K⁺</T>
        <Anim on="hyper-care" kind="fade"><Para x={20} y={yHi + 44} w={320} lead="Causes" text={HYPER_CAUSES} /></Anim>
        <T x={20} y={headY} size={BODY_TEXT} weight={700} color={C.danger}>Severe hyperkalemia: goals can overlap</T>
        {GOALS.map(([lead, t], i) => {
          const y = gy; gy += H(`${lead} ${t}`, 302) + 6;
          return (
            <Anim key={i} on="hyper-care" kind="fade" delay={300 + i * 250}>
              <circle cx={26} cy={y - 4} r={3} fill={C.teal} />
              <Para x={36} y={y} w={302} size={MIN_TEXT} lead={lead} text={t} />
            </Anim>
          );
        })}
      </G>
      {/* the strip that matches this client's value is outlined */}
      {state !== "normal" ? (
        <G id="match">
          <Anim on="worked" kind="pop" delay={900}>
            <rect className="dg-solid" x={14} y={state === "hypokalemia" ? 96 : 198} width={332} height={state === "hypokalemia" ? 98 : 116} rx={8}
              fill="none" stroke={C.danger} strokeWidth={2} strokeDasharray="5 4" />
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
  textCases: [{ k: 3.49 }, { k: 5.01 }, { k: 2.8 }, { k: 8.4 }, { k: 4.2 }],
  facts: [
    "Normal adult serum potassium is 3.5–5.0 mEq/L.",
    "Potassium sets the heart's resting electrical state, so both low and high levels can cause dysrhythmias.",
    "Possible hypokalemia ECG findings: flattened T waves, ST depression and a prominent U wave.",
    "Possible hyperkalemia ECG findings: tall peaked T waves, a widened QRS and flattened P waves. These do not appear in a reliable order and do not track the level predictably; severe hyperkalemia can occur with a normal or nearly normal ECG.",
    "Common causes of hypokalemia include loop and thiazide diuretics, vomiting or NG suction, and diarrhea.",
    "Common causes of hyperkalemia include kidney failure, potassium-sparing diuretics, ACE inhibitors, and tissue damage such as crush injuries or burns.",
    "IV potassium is never given by IV push or intramuscularly; it is diluted, given by infusion pump, with cardiac monitoring.",
    "Adequate urine output is confirmed before giving potassium, because the kidneys must be able to excrete it.",
    "In hyperkalemia with ECG changes or a severely elevated level, IV calcium gluconate stabilises the cardiac membrane; it does not lower the potassium level.",
    "Treatment goals in hyperkalemia — stabilising the heart, shifting potassium into cells (insulin with dextrose, a temporary effect) and removing it from the body — can overlap under the applicable protocol. Dialysis removes potassium definitively; diuretics need a renal response; binders act slowly and are not sole rescue therapy for life-threatening hyperkalemia.",
  ],
  steps: [
    { key: "range", focus: ["level"], caption: "Normal serum potassium is 3.5–5.0. It sets the heart's resting electrical state, so either extreme can trigger a dangerous rhythm.",
      narration: "Normal serum potassium is three point five to five point oh. Potassium sets the heart's resting electrical state, so a level that is either too low or too high can trigger a dangerous rhythm." },
    { key: "hypo-ecg", focus: ["hypo"], caption: "Low potassium can flatten the T wave, depress the ST segment, and add a prominent U wave after the T. The strip is illustrative; not every client shows every change.",
      narration: "Low potassium can flatten the T wave, push the S-T segment down, and add a prominent U wave just after the T. The strip is only an illustration, and not every client shows every change." },
    { key: "hypo-care", focus: ["hypo", "hypo-act"], caption: "Common causes: loop and thiazide diuretics, vomiting or NG suction, diarrhea. IV potassium is never pushed or given IM: it is diluted and run on an infusion pump with the heart monitored, after urine output is confirmed.",
      narration: "The common causes are loop and thiazide diuretics, vomiting or N-G suction, and diarrhea. I-V potassium is never pushed or given into a muscle. It is diluted and run on an infusion pump while the heart is monitored, after urine output has been confirmed, because the kidneys have to be able to clear it." },
    { key: "hyper-ecg", focus: ["hyper"], caption: "High potassium can cause tall, peaked T waves, a wider QRS and a flatter P wave, but not in a reliable order, and the ECG can look normal even when the level is dangerous.",
      narration: "High potassium can cause tall, peaked T waves, a wider Q-R-S, and a flatter P wave. But these changes do not come in a reliable order, and the E-C-G can look normal even when the level is dangerous." },
    { key: "hyper-care", focus: ["hyper", "hyper-act"], caption: "A raised result is first recognized and reported. For severe hyperkalemia, NCLEX priority reasoning uses three goals that can overlap under the prescribed protocol: IV calcium gluconate protects the heart when the ECG shows changes or the level is very high, and does not lower potassium; insulin with dextrose shifts potassium into cells; and the body's potassium is then removed.",
      narration: "A raised potassium result is first recognized and reported. For severe hyperkalemia, NCLEX priority reasoning uses three goals that can overlap under the prescribed protocol. I-V calcium gluconate protects the heart when the E-C-G shows changes or the level is very high, and it does not lower the potassium. Insulin with dextrose shifts potassium into the cells. And the potassium is then removed from the body, most definitively with dialysis." },
    { key: "worked", focus: ["level", "hypo", "hyper", "match"], dynamic: true, caption: null, narration: null },
  ],
  dynamicCaption: ({ k } = K_EXAMPLE) => {
    const s = classifyPotassium(k), v = displayK(k);
    if (s === "normal") return `This client's potassium is ${v} mEq/L, within 3.5–5.0.`;
    if (s === "hypokalemia") return `This client's potassium is ${v} mEq/L, below 3.5, so hypokalemia. U waves and flat T waves are possible findings; urine output is confirmed before replacement.`;
    return `This client's potassium is ${v} mEq/L, above 5.0, so hyperkalemia. ECG changes may or may not appear, and a normal ECG does not rule out danger; the higher the level, the more urgent the response under the prescribed protocol.`;
  },
};
