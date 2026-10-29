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
      pH = 6.1 + log10(HCO₃⁻ / (0.03 × PaCO₂))). The allowed disagreement
      comes from how precisely each value is REPORTED (Sol, round 2: a fixed
      0.08 let contradictory gases through): a value given to n decimals
      can be off by half a unit in its last place, so the pH must lie within
      the range those rounding bounds imply. A gas outside it is not
      interpreted: an extraction or authoring error must not become
      authoritative teaching.
      Precision policy (Sol, round 3: a JavaScript number drops trailing
      zeros, so 7.30 looked like 7.3 and earned a ±0.05 allowance): the
      decimals come from params.precision when the caller knows them (the
      question text, read as written), otherwise pH is taken as reported to
      2 decimals and PaCO₂ / HCO₃⁻ to whole numbers — more if the value
      itself carries more.
   2. Every primary disorder the values could fit is tested against its
      expected compensation — no "which side of 7.40" shortcut picks one
      first. A primary needs its own value abnormal in the direction of the
      problem. A pH in range is NOT taken to prove compensation (Sol, round
      3): a mild disorder can keep the pH in range all along, so when the
      other value is also in range the reading says the compensation can't
      be told.
   3. One fit: that disorder, with the ROME compensation label. More than
      one fit: both are named, and the history decides. No fit: a mixed
      disorder, naming the second disorder the out-of-range value points to.

   Expected compensation (standard bedside rules, baseline HCO₃⁻ 24 and
   PaCO₂ 40, one ±2 tolerance — not stacked on the whole normal range):
     metabolic acidosis    PaCO₂ = 1.5 × HCO₃⁻ + 8 ± 2 (Winter's formula)
     metabolic alkalosis   PaCO₂ = 0.7 × HCO₃⁻ + 21 or 40 + 0.7 × (HCO₃⁻ − 24), ± 2,
                           either rule accepted, never past about 55 mmHg
     respiratory acidosis  HCO₃⁻ = 24 + 1 (acute) or 4 (chronic) per 10 mmHg PaCO₂ above 40, ± 2
     respiratory alkalosis HCO₃⁻ = 24 − 2 (acute) or 5 (chronic) per 10 mmHg PaCO₂ below 40, ± 2
   The diagram has no history, so a respiratory value fitting only the
   acute or only the chronic estimate is reported as such, with the mixed
   disorder the other time course would imply (Sol, round 4). */
import React from "react";
import { Frame, G, T, Gauge, Chip, Box, C, Anim, Loop, Para, paraLines, useMotion, exact, BODY_TEXT, MIN_TEXT } from "./kit.jsx";

export const ABG_RANGES = {
  ph: { lo: 7.35, hi: 7.45 },
  paco2: { lo: 35, hi: 45 },
  hco3: { lo: 22, hi: 26 },
};
/* The range this teaching tool interprets automatically — not the limits
   of what a living client can show (Sol, round 2). */
export const INTERPRETED = { ph: [6.8, 7.8], paco2: [10, 150], hco3: [3, 45] };
/* Respiratory compensation for metabolic alkalosis rarely takes PaCO₂ past
   about 55 mmHg (an approximate ceiling, Sol round 4), and the linear rules
   are not extended beyond it. HCO₃⁻ is read up to 45 so that the expected
   range never starts above the ceiling. */
export const ALKALOSIS_PACO2_CEILING = 55;

const r1 = (n) => Math.round(n * 10) / 10;
export const impliedPh = ({ paco2, hco3 }) => 6.1 + Math.log10(hco3 / (0.03 * paco2));
const decimals = (v) => { for (let d = 0; d <= 17; d++) if (Number(v.toFixed(d)) === v) return d; return 17; };
export const DEFAULT_PRECISION = { ph: 2, paco2: 0, hco3: 0 };
/* Decimals each value is taken as reported to (see the precision policy). */
export function precisionOf(v, precision = null) {
  return Object.fromEntries(Object.keys(DEFAULT_PRECISION).map((k) =>
    [k, Math.max(precision?.[k] ?? DEFAULT_PRECISION[k], decimals(v[k]))]));
}
/* Do these three values belong together, given how precisely each is
   reported? Returns the implied pH range as well. */
export function abgConsistency({ ph, paco2, hco3, precision = null }) {
  const pr = precisionOf({ ph, paco2, hco3 }, precision);
  const half = (k) => 0.5 * 10 ** -pr[k];
  const dc = half("paco2"), dh = half("hco3"), dp = half("ph");
  const lo = impliedPh({ paco2: paco2 + dc, hco3: Math.max(1e-6, hco3 - dh) }) - dp;
  const hi = impliedPh({ paco2: Math.max(1e-6, paco2 - dc), hco3: hco3 + dh }) + dp;
  return { ok: ph >= lo - 1e-9 && ph <= hi + 1e-9, implied: impliedPh({ paco2, hco3 }), lo, hi };
}

/* The expected range of the compensating value for a primary disorder, and
   whether the actual value is beyond it (overshoot) or short of it. One
   rounding, to the 0.1 the values are reported in, used both to decide and
   to display (Astra, PR #134 review, round 11). */
export function compensationLimit(primary, kind, { paco2, hco3 }) {
  const range = (name, value, rawLo, rawHi, towardLow, centers, extra = {}) => {
    const lo = r1(rawLo), hi = r1(rawHi);
    const low = value < lo, high = value > hi;
    const out = low ? (towardLow ? "beyond" : "short") : high ? (towardLow ? "short" : "beyond") : null;
    return { name, value, expected: [lo, hi], centers: centers.map(r1), beyond: out === "beyond", short: out === "short", low, high, ...extra };
  };
  const within = (v, c) => v >= r1(c - 2) && v <= r1(c + 2);
  // towardLow: compensation pushes this value DOWN (so below the range is overshoot)
  if (primary === "metabolic" && kind === "acidosis") return range("PaCO₂", paco2, 1.5 * hco3 + 6, 1.5 * hco3 + 10, true, [1.5 * hco3 + 8]);
  if (primary === "metabolic" && kind === "alkalosis") {
    /* Two bedside rules are in common use and disagree by about 2 mmHg:
       PaCO₂ ≈ 0.7 × HCO₃⁻ + 21 and PaCO₂ ≈ 40 + 0.7 × (HCO₃⁻ − 24). A value
       fitting either is taken as compatible (Sol, round 4), up to the
       ceiling. */
    const a = 0.7 * hco3 + 21, b = 40 + 0.7 * (hco3 - 24);
    const rawHi = Math.min(Math.max(a, b) + 2, ALKALOSIS_PACO2_CEILING);
    return range("PaCO₂", paco2, Math.min(a, b) - 2, rawHi, false, [a, b], { capped: Math.max(a, b) + 2 > ALKALOSIS_PACO2_CEILING });
  }
  if (primary === "respiratory") {
    /* Acute and chronic estimates are reported separately (Sol, round 4): a
       value that fits only one of them is a single disorder only for that
       time course. */
    const d = kind === "acidosis" ? (paco2 - 40) / 10 : (40 - paco2) / 10;
    const [acute, chronic] = kind === "acidosis" ? [24 + d, 24 + 4 * d] : [24 - 2 * d, 24 - 5 * d];
    const lo = Math.min(acute, chronic) - 2, hi = Math.max(acute, chronic) + 2;
    return range("HCO₃⁻", hco3, lo, hi, kind === "alkalosis", [acute, chronic],
      { acuteFit: within(hco3, acute), chronicFit: within(hco3, chronic) });
  }
  return null;
}
const offRange = (c) => !!(c && (c.beyond || c.short));
/* The second disorder an out-of-range compensating value points to. */
const secondDisorder = (c) => (c.name === "PaCO₂"
  ? (c.low ? "respiratory alkalosis" : "respiratory acidosis")
  : (c.low ? "metabolic acidosis" : "metabolic alkalosis"));
const romeLabel = (rome) => (rome === "none" ? "uncompensated" : rome === "partial" ? "partially compensated" : rome === "unclear" ? "pH in range" : "fully compensated");
const mixedResult = (primary, kind, rome, c) => {
  /* Within 1 unit of the expected range is borderline: the bedside rules
     are approximations, so a mixed disorder is raised, not concluded. */
  const miss = c.low ? c.expected[0] - c.value : c.value - c.expected[1];
  const where = `${c.name} ${fmtNum(c.value)} is ${c.beyond ? "beyond what compensation alone usually reaches" : "short of the compensation expected"} (about ${c.expected[0]}–${c.expected[1]} ${unitOf(c.name)})`;
  return {
    disorder: `${primary} ${kind}`, primary, compensation: null, romePattern: rome, mixedPossible: true, mixed: secondDisorder(c),
    reading: `ROME pattern only: ${primary} ${kind}, ${romeLabel(rome)}. But ${where}, `
      + (miss <= 1
        ? `only just outside it. That is borderline, because the bedside rules are approximations: a mixed disorder (${primary} ${kind} with ${secondDisorder(c)}) is possible, and the history decides.`
        : `which suggests a mixed disorder (${primary} ${kind} with ${secondDisorder(c)}) rather than a single compensated one.`),
  };
};
const unitOf = (name) => (name === "PaCO₂" ? "mmHg" : "mEq/L");
const REF = { "PaCO₂": ABG_RANGES.paco2, "HCO₃⁻": ABG_RANGES.hco3 };
/* The reference range and the expected compensation, stated separately
   (Sol, round 2: one sentence made the expected range read like a new
   normal range). */
function compensationText(c, primary) {
  const ref = REF[c.name], u = unitOf(c.name);
  const inside = c.value >= ref.lo && c.value <= ref.hi;
  const refPart = `${c.name} ${fmtNum(c.value)} ${u} is ${inside ? "inside" : "outside"} its reference range (${ref.lo}–${ref.hi})`;
  if (primary === "metabolic" && c.centers.length === 2) {
    const [a, b] = [...c.centers].sort((p, q) => p - q);
    return `${refPart}; expected compensation is about ${a}–${b} by the two common bedside rules, ± 2 (${c.expected[0]}–${c.expected[1]} ${u}${c.capped ? `; compensation rarely takes PaCO₂ past about ${ALKALOSIS_PACO2_CEILING}` : ""})`;
  }
  if (primary === "metabolic") return `${refPart}; expected compensation is about ${c.centers[0]} ± 2 (${c.expected[0]}–${c.expected[1]} ${u})`;
  return `${refPart}; ${courseText(c)}`;
}
/* Which time course a respiratory disorder's HCO₃⁻ fits, and what the
   other course would imply. */
function courseText(c) {
  const [acute, chronic] = c.centers, u = unitOf(c.name);
  const est = `the acute estimate is about ${acute} ± 2 and the chronic about ${chronic} ± 2 ${u}`;
  const acidosisRise = chronic > acute;   // HCO₃⁻ rises in respiratory acidosis, falls in alkalosis
  if (c.acuteFit && c.chronicFit) return `${est}, and it fits both`;
  if (c.acuteFit) return `${est}: it fits an acute picture; if the problem is chronic, this HCO₃⁻ would suggest an added metabolic ${acidosisRise ? "acidosis" : "alkalosis"}, so the history decides`;
  if (c.chronicFit) return `${est}: it fits a chronic picture; if the problem is acute, this HCO₃⁻ would suggest an added metabolic ${acidosisRise ? "alkalosis" : "acidosis"}, so the history decides`;
  return `${est}: it lies between them, which fits a subacute course or a mixed disorder; the history decides`;
}
const recheck = (why) => ({ disorder: "inconsistent", primary: null, compensation: null, reading: `${why} Recheck the values before interpreting.` });
/* Values that agree but lie outside what this tool reads automatically:
   not an error, so never labelled as one (Sol, round 3). */
const unsupported = (why) => ({ disorder: "unsupported", primary: null, compensation: null,
  reading: `${why} These values are outside the range this tool interprets automatically, so no reading is given here; interpret them with your course materials.` });

/* A value exactly as given: at least `min` decimals, never rounded (so never
   rounded onto a reference limit — Sol, round 3: 7.3499 showed as 7.350). */
export const fmtNum = (v, min = 0) => exact(v, min);
/* One of a gas's values as reported, trailing zeros included (7.30). */
export const showAbg = (p, k) => fmtNum(p[k], precisionOf(p, p.precision)[k]);

/* Each possible primary disorder: which value drives it, which compensates. */
const CANDIDATES = [
  { primary: "metabolic", kind: "acidosis", own: ({ hco3 }) => hco3 < ABG_RANGES.hco3.lo },
  { primary: "metabolic", kind: "alkalosis", own: ({ hco3 }) => hco3 > ABG_RANGES.hco3.hi },
  { primary: "respiratory", kind: "acidosis", own: ({ paco2 }) => paco2 > ABG_RANGES.paco2.hi },
  { primary: "respiratory", kind: "alkalosis", own: ({ paco2 }) => paco2 < ABG_RANGES.paco2.lo },
];
const FULL_CAVEAT = " Compensation usually leaves the pH a little on the side of the original problem. It can bring the pH into 7.35–7.45, especially in milder or chronic disorders, but a normal pH alone does not prove compensation: a mixed disorder can look the same, so the history decides.";

export function interpretAbg({ ph, paco2, hco3, precision = null }) {
  for (const [k, v] of Object.entries({ ph, paco2, hco3 })) {
    if (!Number.isFinite(v)) throw new Error(`interpretAbg: ${k} must be a number`);
  }
  const v = { ph, paco2, hco3 };
  const pr = precisionOf(v, precision);
  const show = (k) => fmtNum(v[k], pr[k]);
  if (paco2 <= 0 || hco3 <= 0) return recheck("PaCO₂ and HCO₃⁻ must both be above zero.");
  const fit = abgConsistency({ ...v, precision });
  if (!fit.ok) {
    return recheck(`These values do not agree: a PaCO₂ of ${show("paco2")} with an HCO₃⁻ of ${show("hco3")} goes with a pH near ${fit.implied.toFixed(2)}, not ${show("ph")}.`);
  }
  for (const [k, [lo, hi]] of Object.entries(INTERPRETED)) {
    if (v[k] < lo || v[k] > hi) return unsupported(`${k === "ph" ? "pH" : k === "paco2" ? "PaCO₂" : "HCO₃⁻"} ${show(k)} is outside ${lo}–${hi}.`);
  }
  const phState = ph < ABG_RANGES.ph.lo ? "acidosis" : ph > ABG_RANGES.ph.hi ? "alkalosis" : "normal";
  const co2Normal = paco2 >= ABG_RANGES.paco2.lo && paco2 <= ABG_RANGES.paco2.hi;
  const hco3Normal = hco3 >= ABG_RANGES.hco3.lo && hco3 <= ABG_RANGES.hco3.hi;

  if (phState === "normal" && co2Normal && hco3Normal) {
    return { disorder: "normal", primary: null, compensation: null,
      reading: "Acid–base values are within their reference ranges. This does not assess oxygenation (PaO₂, SaO₂), which is checked separately." };
  }
  const cands = CANDIDATES.filter((c) => c.own(v) && (phState === "normal" || c.kind === phState));
  if (phState !== "normal" && cands.length === 2) {
    return { disorder: `combined respiratory and metabolic ${phState}`, primary: "both", compensation: null,
      reading: `Combined respiratory and metabolic ${phState}: both systems are pushing the same way, so neither is compensating.` };
  }
  if (!cands.length) {
    if (phState === "normal") return recheck("A normal pH with these values does not fit a single disorder.");
    /* Consistent, but neither value is past its reference limit: the
       primary process cannot be named from cutoffs (Sol, round 2). */
    const emia = phState === "acidosis" ? "acidemia" : "alkalemia";
    return { disorder: `${emia}, primary process unresolved`, primary: null, compensation: null, mixedPossible: true,
      reading: `${cap(emia)} (pH ${show("ph")}), with PaCO₂ and HCO₃⁻ both inside their reference ranges. The values agree with each other, but the primary process can't be named from reference cutoffs; small shifts in both may be contributing, so the trend and history decide.` };
  }
  const tested = cands.map((c) => ({ ...c, limit: compensationLimit(c.primary, c.kind, v) }));
  const fits = tested.filter((c) => !offRange(c.limit));
  const otherNormalFor = (c) => (c.primary === "respiratory" ? hco3Normal : co2Normal);
  const romeFor = (c) => (phState === "normal" ? (otherNormalFor(c) ? "unclear" : "full") : otherNormalFor(c) ? "none" : "partial");

  if (fits.length === 1) {
    const f = fits[0];
    const compensation = romeFor(f);
    const detail = compensationText(f.limit, f.primary);
    if (compensation === "unclear") {
      const own = f.primary === "respiratory" ? "PaCO₂" : "HCO₃⁻", other = f.primary === "respiratory" ? "HCO₃⁻" : "PaCO₂";
      return { disorder: `${f.primary} ${f.kind}`, primary: f.primary, compensation: "unclear", mixedPossible: true,
        reading: `A ${f.primary} ${f.kind} pattern with the pH in range: ${own} is outside its reference range, while the pH and ${other} are inside theirs; ${detail}. This may be a mild disorder whose pH never left the range, or one already compensated. These values can't tell which, so the trend and history decide.` };
    }
    const courseUnclear = f.primary === "respiratory" && !(f.limit.acuteFit && f.limit.chronicFit);
    const reading = compensation === "none"
      ? `${cap(f.primary)} ${f.kind}, uncompensated by the NCLEX convention: ${detail}.`
      : compensation === "partial"
        ? `${cap(f.primary)} ${f.kind}, partially compensated: pH is still out of range; ${detail}.`
        : `${cap(f.primary)} ${f.kind}, fully compensated by the NCLEX convention: pH is back in range; ${detail}.${FULL_CAVEAT}`;
    return { disorder: `${f.primary} ${f.kind}`, primary: f.primary, compensation, mixedPossible: courseUnclear, reading };
  }
  if (fits.length > 1) {
    const names = fits.map((f) => `${f.primary} ${f.kind}`);
    return { disorder: "indeterminate", primary: null, compensation: null, mixedPossible: true, alternatives: names,
      reading: `Two readings fit these values: ${names.join(" or ")}, each with the pH in range. Only the history can tell them apart, and a mixed disorder is also possible.` };
  }
  /* Nothing fits as one disorder: every candidate's compensating value is
     outside its expected range. A mixed disorder, reported from the first
     candidate (metabolic before respiratory). */
  const first = tested[0];
  return mixedResult(first.primary, first.kind, romeFor(first), first.limit);
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export const ABG_EXAMPLE = { ph: 7.3, paco2: 50, hco3: 24 };

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
  const bx = x + 14, bw = 80, lo = bx + 30, hi = bx + 52;
  const start = bx + 6;
  const mx = bx + at;
  const inRange = mx >= lo && mx <= hi;
  return (
    <g>
      <Box x={x} y={y} w={108} h={102} r={9} fill={C.surface} lift />
      <T x={x + 54} y={y + 19} size={MIN_TEXT} weight={700} anchor="middle">{title}</T>
      <rect x={bx} y={y + 28} width={bw} height={7} rx={3.5} fill={C.surface} stroke={C.line} />
      <rect x={lo} y={y + 28} width={hi - lo} height={7} rx={3} fill={C.teal} fillOpacity={0.8} />
      <Anim on="compensation" kind="slide" from={`${start - mx}px`} dur={1400} delay={i * 250}>
        <circle className="dg-solid" cx={mx} cy={y + 31.5} r={4.6} fill={inRange ? C.teal : C.danger} stroke={C.card} strokeWidth={1.5} />
      </Anim>
      {lines.map((l, j) => <T key={j} x={x + 54} y={y + 56 + j * 16} size={MIN_TEXT} anchor="middle" color={C.muted}>{l}</T>)}
    </g>
  );
}

/* The verdict on the chip: one line of what interpretAbg() decided. */
export function verdictLabel(r) {
  if (r.disorder === "normal") return "Acid–base values in range";
  if (r.disorder === "inconsistent") return "Values don't fit: recheck";
  if (r.disorder === "unsupported") return "Outside automatic interpretation range";
  if (r.compensation === "unclear") return `${cap(r.disorder)} pattern · pH in range`;
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
    <Frame h={TY + 172} focus={focus} title="Acid–base reading of an arterial blood gas"
      regions={{ ph: [0, 100], co2: [104, 196], hco3: [200, 292], rome: [RY - 4, RY + 132], result: [RY + 132, CY + 6], comp: [TY - 4, TY + 148] }}
      desc={concept
        ? "Method: pH normal 7.35 to 7.45; PaCO2 normal 35 to 45 mmHg, and a high PaCO2 pushes toward acidosis; HCO3 normal 22 to 26 mEq/L, and a low HCO3 pushes toward acidosis, a high one toward alkalosis; the actual pH depends on both together. Match the value that moves with the pH: respiratory opposite, metabolic equal. If both values push the pH the same way, both are primary: a combined disorder, not compensation. Compensation means the other value pushes back, the opposite way: other value still normal means uncompensated; pushing back but pH still out of range means partially compensated; pH back in range means fully compensated. Compensation has expected limits; a value outside them suggests a mixed disorder."
        : `pH ${showAbg(params, "ph")} (normal 7.35 to 7.45), PaCO2 ${showAbg(params, "paco2")} mmHg (35 to 45; high pushes toward acidosis), HCO3 ${showAbg(params, "hco3")} mEq/L (22 to 26; low pushes toward acidosis). ${r.reading}`}>
      <G id="ph">
        <Gauge x={20} y={66} w={320} min={7.1} max={7.7} lo={7.35} hi={7.45} value={concept ? null : params.ph} decimals={2}
          text={concept ? null : showAbg(params, "ph")}
          label="1  pH: what is the problem?" leftLabel="ACIDOSIS" rightLabel="ALKALOSIS" leftColor="coral" rightColor="coral"
          icon={placed(BloodIcon)} anim={["ph", "worked"]} />
      </G>
      <G id="co2">
        <Gauge x={20} y={162} w={320} min={20} max={70} lo={35} hi={45} value={concept ? null : params.paco2} unit="mmHg"
          text={concept ? null : showAbg(params, "paco2")}
          label="2  PaCO₂: lungs, CO₂ is an acid" leftLabel="BASE" rightLabel="ACID ▸" rightColor="coral"
          icon={placed(LungsIcon, "lungs")} anim={["lungs", "worked"]} />
      </G>
      <G id="hco3">
        <Gauge x={20} y={258} w={320} min={12} max={36} lo={22} hi={26} value={concept ? null : params.hco3} unit="mEq/L"
          text={concept ? null : showAbg(params, "hco3")}
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
        <CompTile x={16} y={TY} i={0} title="Uncompensated" lines={["pH out;", "other value", "still in range"]} at={6} />
        <CompTile x={126} y={TY} i={1} title="Partial" lines={["pH still out;", "other value", "pushing back"]} at={20} />
        <CompTile x={236} y={TY} i={2} title="Full" lines={["pH back", "in range;", "check limits"]} at={34} />
        <T x={20} y={TY + 124} size={MIN_TEXT} color={C.muted}>NCLEX labels. Check the expected compensation too.</T>
        <T x={20} y={TY + 142} size={MIN_TEXT} weight={700}>Both push the same way? A combined disorder.</T>
      </G>
      <G id="oxy">
        <T x={20} y={TY + 164} size={MIN_TEXT} color={C.muted}>Oxygenation (PaO₂, SaO₂) is assessed separately.</T>
      </G>
    </Frame>
  );
}

export const abg = {
  id: "abg",
  title: "ABG: acid–base reading",
  concepts: ["abg"],
  Diagram: AbgDiagram,
  example: ABG_EXAMPLE,
  textCases: [{ ph: 7.36, paco2: 36, hco3: 19.7 }, { ph: 7.38, paco2: 20, hco3: 11.4 }, { ph: 7.2, paco2: 60, hco3: 36 }, { ph: 7.34, paco2: 45.4, hco3: 23.7 }, { ph: 7.1, paco2: 60, hco3: 18 }, { ph: 6.77, paco2: 40, hco3: 5.6 }, { ph: 7.3499, paco2: 50, hco3: 26.668 }, { ph: 7.44, paco2: 40, hco3: 26.3 }],
  /* Every clinical claim this diagram makes, stated plainly so the
     adversarial reviewer can check each one. */
  facts: [
    "Normal arterial pH is 7.35–7.45; below 7.35 is acidosis, above 7.45 is alkalosis.",
    "Normal PaCO₂ is 35–45 mmHg; CO₂ acts as an acid, so a PaCO₂ above 45 pushes toward acidosis and below 35 toward alkalosis.",
    "Normal HCO₃⁻ is 22–26 mEq/L; bicarbonate is a base, so an HCO₃⁻ below 22 pushes toward acidosis and above 26 toward alkalosis. The actual pH depends on HCO₃⁻ and PaCO₂ together: a high HCO₃⁻ can accompany acidemic respiratory acidosis, and a low HCO₃⁻ alkalemic respiratory alkalosis.",
    "On an ABG, HCO₃⁻ is calculated from pH and PaCO₂ (Henderson–Hasselbalch), so the three values must agree; a pH far from the one PaCO₂ and HCO₃⁻ imply means the values should be rechecked before interpreting.",
    "ROME: in respiratory disorders pH and PaCO₂ move in opposite directions; in metabolic disorders pH and HCO₃⁻ move in the same direction.",
    "NCLEX compensation labels follow the reference ranges, after a direction check: if PaCO₂ and HCO₃⁻ both push the pH the same way, both are primary (a combined disorder), not compensation. Otherwise, pH out of range with the other system's value still in its reference range is called uncompensated; pH out of range with that value outside its range, pushing the opposite way, is partially compensated; pH back in 7.35–7.45 is fully compensated. A compensating shift can happen while a value is still inside its reference range, and a normal pH alone does not establish compensation, so the expected compensation is checked too.",
    "As a basic exam heuristic, a compensated pH below 7.40 is often read as an original acidosis and above 7.40 as an original alkalosis; it is not a diagnostic rule, and the expected compensation and the history decide.",
    "Compensation has limits. Expected respiratory compensation for metabolic acidosis is PaCO₂ ≈ 1.5 × HCO₃⁻ + 8 ± 2 (Winter's formula). For metabolic alkalosis two bedside rules are in common use, PaCO₂ ≈ 0.7 × HCO₃⁻ + 21 and PaCO₂ ≈ 40 + 0.7 × (HCO₃⁻ − 24), each ± 2; they differ by about 2 mmHg, and respiratory compensation rarely raises PaCO₂ beyond about 55 mmHg. In respiratory acidosis HCO₃⁻ rises about 1 mEq/L per 10 mmHg rise in PaCO₂ when acute and about 4 when chronic, from about 24; in respiratory alkalosis it falls about 2 (acute) or 5 (chronic) per 10 mmHg fall, each ± 2. The acute and chronic estimates are separate: a value fitting only one of them is a single disorder only for that time course, so the history decides. A compensating value outside the expected range, beyond it or short of it, suggests a mixed disorder; just outside it is borderline, because the rules are approximations. Compensation usually leaves a residual pH shift toward the original problem; it can bring the pH into 7.35–7.45, especially in milder or chronic disorders (for example, PaCO₂ 50 with HCO₃⁻ 28 gives a pH of about 7.37), but that alone does not exclude a mixed disorder.",
    "This diagram reads acid–base balance only. Oxygenation (PaO₂, SaO₂) is assessed separately: acid–base values in range do not mean the whole ABG is normal.",
  ],
  steps: [
    { key: "ph", focus: ["ph"], caption: "Start with pH. Below 7.35 is acidosis, above 7.45 is alkalosis. pH tells you what the problem is, not yet where it came from.",
      narration: "Start with the pH. Anything below seven point three five is acidosis. Anything above seven point four five is alkalosis. The pH tells you what the problem is, not yet where it came from." },
    { key: "lungs", focus: ["co2"], caption: "Now the lungs. CO₂ behaves like an acid, so a PaCO₂ above 45 pushes the blood toward acid. Notice its acid end is on the right, the opposite of the pH line.",
      narration: "Now look at the lungs. Carbon dioxide behaves like an acid, so a P-A-C-O-2 above forty-five pushes the blood toward acid. Notice that its acid end is on the right, the opposite way round from the pH line." },
    { key: "kidneys", focus: ["hco3"], caption: "Then the kidneys. Bicarbonate is a base: below 22 pushes toward acidosis, above 26 toward alkalosis. The actual pH depends on how it balances against PaCO₂.",
      narration: "Then the kidneys. Bicarbonate is a base. Below twenty-two pushes toward acidosis, and above twenty-six pushes toward alkalosis. The actual pH depends on how it balances against the P-A-C-O-2." },
    { key: "rome", focus: ["rome"], caption: "Find the value that matches the pH. ROME: Respiratory, pH and PaCO₂ move Opposite ways. Metabolic, pH and HCO₃⁻ move the Equal way. If both values push the pH the same way, both are primary: a combined disorder.",
      narration: "Now find the value that matches the pH, using ROME. Respiratory: the pH and P-A-C-O-2 move in opposite directions. Metabolic: the pH and bicarbonate move in the same direction. And if both values are pushing the pH the same way, both are primary problems: that is a combined disorder." },
    { key: "worked", focus: ["ph", "co2", "hco3", "result"], dynamic: true, caption: null,
      narration: null },
    { key: "compensation", focus: ["comp", "result"], caption: "Compensation is the other system pushing back, the opposite way, to offset the first. NCLEX labels use the reference ranges: pH out with the other value still in range, uncompensated; pH out with the other value out of range and pushing back, partially compensated; pH back in range, fully compensated. If both values push the same way, it is a combined disorder, not compensation. A normal pH alone doesn't prove compensation: check the expected compensation, because too far or not far enough suggests a mixed disorder.",
      narration: "Compensation is the other system pushing back, the opposite way, to offset the first. The NCLEX labels use the reference ranges. If the pH is out of range and the other value is still in its range, it is called uncompensated. If the other value is out of its range and pushing back, but the pH is still abnormal, it is partially compensated. And if the pH is back in range, it is fully compensated. If both values push the pH the same way, that is a combined disorder, not compensation. A normal pH alone doesn't prove compensation, so check the expected compensation. A value that has gone too far, or not far enough, suggests a second, mixed disorder." },
  ],
  /* The worked-example step reads the actual values, so it is written by
     the same function that interprets them. */
  dynamicCaption: (params = ABG_EXAMPLE) => {
    const r = interpretAbg(params);
    return `Here: pH ${showAbg(params, "ph")}, PaCO₂ ${showAbg(params, "paco2")}, HCO₃⁻ ${showAbg(params, "hco3")}. ${r.reading}`;
  },
};
