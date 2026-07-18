/* Pedagogical exhibits (RN pack prompt 8) — hand-drawn inline SVG in the
   app palette. No stock photos, no copied images. Each visual carries a
   `describe` string: the adversarial reviewer audits item↔visual pairings
   through these descriptions, per the owner's accuracy amendment. */
import React from "react";

/* ---- ECG strips: one heartbeat drawn as a path, repeated across the strip ---- */
function beatPath(x, kind) {
  // 60px-wide beat starting at x, baseline y=40
  switch (kind) {
    case "nsr":
      return `M${x},40 q3,-6 6,0 l6,0 l3,8 l4,-26 l4,22 l3,-4 l6,0 q5,-9 10,0 l18,0`;
    case "hyperk": // flattened P, tall narrow peaked T
      return `M${x},40 q3,-3 6,0 l6,0 l3,7 l4,-24 l4,20 l3,-3 l4,0 l7,-26 l7,26 l16,0`;
    case "stemi": // ST segment elevated ~8px above baseline before T
      return `M${x},40 q3,-6 6,0 l5,0 l3,8 l4,-26 l4,16 l2,-6 l12,0 q6,-8 12,2 l12,4`;
    case "afib": // no P, fibrillatory baseline, irregular R spacing handled by caller
      return `M${x},40 q2,-2 4,1 q2,-3 4,1 q2,-2 4,1 l2,7 l4,-25 l4,21 q2,-2 4,1 q2,-3 4,1 q3,-8 8,0 q2,-2 4,1 q2,-3 4,1 l12,-1`;
    default:
      return "";
  }
}
export function EcgStrip({ rhythm = "nsr" }) {
  const beats =
    rhythm === "torsades"
      ? null // torsades is drawn as a continuous twisting sine, not beats
      : rhythm === "afib"
        ? [0, 52, 118, 162, 228, 286].map((x) => beatPath(x, "afib")) // irregularly irregular
        : [0, 60, 120, 180, 240, 300].map((x) => beatPath(x, rhythm));
  let torsades = "";
  if (rhythm === "torsades") {
    const pts = [];
    for (let x = 0; x <= 340; x += 4) {
      const env = 6 + 16 * Math.abs(Math.sin(x / 55)); // twisting amplitude envelope
      pts.push(`${x},${40 - env * Math.sin(x / 7)}`);
    }
    torsades = "M" + pts.join(" L");
  }
  return (
    <svg viewBox="0 0 340 80" className="exh-svg" role="img" aria-label={`ECG strip: ${rhythm}`}>
      {[...Array(18)].map((_, i) => <line key={"v" + i} x1={i * 20} y1="0" x2={i * 20} y2="80" stroke="var(--line)" strokeWidth="0.5" />)}
      {[...Array(5)].map((_, i) => <line key={"h" + i} x1="0" y1={i * 20} x2="340" y2={i * 20} stroke="var(--line)" strokeWidth="0.5" />)}
      <path d={rhythm === "torsades" ? torsades : beats.join(" ")} fill="none" stroke="var(--teal)" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

/* ---- chest tube: 3-chamber drainage system ---- */
export function ChestTube() {
  const box = (x, label, sub, fillY) => (
    <g key={label}>
      <rect x={x} y="18" width="86" height="74" rx="6" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.4" />
      <rect x={x + 4} y={fillY} width="78" height={88 - fillY} rx="3" fill="var(--teal)" opacity="0.3" />
      <text x={x + 43} y="104" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--ink)">{label}</text>
      <text x={x + 43} y="115" textAnchor="middle" fontSize="8.5" fill="var(--muted)">{sub}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 340 122" className="exh-svg" role="img" aria-label="Three-chamber chest tube drainage system">
      <path d="M10,8 L38,8 L38,18" fill="none" stroke="var(--ink)" strokeWidth="2" />
      <text x="10" y="6" fontSize="8.5" fill="var(--muted)">from client</text>
      <path d="M120,12 L156,12 L156,18 M240,12 L272,12 L272,18 M330,8 L306,8 L306,18" fill="none" stroke="var(--ink)" strokeWidth="1.4" />
      <text x="330" y="6" fontSize="8.5" fill="var(--muted)" textAnchor="end">to suction</text>
      {box(14, "1 · COLLECTION", "drainage from client", 62)}
      {box(128, "2 · WATER SEAL", "2 cm — one-way valve", 74)}
      {box(242, "3 · SUCTION CONTROL", "−20 cm H₂O", 58)}
    </svg>
  );
}

/* ---- PPE donning order ---- */
export function PpeDonning() {
  const steps = ["1 · GOWN", "2 · MASK / RESPIRATOR", "3 · GOGGLES / FACE SHIELD", "4 · GLOVES"];
  return (
    <svg viewBox="0 0 340 60" className="exh-svg" role="img" aria-label="PPE donning order: gown, mask, goggles, gloves">
      {steps.map((s, i) => (
        <g key={s}>
          <rect x={4 + i * 86} y="14" width={i === 0 ? 62 : 78} height="30" rx="8" fill="var(--pick-bg)" stroke="var(--teal)" strokeWidth="1.3" />
          <text x={4 + i * 86 + (i === 0 ? 31 : 39)} y="32" textAnchor="middle" fontSize={i === 0 ? "9.5" : "7.6"} fontWeight="700" fill="var(--accent-ink)">{s}</text>
          {i < 3 && <text x={i === 0 ? 70 : 84 + i * 86} y="33" fontSize="12" fill="var(--muted)">→</text>}
        </g>
      ))}
      <text x="170" y="56" textAnchor="middle" fontSize="8.5" fill="var(--muted)">Doffing reverses inside the room except gown+gloves first</text>
    </svg>
  );
}

/* ---- insulin mixing: clear before cloudy ---- */
export function InsulinMixing() {
  const steps = [
    ["1", "Air into NPH", "(cloudy) — don't touch insulin"],
    ["2", "Air into Regular", "(clear)"],
    ["3", "Draw up Regular", "CLEAR first"],
    ["4", "Draw up NPH", "cloudy second"],
  ];
  return (
    <svg viewBox="0 0 340 76" className="exh-svg" role="img" aria-label="Insulin mixing steps: air into NPH, air into regular, draw regular, draw NPH">
      {steps.map(([n, t, sub], i) => (
        <g key={n}>
          <circle cx={28 + i * 86} cy="24" r="12" fill="var(--teal)" opacity="0.85" />
          <text x={28 + i * 86} y="28" textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--btn-ink)">{n}</text>
          <text x={28 + i * 86} y="50" textAnchor="middle" fontSize="8.2" fontWeight="700" fill="var(--ink)">{t}</text>
          <text x={28 + i * 86} y="61" textAnchor="middle" fontSize="7.4" fill="var(--muted)">{sub}</text>
          {i < 3 && <text x={66 + i * 86} y="28" fontSize="12" fill="var(--muted)">→</text>}
        </g>
      ))}
    </svg>
  );
}

/* ---- fetal strip: late decelerations ---- */
export function FetalStrip() {
  // contractions (toco): three humps; FHR dips begin AFTER each peak (late)
  const toco = "M0,108 " + [40, 150, 260].map((c) => `L${c - 32},108 Q${c},78 ${c + 32},108`).join(" ") + " L340,108";
  const fhr = "M0,30 " + [64, 174, 284].map((c) => `L${c - 24},30 Q${c},52 ${c + 26},30`).join(" ") + " L340,30";
  return (
    <svg viewBox="0 0 340 120" className="exh-svg" role="img" aria-label="Fetal monitor strip showing late decelerations: FHR dips after each contraction peak">
      {[...Array(18)].map((_, i) => <line key={i} x1={i * 20} y1="0" x2={i * 20} y2="120" stroke="var(--line)" strokeWidth="0.5" />)}
      <text x="4" y="12" fontSize="8.5" fill="var(--muted)">FHR</text>
      <path d={fhr} fill="none" stroke="var(--coral)" strokeWidth="1.8" />
      <text x="4" y="90" fontSize="8.5" fill="var(--muted)">CONTRACTIONS</text>
      <path d={toco} fill="none" stroke="var(--teal)" strokeWidth="1.8" />
      <line x1="150" y1="78" x2="174" y2="52" stroke="var(--amber)" strokeWidth="1.2" strokeDasharray="3 2" />
      <text x="178" y="66" fontSize="8" fill="var(--amber)">nadir AFTER peak</text>
    </svg>
  );
}

/* ---- medication label for dosage-calc items ---- */
export function MedLabel({ drug = "", conc = "", volume = "" }) {
  return (
    <svg viewBox="0 0 340 84" className="exh-svg" role="img" aria-label={`Medication label: ${drug}, ${conc}, ${volume}`}>
      <rect x="30" y="6" width="280" height="72" rx="8" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.6" />
      <rect x="30" y="6" width="280" height="20" rx="8" fill="var(--teal)" opacity="0.9" />
      <text x="170" y="20" textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--btn-ink)">{drug}</text>
      <text x="170" y="46" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--ink)" fontFamily="'IBM Plex Mono',monospace">{conc}</text>
      <text x="170" y="66" textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="'IBM Plex Mono',monospace">Total volume: {volume} · For educational use only</text>
    </svg>
  );
}

/* ---- registry: id → component + audit description ---- */
export const VISUALS = {
  "ecg-nsr":      { render: () => <EcgStrip rhythm="nsr" />,      describe: "ECG strip: normal sinus rhythm — regular rhythm, upright P before every narrow QRS, normal T waves" },
  "ecg-hyperk":   { render: () => <EcgStrip rhythm="hyperk" />,   describe: "ECG strip: tall, narrow, peaked T waves with flattened P waves — classic hyperkalemia pattern" },
  "ecg-stemi":    { render: () => <EcgStrip rhythm="stemi" />,    describe: "ECG strip: ST segments elevated above baseline after the QRS — ST-elevation pattern" },
  "ecg-torsades": { render: () => <EcgStrip rhythm="torsades" />, describe: "ECG strip: polymorphic ventricular tachycardia with QRS amplitude twisting around the baseline — torsades de pointes" },
  "ecg-afib":     { render: () => <EcgStrip rhythm="afib" />,     describe: "ECG strip: irregularly irregular rhythm, no discernible P waves, fibrillatory baseline — atrial fibrillation" },
  "chest-tube":   { render: () => <ChestTube />,                  describe: "Diagram: 3-chamber chest drainage — chamber 1 collection (from client), chamber 2 water seal at 2 cm (one-way valve), chamber 3 suction control at -20 cm H2O (to suction)" },
  "ppe-donning":  { render: () => <PpeDonning />,                 describe: "Diagram: PPE donning order 1 gown, 2 mask/respirator, 3 goggles/face shield, 4 gloves" },
  "insulin-mix":  { render: () => <InsulinMixing />,              describe: "Diagram: mixing insulins — 1 air into NPH (cloudy), 2 air into Regular (clear), 3 draw up Regular first (clear before cloudy), 4 draw up NPH" },
  "fetal-late":   { render: () => <FetalStrip />,                 describe: "Fetal monitor strip: uniform FHR decelerations whose nadir occurs AFTER each contraction peak — late decelerations (uteroplacental insufficiency)" },
};

/* Render a question's visual exhibit. spec: "id" or {kind:"med-label", drug, conc, volume}. */
export function ExhibitVisual({ spec }) {
  if (!spec) return null;
  if (typeof spec === "string") return VISUALS[spec] ? <div className="exh-wrap">{VISUALS[spec].render()}</div> : null;
  if (spec.kind === "med-label") return <div className="exh-wrap"><MedLabel drug={spec.drug} conc={spec.conc} volume={spec.volume} /></div>;
  return null;
}
