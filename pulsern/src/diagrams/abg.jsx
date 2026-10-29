/* ABG interpretation — the ROME method, with compensation.
   ------------------------------------------------------------------
   The interpretation is COMPUTED, never drawn by hand: interpretAbg() is a
   pure function (CLAUDE.md rule 6) tested against textbook cases, and the
   diagram only renders what it returns. So the same drawing can show any
   question's values and can never label a blood gas wrongly by accident.

   Reference ranges used (standard adult arterial values taught for NCLEX):
     pH 7.35–7.45 · PaCO₂ 35–45 mmHg · HCO₃⁻ 22–26 mEq/L

   How a verdict is reached (Sol, PR #155 diagram review):
   1. The three values must agree with each other. On an ABG the HCO₃⁻ is
      calculated from pH and PaCO₂ (Henderson–Hasselbalch:
      pH = 6.1 + log10(HCO₃⁻ / (0.03 × PaCO₂))), so a gas whose pH is more
      than PH_TOLERANCE from the one its PaCO₂ and HCO₃⁻ imply is not
      interpreted at all: an extraction or authoring error must not become
      authoritative teaching. The tolerance allows the rounding typical of
      exam values.
   2. Every primary disorder the values could fit is tested against its
      expected compensation — no "which side of 7.40" shortcut picks one
      first. A primary needs its own value abnormal in the direction of the
      problem; with a normal pH it also needs the other value to have moved
      past baseline (a pH cannot be back in range without compensation).
   3. One fit: that disorder, with the ROME compensation label. More than
      one fit: both are named, and the history decides. No fit: a mixed
      disorder, naming the second disorder the out-of-range value points to.

   Expected compensation (standard bedside rules, baseline HCO₃⁻ 24 and
   PaCO₂ 40, one ±2 tolerance — not stacked on the whole normal range):
     metabolic acidosis    PaCO₂ = 1.5 × HCO₃⁻ + 8 ± 2 (Winter's formula)
     metabolic alkalosis   PaCO₂ = 0.7 × HCO₃⁻ + 21 ± 2
     respiratory acidosis  HCO₃⁻ = 24 + 1 (acute) to 4 (chronic) per 10 mmHg PaCO₂ above 40, ± 2
     respiratory alkalosis HCO₃⁻ = 24 − 2 (acute) to 5 (chronic) per 10 mmHg PaCO₂ below 40, ± 2
   The acute-to-chronic span is kept because the diagram has no history. */
import React from "react";
import { Frame, G, T, Gauge, Chip, Box, C, Anim, Loop, Para, paraLines, useMotion, BODY_TEXT, MIN_TEXT } from "./kit.jsx";

export const ABG_RANGES = {
  ph: { lo: 7.35, hi: 7.45 },
  paco2: { lo: 35, hi: 45 },
  hco3: { lo: 22, hi: 26 },
};
export const PH_TOLERANCE = 0.08;
export const PLAUSIBLE = { ph: [6.8, 7.8], paco2: [10, 150], hco3: [3, 60] };

const r1 = (n) => Math.round(n * 10) / 10;
export const impliedPh = ({ paco2, hco3 }) => 6.1 + Math.log10(hco3 / (0.03 * paco2));

/* The expected range of the compensating value for a primary disorder, and
   whether the actual value is beyond it (overshoot) or short of it. One
   rounding, to the 0.1 the values are reported in, used both to decide and
   to display (Astra, PR #134 review, round 11). */
export function compensationLimit(primary, kind, { paco2, hco3 }) {
  const range = (name, value, rawLo, rawHi, towardLow) => {
    const lo = r1(rawLo), hi = r1(rawHi);
    const low = value < lo, high = value > hi;
    const out = low ? (towardLow ? "beyond" : "short") : high ? (towardLow ? "short" : "beyond") : null;
    return { name, value, expected: [lo, hi], beyond: out === "beyond", short: out === "short", low, high };
  };
  // towardLow: compensation pushes this value DOWN (so below the range is overshoot)
  if (primary === "metabolic" && kind === "acidosis") return range("PaCO₂", paco2, 1.5 * hco3 + 6, 1.5 * hco3 + 10, true);
  if (primary === "metabolic" && kind === "alkalosis") return range("PaCO₂", paco2, 0.7 * hco3 + 19, 0.7 * hco3 + 23, false);
  if (primary === "respiratory" && kind === "acidosis") {
    const d = (paco2 - 40) / 10;
    return range("HCO₃⁻", hco3, 24 + 1 * d - 2, 24 + 4 * d + 2, false);
  }
  if (primary === "respiratory" && kind === "alkalosis") {
    const d = (40 - paco2) / 10;
    return range("HCO₃⁻", hco3, 24 - 5 * d - 2, 24 - 2 * d + 2, true);
  }
  return null;
}
const offRange = (c) => !!(c && (c.beyond || c.short));
/* The second disorder an out-of-range compensating value points to. */
const secondDisorder = (c) => (c.name === "PaCO₂"
  ? (c.low ? "respiratory alkalosis" : "respiratory acidosis")
  : (c.low ? "metabolic acidosis" : "metabolic alkalosis"));
const romeLabel = (rome) => (rome === "none" ? "uncompensated" : rome === "partial" ? "partially compensated" : "fully compensated");
const mixedResult = (primary, kind, rome, c) => ({
  disorder: `${primary} ${kind}`, primary, compensation: null, romePattern: rome, mixedPossible: true, mixed: secondDisorder(c),
  reading: `ROME pattern only: ${primary} ${kind}, ${romeLabel(rome)}. `
    + `But ${c.name} ${fmtNum(c.value)} is ${c.beyond ? "beyond what compensation alone usually reaches" : "short of the compensation expected"} (about ${c.expected[0]}–${c.expected[1]}), `
    + `which suggests a mixed disorder (${primary} ${kind} with ${secondDisorder(c)}) rather than a single compensated one.`,
});
const recheck = (why) => ({ disorder: "inconsistent", primary: null, compensation: null, reading: `${why} Recheck the values before interpreting.` });

/* A value as given: at least `min` decimals, never rounded onto a limit. */
export function fmtNum(v, min = 0) {
  for (let d = min; d <= 3; d++) if (Math.abs(Number(v.toFixed(d)) - v) < 1e-9) return v.toFixed(d);
  return v.toFixed(3);
}

/* Each possible primary disorder: which value drives it, which compensates. */
const CANDIDATES = [
  { primary: "metabolic", kind: "acidosis", own: ({ hco3 }) => hco3 < ABG_RANGES.hco3.lo, moved: ({ paco2 }) => paco2 < 40 },
  { primary: "metabolic", kind: "alkalosis", own: ({ hco3 }) => hco3 > ABG_RANGES.hco3.hi, moved: ({ paco2 }) => paco2 > 40 },
  { primary: "respiratory", kind: "acidosis", own: ({ paco2 }) => paco2 > ABG_RANGES.paco2.hi, moved: ({ hco3 }) => hco3 > 24 },
  { primary: "respiratory", kind: "alkalosis", own: ({ paco2 }) => paco2 < ABG_RANGES.paco2.lo, moved: ({ hco3 }) => hco3 < 24 },
];
const FULL_CAVEAT = " Full compensation is uncommon except in chronic respiratory alkalosis, and a mixed disorder can look the same, so the history decides.";

export function interpretAbg({ ph, paco2, hco3 }) {
  for (const [k, v] of Object.entries({ ph, paco2, hco3 })) {
    if (!Number.isFinite(v)) throw new Error(`interpretAbg: ${k} must be a number`);
  }
  const v = { ph, paco2, hco3 };
  for (const [k, [lo, hi]] of Object.entries(PLAUSIBLE)) {
    if (v[k] < lo || v[k] > hi) return recheck(`${k === "ph" ? "pH" : k === "paco2" ? "PaCO₂" : "HCO₃⁻"} ${v[k]} is outside the range a living client's blood gas can show.`);
  }
  const implied = impliedPh(v);
  if (Math.abs(implied - ph) > PH_TOLERANCE + 1e-9) {
    return recheck(`These values do not agree: a PaCO₂ of ${fmtNum(paco2)} with an HCO₃⁻ of ${fmtNum(hco3)} goes with a pH near ${implied.toFixed(2)}, not ${fmtNum(ph, 2)}.`);
  }
  const phState = ph < ABG_RANGES.ph.lo ? "acidosis" : ph > ABG_RANGES.ph.hi ? "alkalosis" : "normal";
  const co2Normal = paco2 >= ABG_RANGES.paco2.lo && paco2 <= ABG_RANGES.paco2.hi;
  const hco3Normal = hco3 >= ABG_RANGES.hco3.lo && hco3 <= ABG_RANGES.hco3.hi;

  if (phState === "normal" && co2Normal && hco3Normal) {
    return { disorder: "normal", primary: null, compensation: null, reading: "Normal ABG: all three values in range." };
  }
  const cands = CANDIDATES.filter((c) => c.own(v) && (phState === "normal" || c.kind === phState));
  if (phState !== "normal" && cands.length === 2) {
    return { disorder: `combined respiratory and metabolic ${phState}`, primary: "both", compensation: null,
      reading: `Combined respiratory and metabolic ${phState}: both systems are pushing the same way, so neither is compensating.` };
  }
  if (!cands.length) {
    return phState === "normal"
      ? recheck("A normal pH with these values does not fit a single disorder.")
      : recheck(`Neither PaCO₂ nor HCO₃⁻ is abnormal in the direction of this ${phState}.`);
  }
  const tested = cands.map((c) => ({ ...c, limit: compensationLimit(c.primary, c.kind, v) }));
  const fits = tested.filter((c) => !offRange(c.limit) && (phState !== "normal" || c.moved(v)));

  if (fits.length === 1) {
    const f = fits[0];
    const otherNormal = f.primary === "respiratory" ? hco3Normal : co2Normal;
    const compensation = phState === "normal" ? "full" : otherNormal ? "none" : "partial";
    const otherName = f.primary === "respiratory" ? "HCO₃⁻ (kidneys)" : "PaCO₂ (lungs)";
    const range = `expected about ${f.limit.expected[0]}–${f.limit.expected[1]}`;
    const reading = compensation === "none"
      ? `${cap(f.primary)} ${f.kind}, uncompensated: ${otherName} is still in its normal range (${range}).`
      : compensation === "partial"
        ? `${cap(f.primary)} ${f.kind}, partially compensated: ${otherName} has moved to offset it (${range}), but pH is still out of range.`
        : `${cap(f.primary)} ${f.kind}, fully compensated: pH is back in range and ${otherName} is where compensation would put it (${range}).${FULL_CAVEAT}`;
    return { disorder: `${f.primary} ${f.kind}`, primary: f.primary, compensation, mixedPossible: false, reading };
  }
  if (fits.length > 1) {
    const names = fits.map((f) => `${f.primary} ${f.kind}`);
    return { disorder: "indeterminate", primary: null, compensation: null, mixedPossible: true, alternatives: names,
      reading: `Two readings fit these values: ${names.join(" or ")}, each fully compensated. Only the history can tell them apart, and a mixed disorder is also possible.` };
  }
  /* Nothing fits as one disorder: a mixed disorder, reported from the first
     candidate (metabolic before respiratory). */
  const first = tested[0];
  if (phState === "normal" && !first.moved(v) && !offRange(first.limit)) {
    return recheck("A normal pH needs the other value to have compensated, and it has not.");
  }
  const rome = phState === "normal" ? "full" : (first.primary === "respiratory" ? hco3Normal : co2Normal) ? "none" : "partial";
  return mixedResult(first.primary, first.kind, rome, offRange(first.limit) ? first.limit : { ...first.limit, short: true, low: first.limit.value <= (first.limit.expected[0] + first.limit.expected[1]) / 2 });
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export const ABG_EXAMPLE = { ph: 7.3, paco2: 55, hco3: 24 };

/* Small symbols drawn around (0,0), placed with a translate so a step can
   animate them (the lungs breathe on the lungs step). */
const ICON = { fill: "none", stroke: C.teal, strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
const BloodIcon = () => (
  <g {...ICON}>
    <path d="M0,-7 C3,-3 5,0 5,2.5 A5,5 0 1 1 -5,2.5 C-5,0 -3,-3 0,-7 Z" fill={C.teal} fillOpacity={0.25} stroke={C.teal} />
  </g>
);
const LungsIcon = () => (
  <g {...ICON}>
    <path d="M0,-8 V-1 M0,-1 l-2.5,2.5 M0,-1 l2.5,2.5" />
    <path d="M-2.5,-3 C-6,-4 -8.5,0 -8,5 C-7.6,8 -4,8 -2.6,6 Z" fill={C.teal} fillOpacity={0.2} />
    <path d="M2.5,-3 C6,-4 8.5,0 8,5 C7.6,8 4,8 2.6,6 Z" fill={C.teal} fillOpacity={0.2} />
  </g>
);
const KidneyIcon = () => (
  <g {...ICON}>
    <path d="M1,-7 C-5,-8 -8,-3 -7,2 C-6,7 -1,8 1,5 C2.5,3 0.5,1.5 1,0 C1.5,-1.5 3.5,-2.5 2.5,-5 Z" fill={C.teal} fillOpacity={0.2} />
    <path d="M1.5,0 C4,0 5,2 5,7" strokeWidth={1.2} />
  </g>
);

/* Renders `moving` while step `on` plays with motion live, otherwise the
   still version — so static views never carry motion markup. */
function WhileStep({ on, moving, still }) {
  const { stepKey, live } = useMotion();
  const keys = Array.isArray(on) ? on : [on];
  return (
    <>
      <Loop on={on}>{moving}</Loop>
      {live && keys.includes(stepKey) ? null : still}
    </>
  );
}

const placed = (Icon, breathe = null) => (cx, cy) => (
  <g transform={`translate(${cx},${cy})`}>
    {breathe
      ? <WhileStep on={breathe}
          moving={<g><animateTransform attributeName="transform" type="scale" values="1;1.18;1" dur="2.4s" repeatCount="indefinite" /><Icon /></g>}
          still={<Icon />} />
      : <Icon />}
  </g>
);

/* A small labelled block that sits on the seesaw or the lift. */
const Tag = ({ x, y, text }) => {
  const w = text.length * 8.4 + 12;
  return (
    <g>
      <rect className="dg-solid" x={x - w / 2} y={y - 16} width={w} height={19} rx={5} fill={C.card} stroke={C.teal} strokeWidth={1.1} />
      <T x={x} y={y - 2} size={MIN_TEXT} anchor="middle" weight={700} mono color={C.accent}>{text}</T>
    </g>
  );
};

/* Respiratory Opposite: a seesaw — when pH goes down, PaCO₂ goes up.
   It rocks while the step plays, which shows the rule both ways round. */
function Seesaw({ cx, cy }) {
  const beam = (
    <g>
      <line x1={-54} x2={54} y1={0} y2={0} stroke={C.teal} strokeWidth={3} strokeLinecap="round" />
      <Tag x={-38} y={-2} text="pH" />
      <Tag x={30} y={-2} text="PaCO₂" />
    </g>
  );
  return (
    <g transform={`translate(${cx},${cy})`}>
      <WhileStep on="rome"
        moving={<g><animateTransform attributeName="transform" type="rotate" values="-11;11;-11" dur="3.2s" repeatCount="indefinite" />{beam}</g>}
        still={<g transform="rotate(-11)">{beam}</g>} />
      <path d="M0,1 L-8,13 H8 Z" fill={C.muted} fillOpacity={0.45} />
    </g>
  );
}

/* Metabolic Equal: a lift — pH and HCO₃⁻ ride the same platform. */
function Lift({ cx, cy }) {
  const car = (
    <g>
      <line x1={-52} x2={52} y1={0} y2={0} stroke={C.teal} strokeWidth={3} strokeLinecap="round" />
      <Tag x={-34} y={-2} text="pH" />
      <Tag x={20} y={-2} text="HCO₃⁻" />
      <path d="M-38,5 l4,4 l4,-4 M16,5 l4,4 l4,-4" fill="none" stroke={C.teal} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
  return (
    <g transform={`translate(${cx},${cy})`}>
      <line x1={-56} x2={-56} y1={-18} y2={12} stroke={C.line} strokeWidth={2} />
      <line x1={56} x2={56} y1={-18} y2={12} stroke={C.line} strokeWidth={2} />
      <WhileStep on="rome"
        moving={<g><animateTransform attributeName="transform" type="translate" values="0,-5;0,5;0,-5" dur="3.2s" repeatCount="indefinite" />{car}</g>}
        still={car} />
    </g>
  );
}

/* Compensation as three small pH lines: the marker is pulled back toward
   normal as the other system compensates. It slides on its step. */
function CompTile({ x, y, title, lines, at, i }) {
  const bx = x + 12, bw = 80, lo = bx + 30, hi = bx + 52;
  const start = bx + 6;
  const mx = bx + at;
  const inRange = mx >= lo && mx <= hi;
  return (
    <g>
      <Box x={x} y={y} w={104} h={84} r={9} fill={C.surface} lift />
      <T x={x + 52} y={y + 19} size={MIN_TEXT} weight={700} anchor="middle">{title}</T>
      <rect x={bx} y={y + 28} width={bw} height={7} rx={3.5} fill={C.surface} stroke={C.line} />
      <rect x={lo} y={y + 28} width={hi - lo} height={7} rx={3} fill={C.teal} fillOpacity={0.8} />
      <Anim on="compensation" kind="slide" from={`${start - mx}px`} dur={1400} delay={i * 250}>
        <circle className="dg-solid" cx={mx} cy={y + 31.5} r={4.6} fill={inRange ? C.teal : C.danger} stroke={C.card} strokeWidth={1.5} />
      </Anim>
      {lines.map((l, j) => <T key={j} x={x + 52} y={y + 56 + j * 16} size={MIN_TEXT} anchor="middle" color={C.muted}>{l}</T>)}
    </g>
  );
}

/* The verdict on the chip: one line of what interpretAbg() decided. */
export function verdictLabel(r) {
  if (r.disorder === "normal") return "Normal ABG";
  if (r.disorder === "inconsistent") return "Values don't fit: recheck";
  if (r.disorder === "indeterminate") return `Either: ${r.alternatives?.join(" or ") ?? "history decides"}`;
  if (r.mixed) return `Possible mixed: ${r.disorder} + ${r.mixed}`;
  return `${cap(r.disorder)}${r.compensation ? ` · ${romeLabel(r.compensation)}` : ""}`;
}

/* params === null draws the method alone — no patient markers and no
   verdict. Used when a question is about ABGs but its values could not be
   confirmed: showing the textbook example beside a question with different
   numbers would mislead. */
export function AbgDiagram({ params = ABG_EXAMPLE, focus = null }) {
  const concept = params === null;
  const r = concept ? null : interpretAbg(params);
  const bad = !concept && r.disorder !== "normal";
  const label = concept ? "Read pH → PaCO₂ → HCO₃⁻ → match" : verdictLabel(r);
  const chipLines = paraLines(label, 300, BODY_TEXT).length;
  const RY = 312, CY = 464 + (chipLines - 1) * 18, TY = CY + 30;
  return (
    <Frame h={TY + 90} focus={focus} title="Reading an arterial blood gas"
      desc={concept
        ? "Method: pH normal 7.35 to 7.45; PaCO2 normal 35 to 45 mmHg, and a high PaCO2 pushes toward acidosis; HCO3 normal 22 to 26 mEq/L, and a low HCO3 pushes toward acidosis, a high one toward alkalosis; the actual pH depends on both together. Match the value that moves with the pH: respiratory opposite, metabolic equal. Compensation: other value still normal means uncompensated; moved but pH still out of range means partially compensated; pH back in range means fully compensated. Compensation has expected limits; a value outside them suggests a mixed disorder."
        : `pH ${fmtNum(params.ph, 2)} (normal 7.35 to 7.45), PaCO2 ${fmtNum(params.paco2)} mmHg (35 to 45; high pushes toward acidosis), HCO3 ${fmtNum(params.hco3)} mEq/L (22 to 26; low pushes toward acidosis). ${r.reading}`}>
      <G id="ph">
        <Gauge x={20} y={66} w={320} min={7.1} max={7.7} lo={7.35} hi={7.45} value={concept ? null : params.ph} decimals={2}
          text={concept ? null : fmtNum(params.ph, 2)}
          label="1  pH: what is the problem?" leftLabel="ACIDOSIS" rightLabel="ALKALOSIS" leftColor="coral" rightColor="coral"
          icon={placed(BloodIcon)} anim={["ph", "worked"]} />
      </G>
      <G id="co2">
        <Gauge x={20} y={162} w={320} min={20} max={70} lo={35} hi={45} value={concept ? null : params.paco2} unit="mmHg"
          text={concept ? null : fmtNum(params.paco2)}
          label="2  PaCO₂: lungs, CO₂ is an acid" leftLabel="BASE" rightLabel="ACID ▸" rightColor="coral"
          icon={placed(LungsIcon, "lungs")} anim={["lungs", "worked"]} />
      </G>
      <G id="hco3">
        <Gauge x={20} y={258} w={320} min={12} max={36} lo={22} hi={26} value={concept ? null : params.hco3} unit="mEq/L"
          text={concept ? null : fmtNum(params.hco3)}
          label="3  HCO₃⁻: kidneys, a base" leftLabel="◂ ACID" rightLabel="BASE" leftColor="coral"
          icon={placed(KidneyIcon)} anim={["kidneys", "worked"]} />
      </G>
      <G id="rome">
        <Box x={20} y={RY} w={320} h={128} r={10} fill={C.surface} lift />
        <T x={32} y={RY + 22} size={BODY_TEXT} weight={700}>4  Match the pH: ROME</T>
        <T x={32} y={RY + 54} size={BODY_TEXT}><tspan fontWeight={700} fill={C.accent}>R</tspan>espiratory <tspan fontWeight={700} fill={C.accent}>O</tspan>pposite</T>
        <T x={32} y={RY + 71} size={MIN_TEXT} color={C.muted}>pH and PaCO₂ move apart</T>
        <Seesaw cx={282} cy={RY + 54} />
        <T x={32} y={RY + 94} size={BODY_TEXT}><tspan fontWeight={700} fill={C.accent}>M</tspan>etabolic <tspan fontWeight={700} fill={C.accent}>E</tspan>qual</T>
        <T x={32} y={RY + 111} size={MIN_TEXT} color={C.muted}>pH and HCO₃⁻ move together</T>
        <Lift cx={282} cy={RY + 104} />
      </G>
      <G id="result">
        <Anim on="worked" kind="pop" delay={1100}>
          <Chip x={180} y={RY + 154} text={label} color={bad ? "coral" : "teal"} maxW={330} />
        </Anim>
      </G>
      <G id="comp">
        <CompTile x={20} y={TY} i={0} title="Uncompensated" lines={["other value", "still normal"]} at={6} />
        <CompTile x={128} y={TY} i={1} title="Partial" lines={["other moved,", "pH still out"]} at={20} />
        <CompTile x={236} y={TY} i={2} title="Full" lines={["pH back", "in range"]} at={34} />
      </G>
    </Frame>
  );
}

export const abg = {
  id: "abg",
  title: "Reading an ABG",
  concepts: ["abg"],
  Diagram: AbgDiagram,
  example: ABG_EXAMPLE,
  textCases: [{ ph: 7.36, paco2: 36, hco3: 19.7 }, { ph: 7.38, paco2: 20, hco3: 11.4 }, { ph: 7.2, paco2: 60, hco3: 36 }, { ph: 7.34, paco2: 45.4, hco3: 23.7 }, { ph: 7.1, paco2: 60, hco3: 18 }],
  /* Every clinical claim this diagram makes, stated plainly so the
     adversarial reviewer can check each one. */
  facts: [
    "Normal arterial pH is 7.35–7.45; below 7.35 is acidosis, above 7.45 is alkalosis.",
    "Normal PaCO₂ is 35–45 mmHg; CO₂ acts as an acid, so a PaCO₂ above 45 pushes toward acidosis and below 35 toward alkalosis.",
    "Normal HCO₃⁻ is 22–26 mEq/L; bicarbonate is a base, so an HCO₃⁻ below 22 pushes toward acidosis and above 26 toward alkalosis. The actual pH depends on HCO₃⁻ and PaCO₂ together: a high HCO₃⁻ can accompany acidemic respiratory acidosis, and a low HCO₃⁻ alkalemic respiratory alkalosis.",
    "On an ABG, HCO₃⁻ is calculated from pH and PaCO₂ (Henderson–Hasselbalch), so the three values must agree; a pH far from the one PaCO₂ and HCO₃⁻ imply means the values should be rechecked before interpreting.",
    "ROME: in respiratory disorders pH and PaCO₂ move in opposite directions; in metabolic disorders pH and HCO₃⁻ move in the same direction.",
    "Uncompensated: the other system's value is still normal. Partially compensated: it has moved to offset, but pH is still abnormal. Fully compensated: pH has returned to the normal range.",
    "As a basic exam heuristic, a compensated pH below 7.40 is often read as an original acidosis and above 7.40 as an original alkalosis; it is not a diagnostic rule, and the expected compensation and the history decide.",
    "Compensation has limits. Expected respiratory compensation for metabolic acidosis is PaCO₂ ≈ 1.5 × HCO₃⁻ + 8 ± 2 (Winter's formula); for metabolic alkalosis PaCO₂ ≈ 0.7 × HCO₃⁻ + 21 ± 2. In respiratory acidosis HCO₃⁻ rises about 1 (acute) to 4 (chronic) mEq/L per 10 mmHg rise in PaCO₂ from about 24; in respiratory alkalosis it falls about 2 (acute) to 5 (chronic) per 10 mmHg fall. A compensating value outside the expected range, beyond it or short of it, suggests a mixed disorder. Full compensation to a normal pH is uncommon except in chronic respiratory alkalosis.",
  ],
  steps: [
    { key: "ph", focus: ["ph"], caption: "Start with pH. Below 7.35 is acidosis, above 7.45 is alkalosis. pH tells you what the problem is, not yet where it came from.",
      narration: "Start with the pH. Anything below seven point three five is acidosis. Anything above seven point four five is alkalosis. The pH tells you what the problem is, not yet where it came from." },
    { key: "lungs", focus: ["co2"], caption: "Now the lungs. CO₂ behaves like an acid, so a PaCO₂ above 45 pushes the blood toward acid. Notice its acid end is on the right, the opposite of the pH line.",
      narration: "Now look at the lungs. Carbon dioxide behaves like an acid, so a P-A-C-O-2 above forty-five pushes the blood toward acid. Notice that its acid end is on the right, the opposite way round from the pH line." },
    { key: "kidneys", focus: ["hco3"], caption: "Then the kidneys. Bicarbonate is a base: below 22 pushes toward acidosis, above 26 toward alkalosis. The actual pH depends on how it balances against PaCO₂.",
      narration: "Then the kidneys. Bicarbonate is a base. Below twenty-two pushes toward acidosis, and above twenty-six pushes toward alkalosis. The actual pH depends on how it balances against the P-A-C-O-2." },
    { key: "rome", focus: ["rome"], caption: "Find the value that matches the pH. ROME: Respiratory, pH and PaCO₂ move Opposite ways. Metabolic, pH and HCO₃⁻ move the Equal way.",
      narration: "Now find the value that matches the pH, using ROME. Respiratory: the pH and P-A-C-O-2 move in opposite directions. Metabolic: the pH and bicarbonate move in the same direction." },
    { key: "worked", focus: ["ph", "co2", "hco3", "result"], dynamic: true, caption: null,
      narration: null },
    { key: "compensation", focus: ["comp", "result"], caption: "Compensation is the other system pushing back. Still normal: uncompensated. Moved, but pH still out of range: partially compensated. pH back in range: fully compensated. It has expected limits: a value too far or not far enough suggests a mixed disorder.",
      narration: "Compensation is the other system pushing back. If it is still normal, the disorder is uncompensated. If it has moved but the pH is still out of range, it is partially compensated. And if the pH is back in range, it is fully compensated. Compensation has expected limits, so a value that has gone too far, or not far enough, suggests a second, mixed disorder." },
  ],
  /* The worked-example step reads the actual values, so it is written by
     the same function that interprets them. */
  dynamicCaption: (params = ABG_EXAMPLE) => {
    const r = interpretAbg(params);
    return `Here: pH ${fmtNum(params.ph, 2)}, PaCO₂ ${fmtNum(params.paco2)}, HCO₃⁻ ${fmtNum(params.hco3)}. ${r.reading}`;
  },
};
