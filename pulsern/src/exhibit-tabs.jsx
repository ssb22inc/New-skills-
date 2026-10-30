/* A question's exhibits (chart tabs), each a collapsible panel; the first
   starts open. When read aloud reaches an exhibit, that panel is opened so
   its text can be followed (or read on screen, if that part is not
   voiced). Only opening is automatic: a panel the student closes stays
   closed until the reader reaches it again, and nothing is closed for them. */
import React from "react";
import { ra } from "./read-aloud.jsx";

export function ExhibitTabs({ tabs, reader }) {
  const refs = React.useRef([]);
  const active = reader?.status === "playing" ? reader.active : null;
  React.useEffect(() => {
    const m = /^exhibit(\d+)/.exec(String(active ?? ""));
    if (m) { const el = refs.current[Number(m[1])]; if (el && !el.open) el.open = true; }
  }, [active]);
  if (!Array.isArray(tabs) || !tabs.length) return null;
  return (
    <div className="exhibit">
      {tabs.map((tab, i) => (
        <details key={i} ref={(el) => { refs.current[i] = el; }} className={ra(reader, `exhibit${i}`, "exhibit-tab")} open={i === 0}>
          <summary className="mono">📋 {tab.label}</summary>
          <p className="small exhibit-body">{tab.content}</p>
        </details>
      ))}
    </div>
  );
}
