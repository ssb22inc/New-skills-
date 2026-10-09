/* Insulin action: onset, peak and duration, and what the peak means.
   ------------------------------------------------------------------
   Times are the typical ranges taught for NCLEX-RN preparation. They vary
   by product and source, so the diagram states ranges, not single numbers,
   and says to check the product's labeling. The peak window is computed by
   peakWindow() (pure, tested), so a worked example ("NPH at 07:00") always
   lands on the right clock times.

   Four curves in one palette would fail the colour rules, so they are told
   apart by line style and labelled directly on the curve — never by colour
   alone. */
import React from "react";
import { Frame, G, T, Box, C, Anim, Loop, OnStep } from "./kit.jsx";

/* Hours. Onset/peak are [from, to]; peak null means peakless. */
export const INSULINS = {
  rapid:  { name: "Rapid-acting",  eg: "lispro, aspart, glulisine", onset: [10 / 60, 30 / 60], peak: [1, 2],  duration: [3, 5] },
  short:  { name: "Short-acting",  eg: "regular",                   onset: [0.5, 1],          peak: [2, 4],  duration: [5, 8] },
  nph:    { name: "Intermediate",  eg: "NPH",                       onset: [1, 2],            peak: [4, 12], duration: [12, 18] },
  long:   { name: "Long-acting",   eg: "glargine, detemir",         onset: [1, 2],            peak: null,    duration: [24, 24] },
};

const pad = (n) => String(n).padStart(2, "0");
function clock(hours) {
  const total = Math.round(hours * 60);
  const m = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
function parseClock(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) throw new Error(`peakWindow: time "${s}" must be HH:MM`);
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`peakWindow: time "${s}" is not a clock time`);
  return h + min / 60;
}

/* When this insulin, given at this time, is at its peak — the window of
   highest hypoglycemia risk. Null for a peakless insulin. */
export function peakWindow(type, givenAt) {
  const ins = INSULINS[type];
  if (!ins) throw new Error(`peakWindow: unknown insulin type "${type}"`);
  const t = parseClock(givenAt);
  if (!ins.peak) return null;
  return { from: clock(t + ins.peak[0]), to: clock(t + ins.peak[1]), nextDay: t + ins.peak[1] >= 24 };
}

const X0 = 38, X1 = 344, Y0 = 222, YTOP = 96;   // chart box, hours 0..24
const hx = (h) => X0 + (Math.min(24, h) / 24) * (X1 - X0);

/* A smooth action curve: rises from onset to the middle of the peak range,
   falls to the end of the duration. Peakless insulin rises to a plateau. */
function curvePath(ins, height) {
  const on = (ins.onset[0] + ins.onset[1]) / 2;
  const end = ins.duration[1];
  const y = Y0 - height;
  if (!ins.peak) {
    return `M${hx(0)},${Y0} C${hx(on)},${Y0} ${hx(on + 1)},${y} ${hx(on + 3)},${y} L${hx(end - 0.6)},${y} C${hx(end - 0.2)},${y} ${hx(end)},${Y0 - height * 0.6} ${hx(end)},${Y0 - height * 0.5}`;
  }
  const pk = (ins.peak[0] + ins.peak[1]) / 2;
  return `M${hx(0)},${Y0} C${hx(on)},${Y0} ${hx(on + (pk - on) * 0.4)},${y} ${hx(pk)},${y} C${hx(pk + (end - pk) * 0.45)},${y} ${hx(end - (end - pk) * 0.2)},${Y0} ${hx(end)},${Y0}`;
}

const STYLE = {
  rapid: { dash: null, w: 2.6, h: 112 },
  short: { dash: "7 4", w: 2.2, h: 92 },
  nph:   { dash: "2 4", w: 2.4, h: 70 },
  long:  { dash: "11 4 2 4", w: 2.2, h: 40 },
};

/* The area under a curve, closed back to the baseline. */
const areaPath = (ins, h) => `${curvePath(ins, h)} V${Y0} H${hx(0)} Z`;

/* Where on the drawn curve the onset, the peak and the end sit, for the
   step annotations. */
function landmarks(k) {
  const ins = INSULINS[k], h = STYLE[k].h;
  const on = (ins.onset[0] + ins.onset[1]) / 2;
  return {
    onset: { x: hx(on), y: Y0 },
    peak: ins.peak ? { x: hx((ins.peak[0] + ins.peak[1]) / 2), y: Y0 - h } : null,
    end: { x: hx(ins.duration[1]), y: ins.peak ? Y0 : Y0 - h * 0.5 },
  };
}

const Mark = ({ x, y, label, dx = 0, dy = -10, anchor = "middle", color = C.accent }) => (
  <g>
    <circle cx={x} cy={y} r={3.6} fill={C.card} stroke={color} strokeWidth={1.8} />
    <T x={x + dx} y={y + dy} size={9.5} weight={700} anchor={anchor} color={color}>{label}</T>
  </g>
);

/* One insulin: area, curve (drawn on its step), peak band, and — while its
   own step is on screen — onset / peak / end marks and a dot riding the
   curve to show the effect rising and falling. */
function Curve({ k, step }) {
  const ins = INSULINS[k], st = STYLE[k];
  const d = curvePath(ins, st.h);
  const m = landmarks(k);
  return (
    <G id={k}>
      <path d={areaPath(ins, st.h)} fill={C.teal} fillOpacity={0.07} />
      {ins.peak ? <rect x={hx(ins.peak[0])} y={Y0 - st.h - 4} width={hx(ins.peak[1]) - hx(ins.peak[0])} height={8} rx={4} fill={C.amber} opacity={0.55} /> : null}
      <Anim on={step} kind="draw" dur={1400}>
        <path d={d} pathLength={1} fill="none" stroke={C.teal} strokeWidth={st.w + 3} strokeOpacity={0.12} strokeLinecap="round" />
      </Anim>
      <path d={d} fill="none" stroke={C.teal} strokeWidth={st.w} strokeDasharray={st.dash} strokeLinecap="round" />
      <OnStep on={step} kind="pop" delay={900}>
        <Mark {...m.onset} label="onset" dy={-8} dx={m.onset.x < X0 + 20 ? 10 : 0} anchor={m.onset.x < X0 + 20 ? "start" : "middle"} />
        {m.peak ? <Mark {...m.peak} label="peak" dy={-12} color={C.labInk} /> : <T x={hx(12)} y={Y0 - st.h - 8} size={9.5} weight={700} anchor="middle" color={C.accent}>no peak — steady</T>}
        <Mark {...m.end} label="ends" dy={m.end.y === Y0 ? -8 : -10} dx={m.end.x > X1 - 12 ? -6 : 0} anchor={m.end.x > X1 - 12 ? "end" : "middle"} />
      </OnStep>
      <Loop on={step}>
        <g className="dg-a dg-fade" style={{ animationDelay: "1.4s" }}>
          <circle r={4.5} fill={C.teal} stroke={C.card} strokeWidth={1.5}>
            <animateMotion dur="3.4s" repeatCount="indefinite" path={d} />
          </circle>
        </g>
      </Loop>
    </G>
  );
}

/* "Give with a meal": a plate at dose time, on the rapid-acting step. */
const Meal = ({ x, y }) => (
  <g fill="none" stroke={C.teal} strokeWidth={1.4} strokeLinecap="round">
    <circle cx={x} cy={y} r={7} fill={C.card} />
    <circle cx={x} cy={y} r={3.8} strokeOpacity={0.6} />
    <path d={`M${x - 11},${y - 7} v14 M${x + 11},${y + 7} v-14 q-2.6,2.5 0,7`} />
  </g>
);

/* A syringe glyph for the dose time in the worked example. */
const Syringe = ({ x, y }) => (
  <g fill="none" stroke={C.accent} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
    <path d={`M${x - 3},${y - 9} h6 M${x},${y - 9} v3 M${x - 3},${y - 6} h6 v9 h-6 z M${x},${y + 3} v5`} />
  </g>
);

export const INSULIN_EXAMPLE = { type: "nph", givenAt: "07:00" };

const ROWS = [["rapid", "Rapid · lispro", "10–30 min", "1–2 h", "3–5 h"],
  ["short", "Short · regular", "30–60 min", "2–4 h", "5–8 h"],
  ["nph", "Intermed. · NPH", "1–2 h", "4–12 h", "12–18 h"],
  ["long", "Long · glargine", "1–2 h", "none", "~24 h"]];

export function InsulinDiagram({ params = INSULIN_EXAMPLE, focus = null }) {
  const concept = params === null;
  const pw = concept ? null : peakWindow(params.type, params.givenAt);
  const mine = concept ? null : INSULINS[params.type];
  const mst = concept ? null : STYLE[params.type];
  const bandMid = mine?.peak ? (hx(mine.peak[0]) + hx(mine.peak[1])) / 2 : 0;
  return (
    <Frame h={416} focus={focus} title="Insulin onset, peak and duration"
      desc="Typical action of four insulin types over 24 hours. Rapid-acting: onset 10 to 30 minutes, peak 1 to 2 hours, duration 3 to 5 hours, given with a meal. Short-acting regular: onset 30 to 60 minutes, peak 2 to 4 hours, duration 5 to 8 hours. Intermediate NPH: onset 1 to 2 hours, peak 4 to 12 hours, duration 12 to 18 hours. Long-acting glargine or detemir: onset 1 to 2 hours, no peak, about 24 hours. Hypoglycemia risk is highest at the peak.">
      <G id="axes">
        <T x={18} y={20} size={12} weight={700}>Insulin effect over 24 hours</T>
        <T x={342} y={20} size={10} anchor="end" color={C.muted}>typical ranges</T>
        {[0.33, 0.66, 1].map((f) => (
          <line key={f} x1={X0} x2={X1} y1={Y0 - (Y0 - YTOP) * f} y2={Y0 - (Y0 - YTOP) * f} stroke={C.line} strokeOpacity={0.6} strokeDasharray="2 4" />
        ))}
        <line x1={X0} y1={Y0} x2={X1} y2={Y0} stroke={C.line} strokeWidth={1.2} />
        <line x1={X0} y1={YTOP - 20} x2={X0} y2={Y0} stroke={C.line} strokeWidth={1.2} />
        {[0, 4, 8, 12, 16, 20, 24].map((h) => (
          <g key={h}>
            <line x1={hx(h)} y1={Y0} x2={hx(h)} y2={Y0 + 4} stroke={C.muted} />
            <T x={hx(h)} y={Y0 + 16} size={10} anchor="middle" color={C.muted} mono>{h}h</T>
          </g>
        ))}
        <T x={X0 + 4} y={YTOP - 8} size={10} color={C.muted}>effect (illustrative)</T>
        {/* Legend: line style + name. The curves share one colour (the
            design rules allow no new ones), so style carries identity — and
            a legend keeps it unambiguous where direct labels crowded. */}
        {Object.entries(INSULINS).map(([k, ins], i) => {
          const lx = i % 2 ? 190 : 18, ly = 44 + Math.floor(i / 2) * 18;
          return (
            <g key={k}>
              <line x1={lx} y1={ly - 4} x2={lx + 26} y2={ly - 4} stroke={C.teal} strokeWidth={STYLE[k].w} strokeDasharray={STYLE[k].dash} strokeLinecap="round" />
              <T x={lx + 32} y={ly} size={11} weight={600}>{ins.name}</T>
            </g>
          );
        })}
      </G>
      <Curve k="rapid" step={["idea", "rapid"]} />
      <Curve k="short" step="short" />
      <Curve k="nph" step="nph" />
      <Curve k="long" step="long" />
      <G id="rapid-meal">
        <OnStep on="rapid" kind="pop" delay={600}>
          {/* clear of the rapid curve, with a leader back to dose time */}
          <path d={`M${hx(0) + 2},${Y0 - 2} Q${hx(3)},${Y0 - 6} ${hx(5.6)},${Y0 - 30}`} fill="none" stroke={C.teal} strokeWidth={1.2} strokeDasharray="2 3" />
          <Meal x={hx(6.6)} y={Y0 - 36} />
          <T x={hx(6.6) + 16} y={Y0 - 32} size={10} weight={700} color={C.accent}>give with a meal</T>
        </OnStep>
      </G>
      <G id="table">
        <Box x={8} y={252} w={344} h={112} r={10} fill={C.surface} lift />
        {ROWS.map(([k], i) => (
          <OnStep key={k} on={k} kind="fade">
            <rect x={12} y={277 + i * 19} width={336} height={18} rx={5} fill={C.teal} fillOpacity={0.14} />
          </OnStep>
        ))}
        <T x={18} y={270} size={10.5} weight={700} color={C.muted}>Type</T>
        <T x={124} y={270} size={10.5} weight={700} color={C.muted}>Onset</T>
        <T x={204} y={270} size={10.5} weight={700} color={C.muted}>Peak</T>
        <T x={268} y={270} size={10.5} weight={700} color={C.muted}>Lasts</T>
        {ROWS.map(([k, a, b, c, d], i) => (
          <g key={k}>
            <T x={18} y={290 + i * 19} size={11}>{a}</T>
            <T x={124} y={290 + i * 19} size={11} mono>{b}</T>
            <T x={204} y={290 + i * 19} size={11} mono color={c === "none" ? C.muted : C.ink}>{c}</T>
            <T x={268} y={290 + i * 19} size={11} mono>{d}</T>
          </g>
        ))}
      </G>
      <G id="peak-risk">
        <rect x={18} y={376} width={18} height={8} rx={4} fill={C.amber} opacity={0.55} />
        <T x={42} y={384} size={11}>Peak = highest risk of hypoglycemia</T>
      </G>
      <G id="worked">
        {/* The client's own insulin, on the worked step: its curve, its
            peak window in clock time, and the dose time. */}
        {!concept ? (
          <OnStep on="worked" kind="fade">
            {mine.peak ? (
              <g>
                <rect x={hx(mine.peak[0])} y={YTOP + 14} width={hx(mine.peak[1]) - hx(mine.peak[0])} height={Y0 - YTOP - 14} fill={C.amber} fillOpacity={0.16} />
                <T x={Math.max(X0 + 78, Math.min(X1 - 40, bandMid))} y={YTOP + 28} size={10} weight={700} anchor="middle" mono color={C.labInk}>{`${pw.from}–${pw.to}`}</T>
              </g>
            ) : null}
            <path d={areaPath(mine, mst.h)} fill={C.teal} fillOpacity={0.2} />
            <Anim on="worked" kind="draw" dur={1400}>
              <path d={curvePath(mine, mst.h)} pathLength={1} fill="none" stroke={C.teal} strokeWidth={4} strokeLinecap="round" />
            </Anim>
            <Syringe x={X0 + 10} y={YTOP + 26} />
            <T x={X0 + 20} y={YTOP + 30} size={10} weight={700} mono color={C.accent}>{params.givenAt}</T>
          </OnStep>
        ) : null}
        {pw ? (
          <T x={18} y={406} size={11} weight={700} color={C.accent}>
            {`${INSULINS[params.type].eg.split(",")[0].toUpperCase()} at ${params.givenAt} → peak about ${pw.from}–${pw.to}${pw.nextDay ? " (next day)" : ""}`}
          </T>
        ) : (
          <T x={18} y={406} size={11} color={C.muted}>Check the product labeling — times vary by product.</T>
        )}
      </G>
    </Frame>
  );
}

export const insulin = {
  id: "insulin",
  title: "Insulin action times",
  concepts: ["diabetes"],
  Diagram: InsulinDiagram,
  example: INSULIN_EXAMPLE,
  facts: [
    "Typical rapid-acting insulin (lispro, aspart, glulisine): onset 10–30 minutes, peak 1–2 hours, duration 3–5 hours.",
    "Typical short-acting (regular) insulin: onset 30–60 minutes, peak 2–4 hours, duration 5–8 hours.",
    "Typical intermediate-acting (NPH) insulin: onset 1–2 hours, peak 4–12 hours, duration 12–18 hours.",
    "Long-acting insulin (glargine, detemir): onset 1–2 hours, no pronounced peak, duration about 24 hours.",
    "The risk of hypoglycemia is greatest when an insulin is at its peak.",
    "Action times vary by product and source; the product's labeling is the authority.",
  ],
  steps: [
    { key: "idea", focus: ["axes", "rapid"], caption: "Every insulin has an onset (when it starts working), a peak (when it works hardest) and a duration (how long it lasts).",
      narration: "Every insulin has three times to know: the onset, when it starts working; the peak, when it works hardest; and the duration, how long it lasts." },
    { key: "rapid", focus: ["axes", "rapid", "rapid-meal", "table"], caption: "Rapid-acting — lispro, aspart, glulisine — starts in 10 to 30 minutes and peaks in 1 to 2 hours. Give it with a meal, so food arrives as it starts to work.",
      narration: "Rapid-acting insulin — lispro, aspart, or glulisine — starts working in ten to thirty minutes and peaks in one to two hours. It is given with a meal, so that the food arrives as the insulin starts to work." },
    { key: "short", focus: ["axes", "short", "table"], caption: "Short-acting regular insulin starts in 30 to 60 minutes and peaks at 2 to 4 hours.",
      narration: "Short-acting regular insulin starts in thirty to sixty minutes and peaks at two to four hours." },
    { key: "nph", focus: ["axes", "nph", "table"], caption: "Intermediate NPH starts in 1 to 2 hours, with a long, broad peak from about 4 to 12 hours.",
      narration: "Intermediate-acting N-P-H starts in one to two hours, and has a long, broad peak from about four to twelve hours." },
    { key: "long", focus: ["axes", "long", "table"], caption: "Long-acting glargine and detemir have no pronounced peak — a steady background level for about 24 hours.",
      narration: "Long-acting glargine and detemir have no pronounced peak. They provide a steady background level for about twenty-four hours." },
    { key: "risk", focus: ["axes", "rapid", "short", "nph", "peak-risk"], caption: "The peak is when hypoglycemia is most likely. Know when each client's insulin peaks, and make sure food and glucose checks line up with it.",
      narration: "The peak is when hypoglycemia is most likely. Know when each client's insulin peaks, and make sure food and glucose checks line up with it." },
    { key: "worked", focus: ["axes", "worked", "peak-risk"], dynamic: true, caption: null, narration: null },
  ],
  dynamicCaption: ({ type, givenAt } = INSULIN_EXAMPLE) => {
    const ins = INSULINS[type];
    const pw = peakWindow(type, givenAt);
    if (!pw) return `${ins.name} insulin given at ${givenAt} has no pronounced peak — it gives a steady effect for about a day.`;
    return `${ins.name} (${ins.eg}) given at ${givenAt} peaks roughly ${pw.from}–${pw.to}${pw.nextDay ? " the next day" : ""} — the window to watch most closely for hypoglycemia.`;
  },
};
