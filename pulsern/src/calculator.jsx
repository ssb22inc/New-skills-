import { useState } from "react";
import { fourFn } from "./ngn.js";

/* ---- on-screen calculator for dosage-calc items (NCLEX provides one) ----
   Immediate-execution four-function calculator, deterministic plain math. */
export default function Calculator({ onUse }) {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState(null);
  const [op, setOp] = useState(null);
  const [fresh, setFresh] = useState(true); // next digit starts a new number

  const digit = (d) => {
    if (display === "Error") return;
    if (fresh) { setDisplay(d === "." ? "0." : d); setFresh(false); return; }
    if (d === "." && display.includes(".")) return;
    if (display.length < 12) setDisplay(display + d);
  };
  const clear = () => { setDisplay("0"); setAcc(null); setOp(null); setFresh(true); };
  const applyOp = (nextOp) => {
    if (display === "Error") return;
    const cur = parseFloat(display);
    if (op != null && acc != null && !fresh) {
      const r = fourFn(acc, cur, op);
      if (!Number.isFinite(r)) { clear(); setDisplay("Error"); return; }
      setAcc(r); setDisplay(String(r));
    } else {
      setAcc(cur);
    }
    setOp(nextOp); setFresh(true);
  };
  const equals = () => {
    if (op == null || acc == null || display === "Error") return;
    const r = fourFn(acc, parseFloat(display), op);
    setDisplay(Number.isFinite(r) ? String(r) : "Error");
    setAcc(null); setOp(null); setFresh(true);
  };
  const back = () => {
    if (fresh || display === "Error") return;
    setDisplay(display.length > 1 ? display.slice(0, -1) : "0");
  };

  const KEYS = [["7", "8", "9", "÷"], ["4", "5", "6", "×"], ["1", "2", "3", "−"], ["0", ".", "⌫", "+"]];
  return (
    <div className="calc-pad" role="group" aria-label="On-screen calculator">
      <div className="calc-screen mono">
        <span className="calc-pending">{acc != null && op ? `${acc} ${op}` : " "}</span>
        <span className="calc-display">{display}</span>
      </div>
      {KEYS.map((row, ri) => (
        <div key={ri} className="calc-row">
          {row.map((k) => (
            <button key={k} type="button" className={"calc-key" + ("+−×÷".includes(k) ? " op" : "")}
              onClick={() => ("+−×÷".includes(k) ? applyOp(k) : k === "⌫" ? back() : digit(k))}>{k}</button>
          ))}
        </div>
      ))}
      <div className="calc-row">
        <button type="button" className="calc-key op" onClick={clear}>C</button>
        <button type="button" className="calc-key eq" onClick={equals}>=</button>
      </div>
      <button type="button" className="btn ghost calc-use" onClick={() => { if (display !== "Error") onUse(display); }}>
        Use as my answer ↑
      </button>
    </div>
  );
}

