import React, { useId, useRef, useState } from "react";
import { LAB_GROUPS } from "./labs.js";
import { LAB_AI_NOTE, LAB_DISCLAIMER, filterLabGroups, runLabLookup } from "./lab-lookup.js";

/* Lab ranges + quick lookup, inside the floating study toolkit.
   Same data, same search rule, same AI lookup as the old drawer
   (src/lab-lookup.js); only the layout is new:
     - one prominent search / ask field with a clear button
     - groups (vitals, electrolytes, ABG, CBC …) collapse; a search opens
       every matching group and marks the matching text
     - the AI answer sits in its own card with the verify note */

function Mark({ text, needle }) {
  if (!needle) return text;
  const i = text.toLowerCase().indexOf(needle);
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + needle.length)}</mark>{text.slice(i + needle.length)}</>;
}

export function LabPanel({ ask, searchRef, groups: allGroups = LAB_GROUPS }) {
  const [q, setQ] = useState("");
  const [aiAnswers, setAiAnswers] = useState({}); // {query: text} — session cache
  const [aiBusy, setAiBusy] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const id = useId();
  const aiRef = useRef(null);
  const needle = q.trim().toLowerCase();
  const groups = filterLabGroups(allGroups, q);
  const aiHit = aiAnswers[needle];
  const searching = needle.length > 0;
  const allOpen = openGroups.size === allGroups.length;

  const askAi = async () => {
    const query = q.trim();
    if (!query || aiBusy) return;
    setAiBusy(true);
    try {
      const text = await runLabLookup(ask, query);
      setAiAnswers((m) => ({ ...m, [query.toLowerCase()]: text }));
      requestAnimationFrame(() => aiRef.current?.focus());
    } finally {
      setAiBusy(false);
    }
  };
  const toggle = (name) => setOpenGroups((s) => {
    const n = new Set(s);
    if (n.has(name)) n.delete(name); else n.add(name);
    return n;
  });

  return (
    <div className="lp">
      <div className="lp-search">
        <span className="lp-search-icon" aria-hidden="true">⌕</span>
        <input ref={searchRef} className="lp-input" type="search" enterKeyHint="search"
          aria-label="Search a lab value or ask any NCLEX question"
          placeholder="Search a lab value or ask any NCLEX question…" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !groups.length && !aiHit) askAi(); }} />
        {q && <button type="button" className="lp-clear" onClick={() => setQ("")} aria-label="Clear search">✕</button>}
      </div>

      <div className="lp-meta">
        <p className="lp-count" aria-live="polite">
          {searching ? (groups.length ? `${groups.reduce((n, g) => n + g.rows.length, 0)} matching ranges` : "No built-in range matches") : `${allGroups.length} groups · tap a group to open`}
        </p>
        {!searching && (
          <button type="button" className="lp-all" onClick={() => setOpenGroups(allOpen ? new Set() : new Set(allGroups.map((g) => g.group)))}>
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

      <div className="lp-groups">
        {groups.map((g, gi) => {
          const open = searching || openGroups.has(g.group);
          const panelId = `${id}-g${gi}`;
          return (
            <section key={g.group} className={open ? "lp-group open" : "lp-group"}>
              <h3 className="lp-group-h">
                <button type="button" className="lp-group-btn" aria-expanded={open} aria-controls={panelId}
                  onClick={() => toggle(g.group)} disabled={searching}>
                  <span className="lp-group-name"><Mark text={g.group} needle={needle} /></span>
                  <span className="lp-group-n">{g.rows.length}</span>
                  <span className="lp-chev" aria-hidden="true">{open ? "▴" : "▾"}</span>
                </button>
              </h3>
              {open && (
                <dl id={panelId} className="lp-rows">
                  {g.rows.map(([n, v]) => (
                    <div key={n} className="lp-row">
                      <dt><Mark text={n} needle={needle} /></dt>
                      <dd className="mono"><Mark text={v} needle={needle} /></dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          );
        })}
      </div>

      {searching && !groups.length && !aiHit && (
        <div className="lp-ask">
          <p className="lp-ask-title">“{q.trim()}” isn't in the built-in ranges</p>
          <p className="lp-ask-body">Ask the AI: lab values come back as ranges, and study questions get a short explanation.</p>
          <button type="button" className="btn lp-ask-btn" onClick={askAi} disabled={aiBusy}>{aiBusy ? "Thinking…" : "🧠 Ask AI"}</button>
        </div>
      )}
      {aiHit && (
        <article className="lp-ai" aria-live="polite" tabIndex={-1} ref={aiRef} aria-label="AI lookup answer">
          <p className="lp-ai-eyebrow mono">✨ AI LOOKUP · {q.trim()}</p>
          <p className="lp-ai-text">{aiHit}</p>
          <p className="lp-ai-note">{LAB_AI_NOTE}</p>
        </article>
      )}
      <p className="lp-disclaimer">{LAB_DISCLAIMER}</p>
    </div>
  );
}
