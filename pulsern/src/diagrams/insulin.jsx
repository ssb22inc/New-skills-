/* Insulin action: onset, peak (when there is one) and duration.
   ------------------------------------------------------------------
   Times are the typical SUBCUTANEOUS ranges taught for NCLEX-RN
   preparation (Sol, PR #155 diagram review: the route was never stated,
   and IV regular insulin acts far faster). They vary by product and
   source, so the diagram states ranges, not single numbers, and says to
   check the product's labeling. The peak window is computed by
   peakWindow() (pure, tested), so a worked example ("NPH at 07:00") always
   lands on the right clock times.

   Curves are illustrative shapes, but they keep to the landmarks: each
   stays on the baseline until its onset, peaks inside its peak range and
   returns to baseline at the end of its duration. Glargine U-100 has no
   pronounced peak and wanes at about a day, so its curve tapers off at the
   24-hour edge instead of being marked "ends" while still high.

   Four curves in one palette would fail the colour rules, so they are told
   apart by line style and a legend — never by colour alone — and the
   highlighted worked-example curve keeps its own line style. */
import React from "react";
import { Frame, G, T, Box, C, Anim, Loop, OnStep, Para, paraLines, BODY_TEXT, MIN_TEXT } from "./kit.jsx";

/* Hours. Onset/peak are [from, to]; peak null means peakless. */
export const INSULINS = {
  rapid:  { name: "Rapid-acting",  eg: "lispro, aspart, glulisine", onset: [10 / 60, 30 / 60], peak: [1, 2],  duration: [3, 5] },
  short:  { name: "Short-acting",  eg: "regular U-100",             onset: [0.5, 1],          peak: [2, 4],  duration: [5, 8] },
  nph:    { name: "Intermediate",  eg: "NPH",                       onset: [1, 2],            peak: [4, 12], duration: [12, 18] },
  /* Glargine U-100 only. Detemir (dose-dependent, often shorter), glargine
     U-300 (up to ~36 h) and degludec (~42 h) act differently and are never
     drawn on this row. */
  long:   { name: "Long-acting",   eg: "glargine (U-100)",          onset: [1, 2],            peak: null,    duration: [24, 24] },
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
  /* Each end carries its own day: 0 = the dose day, 1 = the next day
     (Sol, round 2: one "next day" flag mis-dated 23:00–07:00). */
  const a = t + ins.peak[0], b = t + ins.peak[1];
  return { from: clock(a), to: clock(b), fromDay: Math.floor(a / 24), toDay: Math.floor(b / 24), nextDay: b >= 24 };
}

const X0 = 40, X1 = 342, Y0 = 282, YTOP = 152;   // chart box, hours 0..24
const hx = (h) => X0 + (Math.min(24, h) / 24) * (X1 - X0);

/* A smooth action curve: flat until the onset, rising to the middle of the
   peak range, falling to the end of the duration. Peakless glargine rises
   to a plateau and tapers at the 24-hour edge. */
export const onsetOf = (ins) => (ins.onset[0] + ins.onset[1]) / 2;
function curvePath(ins, height) {
  const on = onsetOf(ins);
  const end = ins.duration[1];
  const y = Y0 - height;
  if (!ins.peak) {
    return `M${hx(0)},${Y0} L${hx(on)},${Y0} C${hx(on + 1)},${Y0} ${hx(on + 1.5)},${y} ${hx(on + 3.5)},${y} L${hx(19)},${y} C${hx(21.5)},${y} ${hx(23)},${Y0 - height * 0.35} ${hx(24)},${Y0 - height * 0.15}`;
  }
  const pk = (ins.peak[0] + ins.peak[1]) / 2;
  return `M${hx(0)},${Y0} L${hx(on)},${Y0} C${hx(on + (pk - on) * 0.45)},${Y0} ${hx(on + (pk - on) * 0.55)},${y} ${hx(pk)},${y} C${hx(pk + (end - pk) * 0.45)},${y} ${hx(end - (end - pk) * 0.2)},${Y0} ${hx(end)},${Y0}`;
}

const STYLE = {
  rapid: { dash: null, w: 2.6, h: 112 },
  short: { dash: "7 4", w: 2.2, h: 92 },
  nph:   { dash: "2 4", w: 2.4, h: 70 },
  long:  { dash: "11 4 2 4", w: 2.2, h: 40 },
};

/* The area under a curve, closed back to the baseline. */
const areaPath = (ins, h) => `${curvePath(ins, h)} V${Y0} H${hx(0)} Z`;

/* Where on the drawn curve the onset, the peak and the end sit. */
function landmarks(k) {
  const ins = INSULINS[k], h = STYLE[k].h;
  return {
    onset: { x: hx(onsetOf(ins)), y: Y0 },
    peak: ins.peak ? { x: hx((ins.peak[0] + ins.peak[1]) / 2), y: Y0 - h } : null,
    end: ins.peak ? { x: hx(ins.duration[1]), y: Y0 } : null,
  };
}

const Mark = ({ x, y, label, dx = 0, dy = -10, anchor = "middle", color = C.accent }) => (
  <g>
    <circle className="dg-solid" cx={x} cy={y} r={3.8} fill={C.card} stroke={color} strokeWidth={1.8} />
    <T x={x + dx} y={y + dy} size={MIN_TEXT} weight={700} anchor={anchor} color={color}>{label}</T>
  </g>
);

/* One insulin: area, curve (drawn on its step), peak band, and — while its
   own step is on screen — onset / peak / end marks and a dot riding the
   curve to show the effect rising and falling. */
function Curve({ k, step }) {
  const ins = INSULINS[k], st = STYLE[k];
  const d = curvePath(ins, st.h);
  const m = landmarks(k);
  const onLeft = m.onset.x < X0 + 24;
  return (
    <G id={k}>
      <path d={areaPath(ins, st.h)} fill={C.teal} fillOpacity={0.07} />
      {ins.peak ? <rect x={hx(ins.peak[0])} y={Y0 - st.h - 4} width={hx(ins.peak[1]) - hx(ins.peak[0])} height={8} rx={4} fill={C.amber} fillOpacity={0.55}
        stroke={C.labInk} strokeWidth={1.2} /> : null}
      <Anim on={step} kind="draw" dur={1400}>
        <path d={d} pathLength={1} fill="none" stroke={C.teal} strokeWidth={st.w + 3} strokeOpacity={0.12} strokeLinecap="round" />
      </Anim>
      <path d={d} fill="none" stroke={C.teal} strokeWidth={st.w} strokeDasharray={st.dash} strokeLinecap="round" />
      <OnStep on={step} kind="pop" delay={900}>
        <Mark {...m.onset} label="onset" dy={18} dx={onLeft ? 4 : 0} anchor={onLeft ? "start" : "middle"} />
        {m.peak ? <Mark {...m.peak} label="peak" dy={-12} color={C.labInk} />
          : <T x={hx(10)} y={Y0 - st.h - 10} size={MIN_TEXT} weight={700} anchor="middle" color={C.accent}>no pronounced peak</T>}
        {m.end ? <Mark {...m.end} label="ends" dy={-10} dx={m.end.x > X1 - 16 ? -6 : 4} anchor={m.end.x > X1 - 16 ? "end" : "start"} />
          : <T x={X1} y={Y0 - st.h - 10} size={MIN_TEXT} weight={700} anchor="end" color={C.accent}>wanes ~24 h ▸</T>}
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

/* Meal-time insulin: a plate at dose time, on the rapid-acting step. */
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

/* What the worked example calls the client's insulin. The parameters give
   only the class, so a rapid-acting question is never relabelled with one
   product's name (Sol, round 6: aspart showed as LISPRO). */
export const WORKED_LABEL = { rapid: "Rapid-acting insulin", short: "Regular U-100", nph: "NPH", long: "Glargine U-100" };

/* "11:00–19:00", "23:00 dose day–07:00 next day", "01:00–09:00 next day". */
const DAY = ["dose day", "next day", "day 3"];
export function windowText(pw) {
  if (!pw) return "";
  if (pw.fromDay === 0 && pw.toDay === 0) return `${pw.from}–${pw.to}`;
  if (pw.fromDay === pw.toDay) return `${pw.from}–${pw.to} ${DAY[pw.toDay]}`;
  return `${pw.from} ${DAY[pw.fromDay]}–${pw.to} ${DAY[pw.toDay]}`;
}

const ROWS = [["rapid", "Rapid", "10–30 min", "1–2 h", "3–5 h"],
  ["short", "Regular U-100", "30–60 min", "2–4 h", "5–8 h"],
  ["nph", "NPH", "1–2 h", "4–12 h", "12–18 h"],
  ["long", "Glargine U-100", "1–2 h", "none", "~24 h"]];
const COL = [18, 140, 224, 288];
const TY = 328, RH = 22;
const RISK = "Lows can also happen outside the peak, and with peakless insulin.";
const NOTE = "Subcutaneous use. IV regular insulin and regular U-500 act differently; detemir, glargine U-300 and degludec last differently. Check the product.";

export function InsulinDiagram({ params = INSULIN_EXAMPLE, focus = null }) {
  const concept = params === null;
  const pw = concept ? null : peakWindow(params.type, params.givenAt);
  const mine = concept ? null : INSULINS[params.type];
  const mst = concept ? null : STYLE[params.type];
  const bandMid = mine?.peak ? (hx(mine.peak[0]) + hx(mine.peak[1])) / 2 : 0;
  const tableEnd = TY + 26 + ROWS.length * RH + 8;
  const noteY = tableEnd + 18;
  const riskY = noteY + paraLines(NOTE, 324, MIN_TEXT).length * MIN_TEXT * 1.3 + 12;
  const workedY = riskY + 22 + paraLines(RISK, 300, MIN_TEXT).length * MIN_TEXT * 1.3 + 8;
  const workedText = pw
    ? `${WORKED_LABEL[params.type]} at ${params.givenAt}: peak about ${windowText(pw)}`
    : concept ? "" : `${WORKED_LABEL[params.type]} at ${params.givenAt}: no pronounced peak`;
  const workedLines = workedText ? paraLines(workedText, 324).length : 0;
  const peakText = pw ? `peak ${windowText(pw)}` : "";
  const labelX = Math.max(X0, Math.min(X1 - peakText.length * 7.9, bandMid - (peakText.length * 7.9) / 2));
  return (
    <Frame h={workedLines ? workedY + (workedLines - 1) * BODY_TEXT * 1.3 + 12 : workedY - 6} focus={focus} title="Insulin onset, peak and duration"
      regions={{ axes: [0, Y0 + 40], rapid: [YTOP - 60, Y0 + 40], short: [YTOP - 60, Y0 + 40], nph: [YTOP - 60, Y0 + 40], long: [YTOP - 60, Y0 + 40],
        "rapid-meal": [YTOP - 40, YTOP - 10], table: [TY, tableEnd], note: [noteY - 14, riskY - 14], "peak-risk": [riskY - 16, workedY - 18],
        worked: workedLines ? [[YTOP - 62, Y0 + 40], [workedY - 16, workedY + (workedLines - 1) * BODY_TEXT * 1.3 + 6]] : [YTOP - 62, Y0 + 40] }}
      desc={`${workedText ? `${workedText}. ` : ""}Typical subcutaneous action of four insulin types over 24 hours, as illustrative curves that stay flat until onset; curve heights are arbitrary and do not compare potency or dose, and times vary by product. Rapid-acting (lispro, aspart, glulisine): onset 10 to 30 minutes, peak 1 to 2 hours, duration 3 to 5 hours; it is associated with meals, and its timing follows the specific product and prescribed plan. Short-acting regular U-100: onset 30 to 60 minutes, peak 2 to 4 hours, duration 5 to 8 hours. Intermediate NPH: onset 1 to 2 hours, peak 4 to 12 hours, duration 12 to 18 hours. Long-acting glargine U-100: onset 1 to 2 hours, no pronounced peak, wanes at about 24 hours. IV regular insulin and regular U-500 act differently, and detemir, glargine U-300 and degludec last differently, so check the product. Hypoglycemia risk is highest around a peak, but lows can also happen at other times and with peakless insulin.`}>
      <G id="axes">
        <T x={18} y={20} size={BODY_TEXT} weight={700}>Typical SC insulin action, 24 hours</T>
        <T x={18} y={39} size={MIN_TEXT} color={C.muted}>illustrative: heights don't compare strength</T>
        {Object.entries(INSULINS).map(([k, ins], i) => {
          const lx = i % 2 ? 190 : 18, ly = 64 + Math.floor(i / 2) * 22;
          return (
            <g key={k}>
              <line x1={lx} y1={ly - 5} x2={lx + 26} y2={ly - 5} stroke={C.teal} strokeWidth={STYLE[k].w} strokeDasharray={STYLE[k].dash} strokeLinecap="round" />
              <T x={lx + 32} y={ly} size={MIN_TEXT} weight={600}>{ins.name}</T>
            </g>
          );
        })}
        {[0.33, 0.66, 1].map((f) => (
          <line key={f} x1={X0} x2={X1} y1={Y0 - (Y0 - YTOP) * f} y2={Y0 - (Y0 - YTOP) * f} stroke={C.line} strokeOpacity={0.6} strokeDasharray="2 4" />
        ))}
        {/* axes in the muted ink, which meets 3:1 in both themes (Sol, round 5) */}
        <line x1={X0} y1={Y0} x2={X1} y2={Y0} stroke={C.muted} strokeWidth={1.2} />
        <line x1={X0} y1={YTOP - 6} x2={X0} y2={Y0} stroke={C.muted} strokeWidth={1.2} />
        {[0, 4, 8, 12, 16, 20, 24].map((h) => (
          <g key={h}>
            <line x1={hx(h)} y1={Y0} x2={hx(h)} y2={Y0 + 4} stroke={C.muted} />
            <T x={hx(h)} y={Y0 + 36} size={MIN_TEXT} anchor="middle" color={C.muted} mono>{h}h</T>
          </g>
        ))}
      </G>
      <Curve k="rapid" step={["idea", "rapid"]} />
      <Curve k="short" step="short" />
      <Curve k="nph" step="nph" />
      <Curve k="long" step="long" />
      <G id="rapid-meal">
        {/* Off the time axis, in the label row above the chart: a plate drawn
            at an hour on the axis read as a meal hours after the dose (Sol,
            round 5). */}
        <OnStep on="rapid" kind="pop" delay={600}>
          <Meal x={X0 + 12} y={YTOP - 24} />
          <T x={X0 + 30} y={YTOP - 19} size={MIN_TEXT} weight={700} color={C.accent}>meal-time: timing follows the product</T>
        </OnStep>
      </G>
      <G id="table">
        <Box x={8} y={TY} w={344} h={tableEnd - TY} r={10} fill={C.surface} lift />
        {ROWS.map(([k], i) => (
          <OnStep key={k} on={k} kind="fade">
            <rect x={12} y={TY + 30 + i * RH} width={336} height={RH - 2} rx={5} fill={C.teal} fillOpacity={0.14} />
          </OnStep>
        ))}
        {["Type", "Onset", "Peak", "Lasts"].map((h, i) => <T key={h} x={COL[i]} y={TY + 21} size={MIN_TEXT} weight={700} color={C.muted}>{h}</T>)}
        {ROWS.map(([k, a, b, c, d], i) => (
          <g key={k}>
            <T x={COL[0]} y={TY + 46 + i * RH} size={MIN_TEXT}>{a}</T>
            <T x={COL[1]} y={TY + 46 + i * RH} size={MIN_TEXT} mono>{b}</T>
            <T x={COL[2]} y={TY + 46 + i * RH} size={MIN_TEXT} mono color={c === "none" ? C.muted : C.ink}>{c}</T>
            <T x={COL[3]} y={TY + 46 + i * RH} size={MIN_TEXT} mono>{d}</T>
          </g>
        ))}
      </G>
      <G id="note">
        <Para x={18} y={noteY} w={324} size={MIN_TEXT} color={C.muted} text={NOTE} />
      </G>
      <G id="peak-risk">
        <rect x={18} y={riskY - 9} width={18} height={8} rx={4} fill={C.amber} fillOpacity={0.55} stroke={C.labInk} strokeWidth={1.2} />
        <T x={42} y={riskY} size={BODY_TEXT} weight={600}>Around a peak: highest hypoglycemia risk</T>
        <Para x={42} y={riskY + 20} w={300} size={MIN_TEXT} text={RISK} />
      </G>
      <G id="worked">
        {/* The client's own insulin, on the worked step: its curve in its own
            line style, its peak window in clock time on a label row above the
            chart with a leader to the band, and the dose time. */}
        {!concept ? (
          <OnStep on="worked" kind="fade">
            {mine.peak ? (
              <g>
                <rect x={hx(mine.peak[0])} y={YTOP} width={hx(mine.peak[1]) - hx(mine.peak[0])} height={Y0 - YTOP} fill={C.amber} fillOpacity={0.16} />
                {/* its own label row, above the dose row, with a leader to the band */}
                <path d={`M${bandMid},${YTOP - 40} V${YTOP + 2}`} stroke={C.labInk} strokeWidth={1.2} strokeDasharray="2 2" />
                <T x={labelX} y={YTOP - 44} size={MIN_TEXT} weight={700} mono color={C.labInk}>{peakText}</T>
              </g>
            ) : null}
            <path d={areaPath(mine, mst.h)} fill={C.teal} fillOpacity={0.2} />
            {/* A fade, not the stroke-drawing animation: drawing rewrites the dash
                pattern, and the highlighted curve must keep its legend style
                (Sol, round 2: NPH turned solid like rapid-acting). */}
            <Anim on="worked" kind="fade" dur={900}>
              <path d={curvePath(mine, mst.h)} fill="none" stroke={C.teal} strokeWidth={mst.w + 1.6} strokeDasharray={mst.dash} strokeLinecap="round" />
            </Anim>
            <Syringe x={X0 + 6} y={YTOP - 20} />
            <T x={X0 + 16} y={YTOP - 18} size={MIN_TEXT} weight={700} mono color={C.accent}>{`dose ${params.givenAt}`}</T>
          </OnStep>
        ) : null}
        {workedText ? <Para x={18} y={workedY} w={324} weight={700} color={C.accent} text={workedText} /> : null}
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
  textCases: [{ type: "rapid", givenAt: "07:30" }, { type: "short", givenAt: "12:00" }, { type: "long", givenAt: "21:00" }, { type: "nph", givenAt: "19:00" }],
  facts: [
    "These are typical subcutaneous action times; IV regular insulin and concentrated regular U-500 act differently. The curve heights are illustrative and do not compare potency or dose-equivalent effect.",
    "Typical rapid-acting insulin (lispro, aspart, glulisine): onset 10–30 minutes, peak 1–2 hours, duration 3–5 hours. It is associated with meals; its timing follows the specific product's labeling and the prescribed plan.",
    "Typical short-acting regular insulin (U-100, subcutaneous): onset 30–60 minutes, peak 2–4 hours, duration 5–8 hours.",
    "Typical intermediate-acting (NPH) insulin: onset 1–2 hours, peak 4–12 hours, duration 12–18 hours.",
    "Long-acting insulin glargine U-100: onset 1–2 hours, no pronounced peak, duration about 24 hours.",
    "Other basal insulins differ: detemir's duration is dose-dependent and can be shorter than 24 hours; glargine U-300 lasts up to about 36 hours; degludec about 42 hours.",
    "The risk of hypoglycemia is greatest around an insulin's peak, but hypoglycemia can occur at other times, including with peakless basal insulin.",
    "Action times vary by product and source; the product's labeling is the authority.",
  ],
  steps: [
    { key: "idea", focus: ["axes", "rapid"], caption: "Every insulin has an onset (when it starts working) and a duration (how long it lasts). Most also have a peak, when they work hardest; glargine U-100 has no pronounced peak.",
      narration: "Every insulin has an onset, when it starts working, and a duration, how long it lasts. Most also have a peak, when they work hardest. Glargine U-one-hundred has no pronounced peak." },
    { key: "rapid", focus: ["axes", "rapid", "rapid-meal", "table"], caption: "Rapid-acting insulin (lispro, aspart, glulisine) starts in 10 to 30 minutes and peaks in 1 to 2 hours. It is meal-time insulin; exact timing follows the specific product and the prescribed plan.",
      narration: "Rapid-acting insulin, such as lispro, aspart, or glulisine, starts working in ten to thirty minutes and peaks in one to two hours. It is meal-time insulin, and its exact timing follows the specific product and the prescribed plan." },
    { key: "short", focus: ["axes", "short", "table"], caption: "Regular U-100 insulin given subcutaneously starts in 30 to 60 minutes and peaks at 2 to 4 hours. Regular U-100 given IV acts much faster. Concentrated regular U-500 acts differently and is never given IV.",
      narration: "Regular U-one-hundred insulin given under the skin starts in thirty to sixty minutes and peaks at two to four hours. Regular U-one-hundred given intravenously acts much faster. Concentrated regular U-five-hundred acts differently, and it is never given intravenously." },
    { key: "nph", focus: ["axes", "nph", "table"], caption: "Intermediate NPH starts in 1 to 2 hours, with a long, broad peak from about 4 to 12 hours.",
      narration: "Intermediate-acting N-P-H starts in one to two hours, and has a long, broad peak from about four to twelve hours." },
    { key: "long", focus: ["axes", "long", "table", "note"], caption: "Long-acting glargine U-100 has no pronounced peak: a steady background level that wanes at about 24 hours. Other basal insulins, including glargine U-300, last differently, so check the product.",
      narration: "Long-acting glargine U-one-hundred has no pronounced peak. It provides a steady background level that wanes at about twenty-four hours. Other basal insulins, including glargine U-three-hundred, last differently, so always check the product." },
    { key: "risk", focus: ["axes", "rapid", "short", "nph", "long", "peak-risk"], caption: "Exam questions often test the higher risk of hypoglycemia around an expected peak. Lows can also happen at other times, including with peakless insulin.",
      narration: "Exam questions often test the higher risk of hypoglycemia around an insulin's expected peak. But lows can also happen at other times, including with peakless insulin." },
    { key: "worked", focus: ["axes", "worked", "peak-risk"], dynamic: true, caption: null, narration: null },
  ],
  dynamicCaption: ({ type, givenAt } = INSULIN_EXAMPLE) => {
    const ins = INSULINS[type];
    const pw = peakWindow(type, givenAt);
    if (!pw) return `${ins.name} insulin given at ${givenAt} has no pronounced peak: a steady effect that wanes at about a day. Lows can still happen.`;
    return `${ins.name} (${ins.eg}) given at ${givenAt} peaks roughly ${windowText(pw)}, the window when hypoglycemia is most likely, though lows can happen at other times too.`;
  },
};
