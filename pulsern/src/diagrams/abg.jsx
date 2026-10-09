/* ABG interpretation — the ROME method, with compensation.
   ------------------------------------------------------------------
   The interpretation is COMPUTED, never drawn by hand: interpretAbg() is a
   pure function (CLAUDE.md rule 6) tested against textbook cases, and the
   diagram only renders what it returns. So the same drawing can show any
   question's values and can never label a blood gas wrongly by accident.

   Reference ranges used (standard adult arterial values taught for NCLEX):
     pH 7.35–7.45 · PaCO₂ 35–45 mmHg · HCO₃⁻ 22–26 mEq/L

   Labels follow ROME, as NCLEX answer keys do. But the size of the
   compensation is also checked, on BOTH sides (Astra, PR #133 review,
   finding 7; PR #134 review, finding 5): compensation never overshoots,
   and the diagram has no timeline from which to assume too little simply
   means "early". Outside the expected range either way, no single
   compensated disorder is asserted (Astra, PR #134 review, round 10): the
   ROME result is given only as a preliminary pattern, compensation is null,
   and the reading names the second disorder the out-of-range value points
   to.

   Expected-compensation ranges (standard bedside rules):
     metabolic acidosis    PaCO₂ = 1.5 × HCO₃⁻ + 8 ± 2 (Winter's formula)
     metabolic alkalosis   PaCO₂ = 0.7 × HCO₃⁻ + 21 ± 2
     respiratory acidosis  HCO₃⁻ rises 1 (acute) to 4 (chronic) per 10 mmHg PaCO₂ above 40
     respiratory alkalosis HCO₃⁻ falls 2 (acute) to 5 (chronic) per 10 mmHg PaCO₂ below 40
   The respiratory ranges start from the whole normal HCO₃⁻ range (22–26),
   ± 2, because the client's own baseline is unknown. */
import React from "react";
import { Frame, G, T, Gauge, Chip, Box, C, Anim, Loop, useMotion } from "./kit.jsx";

export const ABG_RANGES = {
  ph: { lo: 7.35, hi: 7.45 },
  paco2: { lo: 35, hi: 45 },
  hco3: { lo: 22, hi: 26 },
};

const side = (v, { lo, hi }, belowMeans, aboveMeans) => (v < lo ? belowMeans : v > hi ? aboveMeans : "normal");
const r1 = (n) => Math.round(n * 10) / 10;

/* The expected range of the compensating value for a primary disorder, and
   whether the actual value is beyond it (overshoot) or short of it. */
export function compensationLimit(primary, kind, { paco2, hco3 }) {
  /* One rounding, to the 0.1 the values are reported in, used both to
     decide and to display — so a value shown as on the boundary is inside
     it, and the side it misses on is the side the decision used (Astra,
     PR #134 review, round 11: unrounded bounds flagged PaCO2 43 as low
     against 43.01, then the rounded 43 named the opposite disorder). */
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
    return range("HCO₃⁻", hco3, 22 + 1 * d - 2, 26 + 4 * d + 2, false);
  }
  if (primary === "respiratory" && kind === "alkalosis") {
    const d = (40 - paco2) / 10;
    return range("HCO₃⁻", hco3, 22 - 5 * d - 2, 26 - 2 * d + 2, true);
  }
  return null;
}
const offRange = (c) => !!(c && (c.beyond || c.short));
/* The second disorder an out-of-range compensating value points to: a
   PaCO₂ lower than expected is an added respiratory alkalosis, higher an
   added respiratory acidosis; an HCO₃⁻ lower than expected an added
   metabolic acidosis, higher an added metabolic alkalosis. */
const secondDisorder = (c) => (c.name === "PaCO₂"
  ? (c.low ? "respiratory alkalosis" : "respiratory acidosis")
  : (c.low ? "metabolic acidosis" : "metabolic alkalosis"));
/* Off the expected range: the ROME result is only a preliminary pattern. */
const mixedResult = (primary, kind, rome, c) => ({
  disorder: `${primary} ${kind}`, primary, compensation: null, romePattern: rome, mixedPossible: true, mixed: secondDisorder(c),
  reading: `ROME pattern only: ${primary} ${kind}${rome === "none" ? ", uncompensated" : rome === "partial" ? ", partially compensated" : ", fully compensated"}. `
    + `But ${c.name} ${c.value} is ${c.beyond ? "beyond what compensation alone usually reaches" : "short of the compensation expected"} (about ${c.expected[0]}–${c.expected[1]}), `
    + `which suggests a mixed disorder — ${primary} ${kind} with ${secondDisorder(c)} — rather than a single compensated one.`,
});

/* Returns the disorder, the compensation state, and a one-line reading.
   "acid"/"base" describe each value's chemical push; CO₂ is an acid, so a
   HIGH PaCO₂ pushes acid — the inversion students most often miss. */
export function interpretAbg({ ph, paco2, hco3 }) {
  for (const [k, v] of Object.entries({ ph, paco2, hco3 })) {
    if (!Number.isFinite(v)) throw new Error(`interpretAbg: ${k} must be a number`);
  }
  const phState = side(ph, ABG_RANGES.ph, "acidosis", "alkalosis");
  const co2 = side(paco2, ABG_RANGES.paco2, "base", "acid");
  const bicarb = side(hco3, ABG_RANGES.hco3, "acid", "base");

  if (phState === "normal") {
    if (co2 === "normal" && bicarb === "normal") {
      return { disorder: "normal", primary: null, compensation: null, reading: "Normal ABG — all three values in range." };
    }
    if (co2 !== "normal" && bicarb !== "normal" && co2 !== bicarb) {
      /* Fully compensated: pH is back in range, so which side of 7.40 it sits
         on shows the original problem. Exactly 7.40 cannot say. */
      if (ph === 7.4) {
        return { disorder: "indeterminate", primary: null, compensation: null, mixedPossible: true,
          reading: "Both values are abnormal in opposite directions with a pH of exactly 7.40: this cannot show which disorder came first, and a mixed disorder is possible." };
      }
      const want = ph < 7.4 ? "acid" : "base";
      const primary = co2 === want ? "respiratory" : "metabolic";
      const kind = want === "acid" ? "acidosis" : "alkalosis";
      const c = compensationLimit(primary, kind, { paco2, hco3 });
      if (offRange(c)) return mixedResult(primary, kind, "full", c);
      return { disorder: `${primary} ${kind}`, primary, compensation: "full", mixedPossible: false,
        reading: `${cap(primary)} ${kind}, fully compensated — pH is back in range, leaning ${want === "acid" ? "acidic (below 7.40)" : "alkaline (above 7.40)"}.` };
    }
    return { disorder: "inconsistent", primary: null, compensation: null,
      reading: "This pattern does not fit a single disorder — recheck the values or consider a mixed disorder." };
  }

  const want = phState === "acidosis" ? "acid" : "base";
  const respMatches = co2 === want;
  const metMatches = bicarb === want;

  if (respMatches && metMatches) {
    /* Nothing is compensating, but nothing could: both systems are the
       problem. "Uncompensated" would describe a single disorder. */
    return { disorder: `combined respiratory and metabolic ${phState}`, primary: "both", compensation: null,
      reading: `Combined respiratory and metabolic ${phState} — both systems are pushing the same way, so neither is compensating.` };
  }
  if (!respMatches && !metMatches) {
    return { disorder: "inconsistent", primary: null, compensation: null,
      reading: "Neither PaCO₂ nor HCO₃⁻ explains this pH — recheck the values." };
  }
  const primary = respMatches ? "respiratory" : "metabolic";
  const other = respMatches ? bicarb : co2;
  const compensation = other === "normal" ? "none" : "partial";
  const otherName = respMatches ? "HCO₃⁻ (kidneys)" : "PaCO₂ (lungs)";
  const c = compensationLimit(primary, phState, { paco2, hco3 });
  if (offRange(c)) return mixedResult(primary, phState, compensation, c);
  return {
    disorder: `${primary} ${phState}`, primary, compensation, mixedPossible: false,
    reading: compensation === "none"
      ? `${cap(primary)} ${phState}, uncompensated — ${otherName} is still normal.`
      : `${cap(primary)} ${phState}, partially compensated — ${otherName} has moved to offset it, but pH is still out of range.`,
  };
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export const ABG_EXAMPLE = { ph: 7.3, paco2: 55, hco3: 24 };

/* Small symbols drawn around (0,0), placed with a translate so a step can
   animate them (the lungs breathe on the lungs step). */
const ICON = { fill: "none", stroke: C.teal, strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
const BloodIcon = () => (
  <g {...ICON}>
    <path d="M0,-7 C3,-3 5,0 5,2.5 A5,5 0 1 1 -5,2.5 C-5,0 -3,-3 0,-7 Z" fill={C.coral} fillOpacity={0.25} stroke={C.coral} />
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
  const w = text.length * 6.6 + 10;
  return (
    <g>
      <rect x={x - w / 2} y={y - 12} width={w} height={14} rx={4} fill={C.card} stroke={C.teal} strokeWidth={1.1} />
      <T x={x} y={y - 1.5} size={10} anchor="middle" weight={700} mono color={C.accent}>{text}</T>
    </g>
  );
};

/* Respiratory Opposite: a seesaw — when pH goes down, PaCO₂ goes up.
   It rocks while the step plays, which shows the rule both ways round. */
function Seesaw({ cx, cy }) {
  const beam = (
    <g>
      <line x1={-50} x2={50} y1={0} y2={0} stroke={C.teal} strokeWidth={3} strokeLinecap="round" />
      <Tag x={-34} y={-2} text="pH" />
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
      <line x1={-46} x2={46} y1={0} y2={0} stroke={C.teal} strokeWidth={3} strokeLinecap="round" />
      <Tag x={-26} y={-2} text="pH" />
      <Tag x={22} y={-2} text="HCO₃⁻" />
      <path d="M-30,5 l4,4 l4,-4 M18,5 l4,4 l4,-4" fill="none" stroke={C.coral} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
  return (
    <g transform={`translate(${cx},${cy})`}>
      <line x1={-52} x2={-52} y1={-16} y2={12} stroke={C.line} strokeWidth={2} />
      <line x1={52} x2={52} y1={-16} y2={12} stroke={C.line} strokeWidth={2} />
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
      <Box x={x} y={y} w={104} h={72} r={9} fill={C.surface} lift />
      <T x={x + 52} y={y + 16} size={10.5} weight={700} anchor="middle">{title}</T>
      <rect x={bx} y={y + 25} width={bw} height={7} rx={3.5} fill={C.surface} stroke={C.line} />
      <rect x={lo} y={y + 25} width={hi - lo} height={7} rx={3} fill={C.teal} fillOpacity={0.8} />
      <Anim on="compensation" kind="slide" from={`${start - mx}px`} dur={1400} delay={i * 250}>
        <circle cx={mx} cy={y + 28.5} r={4.6} fill={inRange ? C.teal : C.danger} stroke={C.card} strokeWidth={1.5} />
      </Anim>
      {lines.map((l, j) => <T key={j} x={x + 52} y={y + 50 + j * 12} size={9.5} anchor="middle" color={C.muted}>{l}</T>)}
    </g>
  );
}

/* params === null draws the method alone — no patient markers and no
   verdict. Used when a question is about ABGs but its values could not be
   confirmed: showing the textbook example beside a question with different
   numbers would mislead. */
export function AbgDiagram({ params = ABG_EXAMPLE, focus = null }) {
  const concept = params === null;
  const r = concept ? null : interpretAbg(params);
  const bad = !concept && r.disorder !== "normal";
  const label = concept ? "Read pH → PaCO₂ → HCO₃⁻ → match" : r.disorder === "normal" ? "Normal ABG"
    : r.disorder === "inconsistent" || r.disorder === "indeterminate" ? "Recheck"
    : r.mixed ? `Possible mixed: ${r.disorder} + ${r.mixed}`
    : `${cap(r.disorder)}${r.compensation === "none" ? " · uncompensated" : r.compensation === "partial" ? " · partly compensated" : r.compensation === "full" ? " · fully compensated" : ""}`;
  return (
    <Frame h={482} focus={focus} title="Reading an arterial blood gas"
      desc={concept
        ? "Method: pH normal 7.35 to 7.45; PaCO2 normal 35 to 45 mmHg, high means acid; HCO3 normal 22 to 26 mEq/L, low means acid. Match the value that moves with the pH: respiratory opposite, metabolic equal. Compensation: other value still normal means uncompensated; moved but pH still out of range means partially compensated; pH back in range means fully compensated."
        : `pH ${params.ph} (normal 7.35 to 7.45), PaCO2 ${params.paco2} mmHg (35 to 45, high means acid), HCO3 ${params.hco3} mEq/L (22 to 26, low means acid). ${r.reading}`}>
      <G id="ph">
        <Gauge x={20} y={56} w={320} min={7.1} max={7.7} lo={7.35} hi={7.45} value={concept ? null : params.ph} decimals={2}
          label="1  pH — what is the problem?" leftLabel="ACIDOSIS" rightLabel="ALKALOSIS" leftColor="coral" rightColor="coral"
          icon={placed(BloodIcon)} anim={["ph", "worked"]} />
      </G>
      <G id="co2">
        <Gauge x={20} y={138} w={320} min={20} max={70} lo={35} hi={45} value={concept ? null : params.paco2} unit="mmHg"
          label="2  PaCO₂ — lungs · CO₂ is an acid" leftLabel="BASE" rightLabel="ACID ▸" rightColor="coral"
          icon={placed(LungsIcon, "lungs")} anim={["lungs", "worked"]} />
      </G>
      <G id="hco3">
        <Gauge x={20} y={220} w={320} min={12} max={36} lo={22} hi={26} value={concept ? null : params.hco3} unit="mEq/L"
          label="3  HCO₃⁻ — kidneys · a base" leftLabel="◂ ACID" rightLabel="BASE" leftColor="coral"
          icon={placed(KidneyIcon)} anim={["kidneys", "worked"]} />
      </G>
      <G id="rome">
        <Box x={20} y={258} w={320} h={106} r={10} fill={C.surface} lift />
        <T x={32} y={279} size={12} weight={700}>4  Match the pH — ROME</T>
        <T x={32} y={310} size={12}><tspan fontWeight={700} fill={C.accent}>R</tspan>espiratory <tspan fontWeight={700} fill={C.accent}>O</tspan>pposite</T>
        <T x={32} y={324} size={10} color={C.muted}>pH and PaCO₂ move apart</T>
        <Seesaw cx={268} cy={304} />
        <T x={32} y={346} size={12}><tspan fontWeight={700} fill={C.accent}>M</tspan>etabolic <tspan fontWeight={700} fill={C.accent}>E</tspan>qual</T>
        <T x={32} y={359} size={10} color={C.muted}>pH and HCO₃⁻ move together</T>
        <Lift cx={268} cy={346} />
      </G>
      <G id="result">
        <Anim on="worked" kind="pop" delay={1100}>
          <Chip x={180} y={390} text={label} color={bad ? "coral" : "teal"} size={12} />
        </Anim>
      </G>
      <G id="comp">
        <CompTile x={20} y={404} i={0} title="Uncompensated" lines={["other value", "still normal"]} at={6} />
        <CompTile x={128} y={404} i={1} title="Partial" lines={["other moved,", "pH still out"]} at={20} />
        <CompTile x={236} y={404} i={2} title="Full" lines={["pH back", "in range"]} at={34} />
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
  /* Every clinical claim this diagram makes, stated plainly so the
     adversarial reviewer can check each one. */
  facts: [
    "Normal arterial pH is 7.35–7.45; below 7.35 is acidosis, above 7.45 is alkalosis.",
    "Normal PaCO₂ is 35–45 mmHg; CO₂ acts as an acid, so PaCO₂ above 45 pushes toward acidosis and below 35 toward alkalosis.",
    "Normal HCO₃⁻ is 22–26 mEq/L; bicarbonate is a base, so HCO₃⁻ below 22 pushes toward acidosis and above 26 toward alkalosis.",
    "ROME: in respiratory disorders pH and PaCO₂ move in opposite directions; in metabolic disorders pH and HCO₃⁻ move in the same direction.",
    "Uncompensated: the other system's value is still normal. Partially compensated: it has moved to offset, but pH is still abnormal. Fully compensated: pH has returned to the normal range.",
    "In full compensation, a pH below 7.40 points to an original acidosis and above 7.40 to an original alkalosis.",
    "Compensation has limits and does not overshoot. Expected respiratory compensation for metabolic acidosis is PaCO₂ ≈ 1.5 × HCO₃⁻ + 8 ± 2 (Winter's formula); for metabolic alkalosis PaCO₂ ≈ 0.7 × HCO₃⁻ + 21 ± 2. In respiratory acidosis HCO₃⁻ rises about 1 (acute) to 4 (chronic) mEq/L per 10 mmHg rise in PaCO₂; in respiratory alkalosis it falls about 2 (acute) to 5 (chronic) per 10 mmHg fall. A compensating value outside the expected range — beyond it, or short of it — suggests a mixed disorder. Respiratory compensation for a metabolic disorder begins within minutes to hours; renal compensation for a respiratory disorder takes days.",
  ],
  steps: [
    { key: "ph", focus: ["ph"], caption: "Start with pH. Below 7.35 is acidosis, above 7.45 is alkalosis. pH tells you what the problem is — not yet where it came from.",
      narration: "Start with the pH. Anything below seven point three five is acidosis. Anything above seven point four five is alkalosis. The pH tells you what the problem is — not yet where it came from." },
    { key: "lungs", focus: ["co2"], caption: "Now the lungs. CO₂ behaves like an acid, so a PaCO₂ above 45 pushes the blood acidic. Notice its acid end is on the right — the opposite of the pH line.",
      narration: "Now look at the lungs. Carbon dioxide behaves like an acid, so a P-A-C-O-2 above forty-five pushes the blood toward acid. Notice that its acid end is on the right — the opposite way round from the pH line." },
    { key: "kidneys", focus: ["hco3"], caption: "Then the kidneys. Bicarbonate is a base: below 22 leaves the blood acidic, above 26 makes it alkaline.",
      narration: "Then the kidneys. Bicarbonate is a base. Below twenty-two leaves the blood acidic, and above twenty-six makes it alkaline." },
    { key: "rome", focus: ["rome"], caption: "Find the value that matches the pH. ROME: Respiratory — pH and PaCO₂ move Opposite ways. Metabolic — pH and HCO₃⁻ move the Equal way.",
      narration: "Now find the value that matches the pH, using ROME. Respiratory: the pH and P-A-C-O-2 move in opposite directions. Metabolic: the pH and bicarbonate move in the same direction." },
    { key: "worked", focus: ["ph", "co2", "hco3", "result"], dynamic: true, caption: null,
      narration: null },
    { key: "compensation", focus: ["comp", "result"], caption: "Compensation is the other system pushing back. Still normal: uncompensated. Moved, but pH still out of range: partially compensated. pH back in range: fully compensated. It never overshoots, and the lungs respond fast — a value outside the expected range suggests a mixed disorder.",
      narration: "Compensation is the other system pushing back. If it is still normal, the disorder is uncompensated. If it has moved but the pH is still out of range, it is partially compensated. And if the pH is back in range, it is fully compensated. Compensation never overshoots, and the lungs respond within minutes to hours, so a value outside the expected range, too far or not far enough, suggests a second, mixed disorder." },
  ],
  /* The worked-example step reads the actual values, so it is written by
     the same function that interprets them. */
  dynamicCaption: (params = ABG_EXAMPLE) => {
    const r = interpretAbg(params);
    return `Here: pH ${params.ph.toFixed(2)}, PaCO₂ ${params.paco2}, HCO₃⁻ ${params.hco3}. ${r.reading}`;
  },
};
