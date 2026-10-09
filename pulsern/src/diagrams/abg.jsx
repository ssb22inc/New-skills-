/* ABG interpretation — the ROME method, with compensation.
   ------------------------------------------------------------------
   The interpretation is COMPUTED, never drawn by hand: interpretAbg() is a
   pure function (CLAUDE.md rule 6) tested against textbook cases, and the
   diagram only renders what it returns. So the same drawing can show any
   question's values and can never label a blood gas wrongly by accident.

   Reference ranges used (standard adult arterial values taught for NCLEX):
     pH 7.35–7.45 · PaCO₂ 35–45 mmHg · HCO₃⁻ 22–26 mEq/L */
import React from "react";
import { Frame, G, T, Gauge, Chip, Arrow, Box, C } from "./kit.jsx";

export const ABG_RANGES = {
  ph: { lo: 7.35, hi: 7.45 },
  paco2: { lo: 35, hi: 45 },
  hco3: { lo: 22, hi: 26 },
};

const side = (v, { lo, hi }, belowMeans, aboveMeans) => (v < lo ? belowMeans : v > hi ? aboveMeans : "normal");

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
        return { disorder: "indeterminate", primary: null, compensation: "full",
          reading: "Fully compensated, but a pH of exactly 7.40 does not show which disorder came first." };
      }
      const want = ph < 7.4 ? "acid" : "base";
      const primary = co2 === want ? "respiratory" : "metabolic";
      const kind = want === "acid" ? "acidosis" : "alkalosis";
      return { disorder: `${primary} ${kind}`, primary, compensation: "full",
        reading: `${cap(primary)} ${kind}, fully compensated — pH is back in range, leaning ${want === "acid" ? "acidic (below 7.40)" : "alkaline (above 7.40)"}.` };
    }
    return { disorder: "inconsistent", primary: null, compensation: null,
      reading: "This pattern does not fit a single disorder — recheck the values or consider a mixed disorder." };
  }

  const want = phState === "acidosis" ? "acid" : "base";
  const respMatches = co2 === want;
  const metMatches = bicarb === want;

  if (respMatches && metMatches) {
    return { disorder: `combined respiratory and metabolic ${phState}`, primary: "both", compensation: "none",
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
  return {
    disorder: `${primary} ${phState}`, primary, compensation,
    reading: compensation === "none"
      ? `${cap(primary)} ${phState}, uncompensated — ${otherName} is still normal.`
      : `${cap(primary)} ${phState}, partially compensated — ${otherName} has moved to offset it, but pH is still out of range.`,
  };
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export const ABG_EXAMPLE = { ph: 7.3, paco2: 55, hco3: 24 };

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
    : `${cap(r.disorder)}${r.compensation === "none" ? " · uncompensated" : r.compensation === "partial" ? " · partly compensated" : r.compensation === "full" ? " · fully compensated" : ""}`;
  return (
    <Frame h={420} focus={focus} title="Reading an arterial blood gas"
      desc={concept
        ? "Method: pH normal 7.35 to 7.45; PaCO2 normal 35 to 45 mmHg, high means acid; HCO3 normal 22 to 26 mEq/L, low means acid. Match the value that moves with the pH: respiratory opposite, metabolic equal."
        : `pH ${params.ph} (normal 7.35 to 7.45), PaCO2 ${params.paco2} mmHg (35 to 45, high means acid), HCO3 ${params.hco3} mEq/L (22 to 26, low means acid). ${r.reading}`}>
      <G id="ph">
        <Gauge x={20} y={56} w={320} min={7.1} max={7.7} lo={7.35} hi={7.45} value={concept ? null : params.ph} decimals={2}
          label="1  pH — what is the problem?" leftLabel="ACIDOSIS" rightLabel="ALKALOSIS" leftColor="coral" rightColor="coral" />
      </G>
      <G id="co2">
        <Gauge x={20} y={138} w={320} min={20} max={70} lo={35} hi={45} value={concept ? null : params.paco2} unit="mmHg"
          label="2  PaCO₂ — lungs · CO₂ is an acid" leftLabel="BASE" rightLabel="ACID ▸" rightColor="coral" />
      </G>
      <G id="hco3">
        <Gauge x={20} y={220} w={320} min={12} max={36} lo={22} hi={26} value={concept ? null : params.hco3} unit="mEq/L"
          label="3  HCO₃⁻ — kidneys · a base" leftLabel="◂ ACID" rightLabel="BASE" leftColor="coral" />
      </G>
      <G id="rome">
        <Box x={20} y={258} w={320} h={72} r={10} fill={C.surface} />
        <T x={32} y={279} size={12} weight={700}>4  Match the pH — ROME</T>
        <T x={32} y={302} size={12}><tspan fontWeight={700} fill={C.accent}>R</tspan>espiratory <tspan fontWeight={700} fill={C.accent}>O</tspan>pposite</T>
        <Updown x={214} y={302} label="pH" dir="down" />
        <Updown x={262} y={302} label="PaCO₂" dir="up" />
        <T x={32} y={322} size={12}><tspan fontWeight={700} fill={C.accent}>M</tspan>etabolic <tspan fontWeight={700} fill={C.accent}>E</tspan>qual</T>
        <Updown x={214} y={322} label="pH" dir="down" />
        <Updown x={262} y={322} label="HCO₃⁻" dir="down" />
      </G>
      <G id="result">
        <Chip x={180} y={360} text={label} color={bad ? "coral" : "teal"} size={12} />
      </G>
      <G id="comp">
        <T x={180} y={386} size={10.5} anchor="middle" color={C.muted}>Other value still normal → uncompensated</T>
        <T x={180} y={401} size={10.5} anchor="middle" color={C.muted}>Moved, pH still out of range → partial</T>
        <T x={180} y={416} size={10.5} anchor="middle" color={C.muted}>pH back in range → fully compensated</T>
      </G>
    </Frame>
  );
}

/* "pH ↓" as text plus a small drawn arrow — glyph arrows render at
   different sizes in different fonts, a drawn one does not. */
function Updown({ x, y, label, dir }) {
  const ax = x + label.length * 6.9 + 6;
  const top = y - 10, bot = y + 1;
  return (
    <g>
      <T x={x} y={y} size={11} color={C.muted} mono>{label}</T>
      <path d={dir === "up" ? `M${ax},${bot} V${top + 3} M${ax - 3.5},${top + 6.5} L${ax},${top} L${ax + 3.5},${top + 6.5}`
                            : `M${ax},${top} V${bot - 3} M${ax - 3.5},${bot - 6.5} L${ax},${bot} L${ax + 3.5},${bot - 6.5}`}
        fill="none" stroke={C.coral} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
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
    { key: "compensation", focus: ["comp", "result"], caption: "Compensation is the other system pushing back. Still normal: uncompensated. Moved, but pH still out of range: partially compensated. pH back in range: fully compensated.",
      narration: "Compensation is the other system pushing back. If it is still normal, the disorder is uncompensated. If it has moved but the pH is still out of range, it is partially compensated. And if the pH is back in range, it is fully compensated." },
  ],
  /* The worked-example step reads the actual values, so it is written by
     the same function that interprets them. */
  dynamicCaption: (params = ABG_EXAMPLE) => {
    const r = interpretAbg(params);
    return `Here: pH ${params.ph.toFixed(2)}, PaCO₂ ${params.paco2}, HCO₃⁻ ${params.hco3}. ${r.reading}`;
  },
};
