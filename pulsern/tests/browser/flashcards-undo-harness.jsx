/* The shipped Flashcards screen, with schedule, XP, and the daily
   new-card ledger kept where a test can read them after each click. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Flashcards, Style } from "../../src/App.jsx";
import { todayStr } from "../../src/dates.js";
import { newCardAllowance, noteNewCard, refundNewCard } from "../../src/srs.js";

const today = todayStr();
const INITIAL = {
  old: { interval: 3, due: today, seen: "2020-01-01" },
};
const CARDS = [
  { id: "fresh", cat: "Pharmacology", topic: "Digoxin", front: "FRESH CARD", back: "fresh answer" },
  { id: "old", cat: "Pharmacology", topic: "Digoxin", front: "OLD CARD", back: "old answer" },
];

function Host() {
  const [srs, setSrs] = useState(INITIAL);
  const [xp, setXp] = useState(0);
  const [fcNew, setFcNew] = useState({ day: null, count: 0 });
  window.__snap = { srs, xp, fcNew };
  return (
    <div className="app" data-theme="light">
      <Style />
      <Flashcards
        addXp={(n) => setXp((x) => x + n)}
        cards={CARDS}
        srsMap={srs}
        setSrsMap={setSrs}
        touchDay={() => {}}
        ready
        fcFlips={99}
        onFlip={() => {}}
        newAllowance={newCardAllowance(fcNew, today)}
        onNewCard={(id) => setFcNew((f) => noteNewCard(f, today, id))}
        onRefundNewCard={(id) => setFcNew((f) => refundNewCard(f, today, id))}
      />
    </div>
  );
}

localStorage.setItem("pulsern.readAloud.v1", JSON.stringify({ auto: false, rate: 1 }));
createRoot(document.getElementById("host")).render(<Host />);
window.T = { ready: true, initial: INITIAL };
