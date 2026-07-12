/* Normal reference ranges for the in-app Lab Values drawer.
   Educational exam-prep reference only (CLAUDE.md rule 7) — standard
   NCLEX-review textbook values. Ranges vary slightly by lab and text;
   the drawer shows a "verify against your course materials" note. */

export const LAB_GROUPS = [
  {
    group: "Vital signs (adult)",
    rows: [
      ["Heart rate", "60–100 /min"],
      ["Respiratory rate", "12–20 /min"],
      ["Blood pressure", "< 120 / < 80 mm Hg"],
      ["Temperature", "36.1–37.2 °C (97–99 °F)"],
      ["SpO₂", "95–100%"],
      ["Pain", "self-report — the 5th vital sign"],
    ],
  },
  {
    group: "Electrolytes",
    rows: [
      ["Sodium (Na⁺)", "136–145 mEq/L"],
      ["Potassium (K⁺)", "3.5–5.0 mEq/L"],
      ["Calcium (Ca²⁺) total", "9.0–10.5 mg/dL"],
      ["Magnesium (Mg²⁺)", "1.3–2.1 mEq/L"],
      ["Phosphorus", "3.0–4.5 mg/dL"],
      ["Chloride (Cl⁻)", "98–106 mEq/L"],
    ],
  },
  {
    group: "ABG",
    rows: [
      ["pH", "7.35–7.45"],
      ["PaCO₂", "35–45 mm Hg"],
      ["HCO₃⁻", "21–28 mEq/L"],
      ["PaO₂", "80–100 mm Hg"],
      ["SaO₂", "95–100%"],
    ],
  },
  {
    group: "CBC",
    rows: [
      ["WBC", "5,000–10,000 /mm³"],
      ["RBC", "4.2–6.1 million/mm³"],
      ["Hemoglobin", "M 14–18 · F 12–16 g/dL"],
      ["Hematocrit", "M 42–52% · F 37–47%"],
      ["Platelets", "150,000–400,000 /mm³"],
    ],
  },
  {
    group: "Coagulation",
    rows: [
      ["PT", "11–12.5 s"],
      ["INR", "0.8–1.1 (warfarin goal 2.0–3.0)"],
      ["aPTT", "30–40 s (heparin goal 1.5–2× control)"],
      ["Fibrinogen", "170–340 mg/dL"],
    ],
  },
  {
    group: "Renal & glucose",
    rows: [
      ["BUN", "10–20 mg/dL"],
      ["Creatinine", "0.5–1.2 mg/dL"],
      ["Glucose (fasting)", "70–99 mg/dL"],
      ["HbA1c", "< 5.7% (diabetes goal < 7%)"],
      ["Urine specific gravity", "1.005–1.030"],
    ],
  },
  {
    group: "Liver & pancreas",
    rows: [
      ["ALT", "4–36 U/L"],
      ["AST", "0–35 U/L"],
      ["Total bilirubin", "0.3–1.0 mg/dL"],
      ["Albumin", "3.5–5.0 g/dL"],
      ["Ammonia", "10–80 mcg/dL"],
      ["Amylase", "30–220 U/L"],
      ["Lipase", "0–160 U/L"],
    ],
  },
  {
    group: "Cardiac & lipids",
    rows: [
      ["Troponin T", "< 0.1 ng/mL"],
      ["BNP", "< 100 pg/mL"],
      ["Total cholesterol", "< 200 mg/dL"],
      ["LDL", "< 100 mg/dL"],
      ["HDL", "M > 40 · F > 50 mg/dL"],
      ["Triglycerides", "< 150 mg/dL"],
    ],
  },
  {
    group: "Therapeutic drug levels",
    rows: [
      ["Digoxin", "0.5–2.0 ng/mL"],
      ["Lithium", "0.6–1.2 mEq/L"],
      ["Phenytoin", "10–20 mcg/mL"],
      ["Theophylline", "10–20 mcg/mL"],
      ["Vancomycin (trough)", "10–20 mcg/mL"],
      ["Magnesium sulfate (OB)", "4–7 mEq/L"],
    ],
  },
];
