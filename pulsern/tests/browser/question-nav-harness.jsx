/* Practice Back / Next / Skip, mounted in a real browser.
   The voice route and the device voice are stood in for, the same way the
   read-aloud harness does, so a move can be heard stopping the old question
   and starting the new one. Stats on the page are whatever QBank actually
   recorded: a skip must leave them alone. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Flashcards, QBank, CaseStudy, Style } from "../../src/App.jsx";
import { Tour, useTourDismissScroll, useTourPlacement } from "../../src/tour.jsx";
import { blocksOverlap, scrollTourTarget } from "../../src/tour.js";
import { emptyAbility, updateAbility } from "../../src/ability-engine.js";
import { updateMissSchedule } from "../../src/question-review.js";

const env = { spoken: [], cancels: 0 };

class FakeAudio {
  constructor() { this.paused = true; this.dataset = {}; this.playbackRate = 1; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
window.Audio = FakeAudio;

try {
  const synth = window.speechSynthesis;
  const define = (name, value) => Object.defineProperty(synth, name, { configurable: true, writable: true, value });
  define("speak", (utterance) => {
    const text = String(utterance?.text ?? "");
    setTimeout(() => {
      if (text) env.spoken.push(text);
      env.live = utterance;
      utterance.onstart?.({});
    }, 0);
  });
  define("cancel", () => {
    env.cancels += 1;
    const live = env.live;
    env.live = null;
    if (live) live.onerror?.({ error: "interrupted" });
  });
  define("getVoices", () => [{ lang: "en-US", localService: true, name: "Test voice" }]);
  define("resume", () => {});
} catch { /* speechSynthesis is not replaceable here */ }

window.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });

const QS = [1, 2, 3, 4, 5, 6].map((id) => ({
  id,
  cat: "Pharmacology",
  diff: 1,
  type: "mc",
  stem: `STEM${id} Which action is the priority for this client right now?`,
  options: ["Alpha choice", "Beta choice", "Gamma choice", "Delta choice"],
  answer: 0,
  rationale: `RATIONALE${id} Alpha choice is the priority because it treats the immediate risk.`,
}));
const calibration = Object.fromEntries(QS.map((item) => [item.id, { rating: 1200 }]));

const CASE = {
  title: "Navigation Case",
  cat: "Pharmacology",
  blurb: "A short case used to move between steps.",
  intro: "0730. A client is on the medical unit this morning and needs a decision from the nurse.",
  vitals: [["HR", "88/min"]],
  labs: [["K", "4.0 mEq/L"]],
  note: "Awake and talking. No distress noted on arrival to the unit this morning.",
  steps: [0, 1, 2].map((i) => ({
    phase: "Take Action",
    type: "mc",
    stem: `CASESTEP${i} Which action should the nurse take first for this client?`,
    options: ["First action", "Second action", "Third action", "Fourth action"],
    answer: 0,
    rationale: `CASERATIONALE${i} First action is the priority because it addresses the immediate risk.`,
  })),
};

function Practice({ auto = false }) {
  const [log, setLog] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [ability, setAbility] = useState(() => emptyAbility(["Pharmacology"]));
  const record = (item, correct) => {
    setLog((rows) => [...rows, { id: item.id, correct }]);
    setSchedule((s) => updateMissSchedule(s, item.id, correct));
    setAbility((a) => updateAbility(a, item, correct).ability);
  };
  const correct = log.filter((row) => row.correct).length;
  return (
    <>
      <p data-testid="stats">
        {`${log.length} recorded, ${correct} correct, ${log.length - correct} wrong, theta ${ability.Pharmacology.theta.toFixed(6)}, schedule ${Object.keys(schedule).length}`}
      </p>
      <QBank record={record} log={log} questions={QS} calibration={calibration} ability={ability} auto={auto} />
    </>
  );
}

function CasePractice() {
  const [log, setLog] = useState([]);
  const record = (item, correct) => setLog((rows) => [...rows, { id: item.id, correct }]);
  const correct = log.filter((row) => row.correct).length;
  return (
    <>
      <p data-testid="stats">{`${log.length} recorded, ${correct} correct, ${log.length - correct} wrong`}</p>
      <CaseStudy record={record} cases={[CASE]} />
    </>
  );
}

function TourFrame({ step, children }) {
  const [tab, setTab] = useState("today");
  useTourPlacement(step, tab, setTab);
  return (
    <div className="app" data-theme="light">
      <Style />
      <header className="top"><span className="brand-name">PULSERN</span></header>
      <main className="body">
        {children}
        <div className="tour-scroll-room" aria-hidden="true" />
      </main>
      <Tour step={step} activating={false} onBack={() => {}} onNext={() => {}} onSkip={() => {}} onHome={() => {}} onAnswer={() => {}} />
    </div>
  );
}

function TourPractice() {
  const [ability] = useState(() => emptyAbility(["Pharmacology"]));
  return (
    <TourFrame step={3}>
      <QBank record={() => {}} log={[]} questions={QS} calibration={calibration} ability={ability} tourFocus="qbank" />
    </TourFrame>
  );
}

function TourCards() {
  const [srs, setSrs] = useState({});
  return (
    <TourFrame step={6}>
      <Flashcards
        addXp={() => {}}
        cards={[{ id: "c1", cat: "Pharmacology", topic: "Digoxin", front: "Hold digoxin if the apical pulse is below this rate.", back: "60 per minute" }]}
        srsMap={srs}
        setSrsMap={setSrs}
        touchDay={() => {}}
        tourFocus="cards"
      />
    </TourFrame>
  );
}

function TourSkipHome() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState("stats");
  const [token, setToken] = useState(0);
  useTourDismissScroll(token, open, tab);
  useTourPlacement(open ? 7 : null, tab, setTab);
  const skip = () => {
    setOpen(false);
    setTab("today");
    setToken((n) => n + 1);
  };
  return (
    <div className="app" data-theme="light">
      <Style />
      <header className="top"><span className="brand-name">PULSERN</span></header>
      <main className="body">
        {tab === "today" ? (
          <>
            <button type="button">Start today's round</button>
            <div style={{ height: 1800 }} />
          </>
        ) : (
          <section className="card tour-target" data-tour="stats" style={{ marginTop: 1600 }}>
            <h2 className="h2">Stats performance</h2>
          </section>
        )}
        {open && <div className="tour-scroll-room" aria-hidden="true" />}
      </main>
      {open && <Tour step={7} activating={false} onBack={() => {}} onNext={() => {}} onSkip={skip} onHome={() => {}} onAnswer={() => {}} />}
    </div>
  );
}

function TourClearance() {
  return (
    <div className="app" data-theme="light">
      <Style />
      <header className="top"><span className="brand-name">PULSERN</span></header>
      <main className="body">
        <div className="stack">
          <section className="card">
            <div style={{ height: 720 }} />
            <div className="row tour-target" data-tour="qbank-review">
              <button type="button" className="btn">New questions</button>
              <button type="button" className="btn ghost">Review misses (3)</button>
            </div>
          </section>
        </div>
        <div className="tour-scroll-room" aria-hidden="true" />
      </main>
      <Tour step={4} activating={false} onBack={() => {}} onNext={() => {}} onSkip={() => {}} onHome={() => {}} onAnswer={() => {}} />
    </div>
  );
}

const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 15)); };
const root = createRoot(document.getElementById("host"));

window.T = {
  async mountPractice(auto = false) {
    localStorage.setItem("pulsern.readAloud.v1", JSON.stringify({ auto: false, rate: 1 }));
    env.spoken.length = 0;
    env.cancels = 0;
    root.render(<div className="app"><Style /><Practice auto={auto} /></div>);
    await settle();
  },
  async mountSpeaking() {
    localStorage.setItem("pulsern.readAloud.v1", JSON.stringify({ auto: true, rate: 1 }));
    env.spoken.length = 0;
    env.cancels = 0;
    root.render(<div className="app"><Style /><Practice /></div>);
    await settle();
  },
  async mountTourSkip() {
    root.render(<TourSkipHome />);
    await settle();
  },
  async mountTourClearance() {
    root.render(<TourClearance />);
    await settle();
    const target = document.querySelector("[data-tour=qbank-review]");
    const sheet = document.querySelector(".tour-overlay:not(.leave-overlay) .tour-card");
    scrollTourTarget(target, sheet, document.querySelector(".top"));
    await settle();
    const targetBox = target.getBoundingClientRect();
    const sheetBox = sheet.getBoundingClientRect();
    window.T._clear = !blocksOverlap(targetBox, sheetBox) && targetBox.bottom <= sheetBox.top;
  },
  tourClearance: () => window.T._clear,
  async mountTourPractice() {
    root.render(<TourPractice />);
    await settle();
  },
  async mountTourCards() {
    root.render(<TourCards />);
    await settle();
  },
  tourBox(focus) {
    const target = document.querySelector(`[data-tour="${focus}"]`);
    const sheet = document.querySelector(".tour-overlay:not(.leave-overlay) .tour-card");
    const header = document.querySelector(".top");
    if (!target || !sheet || !header) return null;
    const box = target.getBoundingClientRect();
    return {
      text: target.innerText,
      top: box.top,
      bottom: box.bottom,
      headerBottom: header.getBoundingClientRect().bottom,
      sheetTop: sheet.getBoundingClientRect().top,
    };
  },
  async mountCase() {
    localStorage.setItem("pulsern.readAloud.v1", JSON.stringify({ auto: false, rate: 1 }));
    root.render(<div className="app"><Style /><CasePractice /></div>);
    await settle();
  },
  stats: () => document.querySelector("[data-testid=stats]")?.textContent ?? "",
  stem: () => document.querySelector(".stem")?.textContent ?? "",
  spoken: () => [...env.spoken],
  cancels: () => env.cancels,
};
window.T.ready = true;
