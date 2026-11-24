import { useEffect, useRef } from "react";
import { cycleTab, tabbables } from "./focus-trap.js";

/* One compact "Focus" control instead of a wall of filter pills.
   Every filter stays available; they live in a bottom sheet that opens on
   tap. Leaving everything off keeps the full adaptive mix, which is the
   default the app recommends. */

export function focusSummary(groups, allLabel = "All topics") {
  const picked = groups.flatMap((g) => g.options.filter(([value]) => g.selected.includes(value)).map(([, label]) => label));
  if (!picked.length) return allLabel;
  if (picked.length <= 2) return picked.join(" + ");
  return `${picked[0]} + ${picked.length - 1} more`;
}

export function focusCount(groups) {
  return groups.reduce((n, g) => n + g.selected.length, 0);
}

export function FocusBar({ groups, open, setOpen, onClear, allLabel = "All topics", title = "Focus", hint = "Leave everything off for the full adaptive mix." }) {
  const count = focusCount(groups);
  const triggerRef = useRef(null);
  const sheetRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const sheet = sheetRef.current;
    tabbables(sheet)[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
      if (e.key !== "Tab") return;
      const next = cycleTab(tabbables(sheetRef.current), document.activeElement, e.shiftKey);
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      next.focus();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      triggerRef.current?.focus();
    };
  }, [open, setOpen]);
  return (
    <div className="focus-bar">
      <button type="button" ref={triggerRef} className={count ? "focus-trigger on" : "focus-trigger"} onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-expanded={open}>
        <span className="focus-k">{title}:</span> <span className="focus-v">{focusSummary(groups, allLabel)}</span>
        {count > 0 && <span className="focus-n mono" aria-label={`${count} filters on`}>{count}</span>}
        <span aria-hidden="true" className="focus-caret">▾</span>
      </button>
      {count > 0 && <button type="button" className="focus-clear" onClick={onClear} aria-label="Clear focus filters">✕</button>}
      {open && (
        <div className="sheet-overlay" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={`${title} filters`} ref={sheetRef} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" aria-hidden="true" />
            <div className="sheet-head">
              <p className="h2 sheet-title">{title}</p>
              <button type="button" className="btn ghost sheet-x" onClick={() => setOpen(false)} aria-label="Close filters">✕</button>
            </div>
            <p className="small">{hint}</p>
            {groups.map((g) => (
              <div key={g.label} className="sheet-group">
                <p className="eyebrow">{g.label}</p>
                <div className="fchips" role="group" aria-label={g.label}>
                  {g.options.map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={g.selected.includes(value)}
                      className={g.selected.includes(value) ? "fchip on" : "fchip"}
                      onClick={() => g.onToggle(value)}>{label}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="row sheet-actions">
              <button type="button" className="btn ghost" onClick={onClear} disabled={!count}>Clear all</button>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
