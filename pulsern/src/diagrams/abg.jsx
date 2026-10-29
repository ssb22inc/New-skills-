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
     respiratory acidosis  HCO₃⁻ = 24 + 1–2 (acute) or 3.5–4 (chronic) per 10 mmHg PaCO₂ above 40, ± 2
     respiratory alkalosis HCO₃⁻ = 24 − 2 (acute) or 4–5 (chronic) per 10 mmHg PaCO₂ below 40, ± 2
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
   about 55 mmHg. That is approximate (Sol, round 5), so it does not cut the
   expected range: a value above it that the rules still fit is reported
   with a caution that an added respiratory acidosis is possible. */
export const ALKALOSIS_PACO2_CEILING = 55;

const r1 = (n) => Math.round(n * 10) / 10;
export const impliedPh = ({ paco2, hco3 }) => 6.1 + Math.log10(hco3 / (0.03 * paco2));
const decimals = (v) => { for (let d = 0; d <= 17; d++) if (Number(v.toFixed(d)) === v) return d; return 17; };
export const DEFAULT_PRECISION = { ph: 2, paco2: 0, hco3: 0 };
/* Analyzers use slightly different constants: pK about 6.095–6.105 and CO₂
   solubility about 0.030–0.0307 mmol/L per mmHg. The bounds are computed
   from those ranges directly — not a symmetric allowance — so the band is
   asymmetric, as the constants are (Sol, round 20: a flat ±0.015 let
   7.35 / 60 / 30 through). */
export const PK_RANGE = [6.095, 6.105];
export const SOLUBILITY_RANGE = [0.03, 0.0307];   // the textbook 0.03 included
const phWith = (pK, sol, paco2, hco3) => pK + Math.log10(hco3 / (sol * paco2));
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
  const lo = phWith(PK_RANGE[0], SOLUBILITY_RANGE[1], paco2 + dc, Math.max(1e-6, hco3 - dh)) - dp;
  const hi = phWith(PK_RANGE[1], SOLUBILITY_RANGE[0], Math.max(1e-6, paco2 - dc), hco3 + dh) + dp;
  return { ok: ph >= lo - 1e-9 && ph <= hi + 1e-9, implied: impliedPh({ paco2, hco3 }), lo, hi };
}

/* The expected range of the compensating value for a primary disorder, and
   whether the actual value is beyond it (overshoot) or short of it. One
   rounding, to the 0.1 the values are reported in, used both to decide and
   to display (Astra, PR #134 review, round 11). */
/* HCO₃⁻ change per 10 mmHg PaCO₂, [acute, chronic], each as a range of the
   values references use. */
export const COEFFICIENTS = { acidosis: [[1, 2], [3.5, 4]], alkalosis: [[2, 2], [4, 5]] };
/* Respiratory alkalosis alone rarely takes HCO₃⁻ below about 12–15 mEq/L
   (Sol, round 16); the linear rule is not trusted below that, so a lower
   value raises an added metabolic acidosis. Approximate, not a cutoff. */
export const RESP_ALK_HCO3_FLOOR = 12;
/* Acute (non-renal) buffering rarely raises HCO₃⁻ above about 30–32 mEq/L,
   and the linear respiratory-acidosis rules are bedside approximations for
   moderate hypercapnia, not the whole PaCO₂ range (Sol, round 17: 7.13 /
   140 / 45 was called an acute fit). Above RESP_ACID_RULES_MAX_PACO2 no
   acute or chronic fit is claimed. */
export const ACUTE_RESP_ACID_HCO3_MAX = 32;
export const RESP_ACID_RULES_MAX_PACO2 = 80;
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
    return range("PaCO₂", paco2, Math.min(a, b) - 2, Math.max(a, b) + 2, false, [a, b], { aboveCeiling: paco2 > ALKALOSIS_PACO2_CEILING });
  }
  if (primary === "respiratory") {
    /* Acute and chronic estimates are reported separately (Sol, round 4): a
       value that fits only one of them is a single disorder only for that
       time course. */
    /* The per-10-mmHg coefficients vary between references (Sol, round 14:
       a chronic rise of 3.5 is as standard as 4), so each time course is a
       band of estimates, not one point. */
    const d = kind === "acidosis" ? (paco2 - 40) / 10 : (40 - paco2) / 10;
    const sign = kind === "acidosis" ? 1 : -1;
    const [kA, kC] = COEFFICIENTS[kind];
    const mid = ([a, b]) => (a + b) / 2;
    const band = ([k1, k2]) => [24 + sign * k1 * d, 24 + sign * k2 * d].sort((a, b) => a - b);
    const acuteB = band(kA), chronicB = band(kC);
    if (kind === "acidosis" && paco2 > RESP_ACID_RULES_MAX_PACO2) {
      /* Past the rules' useful range: only a value too LOW for even acute
         buffering is called short; anything higher is left to the history. */
      const low = Math.min(acuteB[0], ACUTE_RESP_ACID_HCO3_MAX) - 2;
      return range("HCO₃⁻", hco3, low, 60, false, [mid(acuteB), mid(chronicB)],
        { outsideRules: true, acuteFit: false, chronicFit: false, acuteBand: acuteB.map(r1), chronicBand: chronicB.map(r1) });
    }
    const inBand = (v, [a, b]) => v >= r1(a - 2) && v <= r1(b + 2);
    const lo = Math.min(acuteB[0], chronicB[0]) - 2, hi = Math.max(acuteB[1], chronicB[1]) + 2;
    return range("HCO₃⁻", hco3, lo, hi, kind === "alkalosis", [mid(acuteB), mid(chronicB)],
      { acuteFit: inBand(hco3, acuteB), chronicFit: inBand(hco3, chronicB), acuteBand: acuteB.map(r1), chronicBand: chronicB.map(r1),
        belowFloor: kind === "alkalosis" && hco3 < RESP_ALK_HCO3_FLOOR,
        /* the formula band is kept as taught; a value above the usual acute
           buffering limit is flagged as unusual, not excluded (Sol, round 18) */
        acuteUnusual: kind === "acidosis" && inBand(hco3, acuteB) && hco3 > ACUTE_RESP_ACID_HCO3_MAX });
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
    caution: primary === "metabolic" && c.short ? "Or respiratory compensation is still developing; the history decides."
      : miss <= 1 ? "Borderline: the rules are approximations; the history decides." : null,
    reading: `ROME pattern only: ${primary} ${kind}, ${romeLabel(rome)}. But ${where}, `
      + (primary === "metabolic" && c.short
        ? `which has two explanations: respiratory compensation may still be developing (it takes hours, and the expected range assumes it is established), or a second disorder (${secondDisorder(c)}) is present. The history decides.`
        : miss <= 1
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
    return `${refPart}; expected compensation, once established, is about ${a}–${b} by the two common bedside rules, ± 2 (${c.expected[0]}–${c.expected[1]} ${u})${c.aboveCeiling ? `. A PaCO₂ above about ${ALKALOSIS_PACO2_CEILING} is more than compensation usually reaches, so an added respiratory acidosis is possible; the history decides` : ""}`;
  }
  if (primary === "metabolic") return `${refPart}; expected compensation, once established, is about ${c.centers[0]} ± 2 (${c.expected[0]}–${c.expected[1]} ${u})`;
  return `${refPart}; ${courseText(c)}`;
}
/* The short qualification shown under the verdict, so the uncertainty the
   reading carries is visible inline, not only in the caption (Sol, round 6). */
function cautionFor(c, primary, compensation) {
  if (c.acuteUnusual) return "HCO₃⁻ above about 30–32 is unusual for acute buffering alone: chronic compensation or acute-on-chronic is more likely; prior gases decide.";
  if (c.outsideRules) return "PaCO₂ beyond the bedside rules' range: chronic compensation, acute-on-chronic, or a metabolic component; prior gases decide.";
  if (c.belowFloor) return `HCO₃⁻ below about ${RESP_ALK_HCO3_FLOOR}–15 is more than respiratory alkalosis usually explains: an added metabolic acidosis is possible; the history decides.`;
  if (c.aboveCeiling) return `PaCO₂ above about ${ALKALOSIS_PACO2_CEILING}: an added respiratory acidosis is possible; the history decides.`;
  if (primary === "respiratory" && !(c.acuteFit && c.chronicFit)) {
    const rise = c.centers[1] > c.centers[0];
    if (c.acuteFit) return `Fits a PaCO₂ change of hours: if sustained for days, an added metabolic ${rise ? "acidosis" : "alkalosis"}; prior gases decide.`;
    if (c.chronicFit) return "Fits a PaCO₂ sustained for days, or an acute change on chronic disease; prior gases decide.";
    return "Between the acute and chronic estimates: subacute, acute-on-chronic, a stable course outside these approximations, or mixed; prior gases decide.";
  }
  if (compensation === "full") return "A mixed disorder can look the same; the history decides.";
  return null;
}
/* Which time course a respiratory disorder's HCO₃⁻ fits, and what the
   other course would imply. */
function courseText(c) {
  if (c.outsideRules) {
    return `at a PaCO₂ this high the bedside rules are not reliable, so no acute or chronic fit is claimed: acute buffering rarely raises HCO₃⁻ above about 30–32 mEq/L, and a higher HCO₃⁻ may reflect established chronic compensation, an acute change on top of chronic disease, or an added metabolic alkalosis; prior gases and the history decide`;
  }
  if (c.belowFloor) {
    return `the estimates (acute about ${c.acuteBand.join("–")}, chronic about ${c.chronicBand.join("–")} ± 2 mEq/L) are extrapolated past their reliable range here: respiratory alkalosis alone rarely takes HCO₃⁻ below about ${RESP_ALK_HCO3_FLOOR}–15, so an added metabolic acidosis is possible; the history decides`;
  }
  const [acute, chronic] = c.centers, u = unitOf(c.name);
  const span = ([a, b]) => (a === b ? `${a}` : `${a}–${b}`);
  const est = `the acute estimate is about ${span(c.acuteBand)} ± 2 and the chronic about ${span(c.chronicBand)} ± 2 ${u}`;
  const acidosisRise = chronic > acute;   // HCO₃⁻ rises in respiratory acidosis, falls in alkalosis
  const unusual = c.acuteUnusual ? `; an HCO₃⁻ above about 30–32 is unusual for acute buffering alone, so chronic compensation or an acute change on chronic disease is more likely` : "";
  if (c.acuteFit && c.chronicFit) return `${est}, and it fits both${unusual}`;
  /* The two estimates are not the only time courses: an acute change on
     top of chronic disease lands between them (Sol, round 13). The
     estimates describe how long the CURRENT PaCO₂ has been at this level,
     which prior gases and the timeline show — not a history of lung
     disease alone. */
  const timeline = "prior gases and the timeline of this PaCO₂ change decide";
  if (c.acuteFit) return `${est}: it fits a PaCO₂ change of hours${unusual}; if this PaCO₂ has been sustained for days, this HCO₃⁻ would suggest an added metabolic ${acidosisRise ? "acidosis" : "alkalosis"}, so ${timeline}`;
  /* A chronic-only fit can also be an acute change on top of chronic
     disease (Sol, round 15: baseline 70/36 rising acutely to 80/37), so no
     added metabolic disorder is inferred from it; the acute change is
     judged from the prior compensated gas when there is one. */
  if (c.chronicFit) return `${est}: it fits a PaCO₂ sustained for days, or an acute change on top of chronic disease; ${timeline}, and with a prior compensated gas, the acute change is judged from that baseline`;
  return `${est}: it lies between them, which fits a subacute course, an acute change on top of chronic disease, a stable course whose response differs from these approximations, or a mixed disorder; ${timeline}`;
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
    return recheck(`These values do not agree: a PaCO₂ of ${show("paco2")} with an HCO₃⁻ of ${show("hco3")} goes with a pH near ${fit.implied.toFixed(Math.max(2, pr.ph))}, not ${show("ph")}.`);
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
  /* A rule that can't be applied here is NOT a fit (Sol, round 18: above
     the rules' PaCO₂ range a wide placeholder counted as compensation, so
     7.37 / 81 / 45 read "fully compensated"). */
  const fits = tested.filter((c) => !offRange(c.limit) && !c.limit.outsideRules);
  /* Handled before any expected-range or mixed-disorder wording, so the
     placeholder interval is never shown as expected compensation (Sol,
     round 19: 7.11 / 81 / 25 printed "about 26.1–60"). */
  const unevaluable = tested.find((c) => c.limit.outsideRules);
  if (unevaluable) {
    const u = unevaluable, L = u.limit;
    const tooLow = L.short;   // below even the acute buffering estimate
    const lowNote = tooLow
      ? ` HCO₃⁻ ${fmtNum(L.value)} is lower than even acute buffering usually gives (the acute estimate starts at about ${L.acuteBand[0]} ± 2), which raises an added metabolic acidosis.`
      : "";
    return { disorder: `${u.primary} ${u.kind}`, primary: u.primary, compensation: "not evaluable", mixedPossible: true,
      ...(tooLow ? { mixed: "metabolic acidosis" } : {}),
      caution: tooLow ? "Compensation not evaluable at this PaCO₂, but HCO₃⁻ is lower than acute buffering gives: an added metabolic acidosis is possible." : cautionFor(L, u.primary, null),
      reading: `${cap(u.primary)} ${u.kind} pattern, compensation not evaluable here: ${courseText(L)}.${lowNote}${fits.length ? ` A ${fits.map((f) => `${f.primary} ${f.kind}`).join(" or ")} reading also fits the values.` : ""}` };
  }
  const otherNormalFor = (c) => (c.primary === "respiratory" ? hco3Normal : co2Normal);
  const romeFor = (c) => (phState === "normal" ? (otherNormalFor(c) ? "unclear" : "full") : otherNormalFor(c) ? "none" : "partial");

  if (fits.length === 1) {
    const f = fits[0];
    const compensation = romeFor(f);
    const detail = compensationText(f.limit, f.primary);
    if (compensation === "unclear") {
      const own = f.primary === "respiratory" ? "PaCO₂" : "HCO₃⁻", other = f.primary === "respiratory" ? "HCO₃⁻" : "PaCO₂";
      return { disorder: `${f.primary} ${f.kind}`, primary: f.primary, compensation: "unclear", mixedPossible: true,
        caution: "Only one value is out of range, so compensation can't be established from these values.",
        reading: `A ${f.primary} ${f.kind} pattern with the pH in range: ${own} is outside its reference range, while the pH and ${other} are inside theirs; ${detail}. This may be a mild disorder whose pH never left the range, or one already compensated. These values can't tell which, so the trend and history decide.` };
    }
    const courseUnclear = (f.primary === "respiratory" && !(f.limit.acuteFit && f.limit.chronicFit)) || !!f.limit.aboveCeiling || !!f.limit.belowFloor || !!f.limit.outsideRules;
    const reading = compensation === "none"
      ? `${cap(f.primary)} ${f.kind}, uncompensated by the NCLEX convention: ${detail}.`
      : compensation === "partial"
        ? `${cap(f.primary)} ${f.kind}, partially compensated: pH is still out of range; ${detail}.`
        : `${cap(f.primary)} ${f.kind}, fully compensated by the NCLEX convention: pH is back in range; ${detail}.${FULL_CAVEAT}`;
    return { disorder: `${f.primary} ${f.kind}`, primary: f.primary, compensation, mixedPossible: courseUnclear, reading,
      caution: cautionFor(f.limit, f.primary, compensation) };
  }
  if (fits.length > 1) {
    const names = fits.map((f) => `${f.primary} ${f.kind}`);
    return { disorder: "indeterminate", primary: null, compensation: null, mixedPossible: true, alternatives: names,
      caution: "Only the history can tell these apart.",
      reading: `Two readings fit these values: ${names.join(" or ")}, each with the pH in range. Only the history can tell them apart, and a mixed disorder is also possible.` };
  }
  /* Nothing fits as one disorder: every candidate's compensating value is
     outside its expected range. A mixed disorder, reported from the first
     candidate (metabolic before respiratory). */
  /* Report the reading that comes CLOSEST to fitting, so a borderline
     single disorder is never hidden behind whichever candidate happens to
     be tested first (Sol, round 12: 7.42 / 50 / 31). The others are named
     too. */
  const missOf = (c) => (c.limit.low ? c.limit.expected[0] - c.limit.value : c.limit.value - c.limit.expected[1]);
  const ranked = [...tested].sort((a, b) => missOf(a) - missOf(b));
  const best = ranked[0];
  const res = mixedResult(best.primary, best.kind, romeFor(best), best.limit);
  const others = ranked.slice(1).map((c) => `${c.primary} ${c.kind}, whose expected ${c.limit.name} of ${c.limit.expected[0]}–${c.limit.expected[1]} misses by ${r1(missOf(c))}`);
  return others.length ? { ...res, reading: `${res.reading} Also considered: ${others.join("; ")}.` } : res;
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
      <Box x={x} y={y} w={108} h={120} r={9} fill={C.surface} lift />
      <T x={x + 54} y={y + 19} size={MIN_TEXT} weight={700} anchor="middle">{title}</T>
      <rect x={bx} y={y + 28} width={bw} height={7} rx={3.5} fill={C.surface} stroke={C.line} />
      <rect x={lo} y={y + 28} width={hi - lo} height={7} rx={3} fill={C.teal} fillOpacity={0.8} />
      <Anim on="compensation" kind="slide" from={`${start - mx}px`} dur={1400} delay={i * 250}>
        <circle className="dg-solid" cx={mx} cy={y + 31.5} r={4.6} fill={inRange ? C.teal : C.ink} stroke={C.card} strokeWidth={1.5} />
      </Anim>
      {lines.map((l, j) => <T key={j} x={x + 54} y={y + 56 + j * 16} size={MIN_TEXT} anchor="middle" color={C.muted}>{l}</T>)}
    </g>
  );
}

/* The method the overview teaches, in words: the concept view's whole
   description, and appended to a populated one so the method panels are
   never missing from it (Sol, round 15). */
const ABG_METHOD_DESC = "Method: pH normal 7.35 to 7.45; PaCO2 normal 35 to 45 mmHg, and a high PaCO2 pushes toward acidosis; HCO3 normal 22 to 26 mEq/L, and a low HCO3 pushes toward acidosis, a high one toward alkalosis; the actual pH depends on both together. Match the value that moves with the pH: respiratory opposite, metabolic equal. If both values push the pH the same way, both are primary: a combined disorder, not compensation. Compensation means the other value has an opposing effect on pH: other value still normal means uncompensated; out of range with an opposing effect on pH but pH still out of range means partially compensated; pH back in range with both values out of range and opposing effects on pH means fully compensated (in compensation PaCO2 and HCO3 usually rise or fall together); pH in range with only one value out means compensation cannot be established from these values. Expected compensation, once established: metabolic acidosis PaCO2 about 1.5 times HCO3 plus 8, plus or minus 2; metabolic alkalosis PaCO2 about 0.7 times HCO3 plus 21, or 40 plus 0.7 times (HCO3 minus 24), plus or minus 2, rarely above about 55; respiratory acidosis HCO3 about 24 plus 1 to 2 (acute) or 3.5 to 4 (chronic) for each 10 mmHg PaCO2 is above 40; respiratory alkalosis HCO3 about 24 minus 2 (acute) or 4 to 5 (chronic) for each 10 mmHg PaCO2 is below 40, each plus or minus 2; references vary in these coefficients. These are approximations; a value well outside suggests a mixed disorder.";

/* The rules the interpreter uses, shown so a student can do the check the
   explainer asks for (Sol, round 6). */
const RULES = [
  ["Metabolic acidosis:", "PaCO₂ ≈ 1.5 × HCO₃⁻ + 8, ± 2 (Winter's formula)"],
  ["Metabolic alkalosis:", "PaCO₂ ≈ 0.7 × HCO₃⁻ + 21, or 40 + 0.7 × (HCO₃⁻ − 24), ± 2; rarely above about 55"],
  ["Respiratory acidosis:", "HCO₃⁻ ≈ 24 + k × ((PaCO₂ − 40) ÷ 10), k ≈ 1–2 acute or 3.5–4 chronic, ± 2 mEq/L; acute rarely above about 30–32; for PaCO₂ up to about 80"],
  ["Respiratory alkalosis:", "HCO₃⁻ ≈ 24 − k × ((40 − PaCO₂) ÷ 10), k ≈ 2 acute or 4–5 chronic, ± 2 mEq/L; rarely below about 12–15 from this alone"],
  ["", "Approximate, once established: breathing adjusts over hours, the kidneys over days; an acute change on chronic disease can fall between. With a normal pH, test each possible primary against these and keep every one that fits. Well outside suggests a mixed disorder; just outside is borderline."],
];
const H_RULES = 44 + RULES.reduce((a, [lead, text]) => a + paraLines(`${lead} ${text}`, 296, MIN_TEXT).length * MIN_TEXT * 1.3 + 6, 0) + 2;

/* The verdict on the chip: one line of what interpretAbg() decided. */
export function verdictLabel(r) {
  if (r.disorder === "normal") return "Acid–base values in range";
  if (r.disorder === "inconsistent") return "Values don't fit: recheck";
  if (r.disorder === "unsupported") return "Outside automatic interpretation range";
  if (r.compensation === "unclear") return `${cap(r.disorder)} pattern · pH in range`;
  if (r.compensation === "not evaluable") return r.mixed ? `Possible mixed: ${r.disorder} + ${r.mixed}` : `${cap(r.disorder)} · compensation not evaluable`;
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
  /* Coral only for values that don't fit together (incorrect data): an
     abnormal reading is not by itself critical (Sol, round 18). */
  const chipColor = concept || r.disorder === "normal" ? "teal" : r.disorder === "inconsistent" ? "coral" : "ink";
  const label = concept ? "Read pH → PaCO₂ → HCO₃⁻ → match" : verdictLabel(r);
  const chipLines = paraLines(label, 300, BODY_TEXT).length;
  const caution = concept ? null : r.caution ?? null;
  const cautionLines = caution ? paraLines(`Check: ${caution}`, 320, MIN_TEXT).length : 0;
  const RY = 312, CY0 = 464 + (chipLines - 1) * 18;
  const cautionY = CY0 + 22;
  const CY = caution ? cautionY + (cautionLines - 1) * MIN_TEXT * 1.3 + 6 : CY0, TY = CY + 30;
  const LY = TY + 192, ruleH = H_RULES, OY = LY + ruleH + 22;
  return (
    <Frame h={OY + 8} focus={focus} title="Acid–base reading of an arterial blood gas"
      regions={{ ph: [0, 100], co2: [104, 196], hco3: [200, 292], rome: [RY - 4, RY + 132], result: [RY + 132, CY + 6], comp: [TY - 4, TY + 182], rules: [LY - 4, LY + ruleH + 4] }}
      desc={concept
        ? ABG_METHOD_DESC
        : `pH ${showAbg(params, "ph")} (normal 7.35 to 7.45), PaCO2 ${showAbg(params, "paco2")} mmHg (35 to 45; high pushes toward acidosis), HCO3 ${showAbg(params, "hco3")} mEq/L (22 to 26; low pushes toward acidosis). ${r.reading} ${ABG_METHOD_DESC} Oxygenation (PaO2, SaO2) is assessed separately.`}>
      <G id="ph">
        <Gauge x={20} y={66} w={320} min={7.1} max={7.7} lo={7.35} hi={7.45} value={concept ? null : params.ph} decimals={2}
          text={concept ? null : showAbg(params, "ph")}
          label="1  pH: the net state" leftLabel="ACIDEMIA" rightLabel="ALKALEMIA" leftColor="ink" rightColor="ink"
          icon={placed(BloodIcon)} anim={["ph", "worked"]} />
      </G>
      <G id="co2">
        <Gauge x={20} y={162} w={320} min={20} max={70} lo={35} hi={45} value={concept ? null : params.paco2} unit="mmHg"
          text={concept ? null : showAbg(params, "paco2")}
          label="2  PaCO₂: lungs, CO₂ is an acid" leftLabel="BASE" rightLabel="ACID ▸" rightColor="ink"
          icon={placed(LungsIcon, "lungs")} anim={["lungs", "worked"]} />
      </G>
      <G id="hco3">
        <Gauge x={20} y={258} w={320} min={12} max={36} lo={22} hi={26} value={concept ? null : params.hco3} unit="mEq/L"
          text={concept ? null : showAbg(params, "hco3")}
          label="3  HCO₃⁻: kidneys, a base" leftLabel="◂ ACID" rightLabel="BASE" leftColor="ink"
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
          <Chip x={180} y={RY + 154} text={label} color={chipColor} maxW={330} />
          {caution ? <Para x={20} y={cautionY} w={320} size={MIN_TEXT} lead="Check:" text={caution} /> : null}
        </Anim>
      </G>
      <G id="comp">
        <CompTile x={16} y={TY} i={0} title="Uncompensated" lines={["pH out;", "other value", "still in its", "range"]} at={6} />
        <CompTile x={126} y={TY} i={1} title="Partial" lines={["pH still out;", "other value out,", "opposing its", "effect on pH"]} at={20} />
        <CompTile x={236} y={TY} i={2} title="Full" lines={["pH in range;", "both out, with", "opposing", "effects on pH"]} at={34} />
        <T x={20} y={TY + 140} size={MIN_TEXT} weight={700}>pH in range, one value out? Can't tell.</T>
        <T x={20} y={TY + 158} size={MIN_TEXT} weight={700}>Both push the same way? A combined disorder.</T>
        <T x={20} y={TY + 176} size={MIN_TEXT} color={C.muted}>NCLEX labels; then check the limits below.</T>
      </G>
      <G id="rules">
        <Box x={20} y={LY} w={320} h={ruleH} r={10} fill={C.surface} lift />
        <T x={32} y={LY + 22} size={BODY_TEXT} weight={700}>5  Expected compensation</T>
        {(() => { let y = LY + 44; return RULES.map(([lead, text], i) => {
          const at = y; y += paraLines(`${lead} ${text}`, 296, MIN_TEXT).length * MIN_TEXT * 1.3 + 6;
          return <Para key={i} x={32} y={at} w={296} size={MIN_TEXT} lead={lead} text={text} color={lead ? C.ink : C.muted} />;
        }); })()}
      </G>
      <G id="oxy">
        <T x={20} y={OY} size={MIN_TEXT} color={C.muted}>Oxygenation (PaO₂, SaO₂) is assessed separately.</T>
      </G>
    </Frame>
  );
}

/* What each player step SHOWS, for the image's text alternative: the
   gauge with the client's value and where it sits, the panel's text, or the
   verdict with its caution (Sol, round 12). */
const where = (v, lo, hi) => (v < lo ? "below" : v > hi ? "above" : "inside");
function valueText(p, k) {
  if (!p) return "";
  const [name, unit, lo, hi] = { ph: ["pH", "", 7.35, 7.45], paco2: ["PaCO₂", " mmHg", 35, 45], hco3: ["HCO₃⁻", " mEq/L", 22, 26] }[k];
  return ` This client's ${name} is ${showAbg(p, k)}${unit}, ${where(p[k], lo, hi)} the reference range ${lo}–${hi}.`;
}
export function abgStepDesc(key, p) {
  const gas = p && p.ph != null ? p : null;
  if (key === "ph") return `Gauge 1, pH, the net state: reference 7.35–7.45; below is acidemia, above is alkalemia.${valueText(gas, "ph")}`;
  if (key === "lungs") return `Gauge 2, PaCO₂ in mmHg (the lungs; CO₂ is an acid): reference 35–45; a high PaCO₂ pushes toward acid.${valueText(gas, "paco2")}`;
  if (key === "kidneys") return `Gauge 3, HCO₃⁻ in mEq/L (the kidneys; a base): reference 22–26; low pushes toward acid, high toward base.${valueText(gas, "hco3")}`;
  if (key === "rome") return "Panel 4, match the pH with ROME: Respiratory Opposite, pH and PaCO₂ move apart (drawn as a seesaw); Metabolic Equal, pH and HCO₃⁻ move together (drawn as a lift).";
  if (key === "compensation") return "Three tiles. Uncompensated: pH out; other value still in its range. Partial: pH still out; other value out of range, opposing its effect on pH. Full: pH in range; both out, with opposing effects on pH. Below: pH in range with one value out, can't tell; both pushing the same way, a combined disorder; NCLEX labels, then check the limits.";
  if (key === "limits") return `Panel 5, expected compensation: ${RULES.map(([a, b]) => `${a ? `${a} ` : ""}${b}`).join(". ")}.`;
  if (key === "worked") {
    if (!gas) return "Read pH, then PaCO₂, then HCO₃⁻, then match.";
    const r = interpretAbg(gas);
    return `${valueText(gas, "ph").trim()}${valueText(gas, "paco2")}${valueText(gas, "hco3")} Verdict: ${verdictLabel(r)}.${r.caution ? ` Check: ${r.caution}` : ""}`;
  }
  return null;
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
    "Normal arterial pH is 7.35–7.45; below 7.35 is acidemia and above 7.45 is alkalemia (the net state). Acidosis and alkalosis are the processes, which can coexist, even with a pH in range; introductory exam materials often use the process words for the pH state.",
    "Normal PaCO₂ is 35–45 mmHg; CO₂ acts as an acid, so a PaCO₂ above 45 pushes toward acidosis and below 35 toward alkalosis.",
    "Normal HCO₃⁻ is 22–26 mEq/L; bicarbonate is a base, so an HCO₃⁻ below 22 pushes toward acidosis and above 26 toward alkalosis. The actual pH depends on HCO₃⁻ and PaCO₂ together: a high HCO₃⁻ can accompany acidemic respiratory acidosis, and a low HCO₃⁻ alkalemic respiratory alkalosis.",
    "On an ABG, HCO₃⁻ is calculated from pH and PaCO₂ (Henderson–Hasselbalch), so the three values must agree; a pH far from the one PaCO₂ and HCO₃⁻ imply means the values should be rechecked before interpreting.",
    "ROME: in respiratory disorders pH and PaCO₂ move in opposite directions; in metabolic disorders pH and HCO₃⁻ move in the same direction.",
    "NCLEX compensation labels follow the reference ranges, after a direction check: if PaCO₂ and HCO₃⁻ both push the pH the same way, both are primary (a combined disorder), not compensation. Otherwise, pH out of range with the other system's value still in its reference range is called uncompensated; pH out of range with that value outside its range, with an opposing effect on pH, is partially compensated (in compensation PaCO₂ and HCO₃⁻ usually rise together or fall together); pH back in 7.35–7.45 is fully compensated. A compensating shift can happen while a value is still inside its reference range, and a normal pH alone does not establish compensation, so the expected compensation is checked too.",
    "As a basic exam heuristic, a compensated pH below 7.40 is often read as an original acidosis and above 7.40 as an original alkalosis; it is not a diagnostic rule, and the expected compensation and the history decide.",
    "Compensation has limits. Expected respiratory compensation for metabolic acidosis is PaCO₂ ≈ 1.5 × HCO₃⁻ + 8 ± 2 (Winter's formula). For metabolic alkalosis two bedside rules are in common use, PaCO₂ ≈ 0.7 × HCO₃⁻ + 21 and PaCO₂ ≈ 40 + 0.7 × (HCO₃⁻ − 24), each ± 2; they differ by about 2 mmHg, and respiratory compensation rarely raises PaCO₂ beyond about 55 mmHg. In respiratory acidosis HCO₃⁻ rises about 1–2 mEq/L per 10 mmHg rise in PaCO₂ when acute and about 3.5–4 when chronic, from about 24; in respiratory alkalosis it falls about 2 (acute) or 4–5 (chronic) per 10 mmHg fall, each ± 2. References vary in these coefficients, so a value just outside one estimate does not exclude that time course; fitting one estimate shows compatibility with it, not how long the current PaCO₂ has lasted, and prior compensated gases may reveal an acute change on chronic disease. Respiratory alkalosis alone rarely takes HCO₃⁻ below about 12–15 mEq/L, so a lower value raises an added metabolic acidosis. Acute buffering rarely raises HCO₃⁻ above about 30–32 mEq/L, and the respiratory-acidosis rules are bedside approximations for moderate hypercapnia (up to a PaCO₂ of about 80 here); beyond that no acute or chronic fit is claimed, and a high HCO₃⁻ may reflect chronic compensation, an acute change on chronic disease, or a metabolic component. The acute and chronic estimates are separate bands; which one a value fits is weighed with prior gases and the history, not read as the time course on its own. A compensating value outside the expected range, beyond it or short of it, suggests a mixed disorder; just outside it is borderline, because the rules are approximations. Compensation usually leaves a residual pH shift toward the original problem; it can bring the pH into 7.35–7.45, especially in milder or chronic disorders (for example, PaCO₂ 50 with HCO₃⁻ 28 gives a pH of about 7.37), but that alone does not exclude a mixed disorder.",
    "This diagram reads acid–base balance only. Oxygenation (PaO₂, SaO₂) is assessed separately: acid–base values in range do not mean the whole ABG is normal.",
  ],
  steps: [
    { key: "ph", desc: (p) => abgStepDesc("ph", p), focus: ["ph"], caption: "Start with pH, the net state of the blood. Below 7.35 is acidemia, above 7.45 is alkalemia. Exam materials often say acidosis and alkalosis, but those name the processes, and more than one can be at work. pH tells you the net state, not yet where it came from.",
      narration: "Start with the pH, the net state of the blood. Anything below seven point three five is acidemia. Anything above seven point four five is alkalemia. Exam materials often say acidosis and alkalosis, but those words name the processes, and more than one can be at work. The pH tells you the net state, not yet where it came from." },
    { key: "lungs", desc: (p) => abgStepDesc("lungs", p), focus: ["co2"], caption: "Now the lungs. CO₂ behaves like an acid, so a PaCO₂ above 45 pushes the blood toward acid. Notice its acid end is on the right, the opposite of the pH line.",
      narration: "Now look at the lungs. Carbon dioxide behaves like an acid, so a P-A-C-O-2 above forty-five pushes the blood toward acid. Notice that its acid end is on the right, the opposite way round from the pH line." },
    { key: "kidneys", desc: (p) => abgStepDesc("kidneys", p), focus: ["hco3"], caption: "Then the kidneys. Bicarbonate is a base: below 22 pushes toward acidosis, above 26 toward alkalosis. The actual pH depends on how it balances against PaCO₂.",
      narration: "Then the kidneys. Bicarbonate is a base. Below twenty-two pushes toward acidosis, and above twenty-six pushes toward alkalosis. The actual pH depends on how it balances against the P-A-C-O-2." },
    { key: "rome", desc: (p) => abgStepDesc("rome", p), focus: ["rome"], caption: "Find the value that matches the pH. ROME: Respiratory, pH and PaCO₂ move Opposite ways. Metabolic, pH and HCO₃⁻ move the Equal way. If both values push the pH the same way, both are primary: a combined disorder.",
      narration: "Now find the value that matches the pH, using ROME. Respiratory: the pH and P-A-C-O-2 move in opposite directions. Metabolic: the pH and bicarbonate move in the same direction. And if both values are pushing the pH the same way, both are primary problems: that is a combined disorder." },
    { key: "compensation", desc: (p) => abgStepDesc("compensation", p), focus: ["comp"], caption: "Compensation is the other system offsetting the first: its effect on pH opposes the first value's. In compensation PaCO₂ and HCO₃⁻ usually rise together or fall together, because a high PaCO₂ pushes toward acid and a high HCO₃⁻ toward base. NCLEX labels use the reference ranges: pH out with the other value still in range, uncompensated; pH out with the other value out of range, opposing, partially compensated; pH back in range with both values out of range and opposing effects on pH, fully compensated. With the pH in range and only one value out, compensation can't be established from these values. If both values push the pH the same way, it is a combined disorder, not compensation.",
      narration: "Compensation is the other system offsetting the first, so its effect on the pH opposes the first value's. In compensation, the P-A-C-O-2 and the bicarbonate usually rise together or fall together, because a high P-A-C-O-2 pushes toward acid and a high bicarbonate pushes toward base. The NCLEX labels use the reference ranges. If the pH is out of range and the other value is still in its range, it is called uncompensated. If the other value is out of its range, opposing, but the pH is still abnormal, it is partially compensated. If the pH is back in range and both values are out of range with opposing effects on the pH, it is fully compensated. With the pH in range and only one value out, compensation can't be established from these values. And if both values push the pH the same way, that is a combined disorder, not compensation." },
    { key: "limits", desc: (p) => abgStepDesc("limits", p), focus: ["rules"], caption: "Then check the expected compensation. Metabolic acidosis: PaCO₂ about 1.5 × HCO₃⁻ + 8, ± 2. Metabolic alkalosis: two rules are in use, PaCO₂ about 0.7 × HCO₃⁻ + 21 or 40 + 0.7 × (HCO₃⁻ − 24), each ± 2 (they differ by about 2), and rarely above about 55; a value fitting either counts. For respiratory disorders, start from PaCO₂ 40 and HCO₃⁻ 24. Respiratory acidosis: HCO₃⁻ ≈ 24 + k × ((PaCO₂ − 40) ÷ 10), with k about 1–2 if acute or 3.5–4 if chronic, ± 2. Respiratory alkalosis: HCO₃⁻ ≈ 24 − k × ((40 − PaCO₂) ÷ 10), with k about 2 if acute or 4–5 if chronic, ± 2. These are approximations that assume compensation is established: the respiratory-acidosis rules are used up to a PaCO₂ of about 80, acute buffering rarely raises HCO₃⁻ above about 30–32, and respiratory alkalosis alone rarely takes it below about 12–15. An acute change on top of chronic disease can fall between the acute and chronic estimates. With a normal pH, a normal pH alone doesn't identify the primary process: test each possible primary disorder against its expected compensation, and keep every one that fits. Well outside suggests a mixed disorder.",
      narration: "Then check the expected compensation. In metabolic acidosis, the P-A-C-O-2 should be about one and a half times the bicarbonate, plus eight, give or take two. In metabolic alkalosis, two rules are in use: about zero point seven times the bicarbonate, plus twenty-one, or forty plus zero point seven times the quantity, bicarbonate minus twenty-four. Each is give or take two, they differ by about two, and a value fitting either one counts. It rarely goes above about fifty-five. For respiratory disorders, start from a P-A-C-O-2 of forty and a bicarbonate of twenty-four. In respiratory acidosis, the bicarbonate rises from twenty-four by about one to two for every ten the P-A-C-O-2 is above forty when it's acute, and about three and a half to four when it's chronic, give or take two. In respiratory alkalosis, it falls from twenty-four by about two for every ten below forty when acute, and about four to five when chronic, give or take two. References vary in these numbers. These are approximations that assume compensation is established. The respiratory-acidosis rules are used up to a P-A-C-O-2 of about eighty. Acute buffering rarely raises the bicarbonate above about thirty to thirty-two, and respiratory alkalosis alone rarely takes it below about twelve to fifteen. An acute change on top of chronic disease can fall between the acute and chronic estimates. When the pH is in range, the pH alone doesn't tell you the primary process: test each possible primary disorder against its expected compensation, and keep every one that fits. A value well outside them suggests a mixed disorder." },
    { key: "worked", desc: (p) => abgStepDesc("worked", p), focus: ["ph", "co2", "hco3", "result"], dynamic: true, caption: null,
      narration: null },
  ],
  /* The worked-example step reads the actual values, so it is written by
     the same function that interprets them. */
  dynamicCaption: (params = ABG_EXAMPLE) => {
    const r = interpretAbg(params);
    return `Here: pH ${showAbg(params, "ph")}, PaCO₂ ${showAbg(params, "paco2")}, HCO₃⁻ ${showAbg(params, "hco3")}. ${r.reading}`;
  },
};
