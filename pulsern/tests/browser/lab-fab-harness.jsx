/* A practice question with the shipped floating 🧪 button and study
   toolkit on top, so drag, settle, open, and the AI lookup can be checked
   in a real browser at phone and desktop sizes. */
import React, { useEffect, useRef, useState } from "react";
import { useStudyKeys } from "../../src/study-keys.js";
import { createRoot } from "react-dom/client";
import { Style, Toolkit } from "../../src/App.jsx";
import { LabFab } from "../../src/lab-fab.jsx";
import { FocusBar } from "../../src/focus-sheet.jsx";
import { QuestionNav } from "../../src/question-nav.jsx";

const OPTIONS = ["Alpha choice", "Beta choice", "Gamma choice", "Delta choice"];

function Screen() {
  const [pick, setPick] = useState(null);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("labs");
  const [focusOpen, setFocusOpen] = useState(false);
  const [stemText, setStemText] = useState("Which client should the nurse see first? STEM-ONE The finding that decides priority is written out to the end of this line.");
  const [checked, setChecked] = useState(false);
  const keys = useRef({});
  useStudyKeys(keys);
  /* Picks and Check answer stay live while the toolkit is open. The study
     shortcut guard is what stops them; this fixture must not. */
  keys.current = {
    pick: (i) => { if (i < OPTIONS.length) setPick(i); },
    primary: () => setChecked(true),
  };
  const [crowded, setCrowded] = useState(true);
  useEffect(() => {
    window.T.setStem = setStemText;
    window.T.setCrowded = setCrowded;
    window.T.checked = checked;
    window.T.pick = pick;
  }, [checked, pick]);
  return (
    <div className="app tab-qbank in-session" data-theme={window.__theme || "light"}>
      <Style />
      <header className="top"><span className="brand-name">PULSERN</span></header>
      <main className="body">
        <FocusBar open={focusOpen} setOpen={setFocusOpen} groups={[{ label: "Category", options: [["pharm", "Pharmacology"]], selected: [], onToggle() {} }]} />
        <section className="card stack study-col">
          <p className="stem">{stemText}</p>
          <div className="ngn-matrix" role="group" aria-label="Answer grid">
            <div className="mx-row"><span className="small">Continuous bubbling in the water seal</span></div>
          </div>
          <div className="exh-wrap">
            <svg className="exh-svg" viewBox="0 0 340 80" role="img" aria-label="ECG strip">
              <path d="M0,40 L80,40 L90,20 L100,60 L110,40 L340,40" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <figure>
            <img alt="Medication label" width="160" height="48" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='48'%3E%3Crect width='160' height='48' fill='%23e7f3ef'/%3E%3Ctext x='80' y='28' text-anchor='middle' font-size='14'%3EDrug 2 mg/mL%3C/text%3E%3C/svg%3E" />
          </figure>
          <table><tbody><tr><td>Na 140</td><td>K 4.0</td></tr></tbody></table>
          {crowded && OPTIONS.map((o, i) => (
            <button key={o} type="button" role="radio" aria-checked={pick === i} className={pick === i ? "opt picked" : "opt"} onClick={() => setPick(i)}>{o}</button>
          ))}
          {crowded && <button type="button" className="btn" disabled={pick == null}>Check answer</button>}
          {crowded && <p className="rationale"><strong>Rationale.</strong> Beta choice treats the immediate risk and is the priority.</p>}
          {crowded && <div className="chart mono"><span className="chip">HR 88/min</span><span className="chip lab">K 4.0 mEq/L</span></div>}
          {crowded && <QuestionNav canBack={false} skipped={0} onBack={() => {}} onSkip={() => {}} onNext={() => {}} onReview={() => {}} nextPrimary={false} />}
        </section>
      </main>
      <nav className="tabs" aria-label="Sections">
        {["Today", "Practice", "Cases", "Cards", "Stats"].map((t) => <button key={t} type="button" className={t === "Practice" ? "tab on" : "tab"}>{t}</button>)}
      </nav>
      <LabFab hidden={open} open={open} onOpen={() => { setSection("labs"); setOpen(true); }} />
      <Toolkit open={open} section={section} onSection={setSection} onClose={() => setOpen(false)} provider="deepseek" />
    </div>
  );
}

window.T = { ready: true, setStem() {} };
createRoot(document.getElementById("host")).render(<Screen />);
