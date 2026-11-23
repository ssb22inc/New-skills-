/* Cards Back / Skip / Next, with the labs button and the tab bar on screen
   so a phone layout can be measured. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Flashcards, Style } from "../../src/App.jsx";

const DECK = [
  { id: "c1", cat: "Pharmacology", topic: "Digoxin", front: "Card one front", back: "Card one back" },
  { id: "c2", cat: "Pharmacology", topic: "Warfarin", front: "Card two front", back: "Card two back" },
  { id: "c3", cat: "Pharmacology", topic: "Insulin", front: "Card three front", back: "Card three back" },
  { id: "c4", cat: "Pharmacology", topic: "Heparin", front: "Card four front", back: "Card four back" },
  { id: "c5", cat: "Pharmacology", topic: "Potassium", front: "Card five front", back: "Card five back" },
];

function Screen() {
  const [srs, setSrs] = useState({});
  const [news, setNews] = useState(0);
  return (
    <div className="app" data-theme="light">
      <Style />
      <header className="top"><span className="brand-name">PULSERN</span></header>
      <main className="body">
        <Flashcards
          addXp={() => {}}
          cards={DECK}
          srsMap={srs}
          setSrsMap={setSrs}
          touchDay={() => {}}
          ready
          onNewCard={() => setNews((n) => n + 1)}
        />
        <pre data-testid="srs">{JSON.stringify(srs)}</pre>
        <pre data-testid="news">{news}</pre>
      </main>
      <nav className="tabs" aria-label="Sections">
        <button type="button" className="tab on">Cards</button>
      </nav>
      <button type="button" className="fab" aria-label="Lab values">🧪</button>
    </div>
  );
}

const root = createRoot(document.getElementById("host"));
root.render(<Screen />);
window.T = { ready: true };
