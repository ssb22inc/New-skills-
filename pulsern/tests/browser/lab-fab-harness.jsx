/* A practice question with the shipped floating 🧪 button and study
   toolkit on top, so drag, settle, open, and the AI lookup can be checked
   in a real browser at phone and desktop sizes. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Style, Toolkit } from "../../src/App.jsx";
import { LabFab } from "../../src/lab-fab.jsx";
import { QuestionNav } from "../../src/question-nav.jsx";

const OPTIONS = ["Alpha choice", "Beta choice", "Gamma choice", "Delta choice"];

function Screen() {
  const [pick, setPick] = useState(null);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("labs");
  return (
    <div className="app tab-qbank in-session" data-theme={window.__theme || "light"}>
      <Style />
      <header className="top"><span className="brand-name">PULSERN</span></header>
      <main className="body">
        <section className="card stack study-col">
          <p className="stem">Which client should the nurse see first? STEM-ONE</p>
          {OPTIONS.map((o, i) => (
            <button key={o} type="button" role="radio" aria-checked={pick === i} className={pick === i ? "opt picked" : "opt"} onClick={() => setPick(i)}>{o}</button>
          ))}
          <button type="button" className="btn" disabled={pick == null}>Check answer</button>
          <QuestionNav canBack={false} skipped={0} onBack={() => {}} onSkip={() => {}} onNext={() => {}} onReview={() => {}} nextPrimary={false} />
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

createRoot(document.getElementById("host")).render(<Screen />);
window.T = { ready: true };
